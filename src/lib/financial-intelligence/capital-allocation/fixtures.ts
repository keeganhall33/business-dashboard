import {
  moneyRange,
  timeRange,
  unknownMoneyRange,
  type ConfidenceV1,
  type FinancialHealthSnapshotV1,
  type MoneyRangeV1,
  type ProjectEconomicsAssessmentV1,
  type TimeRangeV1
} from "@/lib/financial-intelligence/contracts";
import { FINANCIAL_HEALTH_SNAPSHOT_FIXTURES_V1, PROJECT_ECONOMICS_ASSESSMENT_FIXTURES_V1 } from "@/lib/financial-intelligence/fixtures";
import {
  CAPITAL_ALLOCATION_ASSESSMENT_VERSION_V1,
  orderCapitalAllocationAlternativesV1,
  type CapitalAllocationAlternativeV1,
  type CapitalAllocationAssessmentV1,
  type CapitalAllocationConstraintsV1
} from "./contracts";

const confidence = (level: ConfidenceV1["level"], reasons: string[], qualifiers: string[] = []): ConfidenceV1 => ({ level, reasons, qualifiers });

const refs = {
  growth: "capital-allocation-growth-fixture",
  original: "capital-allocation-original-fixture",
  partnership: "capital-allocation-partnership-fixture",
  reserve: "capital-allocation-reserve-fixture",
  capacity: "capital-allocation-capacity-fixture"
};

const usd = (low_cents: number, high_cents: number, evidence_refs: string[] = [refs.growth]): MoneyRangeV1 =>
  moneyRange({ low_cents, high_cents, coverage_state: "PARTIAL", evidence_refs });

const hours = (low_hours: number, high_hours: number): TimeRangeV1 =>
  timeRange({ low_hours, high_hours, coverage_state: "PARTIAL", evidence_refs: [refs.capacity] });

const snapshot = FINANCIAL_HEALTH_SNAPSHOT_FIXTURES_V1.find((item) => item.snapshot_id === "financial-health-healthy-cash-positive-contribution");
if (!snapshot) throw new Error("CAPITAL_ALLOCATION_MISSING_HEALTHY_SNAPSHOT");

const originalProject = PROJECT_ECONOMICS_ASSESSMENT_FIXTURES_V1.find((item) => item.assessment_id === "project-economics-high-revenue-high-capital-concentration");
const partnershipProject = PROJECT_ECONOMICS_ASSESSMENT_FIXTURES_V1.find((item) => item.assessment_id === "project-economics-strategic-weak-direct");
const unknownCostProject = PROJECT_ECONOMICS_ASSESSMENT_FIXTURES_V1.find((item) => item.assessment_id === "project-economics-missing-unknown-cost-coverage");
if (!originalProject || !partnershipProject || !unknownCostProject) throw new Error("CAPITAL_ALLOCATION_MISSING_PROJECT_FIXTURES");

export const CAPITAL_ALLOCATION_BASE_CONSTRAINTS_V1: CapitalAllocationConstraintsV1 = {
  cash_reserve: snapshot.cash_range,
  minimum_cash_buffer: moneyRange({ low_cents: 1500000, high_cents: 1800000, coverage_state: "PARTIAL", evidence_refs: [refs.reserve] }),
  creative_time_available: timeRange({ low_hours: 90, high_hours: 140, coverage_state: "PARTIAL", evidence_refs: [refs.capacity] })
};

export const CAPITAL_ALLOCATION_LOW_CASH_CONSTRAINTS_V1: CapitalAllocationConstraintsV1 = {
  ...CAPITAL_ALLOCATION_BASE_CONSTRAINTS_V1,
  cash_reserve: moneyRange({ low_cents: 2200000, high_cents: 2600000, coverage_state: "PARTIAL", evidence_refs: [refs.reserve] })
};

export const CAPITAL_ALLOCATION_HIGH_TIME_CONSTRAINTS_V1: CapitalAllocationConstraintsV1 = {
  ...CAPITAL_ALLOCATION_BASE_CONSTRAINTS_V1,
  creative_time_available: timeRange({ low_hours: 240, high_hours: 320, coverage_state: "PARTIAL", evidence_refs: [refs.capacity] })
};

function strategicOption(notes: string[]): ProjectEconomicsAssessmentV1["STRATEGIC_OPTION_VALUE"] {
  return { not_monetized: true, notes };
}

