import { getSupabaseServerClient } from "@/lib/supabase/server";
import { canonicalJsonSha256Hex } from "@/lib/actions/execution/canonical-json";
import { ExecutionDomainError } from "@/lib/actions/execution/domain-errors";

export type ExecutionOperationType =
  | "execution_request"
  | "execution_dry_run"
  | "execution_confirm"
  | "execution_execute"
  | "execution_cancel"
  | "execution_rollback"
  | "execution_lock_acquire"
  | "execution_lock_release"
  | "execution_lock_recover";

export type IdempotencyRecord = {
  id: string;
  operation_type: string;
  action_id: string;
  execution_request_id: string | null;
  idempotency_key: string;
  request_hash: string;
  response_snapshot: Record<string, unknown>;
  completion_state: "started" | "completed" | "failed";
  created_at: string;
  updated_at: string;
};

export function computeRequestHash(input: unknown): string {
  return canonicalJsonSha256Hex(input);
}

export async function upsertIdempotencyRecord(input: {
  operationType: ExecutionOperationType;
  actionId: string;
  executionRequestId?: string | null;
  idempotencyKey: string;
  requestHash: string;
  responseSnapshot: Record<string, unknown>;
  completionState: "started" | "completed" | "failed";
}): Promise<{ replay: boolean; record: IdempotencyRecord }> {
  const key = input.idempotencyKey.trim();
  if (!key) {
    throw new ExecutionDomainError({ code: "EXECUTION_IDEMPOTENCY_CONFLICT", message: "Missing idempotency key", httpStatus: 400 });
  }

  const supabase = getSupabaseServerClient();

  // Try to read existing
  const { data: existing, error: existingErr } = await supabase
    .from("action_execution_idempotency_v1")
    .select("id,operation_type,action_id,execution_request_id,idempotency_key,request_hash,response_snapshot,completion_state,created_at,updated_at")
    .eq("operation_type", input.operationType)
    .eq("action_id", input.actionId)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (existingErr) throw existingErr;

  if (existing) {
    if (String(existing.request_hash) !== input.requestHash) {
      throw new ExecutionDomainError({
        code: "EXECUTION_IDEMPOTENCY_CONFLICT",
        message: "Idempotency key reused with different request hash",
        httpStatus: 409
      });
    }
    return { replay: true, record: existing as unknown as IdempotencyRecord };
  }

  const { data, error } = await supabase
    .from("action_execution_idempotency_v1")
    .insert({
      operation_type: input.operationType,
      action_id: input.actionId,
      execution_request_id: input.executionRequestId ?? null,
      idempotency_key: key,
      request_hash: input.requestHash,
      response_snapshot: input.responseSnapshot,
      completion_state: input.completionState
    })
    .select(
      "id,operation_type,action_id,execution_request_id,idempotency_key,request_hash,response_snapshot,completion_state,created_at,updated_at"
    )
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Failed to insert idempotency record");
  return { replay: false, record: data as unknown as IdempotencyRecord };
}

export async function completeIdempotencyRecord(input: {
  id: string;
  completionState: "completed" | "failed";
  responseSnapshot: Record<string, unknown>;
}): Promise<IdempotencyRecord> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("action_execution_idempotency_v1")
    .update({ completion_state: input.completionState, response_snapshot: input.responseSnapshot })
    .eq("id", input.id)
    .select("id,operation_type,action_id,execution_request_id,idempotency_key,request_hash,response_snapshot,completion_state,created_at,updated_at")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Failed to update idempotency record");
  return data as unknown as IdempotencyRecord;
}
