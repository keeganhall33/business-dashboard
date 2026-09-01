import type { ExplanationConfidence } from "@/lib/intelligence/explanation-contract";
import type { Recommendation } from "@/lib/intelligence/recommendation-contract";

export type StrategyRecommendationFreshnessTruthStateV1 = "KNOWN" | "UNKNOWN" | "STALE" | "CONFLICTED";
export type StrategyRecommendationFreshnessStateV1 = "CURRENT" | "STALE" | "CONFLICTED" | "UNKNOWN";

export type StrategyRecommendationFreshnessEvidenceV1 = {
  evidence_id: string;
  label: string;
  observed_at: string | null;
  materiality: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  truth_state: StrategyRecommendationFreshnessTruthStateV1;
  freshness: "CURRENT" | "STALE" | "UNKNOWN";
  supports_recommendation: boolean | null;
  summary: string;
};

export type StrategyRecommendationFreshnessInputV1 = {
  contract_version: "strategy_recommendation_freshness_input_v1";
  generated_at: string;
  recommendation: Recommendation;
  recommendation_version: string;
  last_reviewed_at: string | null;
  review_window_days: number | null;
  evidence: StrategyRecommendationFreshnessEvidenceV1[];
};

export type StrategyRecommendationFreshnessAssessmentV1 = {
  contract_version: "strategy_recommendation_freshness_v1";
  generated_at: string;
  recommendation_id: string;
  recommendation_version: string;
  title: string;
  last_reviewed_at: string | null;
  review_age_days: number | null;
  material_new_evidence_since_review: StrategyRecommendationFreshnessEvidenceV1[];
  stale_inputs: StrategyRecommendationFreshnessEvidenceV1[];
  conflicted_inputs: StrategyRecommendationFreshnessEvidenceV1[];
  unknown_inputs: StrategyRecommendationFreshnessEvidenceV1[];
  freshness_state: StrategyRecommendationFreshnessStateV1;
  REVIEW_REQUIRED: boolean;
  REVIEW_REASON: string[];
  CURRENT_DASHBOARD_PROJECTION: {
    recommendation_id: string;
    title: string;
    freshness_state: StrategyRecommendationFreshnessStateV1;
    truth_state: StrategyRecommendationFreshnessTruthStateV1;
    confidence: ExplanationConfidence;
    REVIEW_REQUIRED: boolean;
    what_to_review_next: string;
  };
  prior_rationale: {
    recommended_action: string;
    reason: string;
    confidence: ExplanationConfidence;
    confidence_reasons: string[];
    assumptions: string[];
    limitations: string[];
  };
  recommendation_snapshot: Recommendation;
  mutation_performed: false;
  keegan_action_required: "NO";
};
