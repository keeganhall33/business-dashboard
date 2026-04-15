import { evaluateRules } from "@/lib/automation/evaluateRules";
import { withJobRun } from "./jobLogger";
import { runStaleChecks } from "./staleChecks";
import { evaluateWarRoomMode } from "./warRoom";
import { writeDashboardSnapshotMeta } from "./stateWriters";
import { publishAgentStatusSnapshot } from "@/lib/agents/shared";
import { agentKeys } from "@/lib/types/requests";

export async function runDailyHealthCheck() {
  return withJobRun({
    jobKey: "daily-health-check",
    fn: async () => {
      const rules = await evaluateRules();
      const stale = await runStaleChecks();
      const warRoom = await evaluateWarRoomMode();

      await writeDashboardSnapshotMeta({
        source: "daily-health-check",
        mode: warRoom.mode,
        lastRefreshedAt: new Date().toISOString()
      });

      await Promise.all(agentKeys.map((agentKey) => publishAgentStatusSnapshot(agentKey)));

      return {
        rulesEvaluated: rules.rulesEvaluated,
        triggersFired: rules.triggersFired.length,
        alertsCreated: stale.alertsCreatedOrUpdated,
        staleAgents: stale.staleAgents,
        staleTasks: stale.staleTaskIds.length,
        operatingMode: warRoom.mode
      };
    },
    summarize: (result) => ({
      summary: `Rules: ${result.rulesEvaluated}, fired: ${result.triggersFired}, alerts: ${result.alertsCreated}`,
      detailsJson: result
    })
  });
}
