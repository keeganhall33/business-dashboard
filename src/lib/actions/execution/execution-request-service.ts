import type { ExecutionAdapter, ExecutionAdapterId, Reversibility } from "@/lib/actions/execution/adapter-contract";
import { canonicalJsonSha256Hex } from "@/lib/actions/execution/canonical-json";
import { executionActionStateHash } from "@/lib/actions/execution/action-state-hash";
import { ExecutionDomainError } from "@/lib/actions/execution/domain-errors";
import { evaluateExecutionGates } from "@/lib/actions/execution/execution-kill-switch";
import { getAction } from "@/lib/actions/action-store";
import { getExecutionRequestByActionAndIdempotency, insertExecutionRequest } from "@/lib/actions/execution/execution-repo";
import { upsertIdempotencyRecord, computeRequestHash } from "@/lib/actions/execution/idempotency-service";

export type AdapterRegistry = {
  getAdapter(id: ExecutionAdapterId): ExecutionAdapter | null;
  isAdapterEnabled(id: ExecutionAdapterId): boolean;
  isCategoryEnabled(category: string): boolean;
  isEmergencyStopEnabled(actionId: string): boolean;
};

export async function createExecutionRequest(input: {
  actionId: string;
  adapterId: ExecutionAdapterId;
  operatorId: string;
  idempotencyKey: string;
  supabaseUrl: string;
  payload: Record<string, unknown>;
  reversibility: Reversibility;
  irreversibleReason: string | null;
  expiresAtUtc: string;
  harnessRunId?: string | null;
  registry: AdapterRegistry;
}): Promise<{ ok: true; requestId: string; execution_state: "requested"; payload_hash: string; action_state_hash: string }>
{
  const action = await getAction(input.actionId);
  if (!action) {
    throw new ExecutionDomainError({ code: "EXECUTION_ACTION_NOT_APPROVED", message: "Action not found", httpStatus: 404 });
  }
  if (action.status === "needs_revalidation") {
    throw new ExecutionDomainError({ code: "EXECUTION_REVALIDATION_REQUIRED", message: "Action requires revalidation", httpStatus: 400 });
  }
  if (!(action.status === "approved" && action.current_level === "L4_APPROVED_FOR_EXECUTION")) {
    throw new ExecutionDomainError({
      code: "EXECUTION_ACTION_NOT_APPROVED",
      message: "Action must be approved at L4 before execution can be requested",
      httpStatus: 400
    });
  }
  if (action.expires_at && Date.parse(action.expires_at) <= Date.now()) {
    throw new ExecutionDomainError({ code: "EXECUTION_EVIDENCE_STALE", message: "Action evidence is expired", httpStatus: 400 });
  }

  const adapter = input.registry.getAdapter(input.adapterId);
  if (!adapter) {
    throw new ExecutionDomainError({ code: "EXECUTION_ADAPTER_DISABLED", message: "Unknown adapter", httpStatus: 400 });
  }

  const gates = evaluateExecutionGates({
    actionId: input.actionId,
    category: action.category,
    adapterId: input.adapterId,
    supabaseUrl: input.supabaseUrl,
    emergencyStop: input.registry.isEmergencyStopEnabled(input.actionId),
    adapterEnabled: input.registry.isAdapterEnabled(input.adapterId),
    categoryEnabled: input.registry.isCategoryEnabled(action.category)
  });
  if (!gates.allowed) {
    // Map to deterministic codes.
    const message = gates.blockingReasons.join("; ");
    if (message.includes("NODE_ENV=production") || message.includes("Production Supabase")) {
      throw new ExecutionDomainError({ code: "EXECUTION_PRODUCTION_BLOCKED", message, httpStatus: 403 });
    }
    if (message.includes("ACTIONS_ENABLE_EXECUTION_BOUNDARY")) {
      throw new ExecutionDomainError({ code: "EXECUTION_GLOBAL_DISABLED", message, httpStatus: 403 });
    }
    if (message.includes("Unknown execution environment")) {
      throw new ExecutionDomainError({ code: "EXECUTION_ENV_DISABLED", message, httpStatus: 403 });
    }
    if (message.includes("Adapter gate")) {
      throw new ExecutionDomainError({ code: "EXECUTION_ADAPTER_DISABLED", message, httpStatus: 403 });
    }
    if (message.includes("Category gate")) {
      throw new ExecutionDomainError({ code: "EXECUTION_CATEGORY_DISABLED", message, httpStatus: 403 });
    }
    if (message.includes("emergency")) {
      throw new ExecutionDomainError({ code: "EXECUTION_EMERGENCY_STOP", message, httpStatus: 403 });
    }
    throw new ExecutionDomainError({ code: "EXECUTION_GLOBAL_DISABLED", message, httpStatus: 403 });
  }

  // Canonicalization + hashes
  const payload_hash = canonicalJsonSha256Hex(input.payload);
  const action_state_hash = executionActionStateHash(action);

  if (input.reversibility === "irreversible" && !input.irreversibleReason?.trim()) {
    throw new ExecutionDomainError({ code: "EXECUTION_IRREVERSIBLE_ACK_REQUIRED", message: "Irreversible actions require a reason", httpStatus: 400 });
  }

  const requestHash = computeRequestHash({
    op: "execution_request",
    actionId: input.actionId,
    adapterId: input.adapterId,
    payload_hash,
    action_state_hash,
    reversibility: input.reversibility,
    irreversibleReason: input.irreversibleReason,
    expiresAtUtc: input.expiresAtUtc
  });

  // Idempotency ledger first: if replay, return stored response.
  const idem = await upsertIdempotencyRecord({
    operationType: "execution_request",
    actionId: input.actionId,
    executionRequestId: null,
    idempotencyKey: input.idempotencyKey,
    requestHash,
    responseSnapshot: { ok: true, payload_hash, action_state_hash },
    completionState: "started"
  });
  if (idem.replay) {
    const existing = await getExecutionRequestByActionAndIdempotency({ actionId: input.actionId, idempotencyKey: input.idempotencyKey });
    if (!existing) {
      throw new Error("Idempotency replay missing execution request row");
    }
    return { ok: true, requestId: existing.id, execution_state: "requested", payload_hash: existing.payload_hash, action_state_hash: existing.action_state_hash };
  }

  const row = await insertExecutionRequest({
    action_id: input.actionId,
    adapter_id: input.adapterId,
    requested_by: input.operatorId,
    execution_state: "requested",
    payload_hash,
    payload_json: input.payload,
    action_state_hash,
    reversibility: input.reversibility,
    irreversible_reason: input.irreversibleReason,
    requested_at: new Date().toISOString(),
    expires_at: input.expiresAtUtc,
    idempotency_key: input.idempotencyKey,
    harness_run_id: input.harnessRunId ?? null
  });

  await upsertIdempotencyRecord({
    operationType: "execution_request",
    actionId: input.actionId,
    executionRequestId: row.id,
    idempotencyKey: input.idempotencyKey,
    requestHash,
    responseSnapshot: { ok: true, requestId: row.id, payload_hash, action_state_hash },
    completionState: "completed"
  });

  return { ok: true, requestId: row.id, execution_state: "requested", payload_hash, action_state_hash };
}
