import { runAvery } from "./avery";
import { runLyra } from "./lyra";
import { runNoah } from "./noah";
import { runSloan } from "./sloan";
import { activateAgentTasks } from "./automation";
import { createSystemRun, finishSystemRun } from "@/lib/supabase/queries";
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
      const automation = await activateAgentTasks(agentKey, { includeAutoRunnable: true });
      activatedTasks = automation.activatedCount;
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
