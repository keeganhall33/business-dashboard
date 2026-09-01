import { hasUnacceptableRuinRisk, type DecisionAdvantageAssessmentV1 } from "@/lib/strategic-advantage/contracts";
import type { StrategicTrajectoryViewModelV1 } from "@/lib/strategic-trajectory/contracts";
import {
  STRATEGIC_ADVANTAGE_DECISION_LENS_VERSION_V1,
  type StrategicAdvantageComponentSignalV1,
  type StrategicAdvantageDecisionLensV1
} from "./contracts";

const favorableQualitativeLevels = new Set(["HIGH", "VERY_HIGH"]);
const unfavorableRiskLevels = new Set(["HIGH", "UNACCEPTABLE", "UNKNOWN"]);

function sortedUnique(items: string[]): string[] {
  return [...new Set(items)].sort();
}

function componentSignalsFor(assessment: DecisionAdvantageAssessmentV1): StrategicAdvantageComponentSignalV1[] {
  return [
    {
      component: "ASYMMETRY",
      level: assessment.asymmetry.level,
      supports_recommendation: favorableQualitativeLevels.has(assessment.asymmetry.level),
      rationale: assessment.asymmetry.rationale,
      evidence_refs: [...assessment.asymmetry.evidence_refs].sort()
    },
    {
      component: "OPTIONALITY",
      level: assessment.optionality.level,
      supports_recommendation: favorableQualitativeLevels.has(assessment.optionality.level),
      rationale: assessment.optionality.rationale,
      evidence_refs: [...assessment.optionality.evidence_refs].sort()
    },
    {
      component: "REVERSIBILITY",
      level: assessment.reversibility.level,
      supports_recommendation: assessment.reversibility.level === "REVERSIBLE" || assessment.reversibility.level === "PARTIALLY_REVERSIBLE",
      rationale: assessment.reversibility.rationale,
      evidence_refs: [...assessment.reversibility.evidence_refs].sort()
    },
    {
      component: "OPPORTUNITY_COST",
      level: assessment.opportunity_cost.cash_cost_range_cents.currency,
      supports_recommendation: assessment.capacity_fit.level !== "HIGH" && assessment.capacity_fit.level !== "UNACCEPTABLE",
      rationale: [...assessment.opportunity_cost.explicit_tradeoffs, ...assessment.opportunity_cost.qualitative_costs].join(" "),
      evidence_refs: [...assessment.opportunity_cost.evidence_refs].sort()
    },
    {
      component: "COMPOUNDING_VALUE",
      level: assessment.compounding_value.level,
      supports_recommendation: favorableQualitativeLevels.has(assessment.compounding_value.level),
      rationale: assessment.compounding_value.rationale,
      evidence_refs: [...assessment.compounding_value.evidence_refs].sort()
    },
    {
      component: "DEFENSIBILITY",
      level: assessment.defensibility.level,
      supports_recommendation: favorableQualitativeLevels.has(assessment.defensibility.level),
      rationale: assessment.defensibility.rationale,
      evidence_refs: [...assessment.defensibility.evidence_refs].sort()
    },
    {
      component: "CAPACITY_FIT",
      level: assessment.capacity_fit.level,
      supports_recommendation: !unfavorableRiskLevels.has(assessment.capacity_fit.level),
      rationale: assessment.capacity_fit.rationale,
      evidence_refs: [...assessment.capacity_fit.evidence_refs].sort()
    },
    {
      component: "RISK_OF_RUIN",
      level: assessment.risk_of_ruin.level,
      supports_recommendation: assessment.risk_of_ruin.level === "LOW" || assessment.risk_of_ruin.level === "MEDIUM",
      rationale: assessment.risk_of_ruin.rationale,
      evidence_refs: [...assessment.risk_of_ruin.evidence_refs].sort()
    }
  ];
}

function preservesPriorRationale(trajectory: StrategicTrajectoryViewModelV1): boolean {
  return trajectory.path_revision_history.every((revision) => revision.previous_reason.length > 0 && revision.revision_reason.length > 0);
}

