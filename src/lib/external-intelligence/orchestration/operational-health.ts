import "@/lib/server-only";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSystemState, resolveSystemAlert } from "@/lib/supabase/queries";
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
    if (!lastSuccess) {
      // Enabled but never succeeded yet.
      if (jobName === "external-source-watchdog-v1") {
        await createDedupedOperationalAlertV1({
          dedupeKey: "orchestration:watchdog:stale",
          severity: "high",
          title: "Watchdog stale",
          summary: `watchdog never_succeeded`
        });
      }
      if (jobName === "milestone-horizon-scan-v1") {
        await createDedupedOperationalAlertV1({
          dedupeKey: "orchestration:milestone_scan:stale",
          severity: "high",
          title: "Milestone scan stale",
          summary: `milestone scan never_succeeded`
        });
      }
      continue;
    }
    const age = hoursSince(input.now_iso, lastSuccess);

    if (jobName === "external-source-watchdog-v1" && age > 26) {
      await createDedupedOperationalAlertV1({
        dedupeKey: "orchestration:watchdog:stale",
        severity: "high",
        title: "Watchdog stale",
        summary: `watchdog last_success_at age_hours=${age.toFixed(2)}`
      });
    } else if (jobName === "external-source-watchdog-v1") {
      await resolveSystemAlert("orchestration:watchdog:stale");
    }

    if (jobName === "milestone-horizon-scan-v1" && age > 26) {
      await createDedupedOperationalAlertV1({
        dedupeKey: "orchestration:milestone_scan:stale",
        severity: "high",
        title: "Milestone scan stale",
        summary: `milestone scan last_success_at age_hours=${age.toFixed(2)}`
      });
    } else if (jobName === "milestone-horizon-scan-v1") {
      await resolveSystemAlert("orchestration:milestone_scan:stale");
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

  const threshold = 3;
  if (consecutiveFailed >= threshold) {
    await createDedupedOperationalAlertV1({
      dedupeKey: "orchestration:heartbeat:repeated_failure",
      severity: "high",
      title: "Internal orchestration heartbeat repeatedly failing",
      summary: `consecutive_failed=${consecutiveFailed}`
    });
  } else {
    await resolveSystemAlert("orchestration:heartbeat:repeated_failure");
  }

  // Persistent lease failures: stored in system_state by heartbeat runner.
  const leaseState = await getSystemState("orchestration:lease_failures");
  const value = leaseState?.value_json as unknown as { consecutive?: number } | null;
  const consecutiveLeaseFailures = Number(value?.consecutive ?? 0);
  if (consecutiveLeaseFailures >= threshold) {
    await createDedupedOperationalAlertV1({
      dedupeKey: "orchestration:lease:persistent_failure",
      severity: "high",
      title: "Persistent orchestration lease failures",
      summary: `consecutive=${consecutiveLeaseFailures}`
    });
  } else {
    await resolveSystemAlert("orchestration:lease:persistent_failure");
  }

  return { ok: true };
}

export function evaluateOperationalEscalationV1(input: {
  now_iso: string;
  enabledJobs: Array<{ job_name: string; last_success_at: string | null }>;
  recentHeartbeatStatuses: string[];
}): {
  heartbeatConsecutiveFailed: number;
  watchdogStale: boolean;
  milestoneScanStale: boolean;
} {
  const isStale = (thenIso: string) => hoursSince(input.now_iso, thenIso) > 26;

  let watchdogStale = false;
  let milestoneScanStale = false;

  for (const j of input.enabledJobs) {
    if (!j.last_success_at) continue;
    if (j.job_name === "external-source-watchdog-v1" && isStale(j.last_success_at)) watchdogStale = true;
    if (j.job_name === "milestone-horizon-scan-v1" && isStale(j.last_success_at)) milestoneScanStale = true;
  }

  let consecutiveFailed = 0;
  for (const s of input.recentHeartbeatStatuses) {
    if (s === "failed") consecutiveFailed += 1;
    else break;
  }

  return {
    heartbeatConsecutiveFailed: consecutiveFailed,
    watchdogStale,
    milestoneScanStale
  };
}
