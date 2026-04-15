import { runAvery } from "./avery";
import { runLyra } from "./lyra";
import { runNoah } from "./noah";
import { runSloan } from "./sloan";
import {
  createAgentUpdate,
  createSystemRun,
  finishSystemRun,
  startApprovedTasks
} from "@/lib/supabase/queries";
import type { RunType } from "@/lib/types/requests";
import type { AgentRunResult } from "./shared";

const runners: Record<string, () => Promise<AgentRunResult>> = {
  sloan: runSloan,
  lyra: runLyra,
  noah: runNoah,
  avery: runAvery
};

export function hasAgentRunner(agentKey: string) {
  return Boolean(runners[agentKey]);
}

export async function runAgentByKey(agentKey: string, runType: RunType = "manual") {
  const runner = runners[agentKey];
  if (!runner) throw new Error(`Unknown agent: ${agentKey}`);

  const run = await createSystemRun({ agentKey, runType });
  let activatedTasks = 0;

  try {
    try {
      const started = await startApprovedTasks(agentKey);
      activatedTasks = started.length;

      await Promise.all(
        started.map((task) =>
          createAgentUpdate({
            agentKey,
            updateType: "summary",
            title: `Started: ${task.title}`,
            summary: `Execution kicked off for "${task.title}".`,
            detailMd:
              typeof task.description === "string" && task.description.length > 0
                ? (task.description as string)
                : undefined,
            priority: typeof task.priority === "string" ? task.priority : undefined,
            relatedMetricKeys: (task.related_metric_keys as string[] | null) ?? []
          })
        )
      );
    } catch (activationError) {
      console.error("Failed to activate approved tasks", {
        agentKey,
        error: activationError instanceof Error ? activationError.message : activationError
      });
    }

    const result = await runner();
    const finalResult: AgentRunResult = {
      ...result,
      tasksActivated: (result.tasksActivated ?? 0) + activatedTasks
    };

    await finishSystemRun(run.id, { status: "completed", outputsJson: finalResult });
    return { runId: run.id, result: finalResult };
  } catch (error) {
    await finishSystemRun(run.id, {
      status: "failed",
      errorsMd: error instanceof Error ? error.stack ?? error.message : JSON.stringify(error)
    });
    throw error;
  }
}
