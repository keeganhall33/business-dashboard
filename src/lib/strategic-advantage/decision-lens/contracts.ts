import type {
  AdvantageRecommendationV1,
  DecisionAdvantageAssessmentV1,
  QualitativeDimensionV1,
  RiskDimensionV1
} from "@/lib/strategic-advantage/contracts";
import type {
  StrategicTrajectoryPathV1,
  StrategicTrajectoryRevisionV1,
  StrategicTrajectoryViewModelV1
} from "@/lib/strategic-trajectory/contracts";

export const STRATEGIC_ADVANTAGE_DECISION_LENS_VERSION_V1 = "strategic_advantage_decision_lens_v1.0" as const;

export type StrategicAdvantageDecisionComponentV1 =
  | "ASYMMETRY"
  | "OPTIONALITY"
  | "REVERSIBILITY"
  | "OPPORTUNITY_COST"
  | "COMPOUNDING_VALUE"
  | "DEFENSIBILITY"
  | "CAPACITY_FIT"
  | "RISK_OF_RUIN";

export type StrategicAdvantageComponentSignalV1 = {
  component: StrategicAdvantageDecisionComponentV1;
  level: string;
  supports_recommendation: boolean;
  rationale: string;
  evidence_refs: string[];
};

export type StrategicAdvantageDecisionLensV1 = {
  view_version: typeof STRATEGIC_ADVANTAGE_DECISION_LENS_VERSION_V1;
  lens_id: string;
  assessment_id: string;
  trajectory_id: string;
  action_label: string;
  recommendation: AdvantageRecommendationV1;
  preferred_path: Pick<StrategicTrajectoryPathV1, "path_id" | "label" | "why_preferred_or_not">;
  what_compounds: {
    advantage: QualitativeDimensionV1;
    trajectory_asset_created: string;
  };
  what_is_hard_to_copy: {
    defensibility: QualitativeDimensionV1;
    information_advantage: QualitativeDimensionV1;
    brand_prestige_effect: QualitativeDimensionV1;
    network_effect: QualitativeDimensionV1;
  };
  what_the_decision_gives_up: {
    advantage_tradeoffs: string[];
    trajectory_opportunity_cost: StrategicTrajectoryViewModelV1["opportunity_cost"];
  };
  biggest_bottleneck: string;
  biggest_uncertainty: string;
  fog_of_war: string[];
  what_to_ignore_or_deprioritize: string[];
  next_smallest_high_leverage_move: string;
  component_signals: StrategicAdvantageComponentSignalV1[];
  component_disagreement_visible: true;
  ruin_or_capacity_guardrail: {
    blocks_upside_override: boolean;
    capacity_fit: RiskDimensionV1;
    risk_of_ruin: RiskDimensionV1;
  };
  qualitative_value_guardrail: {
    prestige_network_value_not_dollarized: boolean;
    expected_value_currency: DecisionAdvantageAssessmentV1["expected_value_range"]["currency"];
  };
  revision: {
    trigger: string;
    history: StrategicTrajectoryRevisionV1[];
    preserves_prior_rationale: boolean;
  };
  what_would_change_my_mind: string[];
  dashboard_flags: {
    dashboard_consumable: true;
    no_scoring_engine_added: true;
    component_disagreement_visible: true;
  };
  keegan_action_required: "NO";
};
