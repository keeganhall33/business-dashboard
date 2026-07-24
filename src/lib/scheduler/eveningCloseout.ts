import { withJobRun } from "./jobLogger";
import { getTasksAwaitingApproval, getRecentTasks } from "@/lib/supabase/queries";
import { runStaleChecks } from "./staleChecks";
import { enforceDailyIdeaQuotas } from "./ideaQuota";
import { createOrUpdateAlert, makeAlertDedupeKey, resolveAlertByKey } from "./alerting";
import {
  describeMode,
  getEnforcementMode,
  modeAllowsAlerts,
  modeIsDisabled
} from "./enforcement";
import { writeObserveReport } from "./observeReports";

const HOUR_MS = 60 * 60 * 1000;

function hoursSince(dateString?: string | null) {
  if (!dateString) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(dateString).getTime()) / HOUR_MS;
}

export async function runEveningCloseout() {
  const mode = await getEnforcementMode("evening-closeout");
  if (modeIsDisabled(mode)) {
    return withJobRun({
      jobKey: "evening-closeout",
      fn: async () => ({ skipped: true, mode }),
      summarize: () => ({ summary: `Skipped (${describeMode(mode)})`, detailsJson: { skipped: true, mode } })
    });
  }

  const allowAlerts = modeAllowsAlerts(mode);
  const simulatedAlerts: Array<{ action: "create" | "resolve"; title: string; severity?: string }> = [];

  return withJobRun({
    jobKey: "evening-closeout",
    fn: async () => {
      const [awaitingApproval, tasks] = await Promise.all([
        getTasksAwaitingApproval(200),
        getRecentTasks(200)
      ]);

      type TaskRow = {
        priority: string;
        status: string;
        updated_at?: string | null;
        created_at?: string | null;
      };

      const criticalTasksStale = tasks.filter(
        (t: TaskRow) =>
          t.priority === "critical" &&
          ["pending", "approved", "in_progress"].includes(t.status) &&
          hoursSince(t.updated_at ?? t.created_at) > 24
      );

      const stale = await runStaleChecks({ mode });
      const ideaQuota = await enforceDailyIdeaQuotas({ source: "evening-closeout", mode });

      // Enforcement alerts
      const approvalsKey = makeAlertDedupeKey(["evening_closeout", "pending_approvals"]);
      if (awaitingApproval.length > 0) {
        const severity = awaitingApproval.length > 10 ? "high" : "medium";
        if (allowAlerts) {
          await createOrUpdateAlert({
            alertType: "evening_closeout",
            severity,
            title: "Pending approvals at closeout",
            summary: `${awaitingApproval.length} task(s) awaiting approval.`,
            dedupeKey: approvalsKey
          });
        } else {
          simulatedAlerts.push({ action: "create", title: "Pending approvals at closeout", severity });
        }
      } else if (allowAlerts) {
        await resolveAlertByKey(approvalsKey);
      } else {
        simulatedAlerts.push({ action: "resolve", title: "Resolve pending approvals alert", severity: "info" });
      }

      const staleCriticalKey = makeAlertDedupeKey(["evening_closeout", "critical_stale_tasks"]);
      if (criticalTasksStale.length > 0) {
        if (allowAlerts) {
          await createOrUpdateAlert({
            alertType: "evening_closeout",
            severity: "high",
            title: "Critical tasks stale",
            summary: `${criticalTasksStale.length} critical task(s) stale > 24h.`,
            dedupeKey: staleCriticalKey
          });
        } else {
          simulatedAlerts.push({ action: "create", title: "Critical tasks stale", severity: "high" });
        }
      } else if (allowAlerts) {
        await resolveAlertByKey(staleCriticalKey);
      } else {
        simulatedAlerts.push({ action: "resolve", title: "Resolve critical stale tasks alert", severity: "info" });
      }

      const summary = `System closed with ${criticalTasksStale.length} critical stale task(s) and ${awaitingApproval.length} pending approvals.`;
      const combinedAlerts = [...simulatedAlerts, ...stale.simulatedAlerts, ...(ideaQuota.simulatedAlerts ?? [])];

      const observeReport =
        mode !== "active"
          ? await writeObserveReport("evening-closeout", {
              mode,
              alerts: combinedAlerts,
              tasks: [],
              notes: [
                "Observe-only run; no alerts created.",
                `${criticalTasksStale.length} critical tasks appear stale >24h.`
              ]
            })
          : null;

      return {
        skipped: false,
        mode,
        pendingApprovals: awaitingApproval.length,
        criticalTasksStale: criticalTasksStale.length,
        alertsCreated: stale.alertsCreatedOrUpdated,
        ideaQuotaMissingAgents: ideaQuota.missingAgents,
        ideaQuotaAlertsCreated: ideaQuota.alertsCreatedOrUpdated,
        summary,
        simulatedAlerts: observeReport?.sampleAlerts ?? [],
        suppressedAlerts: observeReport?.suppressedBySeverity ?? undefined,
        observeReportKey: observeReport ? "scheduler_observe_evening-closeout" : undefined,
        topIssues: observeReport?.topIssues ?? [],
        eligibleAlerts: observeReport?.eligibleAlerts ?? [],
        groupedAlerts: observeReport?.groupedAlerts ?? [],
        manualReviewAlerts: observeReport?.manualReviewAlerts ?? [],
        blockedAlerts: observeReport?.blockedAlerts ?? [],
        suppressedSummary: observeReport?.suppressedSummary,
        simulatedTasks: []
      };
    },
    summarize: (result) => ({
      summary: result.skipped ? `Skipped (${describeMode(mode)})` : result.summary,
      detailsJson: result
    })
  });
}
