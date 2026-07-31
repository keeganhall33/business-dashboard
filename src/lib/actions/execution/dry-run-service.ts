import type { ExecutionAdapter } from "@/lib/actions/execution/adapter-contract";
import { ExecutionDomainError } from "@/lib/actions/execution/domain-errors";
import { isValidExecutionTransition } from "@/lib/actions/execution/execution-transitions";
import { getExecutionRequestById, updateExecutionRequestState } from "@/lib/actions/execution/execution-repo";
import { upsertIdempotencyRecord, computeRequestHash } from "@/lib/actions/execution/idempotency-service";

export async function runExecutionDryRun(input: {
  executionRequestId: string;
  adapter: ExecutionAdapter;
  operatorId: string;
  actionStateHash: string;
  payloadHash: string;
  idempotencyKey: string;
}): Promise<{ ok: true; execution_state: "confirmation_required"; dryRunExpiresAtUtc: string }>
{
  const req = await getExecutionRequestById(input.executionRequestId);
  if (!req) {
    throw new ExecutionDomainError({ code: "EXECUTION_DRY_RUN_REQUIRED", message: "Execution request not found", httpStatus: 404 });
  }
  if (req.execution_state !== "requested") {
    throw new ExecutionDomainError({ code: "EXECUTION_INVALID_TRANSITION", message: "Dry run only allowed from requested state", httpStatus: 400 });
  }

  const requestHash = computeRequestHash({
    op: "execution_dry_run",
    executionRequestId: req.id,
    payloadHash: req.payload_hash,
    actionStateHash: req.action_state_hash
  });

  const idem = await upsertIdempotencyRecord({
    operationType: "execution_dry_run",
    actionId: req.action_id,
    executionRequestId: req.id,
    idempotencyKey: input.idempotencyKey,
    requestHash,
    responseSnapshot: { ok: true },
    completionState: "started"
  });
  if (idem.replay) {
    const updated = await getExecutionRequestById(req.id);
    if (!updated) throw new Error("Dry-run replay missing request");
    const payloadJson = updated.payload_json as Record<string, unknown>;
    const dryRun = (payloadJson["dry_run"] as Record<string, unknown> | undefined) ?? undefined;
    const expiresAt = dryRun && typeof dryRun["expiresAtUtc"] === "string" ? (dryRun["expiresAtUtc"] as string) : null;
    return { ok: true, execution_state: "confirmation_required", dryRunExpiresAtUtc: expiresAt ?? updated.expires_at };
  }

  const ctx = {
    actionId: req.action_id,
    operatorId: input.operatorId,
    idempotencyKey: input.idempotencyKey,
    timeoutMs: 30_000,
    retryPolicy: { maxAttempts: 1, backoffMs: 0 },
    approval: { approvedAt: "", approvedBy: "", auditIds: [] },
    evidence: { snapshotId: "", hash: "", expiresAt: null },
    payload: { hash: req.payload_hash, summary: "", raw: req.payload_json },
    rollbackPlan: { required: req.reversibility !== "irreversible", hash: null, summary: "", raw: null },
    reversibility: req.reversibility,
    irreversibilityExplanation: req.irreversible_reason,
    auditMetadata: {}
  };

  const validated = await input.adapter.validate(ctx);
  if (!validated.ok) {
    await updateExecutionRequestState({ id: req.id, execution_state: "blocked" });
    throw new ExecutionDomainError({ code: "EXECUTION_DRY_RUN_REQUIRED", message: validated.errors.join("; "), httpStatus: 400 });
  }

  const dryRun = await input.adapter.dryRun(ctx);
  if (!dryRun.ok) {
    await updateExecutionRequestState({ id: req.id, execution_state: "blocked" });
    throw new ExecutionDomainError({ code: "EXECUTION_DRY_RUN_REQUIRED", message: dryRun.blockingReasons.join("; "), httpStatus: 400 });
  }

  // Transition requested -> dry_run_succeeded -> confirmation_required
  if (!isValidExecutionTransition({ from: "requested", to: "dry_run_succeeded" })) {
    throw new ExecutionDomainError({ code: "EXECUTION_INVALID_TRANSITION", message: "Invalid transition", httpStatus: 400 });
  }
  await updateExecutionRequestState({
    id: req.id,
    execution_state: "dry_run_succeeded",
    payload_json_patch: { ...req.payload_json, dry_run: dryRun }
  });

  if (!isValidExecutionTransition({ from: "dry_run_succeeded", to: "confirmation_required" })) {
    throw new ExecutionDomainError({ code: "EXECUTION_INVALID_TRANSITION", message: "Invalid transition", httpStatus: 400 });
  }
  await updateExecutionRequestState({ id: req.id, execution_state: "confirmation_required" });

  await upsertIdempotencyRecord({
    operationType: "execution_dry_run",
    actionId: req.action_id,
    executionRequestId: req.id,
    idempotencyKey: input.idempotencyKey,
    requestHash,
    responseSnapshot: { ok: true, dryRunExpiresAtUtc: dryRun.expiresAtUtc },
    completionState: "completed"
  });

  return { ok: true, execution_state: "confirmation_required", dryRunExpiresAtUtc: dryRun.expiresAtUtc };
}
