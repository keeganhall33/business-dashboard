import { withJobRun } from "./jobLogger";
import { getTasksAwaitingApproval, getRecentTasks } from "@/lib/supabase/queries";
import { runStaleChecks } from "./staleChecks";
import { enforceDailyIdeaQuotas } from "./ideaQuota";
import { createOrUpdateAlert, makeAlertDedupeKey, resolveAlertByKey } from "./alerting";

const HOUR_MS = 60 * 60 * 1000;

function hoursSince(dateString?: string | null) {
  if (!dateString) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(dateString).getTime()) / HOUR_MS;
}

export async function runEveningCloseout() {
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

      const stale = await runStaleChecks();
      const ideaQuota = await enforceDailyIdeaQuotas({ source: "evening-closeout" });

      // Enforcement alerts
      const approvalsKey = makeAlertDedupeKey(["evening_closeout", "pending_approvals"]);
      if (awaitingApproval.length > 0) {
        await createOrUpdateAlert({
          alertType: "evening_closeout",
          severity: awaitingApproval.length > 10 ? "high" : "medium",
          title: "Pending approvals at closeout",
          summary: `${awaitingApproval.length} task(s) awaiting approval.`,
          dedupeKey: approvalsKey
        });
      } else {
        await resolveAlertByKey(approvalsKey);
      }

      const staleCriticalKey = makeAlertDedupeKey(["evening_closeout", "critical_stale_tasks"]);
      if (criticalTasksStale.length > 0) {
        await createOrUpdateAlert({
          alertType: "evening_closeout",
          severity: "high",
          title: "Critical tasks stale",
          summary: `${criticalTasksStale.length} critical task(s) stale > 24h.`,
          dedupeKey: staleCriticalKey
        });
      } else {
        await resolveAlertByKey(staleCriticalKey);
      }

      const summary = `System closed with ${criticalTasksStale.length} critical stale task(s) and ${awaitingApproval.length} pending approvals.`;

      return {
        pendingApprovals: awaitingApproval.length,
        criticalTasksStale: criticalTasksStale.length,
        alertsCreated: stale.alertsCreatedOrUpdated,
        ideaQuotaMissingAgents: ideaQuota.missingAgents,
        ideaQuotaAlertsCreated: ideaQuota.alertsCreatedOrUpdated,
        summary
      };
    },
    summarize: (result) => ({ summary: result.summary, detailsJson: result })
  });
}
