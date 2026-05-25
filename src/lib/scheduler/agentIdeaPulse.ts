import { ensureDailyIdeaAndKpis, getSharedAgentContextForAgent } from "@/lib/agents/shared";
import { agentDisplayNames, agentKeys } from "@/lib/types/requests";
import { createAgentMessage, getOrCreateAgentThread } from "@/lib/supabase/queries";
import { evaluateWarRoomMode } from "./warRoom";
import { withJobRun } from "./jobLogger";

const fallbackIdeaByAgent: Record<string, { title: string; summary: string }> = {
  sloan: {
    title: "Tighten premium pricing ladder to lift AOV",
    summary: "Rebuild offer tiers around scarcity + signed editions to raise AOV without dilution."
  },
  lyra: {
    title: "Sharpen homepage narrative to increase authority + conversion",
    summary: "Tighten the Impossible in Pencil story hierarchy and prestige cues to lift conversion."
  },
  noah: {
    title: "Add 5 Tier-1 targets/week to keep pipeline full",
    summary: "Keep the prestige partnership funnel fed with a small, high-status target list."
  },
  avery: {
    title: "Kill low-leverage drift: enforce 3 weekly priorities",
    summary: "Lock the spotlight on the three moves that unblock revenue and brand compounding."
  }
};

export async function runAgentIdeaPulse() {
  return withJobRun({
    jobKey: "agent-idea-pulse",
    fn: async () => {
      const outputs: Array<{
        agentKey: string;
        ideaCreated: boolean;
        kpisLogged: number;
        warRoomMessageId: string | null;
      }> = [];

      for (const agentKey of agentKeys) {
        const { metrics } = await getSharedAgentContextForAgent(agentKey);
        const fallback = fallbackIdeaByAgent[agentKey] ?? {
          title: `${agentDisplayNames[agentKey]} daily idea pulse`,
          summary: "Automatically logged idea to maintain daily autonomy cadence."
        };

        const { ideaCreated, kpisLogged } = await ensureDailyIdeaAndKpis({
          agentKey,
          metrics,
          fallbackIdeaTitle: fallback.title,
          fallbackIdeaSummary: fallback.summary
        });

        let warRoomMessageId: string | null = null;
        if (ideaCreated) {
          const thread = await getOrCreateAgentThread({ agentKey, threadType: "war_room", title: "War Room Thread" });
          const message = await createAgentMessage({
            threadId: thread.id,
            senderType: "system",
            messageType: "war_room",
            body: `Autonomous idea logged for ${agentDisplayNames[agentKey]}: ${fallback.title}.`,
            metadata: {
              autopulse: "daily_idea",
              title: fallback.title,
              summary: fallback.summary
            }
          });
          warRoomMessageId = message.id as string;
        }

        outputs.push({ agentKey, ideaCreated, kpisLogged, warRoomMessageId });
      }

      const warRoom = await evaluateWarRoomMode();

      return {
        outputs,
        warRoom
      };
    },
    summarize: (result) => ({
      summary: `Agent idea pulse complete (${result.outputs.filter((o) => o.ideaCreated).length} ideas logged).`,
      detailsJson: result
    })
  });
}
