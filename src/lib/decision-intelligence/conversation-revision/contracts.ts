import type {
  RecommendationDecisionDiffV1,
  RecommendationRevisionResultV1,
  RecommendationRevisionVersionV1,
  RevisionAssumptionV1,
  RevisionEvidenceRefV1,
  RevisionInputClassificationV1,
  RevisionProvenanceKindV1
} from "@/lib/decision-intelligence/revision/contracts";

export type ConversationRevisionPayloadKindV1 = "TEXT" | "VOICE_TRANSCRIPT";

export type CanonicalConversationRevisionPayloadV1 = {
  payload_id: string;
  payload_kind: ConversationRevisionPayloadKindV1;
  recommendation_id: string;
  classification: RevisionInputClassificationV1;
  text?: string;
  transcript?: string;
  interpreted_claim?: string | null;
  captured_at: string;
  actor: "KEEGAN";
  source_label: string;
  proposed_changes?: {
    recommendation_summary?: string;
    recommended_action?: string;
    urgency?: RecommendationRevisionVersionV1["urgency"];
    approval_level?: RecommendationRevisionVersionV1["approval_level"];
    confidence?: RecommendationRevisionVersionV1["confidence"];
    unknowns?: string[];
    conflicts?: string[];
    evidence_to_add?: Array<Omit<RevisionEvidenceRefV1, "provenance">>;
    changed_assumptions?: RevisionAssumptionV1[];
    why_changed?: string[];
  };
};

export type ConversationRevisionPreviewV1 = {
  contract_version: "conversation_revision_preview_v1";
  payload_id: string;
  payload_kind: ConversationRevisionPayloadKindV1;
  classification: RevisionInputClassificationV1;
  normalized_utterance: string;
  proposed_evidence_additions: RevisionEvidenceRefV1[];
  proposed_assumption_changes: RevisionAssumptionV1[];
  recommendation_version_diff: RecommendationDecisionDiffV1 | null;
  confidence_delta: RecommendationDecisionDiffV1["confidence_delta"] | null;
  urgency_delta: RecommendationDecisionDiffV1["urgency_delta"] | null;
  approval_delta: RecommendationDecisionDiffV1["approval_class_delta"] | null;
  why_changed: string[];
  fact_memory_mutation_candidate: boolean;
  no_durable_persistence: true;
  revision_result: RecommendationRevisionResultV1;
  keegan_action_required: "NO";
};

export const PROVENANCE_KIND_BY_CLASSIFICATION_V1: Record<RevisionInputClassificationV1, RevisionProvenanceKindV1> = {
  QUESTION_ONLY: "HYPOTHETICAL",
  HYPOTHETICAL: "HYPOTHETICAL",
  HUMAN_REPORTED_FACT: "HUMAN_REPORTED_FACT",
  HUMAN_JUDGMENT: "HUMAN_JUDGMENT",
  CORRECTION: "CORRECTION",
  DECISION: "DECISION_COMMITMENT",
  DECISION_COMMITMENT: "DECISION_COMMITMENT"
};
