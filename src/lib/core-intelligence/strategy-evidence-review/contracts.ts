import type { DecisionConfidenceGuardAssessmentV1 } from "@/lib/decision-intelligence/confidence-guard/contracts";
import type { RecommendationContradictionAssessmentV1 } from "@/lib/core-intelligence/recommendation-contradiction/contracts";
import type { Recommendation } from "@/lib/intelligence/recommendation-contract";

export type StrategyEvidenceReviewDispositionV1 = "REVIEW_NOW" | "REVIEW_NEXT" | "DEFER";

export type StrategyEvidenceReviewInputV1 = {
  contract_version: "strategy_evidence_review_queue_input_v1";
  generated_at: string;
  recommendations: Recommendation[];
  contradiction_assessment: RecommendationContradictionAssessmentV1;
  confidence_guards: DecisionConfidenceGuardAssessmentV1[];
};

export type StrategyEvidenceReviewQueueItemV1 = {
  recommendation_id: string;
  title: string;
  disposition: StrategyEvidenceReviewDispositionV1;
  review_score: number;
  contradiction_count: number;
  unknown_count: number;
  degrading_input_count: number;
  stale_source_count: number;
  conflicted_source_count: number;
  confidence_now: Recommendation["confidence"] | null;
  freshness_state: "CURRENT" | "WATCH" | "REVIEW_REQUIRED" | "UNKNOWN";
  truth_state: "KNOWN" | "UNKNOWN" | "CONFLICTED";
  WHY_REVIEW: string[];
  WHAT_TO_REVIEW_NEXT: string;
};

export type StrategyEvidenceReviewQueueV1 = {
  contract_version: "strategy_evidence_review_queue_v1";
  generated_at: string;
  REVIEW_NOW: StrategyEvidenceReviewQueueItemV1[];
  REVIEW_NEXT: StrategyEvidenceReviewQueueItemV1[];
  DEFER: StrategyEvidenceReviewQueueItemV1[];
  queue: StrategyEvidenceReviewQueueItemV1[];
  recommendation_snapshots: Recommendation[];
  mutation_performed: false;
  keegan_action_required: "NO";
};