export function buildStrategicAdvantageDecisionLensV1(input: {
  assessment: DecisionAdvantageAssessmentV1;
  trajectory: StrategicTrajectoryViewModelV1;
}): StrategicAdvantageDecisionLensV1 {
  const { assessment, trajectory } = input;
  const blocksUpsideOverride = hasUnacceptableRuinRisk(assessment) || assessment.capacity_fit.level === "UNACCEPTABLE";

  return {
    view_version: STRATEGIC_ADVANTAGE_DECISION_LENS_VERSION_V1,
    lens_id: `${assessment.assessment_id}::${trajectory.trajectory_id}`,
    assessment_id: assessment.assessment_id,
    trajectory_id: trajectory.trajectory_id,
    action_label: assessment.action_label,
    recommendation: blocksUpsideOverride ? "REJECT" : assessment.recommendation,
    preferred_path: {
      path_id: trajectory.preferred_path.path_id,
      label: trajectory.preferred_path.label,
      why_preferred_or_not: trajectory.preferred_path.why_preferred_or_not
    },
    what_compounds: {
      advantage: { ...assessment.compounding_value, evidence_refs: [...assessment.compounding_value.evidence_refs].sort() },
      trajectory_asset_created: trajectory.compounding_asset_created
    },
    what_is_hard_to_copy: {
      defensibility: { ...assessment.defensibility, evidence_refs: [...assessment.defensibility.evidence_refs].sort() },
      information_advantage: { ...assessment.information_advantage, evidence_refs: [...assessment.information_advantage.evidence_refs].sort() },
      brand_prestige_effect: { ...assessment.brand_prestige_effect, evidence_refs: [...assessment.brand_prestige_effect.evidence_refs].sort() },
      network_effect: { ...assessment.network_effect, evidence_refs: [...assessment.network_effect.evidence_refs].sort() }
    },
    what_the_decision_gives_up: {
      advantage_tradeoffs: sortedUnique([...assessment.opportunity_cost.explicit_tradeoffs, ...assessment.opportunity_cost.qualitative_costs]),
      trajectory_opportunity_cost: { ...trajectory.opportunity_cost, evidence_refs: [...trajectory.opportunity_cost.evidence_refs].sort() }
    },
    biggest_bottleneck: `${assessment.biggest_bottleneck} | Trajectory: ${trajectory.current_bottleneck}`,
    biggest_uncertainty: `${assessment.key_uncertainty} | Trajectory: ${trajectory.critical_unknown.label}`,
    fog_of_war: sortedUnique([...trajectory.fog_of_war, assessment.key_uncertainty]),
    what_to_ignore_or_deprioritize: sortedUnique([...assessment.what_to_ignore_or_deprioritize, ...trajectory.what_to_ignore]),
    next_smallest_high_leverage_move: trajectory.path_revision_history.length > 0 ? trajectory.next_high_leverage_move : assessment.next_smallest_high_leverage_action,
    component_signals: componentSignalsFor(assessment),
    component_disagreement_visible: true,
    ruin_or_capacity_guardrail: {
      blocks_upside_override: blocksUpsideOverride,
      capacity_fit: { ...assessment.capacity_fit, evidence_refs: [...assessment.capacity_fit.evidence_refs].sort() },
      risk_of_ruin: { ...assessment.risk_of_ruin, evidence_refs: [...assessment.risk_of_ruin.evidence_refs].sort() }
    },
    qualitative_value_guardrail: {
      prestige_network_value_not_dollarized:
        assessment.expected_value_range.currency === "UNKNOWN" &&
        (assessment.network_effect.level === "HIGH" ||
          assessment.network_effect.level === "VERY_HIGH" ||
          assessment.brand_prestige_effect.level === "HIGH" ||
          assessment.brand_prestige_effect.level === "VERY_HIGH"),
      expected_value_currency: assessment.expected_value_range.currency
    },
    revision: {
      trigger: trajectory.revision_trigger,
      history: [...trajectory.path_revision_history],
      preserves_prior_rationale: preservesPriorRationale(trajectory)
    },
    what_would_change_my_mind: [...assessment.what_would_change_my_mind],
    dashboard_flags: {
      dashboard_consumable: true,
      no_scoring_engine_added: true,
      component_disagreement_visible: true
    },
    keegan_action_required: "NO"
  };
}
