import type { ConfidenceV1, EvidenceRefV1, MoneyRangeV1, TimeRangeV1 } from "@/lib/financial-intelligence/contracts";

export const GOAL_FEASIBILITY_CONTRACT_VERSION_V1 = "goal_feasibility_v1.0" as const;
export const GOAL_FEASIBILITY_EXECUTIVE_VIEW_VERSION_V1 = "goal_feasibility_executive_view_v1.0" as const;

export type FeasibilityClassV1 = "PLAUSIBLE" | "STRETCH" | "SPECULATIVE" | "BLOCKED" | "UNKNOWN";
export type PathStrategyKindV1 =
  | "HIGH_END_ORIGINAL_ART_CONCENTRATION"
  | "LICENSING_IP_PLATFORM_LEVERAGE"
  | "DIVERSIFIED_CREATIVE_ENTERPRISE";
export type TrajectoryStateV1 = "AHEAD" | "ON_TRACK" | "BEHIND" | "CAPACITY_CONSTRAINED" | "UNKNOWN";
export type GapSeverityV1 = "LOW" | "MODERATE" | "HIGH" | "STRUCTURAL" | "UNKNOWN";
export type AssetStateV1 = "PRESENT" | "PARTIAL" | "MISSING" | "UNKNOWN";
export type ConstraintSeverityV1 = "LOW" | "MEDIUM" | "HIGH" | "BLOCKING" | "UNKNOWN";
export type RiskOfRuinLevelV1 = "LOW" | "MEDIUM" | "HIGH" | "UNACCEPTABLE" | "UNKNOWN";

export type GoalFeasibilityAssumptionSetV1 = {
  assumption_set_id: string;
  label: string;
  max_originals_per_year: number | null;
  licensing_access: "NONE" | "PARTIAL" | "STRONG" | "UNKNOWN";
  platform_distribution: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  enterprise_operating_support: "NONE" | "PARTIAL" | "STRONG" | "UNKNOWN";
};

export type GoalFeasibilityPathV1 = {
  path_id: string;
  strategy_kind: PathStrategyKindV1;
  TARGET_STATE: string;
  FEASIBILITY_CLASS: FeasibilityClassV1;
  REQUIRED_SCALE_RANGE: MoneyRangeV1;
  CURRENT_TRAJECTORY: {
    state: TrajectoryStateV1;
    summary: string;
    evidence_refs: string[];
  };
  GAP_TO_TARGET: {
    severity: GapSeverityV1;
    enterprise_value_range: MoneyRangeV1;
    annual_revenue_range: MoneyRangeV1;
    cash_flow_range: MoneyRangeV1;
    personal_equity_range: MoneyRangeV1;
    notes: string[];
  };
  PATHWAYS: string[];
  REQUIRED_ASSETS: Array<{
    asset_id: string;
    label: string;
    state: AssetStateV1;
    why_it_matters: string;
    evidence_refs: string[];
  }>;
  CAPACITY_CONSTRAINTS: Array<{
    constraint_id: string;
    severity: ConstraintSeverityV1;
    summary: string;
    creative_hours_range: TimeRangeV1;
    evidence_refs: string[];
  }>;
  CAPITAL_OR_ECONOMIC_ASSUMPTIONS: Array<{
    assumption_id: string;
    label: string;
    value_range: MoneyRangeV1;
    qualitative_only: boolean;
    notes: string[];
  }>;
  MILESTONE_LADDER: Array<{
    milestone_id: string;
    order: number;
    label: string;
    success_signal: string;
    target_window_days: number;
    evidence_refs: string[];
  }>;
  BIGGEST_BOTTLENECK: string;
  PHASE_CHANGE_OPPORTUNITY: {
    trigger: string;
    opportunity: string;
    not_guaranteed: true;
  };
  NEXT_HIGH_LEVERAGE_MOVE: {
    action: string;
    rationale: string;
    requires_keegan_approval: false;
  };
  RISK_OF_RUIN: {
    level: RiskOfRuinLevelV1;
    notes: string[];
    cash_at_risk_range: MoneyRangeV1;
  };
  CONFIDENCE: ConfidenceV1;
  WHAT_WOULD_CHANGE_THE_PATH: string[];
  evidence_refs: string[];
};

export type GoalFeasibilitySnapshotV1 = {
  contract_version: typeof GOAL_FEASIBILITY_CONTRACT_VERSION_V1;
  snapshot_id: string;
  as_of: string;
  source: "fixture" | "adapter";
  TARGET_STATE: string;
  assumption_set: GoalFeasibilityAssumptionSetV1;
  PATHS: GoalFeasibilityPathV1[];
  PREFERRED_PATH_ORDER: string[];
  capacity_constrained_case: {
    path_id: string;
    artist_production_only: true;
    can_be_treated_as_infinite_scale: false;
    maximum_originals_per_year: number;
    why_not_scalable: string[];
  };
  guardrails: {
    aspiration_is_not_forecast: true;
    guaranteed_fame_or_wealth_language_allowed: false;
    prestige_network_effects_are_qualitative: true;
    raw_revenue_is_not_enterprise_value: true;
  };
  evidence_refs: EvidenceRefV1[];
};

export type GoalFeasibilityExecutiveViewModelV1 = {
  view_version: typeof GOAL_FEASIBILITY_EXECUTIVE_VIEW_VERSION_V1;
  snapshot_id: string;
  target_state: string;
  preferred_path_order: string[];
  top_path: {
    path_id: string;
    strategy_kind: PathStrategyKindV1;
    feasibility_class: FeasibilityClassV1;
    bottleneck: string;
    next_high_leverage_move: string;
    confidence: ConfidenceV1;
  };
  milestone_ladder: GoalFeasibilityPathV1["MILESTONE_LADDER"];
  capacity_warning: string;
  what_would_change_the_path: string[];
  keegan_action_required: "NO";
};

export function sortPathsForAssumptionsV1(
  paths: GoalFeasibilityPathV1[],
  assumptions: GoalFeasibilityAssumptionSetV1
): GoalFeasibilityPathV1[] {
  const score = (path: GoalFeasibilityPathV1): number => {
    const base = path.FEASIBILITY_CLASS === "PLAUSIBLE" ? 40 : path.FEASIBILITY_CLASS === "STRETCH" ? 25 : path.FEASIBILITY_CLASS === "SPECULATIVE" ? 10 : 0;
    const capacityPenalty =
      path.strategy_kind === "HIGH_END_ORIGINAL_ART_CONCENTRATION" && assumptions.max_originals_per_year !== null && assumptions.max_originals_per_year < 8 ? -30 : 0;
    const licensingBonus = path.strategy_kind === "LICENSING_IP_PLATFORM_LEVERAGE" && assumptions.licensing_access === "STRONG" ? 45 : 0;
    const enterpriseBonus = path.strategy_kind === "DIVERSIFIED_CREATIVE_ENTERPRISE" && assumptions.enterprise_operating_support === "STRONG" ? 25 : 0;
    const distributionBonus = path.strategy_kind !== "HIGH_END_ORIGINAL_ART_CONCENTRATION" && assumptions.platform_distribution === "HIGH" ? 12 : 0;
    return base + capacityPenalty + licensingBonus + enterpriseBonus + distributionBonus;
  };

  return [...paths].sort((a, b) => {
    const scoreDelta = score(b) - score(a);
    return scoreDelta === 0 ? a.path_id.localeCompare(b.path_id) : scoreDelta;
  });
}
