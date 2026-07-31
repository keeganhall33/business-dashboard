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

export type ExecutionAttemptRow = {
  id: string;
  execution_request_id: string;
  attempt_index: number;
  idempotency_key: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  provider_execution_id: string | null;
  result_json: Record<string, unknown> | null;
  external_side_effect_count: 0;
  created_at: string;
};

export type ExecutionStepRow = {
  id: string;
  attempt_id: string;
  step_index: number;
  name: string;
  status: string;
  details: Record<string, unknown> | null;
  created_at: string;
};

export type ExecutionRollbackRow = {
  id: string;
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
  created_at: string;
  updated_at: string;
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

export async function insertExecutionAttempt(row: Omit<ExecutionAttemptRow, "id" | "created_at">): Promise<ExecutionAttemptRow> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("action_execution_attempts_v1")
    .insert(row)
    .select("id,execution_request_id,attempt_index,idempotency_key,status,started_at,ended_at,provider_execution_id,result_json,external_side_effect_count,created_at")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Failed to insert execution attempt");
  return data as unknown as ExecutionAttemptRow;
}

export async function updateExecutionAttempt(input: {
  id: string;
  status: string;
  ended_at: string | null;
  provider_execution_id: string | null;
  result_json: Record<string, unknown> | null;
}): Promise<ExecutionAttemptRow> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("action_execution_attempts_v1")
    .update({
      status: input.status,
      ended_at: input.ended_at,
      provider_execution_id: input.provider_execution_id,
      result_json: input.result_json
    })
    .eq("id", input.id)
    .select("id,execution_request_id,attempt_index,idempotency_key,status,started_at,ended_at,provider_execution_id,result_json,external_side_effect_count,created_at")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Failed to update execution attempt");
  return data as unknown as ExecutionAttemptRow;
}

export async function insertExecutionStep(row: Omit<ExecutionStepRow, "id" | "created_at">): Promise<ExecutionStepRow> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("action_execution_steps_v1")
    .insert(row)
    .select("id,attempt_id,step_index,name,status,details,created_at")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Failed to insert execution step");
  return data as unknown as ExecutionStepRow;
}

export async function insertExecutionRollback(row: Omit<ExecutionRollbackRow, "id" | "created_at" | "updated_at">): Promise<ExecutionRollbackRow> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("action_execution_rollbacks_v1")
    .insert(row)
    .select(
      "id,execution_request_id,execution_attempt_id,requested_by,confirmed_by,rollback_state,rollback_plan_hash,preview_json,result_json,started_at,ended_at,external_side_effect_count,created_at,updated_at"
    )
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Failed to insert execution rollback");
  return data as unknown as ExecutionRollbackRow;
}

export async function updateExecutionRollbackState(input: {
  id: string;
  rollback_state: string;
  confirmed_by?: string | null;
  preview_json?: Record<string, unknown> | null;
  result_json?: Record<string, unknown> | null;
  started_at?: string | null;
  ended_at?: string | null;
}): Promise<ExecutionRollbackRow> {
  const supabase = getSupabaseServerClient();
  const patch: Record<string, unknown> = { rollback_state: input.rollback_state };
  if ("confirmed_by" in input) patch.confirmed_by = input.confirmed_by;
  if ("preview_json" in input) patch.preview_json = input.preview_json;
  if ("result_json" in input) patch.result_json = input.result_json;
  if ("started_at" in input) patch.started_at = input.started_at;
  if ("ended_at" in input) patch.ended_at = input.ended_at;
  const { data, error } = await supabase
    .from("action_execution_rollbacks_v1")
    .update(patch)
    .eq("id", input.id)
    .select(
      "id,execution_request_id,execution_attempt_id,requested_by,confirmed_by,rollback_state,rollback_plan_hash,preview_json,result_json,started_at,ended_at,external_side_effect_count,created_at,updated_at"
    )
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Failed to update execution rollback");
  return data as unknown as ExecutionRollbackRow;
}
