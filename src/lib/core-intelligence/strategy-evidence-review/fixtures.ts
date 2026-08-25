import { assessRecommendationContradictionsV1 } from "@/lib/core-intelligence/recommendation-contradiction/adapter";
import {
  DECISION_CONFIDENCE_GUARD_CONFLICTED_RESULT_V1,
  DECISION_CONFIDENCE_GUARD_DEGRADED_RESULT_V1,
  DECISION_CONFIDENCE_GUARD_STABLE_RESULT_V1
} from "@/lib/decision-intelligence/confidence-guard/fixtures";
import type { Recommendation } from "@/lib/intelligence/recommendation-contract";
import {
  RECOMMENDATION_CONTRADICTION_COMPATIBLE_INPUT_V1,
  RECOMMENDATION_CONTRADICTION_CONFLICTING_INPUT_V1,
  RECOMMENDATION_CONTRADICTION_UNKNOWN_INPUT_V1
} from "@/lib/core-intelligence/recommendation-contradiction/fixtures";
import { buildStrategyEvidenceReviewQueueV1 } from "./adapter";
import type { StrategyEvidenceReviewInputV1 } from "./contracts";

const conflicted = RECOMMENDATION_CONTRADICTION_CONFLICTING_INPUT_V1.recommendations;
const unknown = RECOMMENDATION_CONTRADICTION_UNKNOWN_INPUT_V1.recommendations;
const compatible = RECOMMENDATION_CONTRADICTION_COMPATIBLE_INPUT_V1.recommendations;

const reviewNow = conflicted[0]!;
const reviewNext = unknown[0]!;
const defer = compatible[0]!;
const conflictingAssessment = assessRecommendationContradictionsV1(RECOMMENDATION_CONTRADICTION_CONFLICTING_INPUT_V1);
const unknownAssessment = assessRecommendationContradictionsV1(RECOMMENDATION_CONTRADICTION_UNKNOWN_INPUT_V1);

function guardFor(rec: Recommendation, kind: "stable" | "degraded" | "conflicted") {
  const base = kind === "stable"
    ? DECISION_CONFIDENCE_GUARD_STABLE_RESULT_V1
    : kind === "degraded"
      ? DECISION_CONFIDENCE_GUARD_DEGRADED_RESULT_V1
      : DECISION_CONFIDENCE_GUARD_CONFLICTED_RESULT_V1;

  return {
    ...base,
    recommendation_id: rec.id,
    active_recommendation_snapshot: {
      ...base.active_recommendation_snapshot,
      recommendation_id: rec.id,
      title: rec.title,
      recommendation_summary: rec.reason,
      recommended_action: rec.recommended_action,
      confidence: rec.confidence
    }
  };
}

export const STRATEGY_EVIDENCE_REVIEW_QUEUE_INPUT_V1: StrategyEvidenceReviewInputV1 = {
  contract_version: "strategy_evidence_review_queue_input_v1",
  generated_at: "2026-08-25T10:20:00.000Z",
  recommendations: [reviewNow, reviewNext, defer],
  contradiction_assessment: {
    ...conflictingAssessment,
    UNKNOWN: unknownAssessment.UNKNOWN.filter((item) => item.recommendation_id === reviewNext.id)
  },
  confidence_guards: [
    guardFor(reviewNow, "conflicted"),
    guardFor(reviewNext, "stable"),
    guardFor(defer, "stable")
  ]
};

export const STRATEGY_EVIDENCE_REVIEW_QUEUE_RESULT_V1 = buildStrategyEvidenceReviewQueueV1(STRATEGY_EVIDENCE_REVIEW_QUEUE_INPUT_V1);
