import type { DecisionConfidenceGuardAssessmentV1 } from "@/lib/decision-intelligence/confidence-guard/contracts";
import type { RecommendationContradictionAssessmentV1 } from "@/lib/core-intelligence/recommendation-contradiction/contracts";
import type { Recommendation } from "@/lib/intelligence/recommendation-contract";
import type {
  StrategyEvidenceReviewDispositionV1,
  StrategyEvidenceReviewInputV1,
  StrategyEvidenceReviewQueueItemV1,
  StrategyEvidenceReviewQueueV1
} from "./contracts";

function contradictionCount(rec: Recommendation, assessment: RecommendationContradictionAssessmentV1) {
  return assessment.WHAT_CONFLICTS.filter((item) => item.recommendation_ids.includes(rec.id)).length;
}

function unknownCount(rec: Recommendation, assessment: RecommendationContradictionAssessmentV1) {
  return assessment.UNKNOWN.filter((item) => item.recommendation_id === rec.id).length;
}

function confidenceGuard(rec: Recommendation, guards: DecisionConfidenceGuardAssessmentV1[]) {
  return guards.find((guard) => guard.recommendation_id === rec.id) ?? null;
}

function baseEvidenceGaps(rec: Recommendation) {
  let score = 0;
  const reasons: string[] = [];

  if (rec.supporting_evidence.length === 0) {
    score += 4;
    reasons.push("No supporting evidence is attached to the recommendation.");
  }
  if (rec.data_missing.length > 0) {
    score += rec.data_missing.length * 2;
    reasons.push(`Missing data: ${rec.data_missing.join(", ")}.`);
  }
  if (rec.estimated_cost.money_cents == null) {
    score += 2;
    reasons.push("Estimated cost remains UNKNOWN.");
  }
  if (rec.estimated_effort.hours == null) {
    score += 1;
    reasons.push("Estimated effort hours remain UNKNOWN.");
  }
  if (rec.review_date == null || rec.time_to_impact === "unknown") {
    score += 1;
    reasons.push("Review timing remains UNKNOWN.");
  }
  if (rec.confidence === "possible" || rec.confidence === "insufficient_evidence") {
    score += 2;
    reasons.push(`Recommendation confidence is ${rec.confidence}.`);
  }

  return { score, reasons };
}

function disposition(score: number): StrategyEvidenceReviewDispositionV1 {
  if (score >= 25) return "REVIEW_NOW";
  if (score >= 4) return "REVIEW_NEXT";
  return "DEFER";
}

function reviewAction(item: {
  contradictionCount: number;
  unknownCount: number;
  guard: DecisionConfidenceGuardAssessmentV1 | null;
  rec: Recommendation;
}) {
  if (item.contradictionCount > 0) return "Resolve contradiction evidence before treating this recommendation as current.";
  if (item.guard?.review_required) return "Review degrading evidence inputs and revalidate confidence before execution.";
  if (item.unknownCount > 0 || item.rec.data_missing.length > 0) return "Fill the highest-material UNKNOWN evidence gap before escalating.";
  return "Keep evidence on normal monitoring cadence.";
}

function toItem(rec: Recommendation, assessment: RecommendationContradictionAssessmentV1, guards: DecisionConfidenceGuardAssessmentV1[]): StrategyEvidenceReviewQueueItemV1 {
  const guard = confidenceGuard(rec, guards);
  const contradictions = contradictionCount(rec, assessment);
  const unknowns = unknownCount(rec, assessment);
  const base = baseEvidenceGaps(rec);
  const degrading = guard?.degrading_inputs.length ?? 0;
  const stale = guard?.stale_sources.length ?? 0;
  const conflicted = guard?.conflicted_sources.length ?? 0;
  const score =
    contradictions * 5
    + unknowns * 2
    + base.score
    + degrading * 2
    + stale * 2
    + conflicted * 4
    + (guard?.review_required ? 4 : 0);
  const why = [
    ...base.reasons,
    ...(contradictions ? [`${contradictions} contradiction finding(s) reference this recommendation.`] : []),
    ...(unknowns ? [`${unknowns} UNKNOWN comparison field(s) reference this recommendation.`] : []),
    ...(degrading ? [`${degrading} confidence-guard degrading input(s) remain visible.`] : []),
    ...(guard?.review_required ? ["Confidence guard requires review."] : [])
  ];

  return {
    recommendation_id: rec.id,
    title: rec.title,
    disposition: disposition(score),
    review_score: score,
    contradiction_count: contradictions,
    unknown_count: unknowns,
    degrading_input_count: degrading,
    stale_source_count: stale,
    conflicted_source_count: conflicted,
    confidence_now: guard?.confidence_now ?? rec.confidence,
    freshness_state: guard?.guard_state ?? "UNKNOWN",
    truth_state: contradictions > 0 || conflicted > 0 ? "CONFLICTED" : unknowns > 0 || base.reasons.length > 0 ? "UNKNOWN" : "KNOWN",
    WHY_REVIEW: why.length ? why : ["No material evidence-review trigger is present."],
    WHAT_TO_REVIEW_NEXT: reviewAction({ contradictionCount: contradictions, unknownCount: unknowns, guard, rec })
  };
}

function compareItems(left: StrategyEvidenceReviewQueueItemV1, right: StrategyEvidenceReviewQueueItemV1) {
  if (left.review_score !== right.review_score) return right.review_score - left.review_score;
  return left.recommendation_id.localeCompare(right.recommendation_id);
}

export function buildStrategyEvidenceReviewQueueV1(input: StrategyEvidenceReviewInputV1): StrategyEvidenceReviewQueueV1 {
  const queue = input.recommendations
    .map((rec) => toItem(rec, input.contradiction_assessment, input.confidence_guards))
    .sort(compareItems);

  return {
    contract_version: "strategy_evidence_review_queue_v1",
    generated_at: input.generated_at,
    REVIEW_NOW: queue.filter((item) => item.disposition === "REVIEW_NOW"),
    REVIEW_NEXT: queue.filter((item) => item.disposition === "REVIEW_NEXT"),
    DEFER: queue.filter((item) => item.disposition === "DEFER"),
    queue,
    recommendation_snapshots: structuredClone(input.recommendations),
    mutation_performed: false,
    keegan_action_required: "NO"
  };
}
