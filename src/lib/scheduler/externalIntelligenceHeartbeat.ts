import { withJobRun } from "@/lib/scheduler/jobLogger";
import {
  acquireInternalOrchestrationLockV1,
  releaseInternalOrchestrationLockV1,
  renewInternalOrchestrationLockV1
} from "@/lib/external-intelligence/orchestration/lock";
import { runExternalSourceWatchdogV1 } from "@/lib/external-intelligence/orchestration/handlers/watchdog-v1";
import { runMilestoneHorizonScanV1 } from "@/lib/external-intelligence/orchestration/handlers/milestone-horizon-scan-v1";
import { runExpiredLeaseRecoveryV1 } from "@/lib/external-intelligence/orchestration/handlers/lease-recovery-v1";
import { runExpiredMilestoneAlertCleanupV1 } from "@/lib/external-intelligence/orchestration/handlers/milestone-alert-cleanup-v1";
import { createSystemAlert, getOpenAlertByDedupeKey } from "@/lib/supabase/queries";
import { INTERNAL_ORCHESTRATION_JOBS_V1 } from "@/lib/external-intelligence/orchestration/internal-jobs";
import type { InternalOrchestrationJobKey } from "@/lib/external-intelligence/orchestration/internal-jobs";
import { InternalOrchestrationJobsRepository } from "@/lib/external-intelligence/orchestration/internal-jobs.repository";
import { computeNextDueUtc, isDueUtc } from "@/lib/external-intelligence/orchestration/due";

function safeErrorSummary(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 300);
  return String(error).slice(0, 300);
}

async function alertOperationalFailure(input: { dedupeKey: string; title: string; summary: string }) {
  const existing = await getOpenAlertByDedupeKey(input.dedupeKey);
  if (existing) return { created: false };
  await createSystemAlert({
    alertType: "orchestration_failure",
    severity: "high",
    title: input.title,
    summary: input.summary,
    dedupeKey: input.dedupeKey
  });
  return { created: true };
}

/**
 * B3 central internal orchestration heartbeat.
 *
 * IMPORTANT: this runner must not execute any external collectors.
 */
export async function runExternalIntelligenceHeartbeatV1() {
  return withJobRun({
    jobKey: "external-intelligence-heartbeat",
    fn: async () => {
      // NOTE: The central scheduler tick does not provide atomic job claiming.
      // We must enforce global exclusion here using a durable DB lease.
      const lockKey = "external-intelligence-heartbeat";
      const leaseOwner = `heartbeat:${process.pid}`;
      const leaseSeconds = 120;
      const now = new Date();
      const nowIso = now.toISOString();
      const nowYmd = nowIso.slice(0, 10);

      const lease = await acquireInternalOrchestrationLockV1({
        lock_key: lockKey,
        lease_owner: leaseOwner,
        lease_seconds: leaseSeconds
      });

      if (!lease.acquired || !lease.lease_token) {
        return { status: "blocked", reason: "lock_not_acquired" };
      }

      try {
        const results: Record<string, unknown> = {};

        // Refresh lease before doing any work.
        await renewInternalOrchestrationLockV1({
          lock_key: lockKey,
          lease_token: lease.lease_token,
          lease_seconds: leaseSeconds
        });

        // Ensure DB contains canonical job definitions (still disabled by default).
        const jobsRepo = new InternalOrchestrationJobsRepository();
        await jobsRepo.upsertDefinitions(INTERNAL_ORCHESTRATION_JOBS_V1);

        // Recurring activation: governed by DB enabled flags + next_run_at.
        const enabledJobs = await jobsRepo.listEnabledJobsForEnv("production");

        const handlers: Record<InternalOrchestrationJobKey, () => Promise<unknown>> = {
          "expired-lease-recovery-v1": () => runExpiredLeaseRecoveryV1(),
          "expired-milestone-alert-cleanup-v1": () => runExpiredMilestoneAlertCleanupV1({ now_iso: nowIso }),
          "external-source-watchdog-v1": () => runExternalSourceWatchdogV1({ now_iso: nowIso }),
          "milestone-horizon-scan-v1": () => runMilestoneHorizonScanV1({ now_ymd: nowYmd, now_iso: nowIso })
        };

        for (const job of enabledJobs) {
          const jobName = job.job_name as InternalOrchestrationJobKey;
          const runner = handlers[jobName];

          if (!isDueUtc({ now_iso: nowIso, next_run_at: job.next_run_at })) {
            results[jobName] = { status: "skipped", reason: "not_due", next_run_at: job.next_run_at };
            continue;
          }

          try {
            const out = await runner();
            const cadenceType = job.cadence_type === "hourly" || job.cadence_type === "daily" ? job.cadence_type : "daily";
            const nextDue = computeNextDueUtc({
              now_iso: nowIso,
              cadence: { type: cadenceType, minutes: job.cadence_minutes ?? undefined }
            });
            await jobsRepo.updateAfterRun({ job_name: jobName, next_run_at: nextDue, now_iso: nowIso, succeeded: true });
            results[jobName] = { status: "succeeded", next_run_at: nextDue, output: out };
          } catch (e) {
            // Failure: keep next_run_at unchanged so hourly heartbeat can retry.
            await jobsRepo.updateAfterRun({
              job_name: jobName,
              next_run_at: job.next_run_at ?? nowIso,
              now_iso: nowIso,
              succeeded: false
            });
            results[jobName] = { status: "failed", error: safeErrorSummary(e) };
          }
        }

        return {
          status: "succeeded",
          now: nowIso,
          results
        };
      } catch (error) {
        await alertOperationalFailure({
          dedupeKey: `orchestration:heartbeat:failed`,
          title: "Internal orchestration heartbeat failed",
          summary: safeErrorSummary(error)
        });
        throw error;
      } finally {
        await releaseInternalOrchestrationLockV1({ lock_key: lockKey, lease_token: lease.lease_token });
      }
    },
    summarize: (result) => ({
      summary: `B3 heartbeat: ${result.status}`,
      detailsJson: result as Record<string, unknown>
    })
  });
}
