import "@/lib/server-only";

import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";
import { B4_HEARTBEAT_JOB_KEY } from "./b4-activate-recurring-internal-orchestration";

export type B4DisableDeps = {
  nowIso: () => string;
  supabase: ReturnType<typeof getExternalIntelligenceSupabaseClient>;
};

export async function disableB4RecurringInternalOrchestration(deps: B4DisableDeps) {
  if (process.env.OPERATOR_ENVIRONMENT !== "production") {
    throw new Error("precondition_failed:operator_env_not_production");
  }
  if (process.env.B4_RECURRING_INTERNAL_ORCHESTRATION_APPROVED !== "true") {
    throw new Error("precondition_failed:missing_b4_approval_flag");
  }

  // Disable scheduled heartbeat row (do not delete history).
  const { error: schedError } = await deps.supabase
    .from("scheduled_jobs")
    .update({ is_active: false, updated_at: deps.nowIso() })
    .eq("job_key", B4_HEARTBEAT_JOB_KEY);
  if (schedError) throw schedError;

  // Disable the four internal jobs.
  const { error: jobsError } = await deps.supabase
    .from("internal_orchestration_jobs_v1")
    .update({ enabled: false, updated_at: deps.nowIso() })
    .eq("environment", "production")
    .in("job_name", [
      "external-source-watchdog-v1",
      "milestone-horizon-scan-v1",
      "expired-lease-recovery-v1",
      "expired-milestone-alert-cleanup-v1"
    ]);
  if (jobsError) throw jobsError;

  return { ok: true } as const;
}

async function main() {
  const supabase = getExternalIntelligenceSupabaseClient({});
  const deps: B4DisableDeps = { nowIso: () => new Date().toISOString(), supabase };
  await disableB4RecurringInternalOrchestration(deps);
}

if (process.argv[1]?.includes("b4-disable-recurring-internal-orchestration")) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  main().catch((e) => {
    console.error("B4 disable failed", { message: e?.message ?? String(e) });
    process.exitCode = 1;
  });
}
