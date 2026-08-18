import { getRecentTasks, upsertSystemState } from "@/lib/supabase/queries";
import { getSupabaseServerClient } from "@/lib/supabase/server";
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

async function persistTaskOutcomeOnce(deliverable: HarvestedDeliverable) {
  if (!deliverable.agentKey || !isNonEmptyString(deliverable.resultSummary)) return false;

  const supabase = getSupabaseServerClient();
  const existing = await supabase
    .from("outcome_memory")
    .select("id")
    .eq("related_task_id", deliverable.taskId)
    .limit(1)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return false;

  const inserted = await supabase.from("outcome_memory").insert({
    agent_key: deliverable.agentKey,
    outcome_type: "task",
    title: `Task outcome: ${deliverable.title}`,
    summary: deliverable.resultSummary,
    related_task_id: deliverable.taskId,
    happened_at: deliverable.completedAt ?? nowIso(),
    metadata: {
      source: "deliverable_harvest",
      deliverable_link_count: deliverable.deliverableLinks.length
    }
  });
  if (inserted.error) throw inserted.error;
  return true;
}

/**
 * Deliverable harvest
 *
 * Pull recent completed tasks with proof into a compact dashboard state and promote their actual
 * result summaries into outcome_memory exactly once so subsequent agent cycles can learn from the
 * work instead of seeing only that a task was completed.
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

      let outcomesPersisted = 0;
      for (const deliverable of harvested) {
        if (await persistTaskOutcomeOnce(deliverable)) outcomesPersisted++;
      }

      await upsertSystemState("deliverable_harvest_latest", {
        harvested,
        harvestedCount: harvested.length,
        outcomesPersisted,
        updatedAt: nowIso()
      });

      return {
        harvestedCount: harvested.length,
        outcomesPersisted
      };
    },
    summarize: (result) => ({
      summary: `Harvested ${result.harvestedCount} deliverables; persisted ${result.outcomesPersisted} new task outcomes`,
      detailsJson: result
    })
  });
}
