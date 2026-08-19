import type { AttributionConfidenceV1 } from "@/lib/learning-engine/decision-record-v1";

export const DECISION_PRECEDENT_VERSION_V1 = "decision_precedent_v1.0" as const;
export const DECISION_PRECEDENT_RETRIEVAL_VERSION_V1 = "decision_precedent_retrieval_v1.0" as const;

export type DecisionPrecedentOutcomeV1 = "SUCCESSFUL" | "FAILED" | "MIXED" | "UNKNOWN";
export type PreferenceSignalClassV1 =
  | "STATED_PREFERENCE"
  | "OBSERVED_BEHAVIOR"
  | "SUCCESSFUL_PATTERN"
  | "FAILED_PATTERN"
  | "CURRENT_CONTEXT_DIFFERENCE"
  | "WEAK_SIGNAL_ONLY";
export type PrecedentRelevanceV1 = "HIGH" | "MEDIUM" | "LOW" | "DO_NOT_USE";

export type DecisionPrecedentOptionV1 = {
  option_id: string;
  label: string;
  was_chosen: boolean;
  tradeoff: string;
};

export type DecisionPrecedentEvidenceV1 = {
  evidence_id: string;
  label: string;
  truth_state: "KNOWN" | "INFERRED" | "UNKNOWN" | "CONFLICTED";
  notes: string;
};

export type DecisionPrecedentV1 = {
  contract_version: typeof DECISION_PRECEDENT_VERSION_V1;
  DECISION_ID: string;
  decided_at: string;
  decision_title: string;
  CONTEXT_TAGS: string[];
  OPTIONS_CONSIDERED: DecisionPrecedentOptionV1[];
  CHOSEN_ACTION: string;
  KEY_EVIDENCE: DecisionPrecedentEvidenceV1[];
  KEY_ASSUMPTIONS: string[];
  OUTCOME: {
    status: DecisionPrecedentOutcomeV1;
    summary: string;
    evidence_refs: string[];
  };
  ATTRIBUTION_CONFIDENCE: AttributionConfidenceV1;
  LESSON: string;
  PREFERENCE_SIGNAL_CLASS: PreferenceSignalClassV1;
};

export type CurrentDecisionMemoryQueryV1 = {
  decision_id: string;
  recommendation_id: string;
  context_tags: string[];
  option_tags: string[];
  evidence_refs: string[];
  key_assumptions: string[];
};

export type DecisionPrecedentMatchV1 = {
  precedent: DecisionPrecedentV1;
  SIMILARITY_FACTORS: {
    shared_context_tags: string[];
    shared_option_tags: string[];
    shared_evidence_refs: string[];
    assumption_overlap: string[];
    material_differences: string[];
  };
  PRECEDENT_RELEVANCE: PrecedentRelevanceV1;
  WHAT_DIFFERS_NOW: string[];
  dashboard_flags: {
    can_inform_current_decision: boolean;
    can_become_preference_rule: false;
    low_attribution_cannot_dominate: boolean;
    superficially_similar_only: boolean;
  };
};

export type DecisionPrecedentRetrievalV1 = {
  retrieval_version: typeof DECISION_PRECEDENT_RETRIEVAL_VERSION_V1;
  current_decision_id: string;
  generated_at: string;
  source_mode: "DETERMINISTIC_FIXTURE";
  matches: DecisionPrecedentMatchV1[];
  dashboard_summary: {
    top_precedent_id: string | null;
    strongest_relevance: PrecedentRelevanceV1 | "NONE";
    usable_precedent_count: number;
    blocked_low_attribution_count: number;
    current_context_difference_count: number;
  };
  keegan_action_required: "NO";
};