const growthInvestment: CapitalAllocationAlternativeV1 = {
  alternative_id: "allocation-high-cash-low-time-growth",
  label: "High-cash / low-time growth investment",
  kind: "HIGH_CASH_LOW_TIME_GROWTH",
  source_project_id: "growth-distribution-system",
  direct_financial_range: usd(400000, 1200000, [refs.growth]),
  capital_required: moneyRange({ low_cents: 700000, high_cents: 950000, coverage_state: "PARTIAL", evidence_refs: [refs.growth] }),
  creative_time_burden: hours(12, 28),
  payback_window: "31_90_DAYS",
  liquidity_impact: "MEDIUM",
  reversibility: "MEDIUM",
  strategic_value_not_monetized: strategicOption(["Operating leverage", "Repeatable distribution learning"]),
  learning_value: { level: "HIGH", summary: "Tests whether paid or operational growth support can create qualified demand without Keegan doing low-leverage work." },
  opportunity_cost: { notes: ["Uses cash that could preserve buffer or fund a partnership test."], range: unknownMoneyRange([refs.growth]) },
  confidence: confidence("MEDIUM", ["cash_requirement_and_time_burden_fixture_known"], ["fixture_only_no_spend_change"]),
  truth_state: "INFERRED",
  key_unknown_inputs: ["Actual qualified lead quality", "Whether demand stays premium-safe"],
  recommendation: "DO_NOW",
  next_safe_action: "Prepare a no-spend test brief with success metrics and stop-loss rules."
};

const originalCommission: CapitalAllocationAlternativeV1 = {
  alternative_id: "allocation-high-time-original-commission",
  label: "High-time original / commission path",
  kind: "HIGH_TIME_ORIGINAL_COMMISSION",
  source_project_id: originalProject.project_id,
  direct_financial_range: originalProject.contribution_range,
  capital_required: originalProject.capital_required_range,
  creative_time_burden: originalProject.creative_hours_range,
  payback_window: originalProject.payback_window,
  liquidity_impact: "HIGH",
  reversibility: "LOW",
  strategic_value_not_monetized: originalProject.STRATEGIC_OPTION_VALUE,
  learning_value: { level: "MEDIUM", summary: "Tests premium buyer seriousness, but consumes scarce studio capacity." },
  opportunity_cost: originalProject.OPPORTUNITY_COST,
  confidence: originalProject.confidence,
  truth_state: "KNOWN",
  key_unknown_inputs: ["Deposit timing", "Scope creep", "Delivery risk under high creative-hour load"],
  recommendation: "PREPARE",
  next_safe_action: "Require deposit/staged-payment terms before any production commitment."
};

const partnershipLicensing: CapitalAllocationAlternativeV1 = {
  alternative_id: "allocation-partnership-licensing-strategic",
  label: "Strategically valuable partnership / licensing path",
  kind: "PARTNERSHIP_LICENSING_STRATEGIC",
  source_project_id: partnershipProject.project_id,
  direct_financial_range: partnershipProject.contribution_range,
  capital_required: partnershipProject.capital_required_range,
  creative_time_burden: partnershipProject.creative_hours_range,
  payback_window: partnershipProject.payback_window,
  liquidity_impact: "LOW",
  reversibility: "HIGH",
  strategic_value_not_monetized: partnershipProject.STRATEGIC_OPTION_VALUE,
  learning_value: { level: "HIGH", summary: "Clarifies whether authority-building partnership surfaces can compound without fake direct economics." },
  opportunity_cost: partnershipProject.OPPORTUNITY_COST,
  confidence: partnershipProject.confidence,
  truth_state: "INFERRED",
  key_unknown_inputs: ["Sponsor/buyer coverage", "Rights terms", "Whether prestige lift becomes observable"],
  recommendation: "PREPARE",
  next_safe_action: "Define non-financial success criteria and rights/economics questions before outreach."
};

