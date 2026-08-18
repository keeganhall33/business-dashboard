import type { ApprovalLevel } from "@/lib/intelligence/recommendation-contract";
import type { ConversationInputClassificationV1 } from "@/lib/intelligence-ux/responsive-shell-fixtures";

export type ConversationalDecisionInputKindV1 = ConversationInputClassificationV1;

export type ConversationalDecisionTruthStateV1 = "KNOWN" | "UNKNOWN" | "CONFLICTED" | "ASSUMED" | "HYPOTHETICAL_ONLY";

export type ConversationalDecisionEvidenceRefV1 = {
  id: string;
  label: string;
  source: string;
  provenance: "SYSTEM_EVIDENCE" | "HUMAN_REPORTED" | "HUMAN_JUDGMENT" | "ASSUMPTION";
  truth_state: ConversationalDecisionTruthStateV1;
  detail: string;
};

export type ConversationalDecisionAssumptionV1 = {
  id: string;
  label: string;
  state: "OPEN" | "CONFIRMED" | "REJECTED" | "CONFLICTED";
  detail: string;
  evidence_refs: string[];
};

export type RecommendationVersionV1 = {
  recommendation_id: string;
  version: number;
  title: string;
  recommendation_summary: string;
  recommended_action: string;
  why: string;
  approval_level: ApprovalLevel;
  evidence_refs: ConversationalDecisionEvidenceRefV1[];
  assumptions: ConversationalDecisionAssumptionV1[];
  unknowns: string[];
  conflicts: string[];
  created_from_turn_id: string;
};

export type RecommendationRevisionV1 = {
  recommendation_id: string;
  previous_version: number;
  next_version: number;
  before: Pick<RecommendationVersionV1, "recommendation_summary" | "recommended_action" | "approval_level" | "unknowns" | "conflicts">;
  after: Pick<RecommendationVersionV1, "recommendation_summary" | "recommended_action" | "approval_level" | "unknowns" | "conflicts">;
  why_changed: string[];
  preserved_evidence_refs: string[];
  added_evidence_refs: string[];
};

export type ConversationalDecisionTurnV1 = {
  turn_id: string;
  recommendation_id: string;
  classification: ConversationalDecisionInputKindV1;
  user_utterance: string;
  interpreted_claim: string | null;
  hypothetical_overlay?: {
    scenario: string;
    projected_changes: string[];
  };
};

export type ConversationalDecisionAnswerV1 = {
  turn_id: string;
  classification: ConversationalDecisionInputKindV1;
  spoken_answer: string;
  written_answer: string;
  evidence_refs: ConversationalDecisionEvidenceRefV1[];
  assumptions: ConversationalDecisionAssumptionV1[];
  unknowns: string[];
  conflicts: string[];
  approval_level: ApprovalLevel;
  facts_mutated: boolean;
  revision: RecommendationRevisionV1 | null;
  active_recommendation_version: RecommendationVersionV1;
  prior_versions: RecommendationVersionV1[];
};

export type ConversationalDecisionFixtureV1 = {
  decision_id: string;
  strategic_question: string;
  current_version: RecommendationVersionV1;
  prior_versions: RecommendationVersionV1[];
  turns: ConversationalDecisionTurnV1[];
};
