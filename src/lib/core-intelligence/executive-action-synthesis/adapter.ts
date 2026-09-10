import type { StrategyEvidenceReviewQueueItemV1 } from "@/lib/core-intelligence/strategy-evidence-review/contracts";
import type { Recommendation } from "@/lib/intelligence/recommendation-contract";
import type {
  ExecutiveActionItemV1,
  ExecutiveActionLaneV1,
  ExecutiveActionSynthesisInputV1,
  ExecutiveActionSynthesisV1,
} from "./contracts";

const MONITOR_STATUSES = new Set<Recommendation["status"]>([
  "snoozed",
  "executed",
  "measuring",
  "successful",
  "inconclusive",
]);

const DEPRIORITIZE_STATUSES = new Set<Recommendation["status"]>([
  "rejected",
  "expired",
  "unsuccessful",
]);

function evidenceBlock(review: StrategyEvidenceReviewQueueItemV1 | null): string | null {
  if (!review) return "Evidence review is unavailable for this recommendation.";
  if (review.truth_state === "CONFLICTED") return "Conflicted evidence must be resolved before action is promoted.";
  if (review.freshness_state === "REVIEW_REQUIRED") return "Evidence freshness requires review before action is promoted.";
  if (review.disposition === "REVIEW_NOW") return "Material evidence gaps require review before action is promoted.";
  if (review.truth_state === "UNKNOWN") return "Evidence truth remains UNKNOWN and cannot support action certainty.";
  if (review.freshness_state === "UNKNOWN") return "Evidence freshness remains UNKNOWN and cannot support action certainty.";
  return null;
}

function classifyLane(
  recommendation: Recommendation,
  review: StrategyEvidenceReviewQueueItemV1 | null,
): { lane: ExecutiveActionLaneV1; blockingReason: string | null } {
  if (DEPRIORITIZE_STATUSES.has(recommendation.status)) {
    return {
      lane: "DEPRIORITIZE",
      blockingReason: `Recommendation status is ${recommendation.status}.`,
    };
  }

  if (MONITOR_STATUSES.has(recommendation.status)) {
    return { lane: "MONITOR", blockingReason: null };
  }

  const block = evidenceBlock(review);
  if (block) return { lane: "WAIT", blockingReason: block };

  if (recommendation.category === "do_nothing") {
    return { lane: "MONITOR", blockingReason: null };
  }

  if (recommendation.status === "approved" && recommendation.approval_level === "L4_APPROVED_FOR_EXECUTION") {
    return { lane: "DO_NOW", blockingReason: null };
  }

  if (recommendation.status === "approved") {
    return {
      lane: "WAIT",
      blockingReason: "Recommendation status is approved but the approval level is not approved for execution.",
    };
  }

  if (["recommended", "draft_prepared", "awaiting_approval"].includes(recommendation.status)) {
    return { lane: "PREPARE", blockingReason: null };
  }

  return {
    lane: "WAIT",
    blockingReason: `Recommendation status ${recommendation.status} is not yet action-ready.`,
  };
}

function compareItems(left: ExecutiveActionItemV1, right: ExecutiveActionItemV1) {
  if (left.priority_score.overallScore !== right.priority_score.overallScore) {
    return right.priority_score.overallScore - left.priority_score.overallScore;
  }
  return left.recommendation_id.localeCompare(right.recommendation_id);
}

function toItem(
  recommendation: Recommendation,
  review: StrategyEvidenceReviewQueueItemV1 | null,
): ExecutiveActionItemV1 {
  const { lane, blockingReason } = classifyLane(recommendation, review);

  return {
    recommendation_id: recommendation.id,
    title: recommendation.title,
    lane,
    recommended_action: recommendation.recommended_action,
    expected_outcome: recommendation.expected_outcome,
    priority_score: structuredClone(recommendation.priority_score),
    confidence: recommendation.confidence,
    urgency: recommendation.urgency,
    approval_level: recommendation.approval_level,
    recommendation_status: recommendation.status,
    review_date: recommendation.review_date,
    evidence_state: {
      review_disposition: review?.disposition ?? "UNAVAILABLE",
      truth_state: review?.truth_state ?? "UNKNOWN",
      freshness_state: review?.freshness_state ?? "UNKNOWN",
    },
    blocking_reason: blockingReason,
    data_missing: [...recommendation.data_missing],
    assumptions: [...recommendation.assumptions],
    limitations: [...recommendation.limitations],
  };
}

export function buildExecutiveActionSynthesisV1(input: ExecutiveActionSynthesisInputV1): ExecutiveActionSynthesisV1 {
  const reviewsByRecommendation = new Map(
    input.evidence_review_queue.queue.map((review) => [review.recommendation_id, review] as const),
  );

  const queue = input.recommendations
    .map((recommendation) => toItem(recommendation, reviewsByRecommendation.get(recommendation.id) ?? null))
    .sort(compareItems);

  return {
    contract_version: "executive_action_synthesis_v1",
    generated_at: input.generated_at,
    DO_NOW: queue.filter((item) => item.lane === "DO_NOW"),
    PREPARE: queue.filter((item) => item.lane === "PREPARE"),
    MONITOR: queue.filter((item) => item.lane === "MONITOR"),
    WAIT: queue.filter((item) => item.lane === "WAIT"),
    DEPRIORITIZE: queue.filter((item) => item.lane === "DEPRIORITIZE"),
    queue,
    mutation_performed: false,
    keegan_action_required: "NO",
  };
}
