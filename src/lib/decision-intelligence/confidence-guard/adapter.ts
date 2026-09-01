import type { DecisionEvidenceRefV1 } from "@/lib/decision-evidence/contracts";
import type { ExplanationConfidence } from "@/lib/intelligence/explanation-contract";
import type {
  DecisionConfidenceGuardAssessmentV1,
  DecisionConfidenceGuardDashboardProjectionV1,
  DecisionConfidenceGuardStateV1,
  DecisionConfidenceGuardInputV1
} from "./contracts";

const CONFIDENCE_RANK: Record<ExplanationConfidence, number> = {
  insufficient_evidence: 0,
  possible: 1,
  likely: 2,
  strongly_supported: 3,
  confirmed: 4
};

function lowerConfidence(left: ExplanationConfidence, right: ExplanationConfidence): ExplanationConfidence {
  return CONFIDENCE_RANK[left] <= CONFIDENCE_RANK[right] ? left : right;
}

function evidenceCap(refs: DecisionEvidenceRefV1[]): ExplanationConfidence {
  if (refs.some((item) => item.truth_state === "CONFLICTED" || item.evidence_quality === "CONFLICTED")) return "insufficient_evidence";
  if (refs.some((item) => item.truth_state === "STALE" || item.freshness_state === "STALE")) return "possible";
  if (refs.some((item) => item.truth_state === "UNKNOWN" || item.freshness_state === "UNKNOWN" || item.evidence_quality === "UNKNOWN")) return "possible";
  if (refs.some((item) => item.evidence_quality === "LOW")) return "possible";
  if (refs.some((item) => item.evidence_quality === "MEDIUM" || item.directness !== "DIRECT")) return "likely";
  return "confirmed";
}

function degradingReason(ref: DecisionEvidenceRefV1): "STALE" | "CONFLICTED" | "LOW_QUALITY" | "UNKNOWN" | null {
  if (ref.truth_state === "CONFLICTED" || ref.evidence_quality === "CONFLICTED") return "CONFLICTED";
  if (ref.truth_state === "STALE" || ref.freshness_state === "STALE") return "STALE";
  if (ref.truth_state === "UNKNOWN" || ref.freshness_state === "UNKNOWN" || ref.evidence_quality === "UNKNOWN") return "UNKNOWN";
  if (ref.evidence_quality === "LOW") return "LOW_QUALITY";
  return null;
}

function materialReview(input: DecisionConfidenceGuardInputV1, confidenceNow: ExplanationConfidence, degradingCount: number): boolean {
  if (confidenceNow === "insufficient_evidence") return true;
  if (input.materiality === "DECISION_CHANGING" && degradingCount > 0) return true;
  if (input.materiality === "HIGH" && CONFIDENCE_RANK[confidenceNow] < CONFIDENCE_RANK[input.recommendation.confidence]) return true;
  return false;
}

function toProjection(input: DecisionConfidenceGuardInputV1, assessment: Omit<DecisionConfidenceGuardAssessmentV1, "dashboard_projection">): DecisionConfidenceGuardDashboardProjectionV1 {
  return {
    view_model_version: "decision_confidence_guard_dashboard_v1",
    recommendation_id: assessment.recommendation_id,
    recommendation_version: assessment.recommendation_version,
    status: assessment.guard_state,
    confidence_before: assessment.confidence_before,
    confidence_now: assessment.confidence_now,
    review_required: assessment.review_required,
    headline: assessment.review_required
      ? "Recommendation confidence requires review before remaining actionable."
      : assessment.guard_state === "WATCH"
        ? "Recommendation remains usable, with explicit confidence watch flags."
        : "Recommendation confidence remains current.",
    degrading_input_count: assessment.degrading_inputs.length,
    stale_source_count: assessment.stale_sources.length,
    conflicted_source_count: assessment.conflicted_sources.length,
    prior_rationale_visible: true,
    prior_rationale_summary: input.prior_rationale.summary,
    rows: assessment.degrading_inputs.map((item) => ({
      ref_id: item.ref_id,
      label: item.label,
      state: item.reason,
      detail: item.detail
    }))
  };
}

export function assessDecisionConfidenceGuardV1(input: DecisionConfidenceGuardInputV1): DecisionConfidenceGuardAssessmentV1 {
  const staleSources = input.current_evidence_refs.filter((item) => item.truth_state === "STALE" || item.freshness_state === "STALE");
  const conflictedSources = input.current_evidence_refs.filter((item) => item.truth_state === "CONFLICTED" || item.evidence_quality === "CONFLICTED");
  const degradingInputs = input.current_evidence_refs.flatMap((item) => {
    const reason = degradingReason(item);
    return reason ? [{ ref_id: item.ref_id, label: item.label, reason, detail: item.notes }] : [];
  });

  const confidenceNow = lowerConfidence(input.recommendation.confidence, evidenceCap(input.current_evidence_refs));
  const reviewRequired = materialReview(input, confidenceNow, degradingInputs.length);
  const guardState: DecisionConfidenceGuardStateV1 = reviewRequired ? "REVIEW_REQUIRED" : degradingInputs.length > 0 ? "WATCH" : "CURRENT";
  const base = {
    contract_version: "decision_confidence_guard_v1" as const,
    recommendation_id: input.recommendation.recommendation_id,
    recommendation_version: input.recommendation.version,
    confidence_before: input.recommendation.confidence,
    confidence_now: confidenceNow,
    confidence_delta: confidenceNow === input.recommendation.confidence ? "UNCHANGED" as const : "DOWN" as const,
    guard_state: guardState,
    review_required: reviewRequired,
    degrading_inputs: degradingInputs,
    stale_sources: staleSources,
    conflicted_sources: conflictedSources,
    prior_rationale: input.prior_rationale,
    active_recommendation_snapshot: input.recommendation,
    history_preserved: true as const,
    mutation_performed: false as const,
    keegan_action_required: "NO" as const
  };

  return {
    ...base,
    dashboard_projection: toProjection(input, base)
  };
}
