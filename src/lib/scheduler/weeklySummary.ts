import { getRecentTasks, getTaskCountsByStatus, upsertSystemState } from "@/lib/supabase/queries";
import { withJobRun } from "./jobLogger";

function nowIso() {
  return new Date().toISOString();
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

type TaskRow = {
  id: string;
  agent_key?: string | null;
  title: string;
  status: string;
  completed_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  result_summary?: string | null;
  deliverable_links?: unknown;
};

/**
 * Weekly summary
 *
 * Minimal v0: counts + recent completed deliverables for the last 7 days.
 * Stored in system_state.weekly_summary_latest for the CEO dashboard / recap views.
 */
export async function runWeeklySummary() {
  return withJobRun({
    jobKey: "weekly-summary",
    fn: async () => {
      const [counts, tasks] = await Promise.all([getTaskCountsByStatus(), getRecentTasks(400)]);
      const since = daysAgoIso(7);

      const rows = tasks as unknown as TaskRow[];

      const completedThisWeek = rows
        .filter((task) => task.status === "completed")
        .filter((task) => {
          const completedAt = task.completed_at ?? task.updated_at ?? task.created_at;
          return completedAt && new Date(completedAt).toISOString() >= since;
        })
        .slice(0, 100);

      const deliverables = completedThisWeek
        .filter((task) => {
          const links = Array.isArray(task.deliverable_links) ? task.deliverable_links : [];
          return links.length > 0 || (typeof task.result_summary === "string" && task.result_summary.trim());
        })
        .slice(0, 25)
        .map((task) => ({
          taskId: task.id,
          agentKey: task.agent_key ?? null,
          title: task.title,
          completedAt: task.completed_at ?? null,
          resultSummary: task.result_summary ?? null,
          deliverableLinks: Array.isArray(task.deliverable_links) ? task.deliverable_links : []
        }));

      const payload = {
        window: { days: 7, since },
        taskCountsByStatus: counts,
        completedCount: completedThisWeek.length,
        deliverables,
        updatedAt: nowIso()
      };

      await upsertSystemState("weekly_summary_latest", payload);

      return {
        completedCount: completedThisWeek.length,
        deliverablesCount: deliverables.length
      };
    },
    summarize: (result) => ({
      summary: `Completed: ${result.completedCount}, deliverables: ${result.deliverablesCount}`,
      detailsJson: result
    })
  });
}
