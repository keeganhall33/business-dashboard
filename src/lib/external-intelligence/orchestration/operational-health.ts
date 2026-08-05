import "@/lib/server-only";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createDedupedOperationalAlertV1 } from "@/lib/external-intelligence/orchestration/operational-alerts";

function hoursSince(nowIso: string, thenIso: string) {
  return (Date.parse(nowIso) - Date.parse(thenIso)) / (1000 * 60 * 60);
}

export async function evaluateInternalOrchestrationOperationalHealthV1(input: { now_iso: string }) {
  const supabase = getSupabaseServerClient();

  // Staleness checks (26 hours).
  const { data: jobs, error: jobsErr } = await supabase
    .from("internal_orchestration_jobs_v1")
    .select("job_name,enabled,last_success_at")
    .eq("environment", "production")
    .eq("enabled", true);
  if (jobsErr) throw jobsErr;

  for (const j of jobs ?? []) {
    const row = j as unknown as { job_name: string; last_success_at: string | null };
    const jobName = String(row.job_name);
    const lastSuccess = row.last_success_at;
    if (!lastSuccess) continue;
    const age = hoursSince(input.now_iso, lastSuccess);

    if (jobName === "external-source-watchdog-v1" && age > 26) {
      await createDedupedOperationalAlertV1({
        dedupeKey: "orchestration:watchdog:stale",
        severity: "high",
        title: "Watchdog stale",
        summary: `watchdog last_success_at age_hours=${age.toFixed(2)}`
      });
    }

    if (jobName === "milestone-horizon-scan-v1" && age > 26) {
      await createDedupedOperationalAlertV1({
        dedupeKey: "orchestration:milestone_scan:stale",
        severity: "high",
        title: "Milestone scan stale",
        summary: `milestone scan last_success_at age_hours=${age.toFixed(2)}`
      });
    }
  }

  // Repeated heartbeat failures: 3 consecutive failed runs.
  const { data: runs, error: runsErr } = await supabase
    .from("job_run_log")
    .select("status")
    .eq("job_key", "external-intelligence-heartbeat")
    .order("started_at", { ascending: false })
    .limit(5);
  if (runsErr) throw runsErr;

  let consecutiveFailed = 0;
  for (const r of runs ?? []) {
    const row = r as unknown as { status: string };
    const status = String(row.status);
    if (status === "failed") consecutiveFailed += 1;
    else break;
  }

  if (consecutiveFailed >= 3) {
    await createDedupedOperationalAlertV1({
      dedupeKey: "orchestration:heartbeat:repeated_failures",
      severity: "high",
      title: "Internal orchestration heartbeat repeatedly failing",
      summary: `consecutive_failed=${consecutiveFailed}`
    });
  }

  return { ok: true };
}
