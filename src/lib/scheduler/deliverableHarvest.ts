import { getRecentTasks, upsertSystemState } from "@/lib/supabase/queries";
import { withJobRun } from "./jobLogger";

type HarvestedDeliverable = {
  taskId: string;
  agentKey: string | null;
  title: string;
  completedAt: string | null;
  resultSummary: string | null;
  deliverableLinks: unknown[];
};

type TaskRow = {
  id: string;
  agent_key?: string | null;
  title: string;
  status: string;
  completed_at?: string | null;
  result_summary?: string | null;
  deliverable_links?: unknown;
};

function nowIso() {
  return new Date().toISOString();
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Deliverable harvest
 *
 * Goal: pull the most recent completed tasks that include deliverable proof
 * (result_summary + deliverable_links) and store a compact list in system_state
 * for dashboards/weekly summaries.
 */
export async function runDeliverableHarvest() {
  return withJobRun({
    jobKey: "deliverable-harvest",
    fn: async () => {
      const tasks = await getRecentTasks(250);

      const rows = tasks as unknown as TaskRow[];

      const harvested: HarvestedDeliverable[] = rows
        .filter((task) => task.status === "completed")
        .filter((task) => {
          const links = Array.isArray(task.deliverable_links) ? task.deliverable_links : [];
          return isNonEmptyString(task.result_summary) || links.length > 0;
        })
        .slice(0, 50)
        .map((task) => ({
          taskId: task.id,
          agentKey: task.agent_key ?? null,
          title: task.title,
          completedAt: task.completed_at ?? null,
          resultSummary: task.result_summary ?? null,
          deliverableLinks: Array.isArray(task.deliverable_links) ? task.deliverable_links : []
        }));

      await upsertSystemState("deliverable_harvest_latest", {
        harvested,
        harvestedCount: harvested.length,
        updatedAt: nowIso()
      });

      return {
        harvestedCount: harvested.length
      };
    },
    summarize: (result) => ({
      summary: `Harvested: ${result.harvestedCount}`,
      detailsJson: result
    })
  });
}
