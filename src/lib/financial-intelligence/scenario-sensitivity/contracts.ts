import type {
  CapitalAllocationAlternativeV1,
  CapitalAllocationAssessmentV1,
  CapitalAllocationRecommendationV1
} from "@/lib/financial-intelligence/capital-allocation/contracts";
import type { MoneyRangeV1, TimeRangeV1 } from "@/lib/financial-intelligence/contracts";

export const SCENARIO_SENSITIVITY_VERSION_V1 = "scenario_sensitivity_v1.0" as const;

export type ScenarioSensitivityTruthStateV1 = "KNOWN" | "INFERRED" | "UNKNOWN";
export type ScenarioSensitivityRecommendationStabilityV1 = "STABLE" | "SENSITIVE" | "BLOCKED_BY_UNKNOWN";

export type ScenarioSensitivityScenarioV1 = {
  scenario_id: string;
  label: string;
  cash_reserve: MoneyRangeV1;
  creative_time_available: TimeRangeV1;
  revenue_multiplier: number;
  cost_multiplier: number | "UNKNOWN";
  recommended_alternative_id: string | null;
  recommendation: CapitalAllocationRecommendationV1 | "UNKNOWN";
  direct_financial_range: MoneyRangeV1;
  break_even_change: string;
  unknown: string[];
  strategic_value_not_monetized: CapitalAllocationAlternativeV1["strategic_value_not_monetized"];
};

export type ScenarioSensitivityV1 = {
  contract_version: typeof SCENARIO_SENSITIVITY_VERSION_V1;
  sensitivity_id: string;
  source_assessment_id: string;
  as_of: string;
  ASSUMPTIONS_THAT_MATTER: string[];
  BREAK_EVEN_CHANGE: string[];
  RECOMMENDATION_STABILITY: ScenarioSensitivityRecommendationStabilityV1;
  UNKNOWN: string[];
  base_recommended_alternative_id: string;
  scenarios: ScenarioSensitivityScenarioV1[];
  guardrails: {
    strategic_prestige_value_not_dollarized: true;
    unknown_cost_blocks_fake_precision: true;
    no_live_account_connection: true;
    no_money_movement_or_spend_change: true;
    keegan_action_required: "NO";
  };
  truth_state: ScenarioSensitivityTruthStateV1;
};

export type ScenarioSensitivityInputV1 = {
  sensitivity_id: string;
  assessment: CapitalAllocationAssessmentV1;
};
