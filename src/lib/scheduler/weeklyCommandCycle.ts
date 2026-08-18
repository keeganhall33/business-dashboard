import { evaluateRules } from "@/lib/automation/evaluateRules";
import { runAvery } from "@/lib/agents/avery";
import { runLyra } from "@/lib/agents/lyra";
import { runNoah } from "@/lib/agents/noah";
import { runSloan } from "@/lib/agents/sloan";
import { AGENT_EXECUTION_SEQUENCE } from "@/lib/agents/operating-model";
import { createSystemRun, finishSystemRun, getLatestAgentDirective } from "@/lib/supabase/queries";
import type { AgentRunResult } from "@/lib/agents/shared";
import type { AgentKey } from "@/lib/types/requests";
import { withJobRun } from "./jobLogger";
import { writeLatestDirectiveState, writeWeeklySummaryState, writeDashboardSnapshotMeta } from "./stateWriters";
import { evaluateWarRoomMode } from "./warRoom";

const runners: Record<AgentKey, () => Promise<AgentRunResult>> = {
  avery: runAvery,
  sloan: runSloan,
  lyra: runLyra,
  noah: runNoah
};

export async function runWeeklyCommandCycle() {
  return withJobRun({
    jobKey: "weekly-command-cycle",
    fn: async () => {
      await evaluateRules();

      const sequence = AGENT_EXECUTION_SEQUENCE;
      const outputs: Array<{
        agentKey: AgentKey;
        updatesCreated: number;
        tasksCreated: number;
        opportunitiesCreated: number;
        planId?: string | null;
      }> = [];
      let currentAveryDirective = "";

      for (const agentKey of sequence) {
        const run = await createSystemRun({ agentKey, runType: "weekly" });
        try {
          const result = await runners[agentKey]();

          if (agentKey === "avery") {
            currentAveryDirective = result.summary ?? "";
          }

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

      const storedDirective = currentAveryDirective ? null : await getLatestAgentDirective();
      const directiveText = currentAveryDirective || storedDirective?.summary || "";

      if (directiveText) {
        await writeLatestDirectiveState({
          directive: directiveText,
          source: "weekly-command-cycle",
          generatedAt: currentAveryDirective ? new Date().toISOString() : storedDirective?.created_at
        });
      }

      await writeWeeklySummaryState({
        sequence,
        outputs,
        weeklyDirective: directiveText
      });

      const warRoom = await evaluateWarRoomMode();
      await writeDashboardSnapshotMeta({
        source: "weekly-command-cycle",
        mode: warRoom.mode
      });

      return {
        sequence,
        outputs,
        weeklyDirective: directiveText,
        operatingMode: warRoom.mode
      };
    },
    summarize: (result) => ({
      summary: `Completed weekly cycle: ${result.sequence.join("→")}`,
      detailsJson: result
    })
  });
}
