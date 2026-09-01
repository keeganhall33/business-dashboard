import {
  buildDecisionConversationPanelViewModelV1,
  type DecisionConversationViewModelV1
} from "@/components/intelligence/conversation/DecisionConversationViewModel";
import {
  RECOMMENDATION_REVISION_BASE_VERSION_V1,
  RECOMMENDATION_REVISION_INPUT_FIXTURES_V1
} from "@/lib/decision-intelligence/revision/fixtures";
import { reviseRecommendationVersionV1 } from "@/lib/decision-intelligence/revision/adapter";
import type { RecommendationRevisionResultV1 } from "@/lib/decision-intelligence/revision/contracts";
import type { ConversationInputClassificationV1 } from "@/lib/intelligence-ux/responsive-shell-fixtures";
import type { DecisionRoomViewModelV1 } from "./contracts";

export type DecisionRoomConversationRevisionV1 = NonNullable<DecisionRoomViewModelV1["conversation_revision"]>;

function withCanonicalRevisionPayload(
  conversation: DecisionConversationViewModelV1,
  revision: RecommendationRevisionResultV1
): DecisionConversationViewModelV1 {
  return {
    ...conversation,
    recommendation: {
      title: revision.active_recommendation.title,
      summary: revision.active_recommendation.recommendation_summary,
      action: revision.active_recommendation.recommended_action,
      approval_level: revision.active_recommendation.approval_level,
      version: revision.active_recommendation.version
    },
    input: {
      ...conversation.input,
      interaction_id: revision.input_id,
      recommendation_id: revision.active_recommendation.recommendation_id,
      classification: revision.classification as ConversationInputClassificationV1,
      utterance: revision.provenance.notes,
      transcript: revision.provenance.notes,
      source_turn_id: revision.input_id,
      read_only_fixture: true
    }
  };
}

export function buildDecisionRoomConversationRevisionV1(): DecisionRoomConversationRevisionV1 {
  const readOnlyRevision = reviseRecommendationVersionV1({
    current: RECOMMENDATION_REVISION_BASE_VERSION_V1,
    revisionInput: {
      ...RECOMMENDATION_REVISION_INPUT_FIXTURES_V1[1]!,
      provenance: {
        ...RECOMMENDATION_REVISION_INPUT_FIXTURES_V1[1]!.provenance,
        memory_write_allowed: false,
        notes: RECOMMENDATION_REVISION_INPUT_FIXTURES_V1[1]!.utterance
      }
    }
  });
  const conversation = buildDecisionConversationPanelViewModelV1({
    mode: "VOICE_TRANSCRIPT",
    turnId: "turn-grounded-why"
  });
  const newInformationPreview = withCanonicalRevisionPayload(
    buildDecisionConversationPanelViewModelV1({
      mode: "VOICE_TRANSCRIPT",
      turnId: "turn-human-reported-fact"
    }),
    readOnlyRevision
  );

  return {
    conversation,
    new_information_preview: newInformationPreview,
    recommendation_revision: readOnlyRevision
  };
}

export function withDecisionRoomConversationRevisionV1(decision: DecisionRoomViewModelV1): DecisionRoomViewModelV1 {
  return {
    ...decision,
    conversation_revision: buildDecisionRoomConversationRevisionV1()
  };
}
