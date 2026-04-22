import { createAgentUpdate, startApprovedTasks, startAutoRunnableTasks } from "@/lib/supabase/queries";

type ActivationResult = {
  activatedCount: number;
  taskIds: string[];
};

type ActivationOptions = {
  includeAutoRunnable?: boolean;
};

export async function activateAgentTasks(agentKey: string, options: ActivationOptions = {}): Promise<ActivationResult> {
  const startedTasks: Record<string, Record<string, unknown>> = {};

  const approved = await startApprovedTasks(agentKey);
  for (const task of approved) {
    startedTasks[task.id as string] = task as Record<string, unknown>;
  }

  if (options.includeAutoRunnable) {
    const autoRunnable = await startAutoRunnableTasks(agentKey);
    for (const task of autoRunnable) {
      startedTasks[task.id as string] = task as Record<string, unknown>;
    }
  }

  const tasksArray = Object.values(startedTasks);
  if (!tasksArray.length) {
    return { activatedCount: 0, taskIds: [] };
  }

  await Promise.all(
    tasksArray.map((task) =>
      createAgentUpdate({
        agentKey,
        updateType: "summary",
        title: `Started: ${task.title as string}`,
        summary: `Execution kicked off for "${task.title as string}".`,
        detailMd: typeof task.description === "string" && task.description.length > 0 ? (task.description as string) : undefined,
        priority: typeof task.priority === "string" ? task.priority : undefined,
        relatedMetricKeys: (task.related_metric_keys as string[] | null) ?? []
      })
    )
  );

  return {
    activatedCount: tasksArray.length,
    taskIds: tasksArray.map((task) => task.id as string)
  };
}
