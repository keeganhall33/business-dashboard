import type { ExecutionAdapter, ExecutionContext, ExecuteResult } from "@/lib/actions/execution/adapter-contract";
import { ExecutionDomainError } from "@/lib/actions/execution/domain-errors";
import type { ExecutionState } from "@/lib/actions/execution/adapter-contract";
import { isValidExecutionTransition } from "@/lib/actions/execution/execution-transitions";
import { sanitizeAuditMetadata } from "@/lib/actions/execution/audit-sanitize";

export type RollbackOrchestratorDeps = {
  nowUtc: () => string;
  idempotency: {
    computeRequestHash: (input: unknown) => string;
    start: (input: {
      operationType: "execution_rollback";
      actionId: string;
      executionRequestId: string;
      idempotencyKey: string;
      requestHash: string;
      responseSnapshot: Record<string, unknown>;
    }) => Promise<{ replay: boolean; id: string; response_snapshot: Record<string, unknown> }>;
    complete: (input: { id: string; completionState: "completed" | "failed"; responseSnapshot: Record<string, unknown> }) => Promise<void>;
  };
  repo: {
    getExecutionRequestById: (id: string) => Promise<{
      id: string;
      action_id: string;
      execution_state: string;
      payload_hash: string;
      payload_json: Record<string, unknown>;
      action_state_hash: string;
      reversibility: "reversible" | "partially_reversible" | "irreversible";
      irreversible_reason: string | null;
    } | null>;
    updateExecutionRequestState: (input: { id: string; execution_state: string }) => Promise<void>;
    insertRollback: (row: {
      execution_request_id: string;
      execution_attempt_id: string | null;
      requested_by: string;
      confirmed_by: string | null;
      rollback_state: string;
      rollback_plan_hash: string | null;
      preview_json: Record<string, unknown> | null;
      result_json: Record<string, unknown> | null;
      started_at: string | null;
      ended_at: string | null;
      external_side_effect_count: 0;
    }) => Promise<{ id: string }>;
    updateRollback: (input: { id: string; rollback_state: string; result_json?: Record<string, unknown> | null; started_at?: string | null; ended_at?: string | null }) => Promise<void>;
  };
  lock: {
    acquire: (input: { actionId: string; executionRequestId: string; owner: string; reason: string; ttlSeconds: number; idempotencyKey: string }) => Promise<{ ok: true } | { ok: false }>;
    release: (input: { actionId: string; owner: string; idempotencyKey: string }) => Promise<void>;
  };
  audit: {
    event: (input: { action_id: string; event_type: string; actor: string; idempotency_key: string; note: string; metadata: Record<string, unknown> }) => Promise<void>;
  };
};

