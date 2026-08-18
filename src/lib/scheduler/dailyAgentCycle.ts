import { runSloan } from "@/lib/agents/sloan";
import { runLyra } from "@/lib/agents/lyra";
import { runNoah } from "@/lib/agents/noah";
import { runAvery } from "@/lib/agents/avery";
import { AGENT_EXECUTION_SEQUENCE } from "@/lib/agents/operating-model";
import { createSystemRun, finishSystemRun } from "@/lib/supabase/queries";
import type { AgentRunResult } from "@/lib/agents/shared";
import type { AgentKey } from "@/lib/types/requests";
import { withJobRun } from "./jobLogger";
import { runAveryQuestionEscalations } from "./ceoQuestions";

const sequence = AGENT_EXECUTION_SEQUENCE;

const runners: Record<AgentKey, () => Promise<AgentRunResult>> = {
  avery: runAvery,
  sloan: runSloan,
  lyra: runLyra,
  noah: runNoah
};

export async function runDailyAgentCycle() {
  return withJobRun({
    jobKey: "daily-agent-cycle",
    fn: async () => {
      const outputs: Array<{
        agentKey: AgentKey;
        updatesCreated: number;
        tasksCreated: number;
        opportunitiesCreated: number;
        planId?: string | null;
      }> = [];

      for (const agentKey of sequence) {
        const run = await createSystemRun({ agentKey, runType: "scheduler" });
        try {
          const result = await runners[agentKey]();
          await finishSystemRun(run.id, {
            status: "completed",
            outputsJson: result
          });

          outputs.push({
            agentKey,
            updatesCreated: result.updatesCreated,
            tasksCreated: result.tasksCreated,
            opportunitiesCreated: result.opportunitiesCreated,
            planId: result.planId ?? null
          });
        } catch (error) {
          await finishSystemRun(run.id, {
            status: "failed",
            errorsMd: error instanceof Error ? error.stack ?? error.message : JSON.stringify(error)
          });
          throw error;
        }
      }

      const ceoQuestions = await runAveryQuestionEscalations();

      return {
        sequence,
        outputs,
        ceoQuestions
      };
    },
    summarize: (result) => ({
      summary: `Daily agent cycle completed: ${result.sequence.join("→")}`,
      detailsJson: result
    })
  });
}
