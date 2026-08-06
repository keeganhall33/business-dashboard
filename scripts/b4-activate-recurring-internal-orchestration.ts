import "@/lib/server-only";

import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";

export const B4_HEARTBEAT_JOB_KEY = "external-intelligence-heartbeat" as const;
export const B4_HEARTBEAT_ROUTE_PATH = "/api/scheduler/tick" as const;

export type B4ActivationConfig = {
  job_key: typeof B4_HEARTBEAT_JOB_KEY;
  job_name: string;
  cron_expression: string;
  timezone: string;
  route_path: typeof B4_HEARTBEAT_ROUTE_PATH;

  enable_jobs: Array<
    | "external-source-watchdog-v1"
    | "milestone-horizon-scan-v1"
    | "expired-lease-recovery-v1"
    | "expired-milestone-alert-cleanup-v1"
  >;
};

export const DEFAULT_B4_CONFIG: B4ActivationConfig = {
  job_key: B4_HEARTBEAT_JOB_KEY,
  job_name: "External intelligence heartbeat",
  // Hourly at minute 0.
  cron_expression: "0 * * * *",
  timezone: "UTC",
  route_path: B4_HEARTBEAT_ROUTE_PATH,
  enable_jobs: [
    "external-source-watchdog-v1",
    "milestone-horizon-scan-v1",
    "expired-lease-recovery-v1",
    "expired-milestone-alert-cleanup-v1"
  ]
};

export type B4ActivateDeps = {
  nowIso: () => string;
  supabase: ReturnType<typeof getExternalIntelligenceSupabaseClient>;
};

export function requireB4ApprovalFlags() {
  if (process.env.OPERATOR_ENVIRONMENT !== "production") {
    throw new Error("precondition_failed:operator_env_not_production");
  }
  if (process.env.B4_RECURRING_INTERNAL_ORCHESTRATION_APPROVED !== "true") {
    throw new Error("precondition_failed:missing_b4_approval_flag");
  }
}

export async function snapshotB4SafetyGates(deps: B4ActivateDeps) {
  const supabase = deps.supabase;

  const [{ count: recurringRows }, { count: activeLeases }, { count: enabledSchedules }, { count: activeExternalJobs }] =
    await Promise.all([
      supabase
        .from("scheduled_jobs")
        .select("id", { count: "exact", head: true })
        .eq("job_key", B4_HEARTBEAT_JOB_KEY)
        .eq("is_active", true),
      supabase
        .from("internal_orchestration_locks_v1")
        .select("lock_key", { count: "exact", head: true })
        .eq("lock_key", B4_HEARTBEAT_JOB_KEY)
        .gt("expires_at", deps.nowIso()),
      supabase
        .from("external_collection_schedules_v1")
        .select("schedule_id", { count: "exact", head: true })
        .eq("enabled", true),
      supabase
        .from("external_collection_jobs_v1")
        .select("job_id", { count: "exact", head: true })
        .or(
          [
            "status.in.(queued,leased,running)",
            `and(status.eq.retry_wait,next_retry_at.is.null)`,
            `and(status.eq.retry_wait,next_retry_at.lte.${deps.nowIso()})`
          ].join(",")
        )
    ]);

  return {
    recurring_heartbeat_rows: recurringRows ?? 0,
    active_heartbeat_leases: activeLeases ?? 0,
    enabled_external_schedules: enabledSchedules ?? 0,
    active_external_jobs: activeExternalJobs ?? 0
  };
}

export async function upsertRecurringHeartbeatRow(deps: B4ActivateDeps, config: B4ActivationConfig) {
  const { error } = await deps.supabase.from("scheduled_jobs").upsert(
    {
      job_key: config.job_key,
      job_name: config.job_name,
      cron_expression: config.cron_expression,
      timezone: config.timezone,
      route_path: config.route_path,
      is_active: true,
      // Ensure it becomes eligible immediately; tick will compute next_run_at.
      next_run_at: deps.nowIso()
    },
    { onConflict: "job_key" }
  );
  if (error) throw error;
}

export async function enableInternalJobs(deps: B4ActivateDeps, jobNames: string[]) {
  const { error } = await deps.supabase
    .from("internal_orchestration_jobs_v1")
    .update({ enabled: true, updated_at: deps.nowIso() })
    .eq("environment", "production")
    .in("job_name", jobNames);
  if (error) throw error;
}

export async function activateB4RecurringInternalOrchestration(deps: B4ActivateDeps, config = DEFAULT_B4_CONFIG) {
  requireB4ApprovalFlags();

  const gates = await snapshotB4SafetyGates(deps);
  if (
    gates.recurring_heartbeat_rows !== 0 ||
    gates.active_heartbeat_leases !== 0 ||
    gates.enabled_external_schedules !== 0 ||
    gates.active_external_jobs !== 0
  ) {
    throw new Error("precondition_failed:b4_safety_gate_blocked");
  }

  await upsertRecurringHeartbeatRow(deps, config);
  await enableInternalJobs(deps, config.enable_jobs);

  return { ok: true } as const;
}

async function main() {
  const supabase = getExternalIntelligenceSupabaseClient({});
  const deps: B4ActivateDeps = { nowIso: () => new Date().toISOString(), supabase };
  await activateB4RecurringInternalOrchestration(deps);
}

if (process.argv[1]?.includes("b4-activate-recurring-internal-orchestration")) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  main().catch((e) => {
    console.error("B4 activation failed", { message: e?.message ?? String(e) });
    process.exitCode = 1;
  });
}
