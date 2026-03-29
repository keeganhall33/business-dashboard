import { withJobRun } from "./jobLogger";
import { getTasksAwaitingApproval, getRecentTasks } from "@/lib/supabase/queries";
import { runStaleChecks } from "./staleChecks";

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

      const summary = `System closed with ${criticalTasksStale.length} critical stale task(s) and ${awaitingApproval.length} pending approvals.`;

      return {
        pendingApprovals: awaitingApproval.length,
        criticalTasksStale: criticalTasksStale.length,
        alertsCreated: stale.alertsCreatedOrUpdated,
        summary
      };
    },
    summarize: (result) => ({ summary: result.summary, detailsJson: result })
  });
}
