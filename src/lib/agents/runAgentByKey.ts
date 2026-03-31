import { runAvery } from "./avery";
import { runLyra } from "./lyra";
import { runNoah } from "./noah";
import { runSloan } from "./sloan";
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

  try {
    const result = await runner();
    await finishSystemRun(run.id, { status: "completed", outputsJson: result });
    return { runId: run.id, result };
  } catch (error) {
    await finishSystemRun(run.id, {
      status: "failed",
      errorsMd: error instanceof Error ? error.stack ?? error.message : JSON.stringify(error)
    });
    throw error;
  }
}
