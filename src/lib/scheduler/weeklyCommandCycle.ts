import { evaluateRules } from "@/lib/automation/evaluateRules";
import { runAvery } from "@/lib/agents/avery";
import { runLyra } from "@/lib/agents/lyra";
import { runNoah } from "@/lib/agents/noah";
import { runSloan } from "@/lib/agents/sloan";
import {
  createSystemRun,
  finishSystemRun,
  getLatestAgentDirective
} from "@/lib/supabase/queries";
import { withJobRun } from "./jobLogger";
import { writeLatestDirectiveState, writeWeeklySummaryState, writeDashboardSnapshotMeta } from "./stateWriters";
import { evaluateWarRoomMode } from "./warRoom";

export async function runWeeklyCommandCycle() {
  return withJobRun({
    jobKey: "weekly-command-cycle",
    fn: async () => {
      await evaluateRules();

      // Executive direction is established first, then the specialists consume it in the same cycle.
      const sequence = ["avery", "sloan", "lyra", "noah"] as const;
      const outputs: Array<{
        agentKey: string;
        updatesCreated: number;
        tasksCreated: number;
        opportunitiesCreated: number;
        planId?: string | null;
      }> = [];

      for (const agentKey of sequence) {
        const run = await createSystemRun({ agentKey, runType: "weekly" });
        try {
          const result =
            agentKey === "avery"
              ? await runAvery()
              : agentKey === "sloan"
                ? await runSloan()
                : agentKey === "lyra"
                  ? await runLyra()
                  : await runNoah();

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

      const directive = await getLatestAgentDirective();
      const directiveText = directive?.summary ?? "";

      if (directiveText) {
        await writeLatestDirectiveState({
          directive: directiveText,
          source: "weekly-command-cycle",
          generatedAt: directive?.created_at
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
