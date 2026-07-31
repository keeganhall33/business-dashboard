import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ExecutionState, Reversibility } from "@/lib/actions/execution/adapter-contract";

export type ExecutionRequestRow = {
  id: string;
  action_id: string;
  adapter_id: string;
  requested_by: string;
  execution_state: ExecutionState;
  payload_hash: string;
  payload_json: Record<string, unknown>;
  action_state_hash: string;
  reversibility: Reversibility;
  irreversible_reason: string | null;
  requested_at: string;
  expires_at: string;
  idempotency_key: string;
  harness_run_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ExecutionConfirmationRow = {
  id: string;
  execution_request_id: string;
  confirmed_by: string;
  confirmed_at: string;
  confirmation_expires_at: string;
  payload_hash: string;
  action_state_hash: string;
  approval_snapshot: Record<string, unknown>;
  irreversible_acknowledged: boolean;
  is_current: boolean;
  created_at: string;
};

export async function getExecutionRequestById(id: string): Promise<ExecutionRequestRow | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("action_execution_requests_v1")
    .select(
      "id,action_id,adapter_id,requested_by,execution_state,payload_hash,payload_json,action_state_hash,reversibility,irreversible_reason,requested_at,expires_at,idempotency_key,harness_run_id,created_at,updated_at"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as ExecutionRequestRow) ?? null;
}

export async function getExecutionRequestByActionAndIdempotency(input: {
  actionId: string;
  idempotencyKey: string;
}): Promise<ExecutionRequestRow | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("action_execution_requests_v1")
    .select(
      "id,action_id,adapter_id,requested_by,execution_state,payload_hash,payload_json,action_state_hash,reversibility,irreversible_reason,requested_at,expires_at,idempotency_key,harness_run_id,created_at,updated_at"
    )
    .eq("action_id", input.actionId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as ExecutionRequestRow) ?? null;
}

export async function insertExecutionRequest(row: Omit<ExecutionRequestRow, "id" | "created_at" | "updated_at">): Promise<ExecutionRequestRow> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("action_execution_requests_v1")
    .insert(row)
    .select(
      "id,action_id,adapter_id,requested_by,execution_state,payload_hash,payload_json,action_state_hash,reversibility,irreversible_reason,requested_at,expires_at,idempotency_key,harness_run_id,created_at,updated_at"
    )
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Failed to insert execution request");
  return data as unknown as ExecutionRequestRow;
}

export async function updateExecutionRequestState(input: { id: string; execution_state: ExecutionState; payload_json_patch?: Record<string, unknown> }): Promise<ExecutionRequestRow> {
  const supabase = getSupabaseServerClient();
  const patch: Record<string, unknown> = { execution_state: input.execution_state };
  if (input.payload_json_patch) {
    // Persist dry-run/confirmation metadata without schema changes.
    patch.payload_json = input.payload_json_patch;
  }
  const { data, error } = await supabase
    .from("action_execution_requests_v1")
    .update(patch)
    .eq("id", input.id)
    .select(
      "id,action_id,adapter_id,requested_by,execution_state,payload_hash,payload_json,action_state_hash,reversibility,irreversible_reason,requested_at,expires_at,idempotency_key,harness_run_id,created_at,updated_at"
    )
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Failed to update execution request");
  return data as unknown as ExecutionRequestRow;
}

export async function insertConfirmation(row: Omit<ExecutionConfirmationRow, "id" | "created_at">): Promise<ExecutionConfirmationRow> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("action_execution_confirmations_v1")
    .insert(row)
    .select(
      "id,execution_request_id,confirmed_by,confirmed_at,confirmation_expires_at,payload_hash,action_state_hash,approval_snapshot,irreversible_acknowledged,is_current,created_at"
    )
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Failed to insert confirmation");
  return data as unknown as ExecutionConfirmationRow;
}

export async function clearCurrentConfirmations(executionRequestId: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("action_execution_confirmations_v1")
    .update({ is_current: false })
    .eq("execution_request_id", executionRequestId)
    .eq("is_current", true);
  if (error) throw error;
}

export async function getCurrentConfirmation(executionRequestId: string): Promise<ExecutionConfirmationRow | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("action_execution_confirmations_v1")
    .select(
      "id,execution_request_id,confirmed_by,confirmed_at,confirmation_expires_at,payload_hash,action_state_hash,approval_snapshot,irreversible_acknowledged,is_current,created_at"
    )
    .eq("execution_request_id", executionRequestId)
    .eq("is_current", true)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as ExecutionConfirmationRow) ?? null;
}