export async function orchestrateRollback(input: {
  executionRequestId: string;
  operatorId: string;
  idempotencyKey: string;
  adapter: ExecutionAdapter;
  env: ExecutionContext["env"];
  rollbackPlan: { hash: string; raw: Record<string, unknown>; preview: { summary: string; warnings: string[] } };
  confirmed: boolean;
  deps: RollbackOrchestratorDeps;
}): Promise<{ ok: true; result: ExecuteResult; rollbackId: string }>
{
  const req = await input.deps.repo.getExecutionRequestById(input.executionRequestId);
  if (!req) throw new ExecutionDomainError({ code: "EXECUTION_DRY_RUN_REQUIRED", message: "Execution request not found", httpStatus: 404 });

  if (!(req.execution_state === "failed" || req.execution_state === "partial_succeeded")) {
    throw new ExecutionDomainError({ code: "EXECUTION_ROLLBACK_NOT_ALLOWED", message: "Rollback only allowed after failed or partial_succeeded", httpStatus: 400 });
  }
  const caps = input.adapter.capabilities();
  if (!caps.supportsRollback) {
    throw new ExecutionDomainError({ code: "EXECUTION_ROLLBACK_NOT_ALLOWED", message: "Adapter does not support rollback", httpStatus: 400 });
  }
  if (!input.rollbackPlan?.hash || !input.rollbackPlan?.raw) {
    throw new ExecutionDomainError({ code: "EXECUTION_ROLLBACK_NOT_ALLOWED", message: "Missing rollback plan", httpStatus: 400 });
  }
  if (!input.rollbackPlan.preview?.summary) {
    throw new ExecutionDomainError({ code: "EXECUTION_ROLLBACK_NOT_ALLOWED", message: "Missing rollback preview", httpStatus: 400 });
  }
  if (req.reversibility === "irreversible") {
    throw new ExecutionDomainError({ code: "EXECUTION_ROLLBACK_NOT_ALLOWED", message: "Rollback blocked for irreversible actions", httpStatus: 400 });
  }
  if (!input.confirmed) {
    throw new ExecutionDomainError({ code: "EXECUTION_CONFIRMATION_REQUIRED", message: "Rollback confirmation required", httpStatus: 400 });
  }

  const opHash = input.deps.idempotency.computeRequestHash({
    op: "execution_rollback",
    executionRequestId: req.id,
    rollback_plan_hash: input.rollbackPlan.hash,
    operatorId: input.operatorId
  });
  const idem = await input.deps.idempotency.start({
    operationType: "execution_rollback",
    actionId: req.action_id,
    executionRequestId: req.id,
    idempotencyKey: input.idempotencyKey,
    requestHash: opHash,
    responseSnapshot: { ok: true }
  });
  if (idem.replay) {
    const snap = idem.response_snapshot as Record<string, unknown>;
    const result = snap["result"] as Record<string, unknown> | undefined;
    const rollbackId = String(snap["rollbackId"] ?? "");
    if (result && rollbackId) return { ok: true, result: result as unknown as ExecuteResult, rollbackId };
    throw new ExecutionDomainError({ code: "EXECUTION_IDEMPOTENCY_CONFLICT", message: "Rollback idempotency replay missing stored snapshot", httpStatus: 409 });
  }

  if (!isValidExecutionTransition({ from: req.execution_state as ExecutionState, to: "rollback_requested" })) {
    throw new ExecutionDomainError({ code: "EXECUTION_INVALID_TRANSITION", message: "Invalid rollback transition", httpStatus: 400 });
  }
  await input.deps.repo.updateExecutionRequestState({ id: req.id, execution_state: "rollback_requested" });
  await input.deps.audit.event({
    action_id: req.action_id,
    event_type: "rollback_requested",
    actor: `rollback:${input.operatorId}`,
    idempotency_key: input.idempotencyKey,
    note: "Rollback requested",
    metadata: sanitizeAuditMetadata({ execution_request_id: req.id })
  });

  const lockOwner = `rollback:${input.operatorId}`;
  const lockRes = await input.deps.lock.acquire({
    actionId: req.action_id,
    executionRequestId: req.id,
    owner: lockOwner,
    reason: "m12 mock rollback",
    ttlSeconds: 60,
    idempotencyKey: input.idempotencyKey
  });
  if (!lockRes.ok) throw new ExecutionDomainError({ code: "EXECUTION_LOCKED", message: "Action is currently locked", httpStatus: 409 });

  try {
    const rollback = await input.deps.repo.insertRollback({
      execution_request_id: req.id,
      execution_attempt_id: null,
      requested_by: input.operatorId,
      confirmed_by: input.operatorId,
      rollback_state: "started",
      rollback_plan_hash: input.rollbackPlan.hash,
      preview_json: { summary: input.rollbackPlan.preview.summary, warnings: input.rollbackPlan.preview.warnings },
      result_json: null,
      started_at: input.deps.nowUtc(),
      ended_at: null,
      external_side_effect_count: 0
    });

    const ctx: ExecutionContext = {
      actionId: req.action_id,
      operatorId: input.operatorId,
      idempotencyKey: input.idempotencyKey,
      timeoutMs: 30_000,
      retryPolicy: { maxAttempts: 1, backoffMs: 0 },
      env: input.env,
      approval: { approvedAt: "", approvedBy: "", auditIds: [] },
      evidence: { snapshotId: "", hash: "", expiresAt: null },
      payload: { hash: req.payload_hash, summary: "", raw: req.payload_json },
      rollbackPlan: { required: true, hash: input.rollbackPlan.hash, summary: input.rollbackPlan.preview.summary, raw: input.rollbackPlan.raw },
      reversibility: req.reversibility,
      irreversibilityExplanation: req.irreversible_reason,
      auditMetadata: { executionRequestId: req.id, rollbackId: rollback.id }
    };

    const result = await input.adapter.rollback(ctx);
    if (result.externalSideEffects !== 0) {
      throw new ExecutionDomainError({ code: "EXECUTION_EXTERNAL_SIDE_EFFECTS_NOT_ALLOWED", message: "Rollback must report externalSideEffects=0", httpStatus: 500 });
    }

    const finalState = result.ok ? "rolled_back" : "rollback_failed";
    if (!isValidExecutionTransition({ from: "rollback_requested", to: finalState as ExecutionState })) {
      throw new ExecutionDomainError({ code: "EXECUTION_INVALID_TRANSITION", message: "Invalid rollback terminal transition", httpStatus: 400 });
    }

    await input.deps.repo.updateRollback({ id: rollback.id, rollback_state: finalState, result_json: result.result, ended_at: input.deps.nowUtc() });
    await input.deps.repo.updateExecutionRequestState({ id: req.id, execution_state: finalState });

    await input.deps.audit.event({
      action_id: req.action_id,
      event_type: "execution_rollback_completed",
      actor: lockOwner,
      idempotency_key: input.idempotencyKey,
      note: `Mock rollback finished with status=${result.status}`,
      metadata: sanitizeAuditMetadata({ execution_request_id: req.id, rollback_id: rollback.id, status: result.status })
    });

    await input.deps.idempotency.complete({
      id: idem.id,
      completionState: "completed",
      responseSnapshot: { ok: true, rollbackId: rollback.id, result }
    });

    return { ok: true, result, rollbackId: rollback.id };
  } finally {
    await input.deps.lock.release({ actionId: req.action_id, owner: lockOwner, idempotencyKey: input.idempotencyKey });
  }
}
