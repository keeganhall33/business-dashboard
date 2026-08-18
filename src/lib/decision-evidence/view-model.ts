import type { DecisionEvidenceDashboardViewModelV1, DecisionEvidenceGapV1, DecisionEvidenceRecommendationV1 } from "./contracts";
import { DECISION_EVIDENCE_GAP_FIXTURES_V1 } from "./fixtures";

function recommendationFor(gap: DecisionEvidenceGapV1): DecisionEvidenceRecommendationV1 {
  if (gap.COVERAGE_STATE === "COMPLETE" && gap.CRITICAL_UNKNOWN === null) return "SUFFICIENT";
  if (gap.COST_OR_EFFORT_CLASS === "NOT_WORTH_IT" || gap.ESTIMATED_INFORMATION_VALUE_QUALITATIVE === "LOW") return "SKIP_FOR_NOW";
  if (gap.TIME_SENSITIVITY === "WATCH") return "MONITOR";
  return "RESEARCH_NOW";
}

export function toDecisionEvidenceDashboardViewModelV1(gap: DecisionEvidenceGapV1): DecisionEvidenceDashboardViewModelV1 {
  const staleOrConflicted = gap.EVIDENCE_REFS.some(
    (item) => item.truth_state === "STALE" || item.truth_state === "CONFLICTED" || item.freshness_state === "STALE" || item.evidence_quality === "CONFLICTED"
  );
  const recommendation = recommendationFor(gap);

  return {
    view_model_version: "decision_evidence_dashboard_v1",
    decision_id: gap.DECISION_ID,
    headline: gap.CRITICAL_UNKNOWN ? `Evidence gap: ${gap.CRITICAL_UNKNOWN}` : "Evidence coverage is sufficient for this decision.",
    recommendation,
    coverage_state: gap.COVERAGE_STATE,
    confidence_cap: gap.CONFIDENCE_CAP,
    critical_unknowns: gap.CRITICAL_UNKNOWN ? [gap.CRITICAL_UNKNOWN] : [],
    evidence_rows: gap.EVIDENCE_REFS.map((item) => ({
      ref_id: item.ref_id,
      label: item.label,
      badge: item.directness,
      state: item.truth_state === "KNOWN" || item.truth_state === "INFERRED" ? item.evidence_quality : item.truth_state,
      detail: `${item.directness} | ${item.freshness_state} | ${item.evidence_quality} | ${item.notes}`
    })),
    next_best_action: gap.NEXT_BEST_SOURCE_OR_RESEARCH_ACTION,
    stop_rule: gap.STOP_RESEARCH_RULE,
    change_trigger: gap.WHAT_RESULT_WOULD_CHANGE_THE_RECOMMENDATION,
    flags: {
      material_unknown_visible: gap.CRITICAL_UNKNOWN !== null && (gap.MATERIALITY_IF_RESOLVED === "HIGH" || gap.MATERIALITY_IF_RESOLVED === "DECISION_CHANGING"),
      stale_or_conflicted_visible: staleOrConflicted,
      low_value_research_deprioritized: recommendation === "SKIP_FOR_NOW",
      proxy_masquerades_as_direct: gap.DIRECT_VS_PROXY_EVIDENCE.proxy_masquerades_as_direct
    }
  };
}

export function buildDecisionEvidenceDashboardFixturesV1(
  gaps: DecisionEvidenceGapV1[] = DECISION_EVIDENCE_GAP_FIXTURES_V1
): DecisionEvidenceDashboardViewModelV1[] {
  return gaps.map(toDecisionEvidenceDashboardViewModelV1);
}
