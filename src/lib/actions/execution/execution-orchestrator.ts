import { ExecutionDomainError } from "@/lib/actions/execution/domain-errors";
import { evaluateExecutionGates } from "@/lib/actions/execution/execution-kill-switch";
import { executionActionStateHash } from "@/lib/actions/execution/action-state-hash";
import type { ExecutionAdapter, ExecutionAdapterId, ExecutionContext, ExecuteResult } from "@/lib/actions/execution/adapter-contract";
import type { AdapterRegistry } from "@/lib/actions/execution/execution-request-service";
import type { DurableAction } from "@/lib/actions/action-contract";
import { sanitizeAuditMetadata } from "@/lib/actions/execution/audit-sanitize";

export type ExecutionOrchestratorDeps = {
  nowUtc: () => string;
  idempotency: {
    computeRequestHash: (input: unknown) => string;
    start: (input: {
      operationType: "execution_execute";
      actionId: string;
      executionRequestId: string;
      idempotencyKey: string;
      requestHash: string;
      responseSnapshot: Record<string, unknown>;
    }) => Promise<{ replay: boolean; id: string; response_snapshot: Record<string, unknown> }>;
    complete: (input: { id: string; completionState: "completed" | "failed"; responseSnapshot: Record<string, unknown> }) => Promise<void>;
  };
  getAction: (actionId: string) => Promise<DurableAction | null>;

  repo: {
    getExecutionRequestById: (id: string) => Promise<{
      id: string;
      action_id: string;
      adapter_id: string;
      requested_by: string;
      execution_state: string;
      payload_hash: string;
      payload_json: Record<string, unknown>;
      action_state_hash: string;
      reversibility: "reversible" | "partially_reversible" | "irreversible";
      irreversible_reason: string | null;
      expires_at: string;
      idempotency_key: string;
    } | null>;
    getCurrentConfirmation: (executionRequestId: string) => Promise<{
      id: string;
      confirmed_by: string;
      confirmation_expires_at: string;
      payload_hash: string;
      action_state_hash: string;
      irreversible_acknowledged: boolean;
    } | null>;
    updateExecutionRequestState: (input: { id: string; execution_state: string; payload_json_patch?: Record<string, unknown> }) => Promise<void>;

    insertAttempt: (row: {
      execution_request_id: string;
      attempt_index: number;
      idempotency_key: string;
      status: string;
      started_at: string | null;
      ended_at: string | null;
      provider_execution_id: string | null;
      result_json: Record<string, unknown> | null;
      external_side_effect_count: 0;
    }) => Promise<{ id: string; started_at: string | null }>;
    insertStep: (row: {
      attempt_id: string;
      step_index: number;
      name: string;
      status: string;
      details: Record<string, unknown> | null;
    }) => Promise<void>;
    updateAttempt: (input: { id: string; status: string; ended_at: string | null; provider_execution_id: string | null; result_json: Record<string, unknown> | null }) => Promise<void>;
  };

  lock: {
    acquire: (input: { actionId: string; executionRequestId: string; owner: string; reason: string; ttlSeconds: number; idempotencyKey: string }) => Promise<{ ok: true } | { ok: false }>;
    release: (input: { actionId: string; owner: string; idempotencyKey: string }) => Promise<void>;
  };

  audit: {
    event: (input: { action_id: string; event_type: string; actor: string; idempotency_key: string; note: string; metadata: Record<string, unknown> }) => Promise<void>;
  };
};

