import type { ExecutiveActionItemV1, ExecutiveActionSynthesisV1 } from "@/lib/core-intelligence/executive-action-synthesis/contracts";
import type { RecommendationContradictionAssessmentV1 } from "@/lib/core-intelligence/recommendation-contradiction/contracts";
import type { StrategyEvidenceReviewQueueItemV1, StrategyEvidenceReviewQueueV1 } from "@/lib/core-intelligence/strategy-evidence-review/contracts";
import type { Recommendation, RecommendationsResponse } from "@/lib/intelligence/recommendation-contract";

export type StrategyEpistemicStateV1 = "KNOWN" | "INFERRED" | "UNKNOWN" | "STALE" | "CONFLICTED";

export type StrategyWorkspaceRecordV1 = {
  id: string;
  title: string;
  lane: ExecutiveActionItemV1["lane"];
  recommendedAction: string;
  expectedOutcome: string;
  priorityScore: number | null;
  confidence: Recommendation["confidence"] | null;
  urgency: Recommendation["urgency"] | null;
  approvalLevel: Recommendation["approval_level"] | null;
  recommendationStatus: Recommendation["status"] | null;
  epistemicState: StrategyEpistemicStateV1;
  freshnessState: StrategyEvidenceReviewQueueItemV1["freshness_state"] | "UNKNOWN";
  blocker: string | null;
  dependencies: string[];
  dataMissing: string[];
  assumptions: string[];
  limitations: string[];
  nextSafeMove: string;
  economics: {
    currency: "USD";
    horizon: string;
    lowCents: number | null;
    expectedCents: number | null;
    highCents: number | null;
  } | null;
  reviewHref: "/recommend";
  evidenceHref: "/data-evidence";
};

export type ExecutiveStrategyWorkspaceModelV1 = {
  contractVersion: "executive_strategy_workspace_v1";
  generatedAt: string;
  sourceMode: RecommendationsResponse["dataMode"] | "UNAVAILABLE";
  state: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
  currentPriorities: StrategyWorkspaceRecordV1[];
  activeBets: StrategyWorkspaceRecordV1[];
  blockers: StrategyWorkspaceRecordV1[];
  decisionPoints: StrategyWorkspaceRecordV1[];
  nextSafeMoves: StrategyWorkspaceRecordV1[];
  counts: {
    total: number;
    doNow: number;
    prepare: number;
    monitor: number;
    wait: number;
    deprioritize: number;
    unknownOrConflicted: number;
  };
  notice: string;
};

function inferredRecommendationIds(assessment: RecommendationContradictionAssessmentV1 | null) {
  const ids = new Set<string>();
  for (const pair of assessment?.compatible_pairs ?? []) {
    if (pair.truth_state !== "INFERRED") continue;
    for (const id of pair.recommendation_ids) ids.add(id);
  }
  return ids;
}

function epistemicState(item: ExecutiveActionItemV1, inferredIds: Set<string>): StrategyEpistemicStateV1 {
  if (item.evidence_state.truth_state === "CONFLICTED") return "CONFLICTED";
  if (item.evidence_state.truth_state === "UNKNOWN") return "UNKNOWN";
  if (item.evidence_state.freshness_state === "REVIEW_REQUIRED") return "STALE";
  if (item.evidence_state.freshness_state === "UNKNOWN") return "UNKNOWN";
  if (inferredIds.has(item.recommendation_id)) return "INFERRED";
  return "KNOWN";
}

function economicsFor(rec: Recommendation | null): StrategyWorkspaceRecordV1["economics"] {
  if (!rec || rec.estimated_incremental_revenue.currency !== "USD") return null;
  const range = rec.estimated_incremental_revenue;
  if (
    range.low_incremental_revenue_cents == null
    && range.expected_incremental_revenue_cents == null
    && range.high_incremental_revenue_cents == null
  ) return null;
  return {
    currency: "USD",
    horizon: range.horizon,
    lowCents: range.low_incremental_revenue_cents,
    expectedCents: range.expected_incremental_revenue_cents,
    highCents: range.high_incremental_revenue_cents,
  };
}

function nextSafeMove(
  item: ExecutiveActionItemV1,
  review: StrategyEvidenceReviewQueueItemV1 | null,
  recommendation: Recommendation | null,
): string {
  if (item.lane === "DO_NOW") return item.recommended_action;
  if (item.lane === "PREPARE") return item.recommended_action;
  if (item.lane === "MONITOR") return recommendation?.measurement_plan || "Continue monitoring the supported evidence.";
  if (item.lane === "DEPRIORITIZE") return "Keep deprioritized unless material evidence changes.";
  return review?.WHAT_TO_REVIEW_NEXT || item.blocking_reason || "Resolve the material UNKNOWN before escalating.";
}

