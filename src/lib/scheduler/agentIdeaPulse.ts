import { getSharedAgentContextForAgent } from "@/lib/agents/shared";
import { recordDailyAgentKpis } from "@/lib/agents/kpi-pulse";
import { agentKeys } from "@/lib/types/requests";
import { evaluateWarRoomMode } from "./warRoom";
import { withJobRun } from "./jobLogger";

/**
 * Legacy job name retained for scheduler compatibility.
 *
 * The old implementation manufactured one canned idea per agent per day simply to satisfy an
 * activity quota. The intelligence system now treats ideas/recommendations as evidence-triggered
 * outputs. This pulse therefore records daily KPI state only; new ideas must come from a real
 * change in evidence, Career OS state, Fusion, measured outcomes, or an explicit research result.
 */
export async function runAgentIdeaPulse() {
  return withJobRun({
    jobKey: "agent-idea-pulse",
    fn: async () => {
      const outputs: Array<{
        agentKey: string;
        ideaCreated: false;
        kpisLogged: number;
        warRoomMessageId: null;
      }> = [];

      for (const agentKey of agentKeys) {
        const { metrics } = await getSharedAgentContextForAgent(agentKey);
        const { kpisLogged } = await recordDailyAgentKpis({ agentKey, metrics });
        outputs.push({ agentKey, ideaCreated: false, kpisLogged, warRoomMessageId: null });
      }

      const warRoom = await evaluateWarRoomMode();

      return {
        outputs,
        warRoom,
        mode: "evidence_triggered_ideas" as const
      };
    },
    summarize: (result) => ({
      summary: `Agent KPI pulse complete (${result.outputs.reduce((sum, output) => sum + output.kpisLogged, 0)} KPI readings logged; no quota-driven ideas created).`,
      detailsJson: result
    })
  });
}
