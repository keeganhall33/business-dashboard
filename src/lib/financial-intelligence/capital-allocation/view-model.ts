import { CAPITAL_ALLOCATION_VIEW_VERSION_V1, type CapitalAllocationAssessmentV1, type CapitalAllocationViewModelV1 } from "./contracts";

export function toCapitalAllocationViewModelV1(assessment: CapitalAllocationAssessmentV1): CapitalAllocationViewModelV1 {
  return {
    view_version: CAPITAL_ALLOCATION_VIEW_VERSION_V1,
    assessment_id: assessment.assessment_id,
    recommended_alternative_id: assessment.recommended_alternative_id,
    recommendation_reason: assessment.recommendation_reason,
    rows: assessment.alternatives.map((alternative) => ({
      alternative_id: alternative.alternative_id,
      label: alternative.label,
      kind: alternative.kind,
      direct_financial_range: alternative.direct_financial_range,
      capital_required: alternative.capital_required,
      creative_time_burden: alternative.creative_time_burden,
      payback_window: alternative.payback_window,
      liquidity_impact: alternative.liquidity_impact,
      reversibility: alternative.reversibility,
      strategic_value_not_monetized: [...alternative.strategic_value_not_monetized.notes],
      learning_value: alternative.learning_value.summary,
      opportunity_cost: [...alternative.opportunity_cost.notes],
      confidence: alternative.confidence,
      truth_state: alternative.truth_state,
      key_unknown_inputs: [...alternative.key_unknown_inputs],
      recommendation: alternative.recommendation,
      next_safe_action: alternative.next_safe_action
    })),
    guardrails: assessment.guardrails,
    keegan_action_required: "NO"
  };
}