const unknownCostGrowth: CapitalAllocationAlternativeV1 = {
  ...growthInvestment,
  alternative_id: "allocation-unknown-cost-growth",
  label: "Growth option with UNKNOWN cost coverage",
  source_project_id: unknownCostProject.project_id,
  direct_financial_range: unknownCostProject.contribution_range,
  capital_required: unknownCostProject.capital_required_range,
  creative_time_burden: unknownCostProject.creative_hours_range,
  payback_window: "UNKNOWN",
  liquidity_impact: "UNKNOWN",
  reversibility: "UNKNOWN",
  strategic_value_not_monetized: strategicOption([]),
  learning_value: { level: "MEDIUM", summary: "Could teach distribution economics, but cost coverage is missing." },
  opportunity_cost: unknownCostProject.OPPORTUNITY_COST,
  confidence: unknownCostProject.confidence,
  truth_state: "UNKNOWN",
  key_unknown_inputs: ["Direct cost", "Profit", "Cash timing"],
  recommendation: "WAIT_FOR_EVIDENCE",
  next_safe_action: "Collect production, fulfillment, platform, and packaging cost ranges before comparing profit."
};

const BASE_ALTERNATIVES = [growthInvestment, originalCommission, partnershipLicensing];

function buildAssessment(input: {
  assessment_id: string;
  financial_snapshot: FinancialHealthSnapshotV1;
  constraints: CapitalAllocationConstraintsV1;
  alternatives: CapitalAllocationAlternativeV1[];
}): CapitalAllocationAssessmentV1 {
  const ordered = orderCapitalAllocationAlternativesV1(input.alternatives, input.constraints);
  const recommended = ordered[0];
  if (!recommended) throw new Error("CAPITAL_ALLOCATION_EMPTY_ALTERNATIVES");
  return {
    contract_version: CAPITAL_ALLOCATION_ASSESSMENT_VERSION_V1,
    assessment_id: input.assessment_id,
    as_of: "2026-08-25",
    source: "fixture",
    financial_snapshot_id: input.financial_snapshot.snapshot_id,
    constraints: input.constraints,
    alternatives: ordered,
    recommended_alternative_id: recommended.alternative_id,
    recommendation_reason: `${recommended.label} ranks first under current cash reserve, creative-time, reversibility, direct economics, learning, and UNKNOWN-input constraints.`,
    truth_state: ordered.some((item) => item.truth_state === "UNKNOWN") ? "UNKNOWN" : "INFERRED",
    confidence: confidence("MEDIUM", ["fixture_compares_cash_time_economics_strategy_and_unknowns"], ["dashboard_strategy_consumable_only"]),
    guardrails: {
      direct_financial_and_strategic_value_separate: true,
      unknown_cost_blocks_profit_precision: true,
      no_live_account_connection: true,
      no_money_movement_or_spend_change: true,
      keegan_action_required: "NO"
    }
  };
}

export const CAPITAL_ALLOCATION_BASE_FIXTURE_V1 = buildAssessment({
  assessment_id: "capital-allocation-base-cash-strong-time-constrained",
  financial_snapshot: snapshot,
  constraints: CAPITAL_ALLOCATION_BASE_CONSTRAINTS_V1,
  alternatives: BASE_ALTERNATIVES
});

export const CAPITAL_ALLOCATION_LOW_CASH_FIXTURE_V1 = buildAssessment({
  assessment_id: "capital-allocation-low-cash-buffer",
  financial_snapshot: snapshot,
  constraints: CAPITAL_ALLOCATION_LOW_CASH_CONSTRAINTS_V1,
  alternatives: BASE_ALTERNATIVES
});

export const CAPITAL_ALLOCATION_HIGH_TIME_FIXTURE_V1 = buildAssessment({
  assessment_id: "capital-allocation-high-creative-time",
  financial_snapshot: snapshot,
  constraints: CAPITAL_ALLOCATION_HIGH_TIME_CONSTRAINTS_V1,
  alternatives: BASE_ALTERNATIVES
});

export const CAPITAL_ALLOCATION_UNKNOWN_COST_FIXTURE_V1 = buildAssessment({
  assessment_id: "capital-allocation-unknown-cost-blocks-profit",
  financial_snapshot: snapshot,
  constraints: CAPITAL_ALLOCATION_BASE_CONSTRAINTS_V1,
  alternatives: [unknownCostGrowth, partnershipLicensing, originalCommission]
});

export const CAPITAL_ALLOCATION_FIXTURES_V1 = [
  CAPITAL_ALLOCATION_BASE_FIXTURE_V1,
  CAPITAL_ALLOCATION_LOW_CASH_FIXTURE_V1,
  CAPITAL_ALLOCATION_HIGH_TIME_FIXTURE_V1,
  CAPITAL_ALLOCATION_UNKNOWN_COST_FIXTURE_V1
].sort((a, b) => a.assessment_id.localeCompare(b.assessment_id));