export async function orchestrateExecutionAttempt(input: {
  executionRequestId: string;
  operatorId: string;
  idempotencyKey: string;
  supabaseUrl: string;
  registry: AdapterRegistry;
  adapter: ExecutionAdapter;
  deps: ExecutionOrchestratorDeps;
}): Promise<{ ok: true; result: ExecuteResult }>
{
  const req = await input.deps.repo.getExecutionRequestById(input.executionRequestId);
  if (!req) throw new ExecutionDomainError({ code: "EXECUTION_DRY_RUN_REQUIRED", message: "Execution request not found", httpStatus: 404 });

  const opHash = input.deps.idempotency.computeRequestHash({
    op: "execution_execute",
    executionRequestId: req.id,
    payload_hash: req.payload_hash,
    action_state_hash: req.action_state_hash,
    adapter_id: req.adapter_id,
    operatorId: input.operatorId
  });

  const idem = await input.deps.idempotency.start({
    operationType: "execution_execute",
    actionId: req.action_id,
    executionRequestId: req.id,
    idempotencyKey: input.idempotencyKey,
    requestHash: opHash,
    responseSnapshot: { ok: true }
  });
  if (idem.replay) {
    const snap = idem.response_snapshot as Record<string, unknown>;
    const stored = snap["result"] as Record<string, unknown> | undefined;
    if (stored) {
      await input.deps.audit.event({
        action_id: req.action_id,
        event_type: "execution_idempotent_replay",
        actor: `orchestrator:${input.operatorId}`,
        idempotency_key: input.idempotencyKey,
        note: "Execution replayed from idempotency ledger",
        metadata: sanitizeAuditMetadata({ execution_request_id: req.id })
      });
      return { ok: true, result: stored as unknown as ExecuteResult };
    }
    // If we have an incomplete idempotency record, treat as conflict until a recovery path exists.
    throw new ExecutionDomainError({
      code: "EXECUTION_IDEMPOTENCY_CONFLICT",
      message: "Idempotency replay found without stored execution result",
      httpStatus: 409
    });
  }

  const action = await input.deps.getAction(req.action_id);
  if (!action) throw new ExecutionDomainError({ code: "EXECUTION_ACTION_NOT_APPROVED", message: "Action not found", httpStatus: 404 });
  if (!(action.status === "approved" && action.current_level === "L4_APPROVED_FOR_EXECUTION")) {
    throw new ExecutionDomainError({ code: "EXECUTION_ACTION_NOT_APPROVED", message: "Action is no longer approved", httpStatus: 400 });
  }
  if (action.expires_at && Date.parse(action.expires_at) <= Date.now()) {
    throw new ExecutionDomainError({ code: "EXECUTION_EVIDENCE_STALE", message: "Action evidence is expired", httpStatus: 400 });
  }
  if (!action.evidence_snapshot_id || !action.evidence_snapshot_hash) {
    throw new ExecutionDomainError({
      code: "EXECUTION_EVIDENCE_STALE",
      message: "Action evidence snapshot is missing",
      httpStatus: 400
    });
  }

  // Kill-switch gates must be re-evaluated at execution time.
  const gates = evaluateExecutionGates({
    actionId: req.action_id,
    category: action.category,
    adapterId: req.adapter_id as ExecutionAdapterId,
    supabaseUrl: input.supabaseUrl,
    emergencyStop: input.registry.isEmergencyStopEnabled(req.action_id),
    adapterEnabled: input.registry.isAdapterEnabled(req.adapter_id as ExecutionAdapterId),
    categoryEnabled: input.registry.isCategoryEnabled(action.category)
  });
  if (!gates.allowed) {
    throw new ExecutionDomainError({ code: "EXECUTION_GLOBAL_DISABLED", message: gates.blockingReasons.join("; "), httpStatus: 403, details: gates });
  }

  // State + dry-run + confirmation checks.
  if (req.execution_state !== "confirmed") {
    throw new ExecutionDomainError({ code: "EXECUTION_CONFIRMATION_REQUIRED", message: "Execution request must be confirmed before orchestration", httpStatus: 400 });
  }

  const payloadJson = req.payload_json as Record<string, unknown>;
  const dryRun = payloadJson["dry_run"] as Record<string, unknown> | undefined;
  const dryRunExpiresAt = typeof dryRun?.["expiresAtUtc"] === "string" ? (dryRun["expiresAtUtc"] as string) : null;
  if (!dryRunExpiresAt) throw new ExecutionDomainError({ code: "EXECUTION_DRY_RUN_REQUIRED", message: "Missing dry-run result", httpStatus: 400 });
  if (Date.parse(dryRunExpiresAt) <= Date.now()) throw new ExecutionDomainError({ code: "EXECUTION_DRY_RUN_EXPIRED", message: "Dry run has expired", httpStatus: 400 });

  const confirmation = await input.deps.repo.getCurrentConfirmation(req.id);
  if (!confirmation) throw new ExecutionDomainError({ code: "EXECUTION_CONFIRMATION_REQUIRED", message: "Missing current confirmation", httpStatus: 400 });
  if (Date.parse(confirmation.confirmation_expires_at) <= Date.now()) {
    throw new ExecutionDomainError({ code: "EXECUTION_CONFIRMATION_EXPIRED", message: "Confirmation has expired", httpStatus: 400 });
  }
  if (confirmation.payload_hash !== req.payload_hash) throw new ExecutionDomainError({ code: "EXECUTION_PAYLOAD_CHANGED", message: "Payload changed since confirmation", httpStatus: 409 });
  if (confirmation.action_state_hash !== req.action_state_hash) throw new ExecutionDomainError({ code: "EXECUTION_ACTION_STATE_CHANGED", message: "Action state changed since confirmation", httpStatus: 409 });
  if (req.reversibility === "irreversible" && !confirmation.irreversible_acknowledged) {
    throw new ExecutionDomainError({ code: "EXECUTION_IRREVERSIBLE_ACK_REQUIRED", message: "Irreversible acknowledgement required", httpStatus: 400 });
  }

  const actionStateHash = executionActionStateHash(action);
  if (actionStateHash !== req.action_state_hash) {
    throw new ExecutionDomainError({ code: "EXECUTION_ACTION_STATE_CHANGED", message: "Action state changed since request", httpStatus: 409 });
  }

  // Acquire lock.
  const lockOwner = `orchestrator:${input.operatorId}`;
  const lockRes = await input.deps.lock.acquire({
    actionId: req.action_id,
    executionRequestId: req.id,
    owner: lockOwner,
    reason: "m12 mock execution",
    ttlSeconds: 60,
    idempotencyKey: input.idempotencyKey
  });
  if (!lockRes.ok) throw new ExecutionDomainError({ code: "EXECUTION_LOCKED", message: "Action is currently locked for execution", httpStatus: 409 });

  let attemptId: string | null = null;
  let stepIndex = 0;

  try {
    // Ordered orchestration steps (persisted).
    const stepsToPersist: Array<{ name: string; status: "succeeded"; details?: Record<string, unknown> | null }> = [];
    stepsToPersist.push({ name: "preflight", status: "succeeded" });
    stepsToPersist.push({ name: "lock_acquired", status: "succeeded" });
    stepsToPersist.push({ name: "idempotency_checked", status: "succeeded" });
    stepsToPersist.push({ name: "confirmation_verified", status: "succeeded" });
    stepsToPersist.push({ name: "payload_verified", status: "succeeded" });
    stepsToPersist.push({ name: "action_state_verified", status: "succeeded" });

    // Persist attempt.
    const attempt = await input.deps.repo.insertAttempt({
      execution_request_id: req.id,
      attempt_index: 1,
      idempotency_key: input.idempotencyKey,
      status: "started",
      started_at: input.deps.nowUtc(),
      ended_at: null,
      provider_execution_id: null,
      result_json: null,
      external_side_effect_count: 0
    });
    attemptId = attempt.id;

    await input.deps.repo.updateExecutionRequestState({ id: req.id, execution_state: "queued" });
    stepsToPersist.push({ name: "queued", status: "succeeded" });
    await input.deps.audit.event({
      action_id: req.action_id,
      event_type: "execution_queued",
      actor: lockOwner,
      idempotency_key: input.idempotencyKey,
      note: "Execution queued",
      metadata: sanitizeAuditMetadata({ execution_request_id: req.id, attempt_id: attempt.id })
    });
    await input.deps.repo.updateExecutionRequestState({ id: req.id, execution_state: "started" });
    stepsToPersist.push({ name: "started", status: "succeeded" });
    await input.deps.audit.event({
      action_id: req.action_id,
      event_type: "execution_started",
      actor: lockOwner,
      idempotency_key: input.idempotencyKey,
      note: "Execution started",
      metadata: sanitizeAuditMetadata({ execution_request_id: req.id, attempt_id: attempt.id })
    });

    // Execute via adapter.
    const ctx: ExecutionContext = {
      actionId: req.action_id,
      operatorId: input.operatorId,
      idempotencyKey: input.idempotencyKey,
      timeoutMs: 30_000,
      retryPolicy: { maxAttempts: 1, backoffMs: 0 },
      env: {
        supabaseUrl: input.supabaseUrl,
        category: action.category,
        adapterEnabled: input.registry.isAdapterEnabled(req.adapter_id as ExecutionAdapterId),
        categoryEnabled: input.registry.isCategoryEnabled(action.category),
        emergencyStop: input.registry.isEmergencyStopEnabled(req.action_id)
      },
      approval: { approvedAt: action.approved_at ?? "", approvedBy: action.approved_by ?? "", auditIds: [] },
      evidence: { snapshotId: action.evidence_snapshot_id, hash: action.evidence_snapshot_hash, expiresAt: action.expires_at },
      payload: { hash: req.payload_hash, summary: "", raw: req.payload_json },
      rollbackPlan: { required: req.reversibility !== "irreversible", hash: null, summary: "", raw: null },
      reversibility: req.reversibility,
      irreversibilityExplanation: req.irreversible_reason,
      auditMetadata: { executionRequestId: req.id }
    };

    stepsToPersist.push({ name: "adapter_invoked", status: "succeeded", details: { adapter: input.adapter.id } });
    const result = await input.adapter.execute(ctx);
    if (result.externalSideEffects !== 0) {
      throw new ExecutionDomainError({ code: "EXECUTION_EXTERNAL_SIDE_EFFECTS_NOT_ALLOWED", message: "Mock adapter must report externalSideEffects=0", httpStatus: 500 });
    }

    stepsToPersist.push({ name: "result_persisted", status: "succeeded" });

    // Persist ordered orchestration steps first.
    stepIndex = 0;
    for (const s of stepsToPersist) {
      await input.deps.repo.insertStep({ attempt_id: attempt.id, step_index: stepIndex++, name: s.name, status: s.status, details: s.details ?? null });
    }
    // Then adapter-reported steps.
    for (const name of result.completedSteps) {
      await input.deps.repo.insertStep({ attempt_id: attempt.id, step_index: stepIndex++, name, status: "succeeded", details: { source: "adapter" } });
    }
    for (const name of result.failedSteps) {
      await input.deps.repo.insertStep({ attempt_id: attempt.id, step_index: stepIndex++, name, status: "failed", details: { source: "adapter" } });
    }

    await input.deps.repo.updateAttempt({
      id: attempt.id,
      status: result.status,
      ended_at: input.deps.nowUtc(),
      provider_execution_id: result.providerExecutionId,
      result_json: {
        executionRequestId: req.id,
        actionId: req.action_id,
        adapterId: input.adapter.id,
        adapterCapabilities: input.adapter.capabilities(),
        startedAtUtc: attempt.started_at,
        endedAtUtc: input.deps.nowUtc(),
        providerExecutionId: result.providerExecutionId,
        externalSideEffectCount: 0,
        executionResult: {
          ok: result.ok,
          status: result.status,
          completedSteps: result.completedSteps,
          failedSteps: result.failedSteps,
          rollbackEligible: result.rollbackEligible,
          result: result.result
        }
      }
    });

    // Verification
    const verification = await input.adapter.verify(ctx);
    await input.deps.repo.insertStep({
      attempt_id: attempt.id,
      step_index: stepIndex++,
      name: "verification_completed",
      status: "succeeded",
      details: { ok: verification.ok, ...verification.details }
    });

    const terminalState = result.status === "succeeded" ? "succeeded" : result.status;
    await input.deps.repo.updateExecutionRequestState({ id: req.id, execution_state: terminalState });

    await input.deps.audit.event({
      action_id: req.action_id,
      event_type: "execution_attempt_completed",
      actor: lockOwner,
      idempotency_key: input.idempotencyKey,
      note: `Mock execution finished with status=${result.status}, verified=${verification.ok}`,
      metadata: sanitizeAuditMetadata({
        execution_request_id: req.id,
        attempt_id: attempt.id,
        status: result.status,
        verified: verification.ok,
        provider_execution_id: result.providerExecutionId,
        verification_details: verification.details
      })
    });

    await input.deps.idempotency.complete({
      id: idem.id,
      completionState: "completed",
      responseSnapshot: {
        ok: true,
        executionRequestId: req.id,
        attemptId: attempt.id,
        result
      }
    });

    return { ok: true, result };
  } finally {
    await input.deps.lock.release({ actionId: req.action_id, owner: lockOwner, idempotencyKey: input.idempotencyKey });
    if (attemptId) {
      // Only record lock_released after the release call completes.
      await input.deps.repo.insertStep({
        attempt_id: attemptId,
        step_index: stepIndex++,
        name: "lock_released",
        status: "succeeded",
        details: null
      });
    }
  }
}
