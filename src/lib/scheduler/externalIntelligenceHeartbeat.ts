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
import { evaluateInternalOrchestrationOperationalHealthV1 } from "@/lib/external-intelligence/orchestration/operational-health";
import { remainingLeaseMs, runWithTimeout } from "@/lib/external-intelligence/orchestration/timeout";

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
      // Upper-bounded lease; renewed between handlers.
      const leaseSeconds = 300;
      const now = new Date();
      const nowIso = now.toISOString();
      const nowYmd = nowIso.slice(0, 10);

      const safetyMarginSeconds = 20;

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
        const renewed0 = await renewInternalOrchestrationLockV1({
          lock_key: lockKey,
          lease_token: lease.lease_token,
          lease_seconds: leaseSeconds
        });
        if (!renewed0.renewed) return { status: "blocked", reason: "lock_renewal_failed" };

        // Ensure DB contains canonical job definitions (still disabled by default).
        const jobsRepo = new InternalOrchestrationJobsRepository();
        await jobsRepo.upsertDefinitions(INTERNAL_ORCHESTRATION_JOBS_V1);

        // Recurring activation: governed by DB enabled flags + next_run_at.
        const enabledJobs = await jobsRepo.listEnabledJobsForEnv("production");

        const handlers: Record<InternalOrchestrationJobKey, (signal: AbortSignal) => Promise<unknown>> = {
          "expired-lease-recovery-v1": (signal) => runExpiredLeaseRecoveryV1({ signal }),
          "expired-milestone-alert-cleanup-v1": (signal) => runExpiredMilestoneAlertCleanupV1({ now_iso: nowIso, signal }),
          "external-source-watchdog-v1": (signal) => runExternalSourceWatchdogV1({ now_iso: nowIso, signal }),
          "milestone-horizon-scan-v1": (signal) => runMilestoneHorizonScanV1({ now_ymd: nowYmd, now_iso: nowIso, signal })
        };

        for (const job of enabledJobs) {
          const jobName = job.job_name as InternalOrchestrationJobKey;
          const runner = handlers[jobName];

          if (!isDueUtc({ now_iso: nowIso, next_run_at: job.next_run_at })) {
            results[jobName] = { status: "skipped", reason: "not_due", next_run_at: job.next_run_at };
            continue;
          }

          // Renew lease before starting each handler.
          const renewedBefore = await renewInternalOrchestrationLockV1({
            lock_key: lockKey,
            lease_token: lease.lease_token,
            lease_seconds: leaseSeconds
          });
          if (!renewedBefore.renewed || !renewedBefore.expires_at) return { status: "blocked", reason: "lock_renewal_failed" };

          const leaseRemainingMs = remainingLeaseMs({ now_iso: nowIso, expires_at_iso: renewedBefore.expires_at });
          const timeoutSeconds = Number(job.timeout_seconds);
          if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0 || timeoutSeconds > 600) {
            results[jobName] = { status: "failed", error_code: "invalid_timeout" };
            break;
          }
          const requiredMs = (timeoutSeconds + safetyMarginSeconds) * 1000;
          if (timeoutSeconds + safetyMarginSeconds > leaseSeconds) {
            results[jobName] = { status: "failed", error_code: "handler_timeout_exceeds_lease" };
            break;
          }
          if (leaseRemainingMs < requiredMs) {
            results[jobName] = { status: "blocked", reason: "insufficient_lease_time" };
            break;
          }

          try {
            const timed = await runWithTimeout({
              name: jobName,
              timeout_ms: timeoutSeconds * 1000,
              fn: (signal) => runner(signal)
            });

            if (!timed.ok) {
              // Timeout: do not continue to later handlers.
              await jobsRepo.updateAfterRun({
                job_name: jobName,
                next_run_at: job.next_run_at ?? nowIso,
                now_iso: nowIso,
                succeeded: false
              });
              results[jobName] = { status: "failed", error_code: timed.code, error: timed.safe_summary };
              break;
            }

            const out = timed.value;
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
            break;
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
        // Staleness and repeated failure evaluation uses existing alert mechanism.
        // It must not treat lock contention as an incident.
        await evaluateInternalOrchestrationOperationalHealthV1({ now_iso: nowIso });
        await releaseInternalOrchestrationLockV1({ lock_key: lockKey, lease_token: lease.lease_token });
      }
    },
    summarize: (result) => ({
      summary: `B3 heartbeat: ${result.status}`,
      detailsJson: result as Record<string, unknown>
    })
  });
}
