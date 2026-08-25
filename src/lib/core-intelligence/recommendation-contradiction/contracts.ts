import type { ExplanationConfidence } from "@/lib/intelligence/explanation-contract";
import type { Recommendation } from "@/lib/intelligence/recommendation-contract";

export type RecommendationContradictionTruthStateV1 = "KNOWN" | "INFERRED" | "UNKNOWN" | "CONFLICTED";

export type RecommendationContradictionAxisV1 = "OBJECTIVE" | "RESOURCE_USE" | "TIMING" | "EVIDENCE_ASSUMPTION";

export type RecommendationContradictionInputV1 = {
  contract_version: "recommendation_contradiction_input_v1";
  generated_at: string;
  recommendations: Recommendation[];
};

export type RecommendationContradictionAssessmentV1 = {
  contract_version: "recommendation_contradiction_v1";
  generated_at: string;
  recommendation_count: number;
  REVIEW_REQUIRED: boolean;
  WHAT_CONFLICTS: RecommendationContradictionFindingV1[];
  WHY: string[];
  UNKNOWN: Array<{
    recommendation_id: string;
    field: "cost" | "effort" | "timing" | "evidence" | "assumptions";
    reason: string;
  }>;
  compatible_pairs: Array<{
    recommendation_ids: [string, string];
    truth_state: "KNOWN" | "INFERRED";
    why: string;
  }>;
  prior_rationale: Array<{
    recommendation_id: string;
    title: string;
    recommended_action: string;
    reason: string;
    confidence: ExplanationConfidence;
    confidence_reasons: string[];
    assumptions: string[];
    limitations: string[];
  }>;
  recommendation_snapshots: Recommendation[];
  mutation_performed: false;
  keegan_action_required: "NO";
};

export type RecommendationContradictionFindingV1 = {
  axis: RecommendationContradictionAxisV1;
  recommendation_ids: [string, string];
  truth_state: "CONFLICTED" | "UNKNOWN";
  REVIEW_REQUIRED: boolean;
  conflict_summary: string;
  evidence: string[];
  prior_rationale_preserved: true;
};
