import { runAvery } from "@/lib/agents/avery";
import { createSystemRun, finishSystemRun, getLatestAgentDirective } from "@/lib/supabase/queries";
import { withJobRun } from "./jobLogger";
import { writeLatestDirectiveState, writeWeeklySummaryState, writeDashboardSnapshotMeta } from "./stateWriters";
import { evaluateWarRoomMode } from "./warRoom";

/**
 * Weekly executive second pass.
 *
 * The normal daily cycle already runs Avery -> Sloan -> Lyra -> Noah. Re-running all four agents
 * again on Monday creates duplicate analysis and recommendation noise. The weekly command therefore
 * runs after Monday's daily specialist cycle and lets Avery synthesize the specialists' fresh output
 * into the weekly executive directive.
 *
 * Metric thresholds are evidence, not a parallel strategy engine. This cycle intentionally does not
 * auto-create strategic tasks from the legacy metric-rule system before Avery reasons.
 */
export async function runWeeklyCommandCycle() {
  return withJobRun({
    jobKey: "weekly-command-cycle",
    fn: async () => {
      const sequence = ["avery"] as const;
      const run = await createSystemRun({ agentKey: "avery", runType: "weekly" });
      let currentAveryDirective = "";
      let output: {
        agentKey: "avery";
        updatesCreated: number;
        tasksCreated: number;
        opportunitiesCreated: number;
        planId?: string | null;
      };

      try {
        const result = await runAvery();
        currentAveryDirective = result.summary ?? "";
        await finishSystemRun(run.id, { status: "completed", outputsJson: result });
        output = {
          agentKey: "avery",
          updatesCreated: result.updatesCreated,
          tasksCreated: result.tasksCreated,
          opportunitiesCreated: result.opportunitiesCreated,
          planId: result.planId ?? null
        };
      } catch (error) {
        await finishSystemRun(run.id, {
          status: "failed",
          errorsMd: error instanceof Error ? error.stack ?? error.message : JSON.stringify(error)
        });
        throw error;
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

      const outputs = [output];
      await writeWeeklySummaryState({ sequence, outputs, weeklyDirective: directiveText });

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
      summary: "Completed weekly executive synthesis after the current specialist cycle.",
      detailsJson: result
    })
  });
}
