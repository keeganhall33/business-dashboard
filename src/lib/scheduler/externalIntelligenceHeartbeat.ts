import { withJobRun } from "@/lib/scheduler/jobLogger";
import { acquireGlobalOrchestrationLockV1, releaseGlobalOrchestrationLockV1 } from "@/lib/external-intelligence/orchestration/lock";
import { runExternalSourceWatchdogV1 } from "@/lib/external-intelligence/orchestration/handlers/watchdog-v1";
import { runMilestoneHorizonScanV1 } from "@/lib/external-intelligence/orchestration/handlers/milestone-horizon-scan-v1";
import { runExpiredLeaseRecoveryV1 } from "@/lib/external-intelligence/orchestration/handlers/lease-recovery-v1";
import { runExpiredMilestoneAlertCleanupV1 } from "@/lib/external-intelligence/orchestration/handlers/milestone-alert-cleanup-v1";
import { createSystemAlert, getOpenAlertByDedupeKey } from "@/lib/supabase/queries";

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
      const lockKey = 914_000_001;
      const now = new Date();
      const nowIso = now.toISOString();
      const nowYmd = nowIso.slice(0, 10);

      const { acquired } = await acquireGlobalOrchestrationLockV1({ lock_key: lockKey });
      if (!acquired) {
        return { status: "blocked", reason: "lock_not_acquired" };
      }

      try {
        const results: Record<string, unknown> = {};

        results["expired-lease-recovery-v1"] = await runExpiredLeaseRecoveryV1();
        results["expired-milestone-alert-cleanup-v1"] = await runExpiredMilestoneAlertCleanupV1({ now_iso: nowIso });
        results["external-source-watchdog-v1"] = await runExternalSourceWatchdogV1({ now_iso: nowIso });
        results["milestone-horizon-scan-v1"] = await runMilestoneHorizonScanV1({ now_ymd: nowYmd, now_iso: nowIso });

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
        await releaseGlobalOrchestrationLockV1({ lock_key: lockKey });
      }
    },
    summarize: (result) => ({
      summary: `B3 heartbeat: ${result.status}`,
      detailsJson: result as Record<string, unknown>
    })
  });
}

