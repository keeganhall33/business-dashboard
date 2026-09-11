import { answerConversationalDecisionTurnV1 } from "@/lib/conversational-decision/engine";
import { CONVERSATIONAL_DECISION_FIXTURE_V1 } from "@/lib/conversational-decision/fixtures";
import { DECISION_ROOM_FIXTURE_V1 } from "@/lib/decision-room/fixtures";
import { withDecisionRoomStrategicContextV1 } from "@/lib/decision-room/trajectory-data-context";
import type { ExecutiveHomeDecisionRoomDrilldownV1 } from "@/lib/executive-home/decision-room-drilldown";

export function getExecutiveHomeDecisionRoomDrilldownFixtureV1(): ExecutiveHomeDecisionRoomDrilldownV1 {
  const answer = answerConversationalDecisionTurnV1({
    fixture: CONVERSATIONAL_DECISION_FIXTURE_V1,
    turn: CONVERSATIONAL_DECISION_FIXTURE_V1.turns[0]
  });

  return {
    ...withDecisionRoomStrategicContextV1(DECISION_ROOM_FIXTURE_V1),
    source_card_id: "matters-now-premium-scarcity",
    contextual_ask: {
      id: `contextual-ask-${CONVERSATIONAL_DECISION_FIXTURE_V1.decision_id}`,
      scope: "DECISION_CONTEXT",
      placeholder: "Ask why this recommendation is grounded...",
      voice_state: "TRANSCRIPT_READY",
      supported_classifications: ["QUESTION_ONLY", "HYPOTHETICAL", "HUMAN_REPORTED_FACT", "HUMAN_JUDGMENT", "CORRECTION", "DECISION"],
      transcript: answer.turn_id,
      spoken_answer: answer.spoken_answer,
      written_answer: answer.written_answer,
      memory_write_policy: "NO_WRITE_WITHOUT_CLASSIFICATION"
    }
  };
}
