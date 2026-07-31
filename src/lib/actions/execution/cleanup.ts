import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function cleanupExecutionHarnessRun(harnessRunId: string): Promise<{ ok: boolean; deleted: Record<string, number>; remaining: Record<string, number> }> {
  const supabase = getSupabaseServerClient();

  const { data: requests, error } = await supabase
    .from("action_execution_requests_v1")
    .select("id,action_id")
    .eq("harness_run_id", harnessRunId)
    .limit(5000);
  if (error) throw error;

  const requestIds = (requests ?? []).map((r) => r.id);
  const actionIds = Array.from(new Set((requests ?? []).map((r) => r.action_id)));

  const deleted: Record<string, number> = {
    steps: 0,
    attempts: 0,
    rollbacks: 0,
    confirmations: 0,
    idempotency: 0,
    locks: 0,
    requests: 0
  };

  if (requestIds.length) {
    // Steps depend on attempts; attempt ids first.
    const { data: attempts } = await supabase.from("action_execution_attempts_v1").select("id").in("execution_request_id", requestIds).limit(5000);
    const attemptIds = (attempts ?? []).map((a) => a.id);

    if (attemptIds.length) {
      const stepDel = await supabase.from("action_execution_steps_v1").delete().in("attempt_id", attemptIds).select("id");
      if (stepDel.error) throw stepDel.error;
      deleted.steps = (stepDel.data ?? []).length;
    }

    const rollbackDel = await supabase.from("action_execution_rollbacks_v1").delete().in("execution_request_id", requestIds).select("id");
    if (rollbackDel.error) throw rollbackDel.error;
    deleted.rollbacks = (rollbackDel.data ?? []).length;

    const attemptDel = await supabase.from("action_execution_attempts_v1").delete().in("execution_request_id", requestIds).select("id");
    if (attemptDel.error) throw attemptDel.error;
    deleted.attempts = (attemptDel.data ?? []).length;

    const confDel = await supabase.from("action_execution_confirmations_v1").delete().in("execution_request_id", requestIds).select("id");
    if (confDel.error) throw confDel.error;
    deleted.confirmations = (confDel.data ?? []).length;

    const idemDel = await supabase.from("action_execution_idempotency_v1").delete().in("execution_request_id", requestIds).select("id");
    if (idemDel.error) throw idemDel.error;
    deleted.idempotency = (idemDel.data ?? []).length;

    if (actionIds.length) {
      const lockDel = await supabase.from("action_execution_locks_v1").delete().in("action_id", actionIds).select("action_id");
      if (lockDel.error) throw lockDel.error;
      deleted.locks = (lockDel.data ?? []).length;
    }

    const reqDel = await supabase.from("action_execution_requests_v1").delete().in("id", requestIds).select("id");
    if (reqDel.error) throw reqDel.error;
    deleted.requests = (reqDel.data ?? []).length;
  }

  const remaining: Record<string, number> = {
    requests: 0
  };
  const { count, error: remainingErr } = await supabase
    .from("action_execution_requests_v1")
    .select("id", { count: "exact", head: true })
    .eq("harness_run_id", harnessRunId);
  if (remainingErr) throw remainingErr;
  remaining.requests = count ?? 0;

  return { ok: remaining.requests === 0, deleted, remaining };
}

