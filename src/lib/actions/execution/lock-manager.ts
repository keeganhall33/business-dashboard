import { getSupabaseServerClient } from "@/lib/supabase/server";
import { ExecutionDomainError } from "@/lib/actions/execution/domain-errors";
import { upsertIdempotencyRecord } from "@/lib/actions/execution/idempotency-service";
import { insertAuditEvent } from "@/lib/actions/action-store";

export type ExecutionLock = {
  action_id: string;
  execution_request_id: string | null;
  lock_owner: string;
  lock_reason: string;
  lock_acquired_at: string;
  lock_expires_at: string;
};

function nowIso() {
  return new Date().toISOString();
}

function isExpired(lock: ExecutionLock): boolean {
  return Date.parse(lock.lock_expires_at) <= Date.now();
}

export async function acquireExecutionLock(input: {
  actionId: string;
  executionRequestId: string | null;
  owner: string;
  reason: string;
  ttlSeconds: number;
  idempotencyKey: string;
}): Promise<{ ok: true; lock: ExecutionLock; recovered: boolean } | { ok: false; lock: ExecutionLock }>
{
  const expiresAt = new Date(Date.now() + Math.max(input.ttlSeconds, 5) * 1000).toISOString();
  const supabase = getSupabaseServerClient();

  // Idempotent acquire: if same idempotency key is replayed, return stored snapshot.
  const reqHash = `${input.actionId}:${input.executionRequestId ?? ""}:${input.owner}:${input.reason}:${expiresAt}`;
  const idem = await upsertIdempotencyRecord({
    operationType: "execution_lock_acquire",
    actionId: input.actionId,
    executionRequestId: input.executionRequestId,
    idempotencyKey: input.idempotencyKey,
    requestHash: reqHash,
    responseSnapshot: { op: "acquire", actionId: input.actionId },
    completionState: "started"
  });
  if (idem.replay) {
    const { data } = await supabase
      .from("action_execution_locks_v1")
      .select("action_id,execution_request_id,lock_owner,lock_reason,lock_acquired_at,lock_expires_at")
      .eq("action_id", input.actionId)
      .maybeSingle();
    if (!data) throw new Error("Lock replay missing lock row");
    return { ok: true, lock: data as unknown as ExecutionLock, recovered: false };
  }

  // Attempt insert (atomic due to PK).
  const insertRes = await supabase
    .from("action_execution_locks_v1")
    .insert({
      action_id: input.actionId,
      execution_request_id: input.executionRequestId,
      lock_owner: input.owner,
      lock_reason: input.reason,
      lock_expires_at: expiresAt
    })
    .select("action_id,execution_request_id,lock_owner,lock_reason,lock_acquired_at,lock_expires_at")
    .maybeSingle();

  if (!insertRes.error && insertRes.data) {
    await upsertIdempotencyRecord({
      operationType: "execution_lock_acquire",
      actionId: input.actionId,
      executionRequestId: input.executionRequestId,
      idempotencyKey: input.idempotencyKey,
      requestHash: reqHash,
      responseSnapshot: { ok: true, recovered: false, lock: insertRes.data },
      completionState: "completed"
    });
    return { ok: true, lock: insertRes.data as unknown as ExecutionLock, recovered: false };
  }

  // Existing lock row: inspect.
  const { data: existing, error: readErr } = await supabase
    .from("action_execution_locks_v1")
    .select("action_id,execution_request_id,lock_owner,lock_reason,lock_acquired_at,lock_expires_at")
    .eq("action_id", input.actionId)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!existing) throw new Error("Lock insert failed but existing lock not found");

  const existingLock = existing as unknown as ExecutionLock;
  if (!isExpired(existingLock)) {
    await upsertIdempotencyRecord({
      operationType: "execution_lock_acquire",
      actionId: input.actionId,
      executionRequestId: input.executionRequestId,
      idempotencyKey: input.idempotencyKey,
      requestHash: reqHash,
      responseSnapshot: { ok: false, locked: true, lock: existingLock },
      completionState: "completed"
    });
    return { ok: false, lock: existingLock };
  }

  // Stale recovery.
  const updateRes = await supabase
    .from("action_execution_locks_v1")
    .update({
      execution_request_id: input.executionRequestId,
      lock_owner: input.owner,
      lock_reason: input.reason,
      lock_acquired_at: nowIso(),
      lock_expires_at: expiresAt
    })
    .eq("action_id", input.actionId)
    .select("action_id,execution_request_id,lock_owner,lock_reason,lock_acquired_at,lock_expires_at")
    .maybeSingle();
  if (updateRes.error) throw updateRes.error;
  if (!updateRes.data) throw new Error("Failed to recover stale lock");

  await insertAuditEvent({
    action_id: input.actionId,
    event_type: "execution_lock_recovered",
    from_status: null,
    to_status: null,
    from_level: null,
    to_level: null,
    actor: input.owner,
    idempotency_key: input.idempotencyKey,
    note: "Recovered stale execution lock",
    metadata: { previous_owner: existingLock.lock_owner, previous_expires_at: existingLock.lock_expires_at }
  });

  await upsertIdempotencyRecord({
    operationType: "execution_lock_acquire",
    actionId: input.actionId,
    executionRequestId: input.executionRequestId,
    idempotencyKey: input.idempotencyKey,
    requestHash: reqHash,
    responseSnapshot: { ok: true, recovered: true, lock: updateRes.data },
    completionState: "completed"
  });

  return { ok: true, lock: updateRes.data as unknown as ExecutionLock, recovered: true };
}

export async function releaseExecutionLock(input: { actionId: string; owner: string; idempotencyKey: string }): Promise<void> {
  const supabase = getSupabaseServerClient();
  const reqHash = `${input.actionId}:${input.owner}`;
  const idem = await upsertIdempotencyRecord({
    operationType: "execution_lock_release",
    actionId: input.actionId,
    executionRequestId: null,
    idempotencyKey: input.idempotencyKey,
    requestHash: reqHash,
    responseSnapshot: { op: "release", actionId: input.actionId },
    completionState: "started"
  });
  if (idem.replay) return;

  const { error } = await supabase.from("action_execution_locks_v1").delete().eq("action_id", input.actionId);
  if (error) throw error;
  await upsertIdempotencyRecord({
    operationType: "execution_lock_release",
    actionId: input.actionId,
    executionRequestId: null,
    idempotencyKey: input.idempotencyKey,
    requestHash: reqHash,
    responseSnapshot: { ok: true },
    completionState: "completed"
  });
}

export async function inspectExecutionLock(actionId: string): Promise<ExecutionLock | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("action_execution_locks_v1")
    .select("action_id,execution_request_id,lock_owner,lock_reason,lock_acquired_at,lock_expires_at")
    .eq("action_id", actionId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as ExecutionLock) ?? null;
}

export function assertUnlockedOrExpired(lock: ExecutionLock | null): void {
  if (!lock) return;
  if (!isExpired(lock)) {
    throw new ExecutionDomainError({
      code: "EXECUTION_LOCKED",
      message: "Action is currently locked for execution",
      httpStatus: 409,
      details: { lock_owner: lock.lock_owner, lock_expires_at: lock.lock_expires_at }
    });
  }
}
