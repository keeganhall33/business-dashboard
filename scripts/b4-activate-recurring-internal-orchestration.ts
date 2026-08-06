import "@/lib/server-only";

import crypto from "node:crypto";

import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";

export const B4_HEARTBEAT_JOB_KEY = "external-intelligence-heartbeat" as const;
export const B4_HEARTBEAT_ROUTE_PATH = "/api/scheduler/tick" as const;
export const B4_EXPECTED_PROJECT_REF = "ibjsjosplgbqevmnvvpf" as const;
export const B4_CONFIGURATION_VERSION = "b4.recurring_internal_orchestration.v1" as const;

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

function parseProjectRefFromSupabaseUrl(url: string): string | null {
  // https://<ref>.supabase.co
  const match = url.match(/^https:\/\/([a-z0-9]{20})\.supabase\.co/i);
  return match?.[1] ?? null;
}

function stableStringify(value: unknown): string {
  if (value == null) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export function computeB4ConfigurationHash(config: B4ActivationConfig): string {
  const payload = stableStringify({
    configuration_version: B4_CONFIGURATION_VERSION,
    heartbeat: {
      job_key: config.job_key,
      cron_expression: config.cron_expression,
      timezone: config.timezone,
      route_path: config.route_path
    },
    internal_jobs: [...config.enable_jobs].sort()
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export function requireB4ApprovalFlags() {
  if (process.env.OPERATOR_ENVIRONMENT !== "production") {
    throw new Error("precondition_failed:operator_env_not_production");
  }
  if (process.env.B4_RECURRING_INTERNAL_ORCHESTRATION_APPROVED !== "true") {
    throw new Error("precondition_failed:missing_b4_approval_flag");
  }
}

export function requireExpectedProjectRef() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error("precondition_failed:missing_supabase_url");
  const ref = parseProjectRefFromSupabaseUrl(supabaseUrl);
  if (!ref) throw new Error("precondition_failed:unable_to_parse_project_ref");
  if (ref !== B4_EXPECTED_PROJECT_REF) throw new Error("precondition_failed:wrong_supabase_project");
  return ref;
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

export async function activateB4RecurringInternalOrchestration(deps: B4ActivateDeps, config = DEFAULT_B4_CONFIG) {
  requireB4ApprovalFlags();
  requireExpectedProjectRef();

  const activationId = process.env.B4_ACTIVATION_ID;
  if (!activationId) throw new Error("precondition_failed:missing_activation_id");
  const requestedBy = process.env.B4_REQUESTED_BY ?? "unknown";

  const configurationHash = computeB4ConfigurationHash(config);

  // Prefer the atomic DB boundary over script-level multi-write updates.
  const { data, error } = await deps.supabase.rpc("activate_external_intelligence_internal_orchestration_v1", {
    in_activation_id: activationId,
    in_configuration_version: B4_CONFIGURATION_VERSION,
    in_configuration_hash: configurationHash,
    in_environment: "production",
    in_requested_by: requestedBy,
    in_requested_at: deps.nowIso(),
    in_review_by: "owner",
    in_governing_policy_reference: "external-intelligence.phase-b4.v1",
    in_expected_project_ref: B4_EXPECTED_PROJECT_REF
  });
  if (error) throw new Error(`B4 activation RPC failed: ${error.message}`);
  return { ok: true, result: data } as const;
}

export async function inspectB4RecurringInternalOrchestration(deps: B4ActivateDeps) {
  requireExpectedProjectRef();
  const gates = await snapshotB4SafetyGates(deps);
  const [{ data: scheduled }, { data: internalJobs }] = await Promise.all([
    deps.supabase
      .from("scheduled_jobs")
      .select("job_key,cron_expression,timezone,route_path,is_active,next_run_at,last_run_at")
      .eq("job_key", B4_HEARTBEAT_JOB_KEY)
      .limit(1),
    deps.supabase
      .from("internal_orchestration_jobs_v1")
      .select("job_name,enabled,next_run_at,last_success_at,last_failure_at,environment")
      .eq("environment", "production")
      .in("job_name", DEFAULT_B4_CONFIG.enable_jobs)
      .order("job_name", { ascending: true })
  ]);

  return {
    ok: true,
    gates,
    scheduled_job: scheduled?.[0] ?? null,
    internal_jobs: internalJobs ?? []
  } as const;
}

async function main() {
  const supabase = getExternalIntelligenceSupabaseClient({});
  const deps: B4ActivateDeps = { nowIso: () => new Date().toISOString(), supabase };

  const mode = (process.env.B4_ACTION ?? "activate") as "inspect" | "activate";
  if (mode === "inspect") {
    const res = await inspectB4RecurringInternalOrchestration(deps);
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  const res = await activateB4RecurringInternalOrchestration(deps);
  console.log(JSON.stringify(res, null, 2));
}

if (process.argv[1]?.includes("b4-activate-recurring-internal-orchestration")) {
  main().catch((e) => {
    console.error("B4 activation failed", { message: e?.message ?? String(e) });
    process.exitCode = 1;
  });
}