function toRecord(
  item: ExecutiveActionItemV1,
  recommendations: Map<string, Recommendation>,
  reviews: Map<string, StrategyEvidenceReviewQueueItemV1>,
  inferredIds: Set<string>,
): StrategyWorkspaceRecordV1 {
  const recommendation = recommendations.get(item.recommendation_id) ?? null;
  const review = reviews.get(item.recommendation_id) ?? null;
  const dependencies = recommendation?.prerequisites ? [...recommendation.prerequisites] : [];

  return {
    id: item.recommendation_id,
    title: item.title,
    lane: item.lane,
    recommendedAction: item.recommended_action,
    expectedOutcome: item.expected_outcome,
    priorityScore: Number.isFinite(item.priority_score.overallScore) ? item.priority_score.overallScore : null,
    confidence: item.confidence ?? null,
    urgency: item.urgency ?? null,
    approvalLevel: item.approval_level ?? null,
    recommendationStatus: item.recommendation_status ?? null,
    epistemicState: epistemicState(item, inferredIds),
    freshnessState: item.evidence_state.freshness_state ?? "UNKNOWN",
    blocker: item.blocking_reason,
    dependencies,
    dataMissing: [...item.data_missing],
    assumptions: [...item.assumptions],
    limitations: [...item.limitations],
    nextSafeMove: nextSafeMove(item, review, recommendation),
    economics: economicsFor(recommendation),
    reviewHref: "/recommend",
    evidenceHref: "/data-evidence",
  };
}

function isActiveBet(item: StrategyWorkspaceRecordV1) {
  return ["recommended", "draft_prepared", "awaiting_approval", "approved", "measuring"].includes(item.recommendationStatus ?? "");
}

function isBlocked(item: StrategyWorkspaceRecordV1) {
  return Boolean(item.blocker || item.dependencies.length || item.dataMissing.length || ["UNKNOWN", "STALE", "CONFLICTED"].includes(item.epistemicState));
}

export function buildExecutiveStrategyWorkspaceV1(input: {
  recommendations: RecommendationsResponse | null;
  evidenceReview: StrategyEvidenceReviewQueueV1 | null;
  contradictionAssessment?: RecommendationContradictionAssessmentV1 | null;
  synthesis: ExecutiveActionSynthesisV1 | null;
  generatedAt?: string;
}): ExecutiveStrategyWorkspaceModelV1 {
  const generatedAt = input.generatedAt ?? input.synthesis?.generated_at ?? input.recommendations?.generatedAt ?? new Date(0).toISOString();

  if (!input.recommendations || !input.evidenceReview || !input.synthesis) {
    return {
      contractVersion: "executive_strategy_workspace_v1",
      generatedAt,
      sourceMode: input.recommendations?.dataMode ?? "UNAVAILABLE",
      state: "UNAVAILABLE",
      currentPriorities: [],
      activeBets: [],
      blockers: [],
      decisionPoints: [],
      nextSafeMoves: [],
      counts: { total: 0, doNow: 0, prepare: 0, monitor: 0, wait: 0, deprioritize: 0, unknownOrConflicted: 0 },
      notice: "Canonical strategy evidence is unavailable for the selected window. No strategic priority is inferred from missing data.",
    };
  }

  const recommendations = new Map(input.recommendations.recommendations.map((item) => [item.id, item] as const));
  const reviews = new Map(input.evidenceReview.queue.map((item) => [item.recommendation_id, item] as const));
  const inferredIds = inferredRecommendationIds(input.contradictionAssessment ?? null);
  const records = input.synthesis.queue.map((item) => toRecord(item, recommendations, reviews, inferredIds));
  const sourceMode = input.recommendations.dataMode ?? "UNAVAILABLE";
  const state = sourceMode === "LIVE_DATA" ? "AVAILABLE" : "PARTIAL";
  const actionable = records.filter((item) => item.lane !== "DEPRIORITIZE");

  return {
    contractVersion: "executive_strategy_workspace_v1",
    generatedAt,
    sourceMode,
    state,
    currentPriorities: actionable.slice(0, 5),
    activeBets: records.filter(isActiveBet).slice(0, 6),
    blockers: records.filter(isBlocked).slice(0, 6),
    decisionPoints: records.filter((item) => item.lane === "WAIT" || item.lane === "DEPRIORITIZE").slice(0, 6),
    nextSafeMoves: actionable.slice(0, 5),
    counts: {
      total: records.length,
      doNow: records.filter((item) => item.lane === "DO_NOW").length,
      prepare: records.filter((item) => item.lane === "PREPARE").length,
      monitor: records.filter((item) => item.lane === "MONITOR").length,
      wait: records.filter((item) => item.lane === "WAIT").length,
      deprioritize: records.filter((item) => item.lane === "DEPRIORITIZE").length,
      unknownOrConflicted: records.filter((item) => item.epistemicState === "UNKNOWN" || item.epistemicState === "CONFLICTED").length,
    },
    notice: state === "AVAILABLE"
      ? "Priorities preserve the existing recommendation score and executive-action lanes. No new strategy ranking is introduced here."
      : "Strategy is using partial or non-live evidence. UNKNOWN and review-required states remain visible and action certainty is withheld.",
  };
}
