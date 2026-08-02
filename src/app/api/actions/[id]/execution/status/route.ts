import { enforceDashboardAuth } from "@/lib/auth/dashboard";
import { executionError, ok } from "@/lib/api/execution-responses";

import { evaluateExecutionGates } from "@/lib/actions/execution/execution-kill-switch";
import { createMilestone12AdapterRegistry, milestone12RegisteredAdapterIds } from "@/lib/actions/execution/adapters/mock/mock-adapter-registry";
import { getExecutionRequestById, getCurrentConfirmation } from "@/lib/actions/execution/execution-repo";
import { inspectExecutionLock } from "@/lib/actions/execution/lock-manager";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ExecutionAdapterId } from "@/lib/actions/execution/adapter-contract";

export const runtime = "nodejs";

function redactPayload(payload: Record<string, unknown>) {
  const dryRun = payload["dry_run"];
  return {
    has_payload: true,
    dry_run: (dryRun && typeof dryRun === "object") ? dryRun : null
  };
}

export async function GET(request: Request) {
  const authResponse = enforceDashboardAuth(request);
  if (authResponse) return authResponse;

  try {
    const url = new URL(request.url);
    const executionRequestId = String(url.searchParams.get("executionRequestId") ?? "").trim();
    if (!executionRequestId) throw new Error("Missing executionRequestId");

    const req = await getExecutionRequestById(executionRequestId);
    if (!req) throw new Error("Execution request not found");

    const registry = createMilestone12AdapterRegistry();
    const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    const gates = evaluateExecutionGates({
      actionId: req.action_id,
      category: "unknown",
      adapterId: req.adapter_id as ExecutionAdapterId,
      supabaseUrl,
      emergencyStop: registry.isEmergencyStopEnabled(req.action_id),
      adapterEnabled: registry.isAdapterEnabled(req.adapter_id as ExecutionAdapterId),
      categoryEnabled: true
    });

    const confirmation = await getCurrentConfirmation(req.id);
    const lock = await inspectExecutionLock(req.action_id);

    const supabase = getSupabaseServerClient();
    const attempts = await supabase
      .from("action_execution_attempts_v1")
      .select("id,attempt_index,status,started_at,ended_at,provider_execution_id,external_side_effect_count")
      .eq("execution_request_id", req.id)
      .order("created_at", { ascending: true });
    if (attempts.error) throw attempts.error;

    const attemptIds = (attempts.data ?? []).map((r) => String((r as Record<string, unknown>)["id"]));
    const stepsRes = attemptIds.length
      ? await supabase
          .from("action_execution_steps_v1")
          .select("attempt_id,step_index,name,status")
          .in("attempt_id", attemptIds)
          .order("step_index", { ascending: true })
      : { data: [] as unknown[], error: null as unknown };
    if ((stepsRes as { error: unknown }).error) throw (stepsRes as { error: unknown }).error;

    const rollbacks = await supabase
      .from("action_execution_rollbacks_v1")
      .select("id,rollback_state,started_at,ended_at,external_side_effect_count")
      .eq("execution_request_id", req.id)
      .order("created_at", { ascending: true });
    if (rollbacks.error) throw rollbacks.error;

    // Very compact summaries (no secrets).
    const idempotency = await supabase
      .from("action_execution_idempotency_v1")
      .select("operation_type", { count: "exact", head: false })
      .eq("action_id", req.action_id);
    if (idempotency.error) throw idempotency.error;
    const idemOps = (idempotency.data ?? []).map((r) => {
      const row = (r && typeof r === "object") ? (r as Record<string, unknown>) : {};
      return String(row["operation_type"] ?? "");
    });

    const audit = await supabase
      .from("action_audit_events_v1")
      .select("event_type")
      .eq("action_id", req.action_id)
      .order("created_at", { ascending: true });
    if (audit.error) throw audit.error;
    const auditTypes = (audit.data ?? []).map((r) => {
      const row = (r && typeof r === "object") ? (r as Record<string, unknown>) : {};
      return String(row["event_type"] ?? "");
    });

    return ok({
      ok: true,
      execution: {
        request: {
          id: req.id,
          action_id: req.action_id,
          adapter_id: req.adapter_id,
          execution_state: req.execution_state,
          payload_hash: req.payload_hash,
          action_state_hash: req.action_state_hash,
          reversibility: req.reversibility,
          expires_at: req.expires_at,
          payload: redactPayload(req.payload_json)
        },
        dry_run: (typeof req.payload_json === "object" && req.payload_json)
          ? ((req.payload_json as Record<string, unknown>)["dry_run"] ?? null)
          : null,
        confirmation: confirmation
          ? {
              confirmed_by: confirmation.confirmed_by,
              confirmation_expires_at: confirmation.confirmation_expires_at,
              irreversible_acknowledged: confirmation.irreversible_acknowledged
            }
          : null,
        lock,
        attempts: attempts.data ?? [],
        steps: (stepsRes as { data: unknown[] }).data ?? [],
        rollbacks: rollbacks.data ?? [],
        kill_switches: gates,
        adapters: { registered: milestone12RegisteredAdapterIds() },
        idempotency_summary: { op_counts: idemOps.reduce((m: Record<string, number>, op) => ((m[op] = (m[op] ?? 0) + 1), m), {}) },
        audit_summary: { count: auditTypes.length, types: auditTypes.slice(-20) }
      }
    });
  } catch (error) {
    return executionError(error, "Failed to fetch execution status");
  }
}
