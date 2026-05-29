import { agentKeys } from "@/lib/types/requests";
import { createAgentMessage, getOrCreateAgentThread } from "@/lib/supabase/queries";
import { withJobRun } from "./jobLogger";
import { evaluateWarRoomMode } from "./warRoom";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function postWarRoomDigest(agentKey: string, triggers: string[], reason: string | null) {
  const thread = await getOrCreateAgentThread({
    agentKey,
    threadType: "war_room",
    title: "War Room Thread"
  });

  const agenda = [
    "Review revenue pace + pipeline status",
    "Identify top 1-3 blockers",
    "Pick the next 3 highest-leverage actions",
    "Assign owners + deadlines"
  ];

  const bodyLines = [
    `War Room Digest — ${todayIso()}`,
    "",
    reason ? `Reason: ${reason}` : null,
    triggers.length ? `Triggers: ${triggers.join("; ")}` : null,
    "",
    "Agenda:",
    ...agenda.map((item) => `- ${item}`),
    "",
    "Recap (TODO): implement automated recap generation + posting from system state/tasks/opportunities."
  ].filter(Boolean) as string[];

  await createAgentMessage({
    threadId: thread.id,
    senderType: "system",
    messageType: "war_room",
    body: bodyLines.join("\n"),
    metadata: { triggers, agenda, source: "war-room-digest" }
  });
}

export async function runWarRoomDigest() {
  return withJobRun({
    jobKey: "war-room-digest",
    fn: async () => {
      // evaluateWarRoomMode is the canonical source of truth for whether we are in war room mode.
      const warRoom = await evaluateWarRoomMode();

      if (warRoom.mode !== "war_room") {
        return { skipped: true, mode: warRoom.mode } as const;
      }

      await Promise.all(
        agentKeys.map((agentKey) => postWarRoomDigest(agentKey, warRoom.triggers, warRoom.reason))
      );

      return {
        skipped: false,
        mode: warRoom.mode,
        triggers: warRoom.triggers,
        reason: warRoom.reason,
        agentsNotified: agentKeys.length
      } as const;
    },
    summarize: (result) => ({
      summary: result.skipped
        ? `Skipped (mode: ${result.mode})`
        : `Posted digest to ${result.agentsNotified} agents (triggers: ${result.triggers.length})`,
      detailsJson: result
    })
  });
}
