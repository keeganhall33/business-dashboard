import { ExecutionDomainError } from "@/lib/actions/execution/domain-errors";
import { getConfirmationTtlSeconds } from "@/lib/actions/execution/confirmation-ttl";
import { requireHumanOperatorId } from "@/lib/actions/execution/operator";
import { getAction } from "@/lib/actions/action-store";
import { executionActionStateHash } from "@/lib/actions/execution/action-state-hash";
import { getExecutionRequestById, clearCurrentConfirmations, insertConfirmation, updateExecutionRequestState } from "@/lib/actions/execution/execution-repo";
import { upsertIdempotencyRecord, computeRequestHash } from "@/lib/actions/execution/idempotency-service";
import { isValidExecutionTransition } from "@/lib/actions/execution/execution-transitions";

export async function confirmExecutionRequest(input: {
  executionRequestId: string;
  operatorActor: string;
  idempotencyKey: string;
  irreversibleAcknowledged: boolean;
  approvalSnapshot: Record<string, unknown>;
}): Promise<{ ok: true; confirmationId: string; confirmation_expires_at: string }>
{
  const operatorId = requireHumanOperatorId(input.operatorActor);
  const req = await getExecutionRequestById(input.executionRequestId);
  if (!req) throw new ExecutionDomainError({ code: "EXECUTION_CONFIRMATION_REQUIRED", message: "Execution request not found", httpStatus: 404 });

  if (req.execution_state !== "confirmation_required") {
    throw new ExecutionDomainError({ code: "EXECUTION_INVALID_TRANSITION", message: "Confirmation only allowed after dry run", httpStatus: 400 });
  }

  // Dry run must exist and not be expired (stored in payload_json.dry_run)
  const dryRun = (req.payload_json as Record<string, unknown>)["dry_run"] as Record<string, unknown> | undefined;
  const expiresAtUtc = typeof dryRun?.["expiresAtUtc"] === "string" ? (dryRun["expiresAtUtc"] as string) : null;
  if (!expiresAtUtc) {
    throw new ExecutionDomainError({ code: "EXECUTION_DRY_RUN_REQUIRED", message: "Missing dry-run result", httpStatus: 400 });
  }
  if (Date.parse(expiresAtUtc) <= Date.now()) {
    throw new ExecutionDomainError({ code: "EXECUTION_DRY_RUN_EXPIRED", message: "Dry run has expired", httpStatus: 400 });
  }

  const action = await getAction(req.action_id);
  if (!action) throw new ExecutionDomainError({ code: "EXECUTION_ACTION_NOT_APPROVED", message: "Action not found", httpStatus: 404 });
  if (!(action.status === "approved" && action.current_level === "L4_APPROVED_FOR_EXECUTION")) {
    throw new ExecutionDomainError({ code: "EXECUTION_ACTION_NOT_APPROVED", message: "Action is no longer approved", httpStatus: 400 });
  }
  if (action.expires_at && Date.parse(action.expires_at) <= Date.now()) {
    throw new ExecutionDomainError({ code: "EXECUTION_EVIDENCE_STALE", message: "Action evidence is expired", httpStatus: 400 });
  }

  const currentActionStateHash = executionActionStateHash(action);
  if (currentActionStateHash !== req.action_state_hash) {
    throw new ExecutionDomainError({ code: "EXECUTION_ACTION_STATE_CHANGED", message: "Action state changed since request", httpStatus: 409 });
  }

  if (req.reversibility === "irreversible" && !input.irreversibleAcknowledged) {
    throw new ExecutionDomainError({ code: "EXECUTION_IRREVERSIBLE_ACK_REQUIRED", message: "Irreversible execution requires explicit acknowledgement", httpStatus: 400 });
  }

  const ttl = getConfirmationTtlSeconds();
  const confirmation_expires_at = new Date(Date.now() + ttl * 1000).toISOString();

  const requestHash = computeRequestHash({
    op: "execution_confirm",
    executionRequestId: req.id,
    payload_hash: req.payload_hash,
    action_state_hash: req.action_state_hash,
    operatorId,
    irreversibleAcknowledged: input.irreversibleAcknowledged,
    confirmation_expires_at
  });

  const idem = await upsertIdempotencyRecord({
    operationType: "execution_confirm",
    actionId: req.action_id,
    executionRequestId: req.id,
    idempotencyKey: input.idempotencyKey,
    requestHash,
    responseSnapshot: { ok: true },
    completionState: "started"
  });
  if (idem.replay) {
    // Return stored snapshot.
    const snap = idem.record.response_snapshot as Record<string, unknown>;
    const confirmationId = String(snap["confirmationId"] ?? "");
    const expires = String(snap["confirmation_expires_at"] ?? "");
    if (confirmationId && expires) return { ok: true, confirmationId, confirmation_expires_at: expires };
  }

  await clearCurrentConfirmations(req.id);
  const inserted = await insertConfirmation({
    execution_request_id: req.id,
    confirmed_by: operatorId,
    confirmed_at: new Date().toISOString(),
    confirmation_expires_at,
    payload_hash: req.payload_hash,
    action_state_hash: req.action_state_hash,
    approval_snapshot: input.approvalSnapshot,
    irreversible_acknowledged: input.irreversibleAcknowledged,
    is_current: true
  });

  if (!isValidExecutionTransition({ from: "confirmation_required", to: "confirmed" })) {
    throw new ExecutionDomainError({ code: "EXECUTION_INVALID_TRANSITION", message: "Invalid transition", httpStatus: 400 });
  }
  await updateExecutionRequestState({ id: req.id, execution_state: "confirmed" });

  await upsertIdempotencyRecord({
    operationType: "execution_confirm",
    actionId: req.action_id,
    executionRequestId: req.id,
    idempotencyKey: input.idempotencyKey,
    requestHash,
    responseSnapshot: { ok: true, confirmationId: inserted.id, confirmation_expires_at },
    completionState: "completed"
  });

  return { ok: true, confirmationId: inserted.id, confirmation_expires_at };
}

