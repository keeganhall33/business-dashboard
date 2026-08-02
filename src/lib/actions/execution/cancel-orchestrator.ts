import type { ExecutionAdapter, ExecutionContext, ExecutionState } from "@/lib/actions/execution/adapter-contract";
import { ExecutionDomainError } from "@/lib/actions/execution/domain-errors";
import { isValidExecutionTransition } from "@/lib/actions/execution/execution-transitions";
import { sanitizeAuditMetadata } from "@/lib/actions/execution/audit-sanitize";

export type CancelOrchestratorDeps = {
  nowUtc: () => string;
  idempotency: {
    computeRequestHash: (input: unknown) => string;
    start: (input: {
      operationType: "execution_cancel";
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
      execution_state: ExecutionState;
      payload_hash: string;
      payload_json: Record<string, unknown>;
      action_state_hash: string;
      reversibility: "reversible" | "partially_reversible" | "irreversible";
      irreversible_reason: string | null;
    } | null>;
    updateExecutionRequestState: (input: { id: string; execution_state: ExecutionState }) => Promise<void>;
  };
  lock: {
    acquire: (input: { actionId: string; executionRequestId: string; owner: string; reason: string; ttlSeconds: number; idempotencyKey: string }) => Promise<{ ok: true } | { ok: false }>;
    release: (input: { actionId: string; owner: string; idempotencyKey: string }) => Promise<void>;
  };
  audit: {
    event: (input: { action_id: string; event_type: string; actor: string; idempotency_key: string; note: string; metadata: Record<string, unknown> }) => Promise<void>;
  };
};

export async function orchestrateCancellation(input: {
  executionRequestId: string;
  operatorId: string;
  idempotencyKey: string;
  adapter: ExecutionAdapter;
  env?: ExecutionContext["env"]; // required for cancellation during execution
  deps: CancelOrchestratorDeps;
}): Promise<{ ok: true; finalState: "cancelled" }>
{
  const req = await input.deps.repo.getExecutionRequestById(input.executionRequestId);
  if (!req) throw new ExecutionDomainError({ code: "EXECUTION_DRY_RUN_REQUIRED", message: "Execution request not found", httpStatus: 404 });

  const requestHash = input.deps.idempotency.computeRequestHash({ op: "execution_cancel", executionRequestId: req.id, operatorId: input.operatorId });
  const idem = await input.deps.idempotency.start({
    operationType: "execution_cancel",
    actionId: req.action_id,
    executionRequestId: req.id,
    idempotencyKey: input.idempotencyKey,
    requestHash,
    responseSnapshot: { ok: true, finalState: "cancelled" }
  });
  if (idem.replay) return { ok: true, finalState: "cancelled" };

  const lockOwner = `cancel:${input.operatorId}`;
  const lockRes = await input.deps.lock.acquire({
    actionId: req.action_id,
    executionRequestId: req.id,
    owner: lockOwner,
    reason: "m12 cancel",
    ttlSeconds: 60,
    idempotencyKey: input.idempotencyKey
  });
  if (!lockRes.ok) throw new ExecutionDomainError({ code: "EXECUTION_LOCKED", message: "Action is currently locked", httpStatus: 409 });

  try {
    const state = req.execution_state;
    if (!(state === "confirmed" || state === "queued" || state === "started" || state === "cancel_requested")) {
      throw new ExecutionDomainError({ code: "EXECUTION_INVALID_TRANSITION", message: `Cannot cancel from state=${state}`, httpStatus: 400 });
    }

    if (!isValidExecutionTransition({ from: state, to: "cancel_requested" })) {
      throw new ExecutionDomainError({ code: "EXECUTION_INVALID_TRANSITION", message: "Invalid cancel transition", httpStatus: 400 });
    }
    await input.deps.repo.updateExecutionRequestState({ id: req.id, execution_state: "cancel_requested" });
    await input.deps.audit.event({
      action_id: req.action_id,
      event_type: "cancellation_requested",
      actor: lockOwner,
      idempotency_key: input.idempotencyKey,
      note: "Cancellation requested",
      metadata: sanitizeAuditMetadata({ execution_request_id: req.id, from_state: state })
    });

    // If not started yet, do not invoke adapter.
    if (state === "confirmed" || state === "queued") {
      if (!isValidExecutionTransition({ from: "cancel_requested", to: "cancelled" })) {
        throw new ExecutionDomainError({ code: "EXECUTION_INVALID_TRANSITION", message: "Invalid cancel terminal transition", httpStatus: 400 });
      }
      await input.deps.repo.updateExecutionRequestState({ id: req.id, execution_state: "cancelled" });
    } else {
      // During execution: record cancel, ask adapter.
      if (!input.env?.supabaseUrl) {
        throw new ExecutionDomainError({
          code: "EXECUTION_ENV_DISABLED",
          message: "Missing environment context for cancellation",
          httpStatus: 400
        });
      }
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
        rollbackPlan: { required: req.reversibility !== "irreversible", hash: null, summary: "", raw: null },
        reversibility: req.reversibility,
        irreversibilityExplanation: req.irreversible_reason,
        auditMetadata: { executionRequestId: req.id }
      };
      const cancelled = await input.adapter.cancel(ctx);
      if (!cancelled.ok) {
        throw new ExecutionDomainError({ code: "EXECUTION_INVALID_TRANSITION", message: "Adapter cancel failed", httpStatus: 500, details: cancelled.details ?? {} });
      }
      await input.deps.repo.updateExecutionRequestState({ id: req.id, execution_state: "cancelled" });
    }

    await input.deps.audit.event({
      action_id: req.action_id,
      event_type: "execution_cancelled",
      actor: lockOwner,
      idempotency_key: input.idempotencyKey,
      note: "Execution cancelled",
      metadata: sanitizeAuditMetadata({ execution_request_id: req.id, from_state: state })
    });

    await input.deps.idempotency.complete({
      id: idem.id,
      completionState: "completed",
      responseSnapshot: { ok: true, finalState: "cancelled" }
    });

    return { ok: true, finalState: "cancelled" };
  } finally {
    await input.deps.lock.release({ actionId: req.action_id, owner: lockOwner, idempotencyKey: input.idempotencyKey });
  }
}
