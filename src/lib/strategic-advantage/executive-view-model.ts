import {
  STRATEGIC_ADVANTAGE_EXECUTIVE_VIEW_VERSION_V1,
  hasUnacceptableRuinRisk,
  type DecisionAdvantageAssessmentV1,
  type StrategicAdvantageExecutiveViewModelV1
} from "./contracts";

export function toStrategicAdvantageExecutiveViewModelV1(
  assessment: DecisionAdvantageAssessmentV1
): StrategicAdvantageExecutiveViewModelV1 {
  const hardToCopy = [
    assessment.defensibility.rationale,
    assessment.information_advantage.level !== "LOW" && assessment.information_advantage.level !== "VERY_LOW"
      ? assessment.information_advantage.rationale
      : null,
    assessment.brand_prestige_effect.level === "HIGH" || assessment.brand_prestige_effect.level === "VERY_HIGH"
      ? assessment.brand_prestige_effect.rationale
      : null
  ].filter((item): item is string => Boolean(item));

  return {
    view_version: STRATEGIC_ADVANTAGE_EXECUTIVE_VIEW_VERSION_V1,
    assessment_id: assessment.assessment_id,
    action_label: assessment.action_label,
    recommendation: hasUnacceptableRuinRisk(assessment) ? "REJECT" : assessment.recommendation,
    why_this_creates_advantage: assessment.advantage_thesis,
    what_compounds: assessment.compounding_value.rationale,
    what_is_hard_to_copy: hardToCopy.join(" "),
    what_we_give_up: [
      ...assessment.opportunity_cost.explicit_tradeoffs,
      ...assessment.opportunity_cost.qualitative_costs
    ],
    biggest_uncertainty: assessment.key_uncertainty,
    biggest_bottleneck: assessment.biggest_bottleneck,
    what_to_ignore_or_deprioritize: assessment.what_to_ignore_or_deprioritize,
    next_high_leverage_move: assessment.next_smallest_high_leverage_action,
    what_would_change_the_recommendation: assessment.what_would_change_my_mind,
    confidence: assessment.confidence
  };
}

export function toStrategicAdvantageExecutiveViewModelsV1(
  assessments: DecisionAdvantageAssessmentV1[]
): StrategicAdvantageExecutiveViewModelV1[] {
  return assessments
    .map(toStrategicAdvantageExecutiveViewModelV1)
    .sort((a, b) => a.assessment_id.localeCompare(b.assessment_id));
}
