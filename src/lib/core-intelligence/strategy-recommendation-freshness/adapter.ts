import type {
  StrategyRecommendationFreshnessAssessmentV1,
  StrategyRecommendationFreshnessInputV1,
  StrategyRecommendationFreshnessStateV1,
  StrategyRecommendationFreshnessTruthStateV1
} from "./contracts";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MATERIAL = new Set(["HIGH", "MEDIUM"]);

function daysSince(value: string | null, now: Date) {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor((now.getTime() - parsed) / MS_PER_DAY));
}

function afterReview(observedAt: string | null, reviewedAt: string | null) {
  if (!observedAt || !reviewedAt) return false;
  const observed = Date.parse(observedAt);
  const reviewed = Date.parse(reviewedAt);
  return Number.isFinite(observed) && Number.isFinite(reviewed) && observed > reviewed;
}

function freshnessState(input: {
  reviewAgeDays: number | null;
  reviewWindowDays: number | null;
  materialNewEvidence: number;
  staleInputs: number;
  conflictedInputs: number;
  unknownInputs: number;
}): StrategyRecommendationFreshnessStateV1 {
  if (input.conflictedInputs > 0) return "CONFLICTED";
  if (input.materialNewEvidence > 0 || input.staleInputs > 0) return "STALE";
  if (input.reviewAgeDays === null || input.reviewWindowDays === null || input.unknownInputs > 0) return "UNKNOWN";
  return input.reviewAgeDays >= input.reviewWindowDays ? "STALE" : "CURRENT";
}

function truthState(state: StrategyRecommendationFreshnessStateV1): StrategyRecommendationFreshnessTruthStateV1 {
  if (state === "CURRENT") return "KNOWN";
  return state;
}

function reviewReasons(input: {
  state: StrategyRecommendationFreshnessStateV1;
  materialNewEvidence: number;
  staleInputs: number;
  conflictedInputs: number;
  unknownInputs: number;
  reviewAgeDays: number | null;
  reviewWindowDays: number | null;
}) {
  const reasons: string[] = [];
  if (input.materialNewEvidence > 0) reasons.push(`${input.materialNewEvidence} material new evidence item(s) arrived after last review.`);
  if (input.staleInputs > 0) reasons.push(`${input.staleInputs} stale evidence input(s) remain attached.`);
  if (input.conflictedInputs > 0) reasons.push(`${input.conflictedInputs} conflicted evidence input(s) challenge the recommendation.`);
  if (input.unknownInputs > 0) reasons.push(`${input.unknownInputs} UNKNOWN evidence input(s) block current-state certainty.`);
  if (input.reviewAgeDays !== null && input.reviewWindowDays !== null && input.reviewAgeDays >= input.reviewWindowDays) {
    reasons.push(`Recommendation review age is ${input.reviewAgeDays} days against ${input.reviewWindowDays} day review window.`);
  }
  if (input.state === "CURRENT") reasons.push("Recommendation remains current against supplied evidence and review window.");
  return reasons;
}

function nextReviewAction(state: StrategyRecommendationFreshnessStateV1) {
  if (state === "CONFLICTED") return "Resolve conflicted evidence before treating this recommendation as authoritative.";
  if (state === "STALE") return "Review material new or stale evidence before keeping this recommendation current.";
  if (state === "UNKNOWN") return "Clarify UNKNOWN evidence and review timing before escalating the recommendation.";
  return "Keep recommendation on the normal review cadence.";
}

export function assessStrategyRecommendationFreshnessV1(
  input: StrategyRecommendationFreshnessInputV1,
  { now = new Date("2026-08-25T12:00:00.000Z") } = {}
): StrategyRecommendationFreshnessAssessmentV1 {
  const reviewAgeDays = daysSince(input.last_reviewed_at, now);
  const materialNewEvidence = input.evidence.filter(
    (item) => MATERIAL.has(item.materiality) && afterReview(item.observed_at, input.last_reviewed_at)
  );
  const staleInputs = input.evidence.filter((item) => item.freshness === "STALE" || item.truth_state === "STALE");
  const conflictedInputs = input.evidence.filter((item) => item.truth_state === "CONFLICTED" || item.supports_recommendation === false);
  const unknownInputs = input.evidence.filter((item) => item.truth_state === "UNKNOWN" || item.observed_at === null || item.materiality === "UNKNOWN");
  const state = freshnessState({
    reviewAgeDays,
    reviewWindowDays: input.review_window_days,
    materialNewEvidence: materialNewEvidence.length,
    staleInputs: staleInputs.length,
    conflictedInputs: conflictedInputs.length,
    unknownInputs: unknownInputs.length
  });
  const reviewRequired = state === "STALE" || state === "CONFLICTED";

  return {
    contract_version: "strategy_recommendation_freshness_v1",
    generated_at: input.generated_at,
    recommendation_id: input.recommendation.id,
    recommendation_version: input.recommendation_version,
    title: input.recommendation.title,
    last_reviewed_at: input.last_reviewed_at,
    review_age_days: reviewAgeDays,
    material_new_evidence_since_review: materialNewEvidence,
    stale_inputs: staleInputs,
    conflicted_inputs: conflictedInputs,
    unknown_inputs: unknownInputs,
    freshness_state: state,
    REVIEW_REQUIRED: reviewRequired,
    REVIEW_REASON: reviewReasons({
      state,
      materialNewEvidence: materialNewEvidence.length,
      staleInputs: staleInputs.length,
      conflictedInputs: conflictedInputs.length,
      unknownInputs: unknownInputs.length,
      reviewAgeDays,
      reviewWindowDays: input.review_window_days
    }),
    CURRENT_DASHBOARD_PROJECTION: {
      recommendation_id: input.recommendation.id,
      title: input.recommendation.title,
      freshness_state: state,
      truth_state: truthState(state),
      confidence: input.recommendation.confidence,
      REVIEW_REQUIRED: reviewRequired,
      what_to_review_next: nextReviewAction(state)
    },
    prior_rationale: {
      recommended_action: input.recommendation.recommended_action,
      reason: input.recommendation.reason,
      confidence: input.recommendation.confidence,
      confidence_reasons: input.recommendation.confidence_reasons,
      assumptions: input.recommendation.assumptions,
      limitations: input.recommendation.limitations
    },
    recommendation_snapshot: structuredClone(input.recommendation),
    mutation_performed: false,
    keegan_action_required: "NO"
  };
}
