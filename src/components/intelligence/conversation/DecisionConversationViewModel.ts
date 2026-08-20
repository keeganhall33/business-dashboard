import { answerConversationalDecisionTurnV1 } from "@/lib/conversational-decision/engine";
import { CONVERSATIONAL_DECISION_FIXTURE_V1 } from "@/lib/conversational-decision/fixtures";
import type {
  ConversationalDecisionAnswerV1,
  ConversationalDecisionFixtureV1,
  ConversationalDecisionInputKindV1,
  ConversationalDecisionTurnV1
} from "@/lib/conversational-decision/contracts";

export type DecisionConversationInputModeV1 = "TEXT" | "VOICE_TRANSCRIPT";

export type DecisionConversationCanonicalInputV1 = {
  interaction_id: string;
  decision_id: string;
  recommendation_id: string;
  mode: DecisionConversationInputModeV1;
  classification: ConversationalDecisionInputKindV1;
  utterance: string;
  transcript: string;
  source_turn_id: string;
  read_only_fixture: true;
};

export type DecisionConversationQuestionV1 = {
  id: string;
  label: string;
  classification: ConversationalDecisionInputKindV1;
};

export type DecisionConversationViewModelV1 = {
  id: string;
  eyebrow: string;
  title: string;
  read_only_state: "READ_ONLY_FIXTURE";
  mutation_state: "MUTATION_DISABLED";
  strategic_question: string;
  recommendation: {
    title: string;
    summary: string;
    action: string;
    approval_level: string;
    version: number;
  };
  input: DecisionConversationCanonicalInputV1;
  voice: {
    affordance_label: string;
    state_label: string;
    transcript: string;
  };
  suggested_questions: DecisionConversationQuestionV1[];
  answer: ConversationalDecisionAnswerV1;
};

export function normalizeDecisionConversationInputV1(input: {
  fixture: ConversationalDecisionFixtureV1;
  mode: DecisionConversationInputModeV1;
  turn: ConversationalDecisionTurnV1;
}): DecisionConversationCanonicalInputV1 {
  return {
    interaction_id: `${input.mode.toLowerCase()}-${input.turn.turn_id}`,
    decision_id: input.fixture.decision_id,
    recommendation_id: input.turn.recommendation_id,
    mode: input.mode,
    classification: input.turn.classification,
    utterance: input.turn.user_utterance.trim(),
    transcript: input.turn.user_utterance.trim(),
    source_turn_id: input.turn.turn_id,
    read_only_fixture: true
  };
}

export function buildDecisionConversationPanelViewModelV1(input: {
  fixture?: ConversationalDecisionFixtureV1;
  mode?: DecisionConversationInputModeV1;
  turnId?: string;
} = {}): DecisionConversationViewModelV1 {
  const fixture = input.fixture ?? CONVERSATIONAL_DECISION_FIXTURE_V1;
  const selectedTurn = fixture.turns.find((turn) => turn.turn_id === input.turnId) ?? fixture.turns[0];
  const mode = input.mode ?? "TEXT";
  const answer = answerConversationalDecisionTurnV1({ fixture, turn: selectedTurn });

  return {
    id: `decision-conversation-${fixture.decision_id}`,
    eyebrow: "Ask about this decision",
    title: "Conversational Decision Panel",
    read_only_state: "READ_ONLY_FIXTURE",
    mutation_state: "MUTATION_DISABLED",
    strategic_question: fixture.strategic_question,
    recommendation: {
      title: fixture.current_version.title,
      summary: fixture.current_version.recommendation_summary,
      action: fixture.current_version.recommended_action,
      approval_level: answer.approval_level,
      version: answer.active_recommendation_version.version
    },
    input: normalizeDecisionConversationInputV1({ fixture, mode, turn: selectedTurn }),
    voice: {
      affordance_label: mode === "VOICE_TRANSCRIPT" ? "Transcript ready" : "Mock microphone",
      state_label: mode === "VOICE_TRANSCRIPT" ? "TRANSCRIPT_READY" : "VOICE_AVAILABLE_FIXTURE",
      transcript: selectedTurn.user_utterance
    },
    suggested_questions: [
      {
        id: "suggested-grounding",
        label: "Why validate before building?",
        classification: "QUESTION_ONLY"
      },
      {
        id: "suggested-unknowns",
        label: "What unknown would change this?",
        classification: "QUESTION_ONLY"
      },
      {
        id: "suggested-hypothetical",
        label: "What if a sponsor covers the room fee?",
        classification: "HYPOTHETICAL"
      },
      {
        id: "suggested-human-fact",
        label: "What changes if I confirm a warm intro?",
        classification: "HUMAN_REPORTED_FACT"
      }
    ],
    answer
  };
}
