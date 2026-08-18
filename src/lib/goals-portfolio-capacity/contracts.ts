import type { ConfidenceV1, MoneyRangeV1, TimeRangeV1 } from "@/lib/financial-intelligence/contracts";

export const GOALS_PORTFOLIO_CAPACITY_SNAPSHOT_CONTRACT_VERSION_V1 = "goals_portfolio_capacity_snapshot_v1.0" as const;

export type GoalStatusV1 = "ACTIVE" | "PAUSED" | "MONITOR";
export type BetStatusV1 = "ACTIVE" | "WATCH" | "DEFER";
export type BetConfidenceV1 = ConfidenceV1["level"];
export type CapacityLoadStateV1 = "HEALTHY" | "WATCH" | "OVERLOADED" | "UNKNOWN";
export type PortfolioConflictSeverityV1 = "NONE" | "WATCH" | "BLOCKING";
export type PortfolioActionKindV1 = "CONTINUE" | "DEFER" | "KILL" | "VALIDATE" | "REBALANCE";
export type QualitativeObjectiveKindV1 = "PRESTIGE" | "NETWORK" | "AUTHORITY" | "SCARCITY" | "CRAFT" | "LEARNING";

export type QualitativeObjectiveV1 = {
  kind: QualitativeObjectiveKindV1;
  label: string;
  not_monetized: true;
  evidence_refs: string[];
};

export type StrategicGoalV1 = {
  goal_id: string;
  label: string;
  status: GoalStatusV1;
  horizon: "NOW" | "30_DAYS" | "90_DAYS" | "YEAR";
  qualitative_objectives: QualitativeObjectiveV1[];
  success_signal: string;
};

export type AttentionCapacityLoadV1 = {
  state: CapacityLoadStateV1;
  load_score: number | null;
  creative_hours_committed_range: TimeRangeV1;
  creative_hours_available_range: TimeRangeV1;
  attention_load: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  bottleneck_refs: string[];
};

export type StrategicBetV1 = {
  bet_id: string;
  title: string;
  status: BetStatusV1;
  goal_refs: string[];
  EXPECTED_UPSIDE: {
    direct_financial_range: MoneyRangeV1;
    qualitative_objectives: QualitativeObjectiveV1[];
    notes: string[];
  };
  EXPECTED_DOWNSIDE: {
    cash_risk_range: MoneyRangeV1;
    creative_capacity_risk_range: TimeRangeV1;
    notes: string[];
  };
  CONFIDENCE: ConfidenceV1;
  CASH_REQUIREMENT_RANGE: MoneyRangeV1;
  CREATIVE_HOURS_RANGE: TimeRangeV1;
  ATTENTION_CAPACITY_LOAD: AttentionCapacityLoadV1;
  DEPENDENCIES: string[];
  OPPORTUNITY_COST: {
    notes: string[];
    displaced_bet_refs: string[];
    creative_hours_range: TimeRangeV1;
    cash_range: MoneyRangeV1;
  };
  KILL_CRITERIA: string[];
  CURRENT_BOTTLENECK: string;
  WHAT_TO_IGNORE: string[];
  NEXT_PORTFOLIO_ACTION: {
    action: PortfolioActionKindV1;
    label: string;
    rationale: string;
    requires_keegan_approval: false;
  };
  evidence_refs: string[];
};

export type PortfolioConflictV1 = {
  conflict_id: string;
  severity: PortfolioConflictSeverityV1;
  bet_refs: string[];
  scarce_resource: "CASH" | "CREATIVE_HOURS" | "ATTENTION" | "ACCESS" | "UNKNOWN";
  summary: string;
  cannot_be_hidden_by_upside: true;
};

export type GoalsPortfolioCapacitySnapshotV1 = {
  contract_version: typeof GOALS_PORTFOLIO_CAPACITY_SNAPSHOT_CONTRACT_VERSION_V1;
  snapshot_id: string;
  as_of: string;
  source: "fixture" | "adapter";
  GOALS: StrategicGoalV1[];
  ACTIVE_BETS: StrategicBetV1[];
  ATTENTION_CAPACITY_LOAD: AttentionCapacityLoadV1;
  CURRENT_BOTTLENECK: string;
  WHAT_TO_IGNORE: string[];
  NEXT_PORTFOLIO_ACTION: StrategicBetV1["NEXT_PORTFOLIO_ACTION"];
  conflicts: PortfolioConflictV1[];
  unknown_resource_inputs: string[];
  evidence_refs: Array<{ ref_id: string; source: string; notes: string }>;
};

export type ExecutiveGoalsCapacityViewModelV1 = {
  view_version: "executive_goals_capacity_view_v1.0";
  snapshot_id: string;
  headline: string;
  portfolio_state: CapacityLoadStateV1;
  active_bets: Array<{
    bet_id: string;
    title: string;
    confidence: BetConfidenceV1;
    current_bottleneck: string;
    next_action: string;
    cash_requirement: MoneyRangeV1;
    creative_hours: TimeRangeV1;
    qualitative_upside: string[];
    what_to_ignore: string[];
  }>;
  overload_or_conflict: {
    visible: boolean;
    severity: PortfolioConflictSeverityV1;
    summary: string;
  };
  what_to_ignore: string[];
  next_portfolio_action: string;
  keegan_action_required: "NO";
};
