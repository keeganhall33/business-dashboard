import {
  FINANCIAL_INTELLIGENCE_SNAPSHOT_CONTRACT_VERSION_V1,
  PROJECT_ECONOMICS_ASSESSMENT_CONTRACT_VERSION_V1,
  type ConfidenceV1,
  type CoverageStateV1,
  type FinancialHealthSnapshotV1,
  type MoneyRangeV1,
  type ProjectEconomicsAssessmentV1,
  moneyRange,
  timeRange,
  unknownMoneyRange
} from "./contracts";

const FIXTURE_AS_OF = "2026-08-17T00:00:00.000Z";

function confidence(level: ConfidenceV1["level"], reasons: string[], qualifiers: string[] = []): ConfidenceV1 {
  return { level, reasons, qualifiers };
}

export function qualifyConfidenceForCostCoverage(input: {
  base: ConfidenceV1;
  costCoverage: CoverageStateV1;
  costLabel: string;
}): ConfidenceV1 {
  if (input.costCoverage === "COMPLETE") return input.base;

  const qualifier =
    input.costCoverage === "UNKNOWN"
      ? `${input.costLabel}_coverage_unknown`
      : `${input.costLabel}_coverage_partial`;

  return {
    level: input.base.level === "HIGH" ? "MEDIUM" : input.base.level === "MEDIUM" ? "LOW" : input.base.level,
    reasons: input.base.reasons,
    qualifiers: [...new Set([...input.base.qualifiers, qualifier])]
  };
}

export function deriveDirectFinancialValue(input: {
  directRevenueRange: MoneyRangeV1;
  contributionRange: MoneyRangeV1;
}): ProjectEconomicsAssessmentV1["direct_financial_value"] {
  if (input.contributionRange.low_cents === null && input.contributionRange.high_cents === null) return "UNKNOWN";
  if ((input.contributionRange.high_cents ?? 0) < 0) return "NEGATIVE";
  if ((input.contributionRange.low_cents ?? 0) > 0) return "POSITIVE";
  return "NEUTRAL";
}

const HEALTHY_SNAPSHOT: FinancialHealthSnapshotV1 = {
  contract_version: FINANCIAL_INTELLIGENCE_SNAPSHOT_CONTRACT_VERSION_V1,
  snapshot_id: "financial-health-healthy-cash-positive-contribution",
  as_of: FIXTURE_AS_OF,
  coverage_state: "COMPLETE",
  cash_position: moneyRange({ low_cents: 4800000, high_cents: 5200000, coverage_state: "COMPLETE", evidence_refs: ["bank-summary-fixture"] }),
  cash_range: moneyRange({ low_cents: 4800000, high_cents: 5200000, coverage_state: "COMPLETE", evidence_refs: ["bank-summary-fixture"] }),
  expected_30_60_90_day_inflow_range: {
    days_30: moneyRange({ low_cents: 900000, high_cents: 1200000, coverage_state: "COMPLETE", evidence_refs: ["receivables-fixture"] }),
    days_60: moneyRange({ low_cents: 1600000, high_cents: 2100000, coverage_state: "COMPLETE", evidence_refs: ["receivables-fixture"] }),
    days_90: moneyRange({ low_cents: 2200000, high_cents: 2900000, coverage_state: "COMPLETE", evidence_refs: ["receivables-fixture"] })
  },
  expected_30_60_90_day_outflow_range: {
    days_30: moneyRange({ low_cents: 300000, high_cents: 420000, coverage_state: "COMPLETE", evidence_refs: ["planned-costs-fixture"] }),
    days_60: moneyRange({ low_cents: 650000, high_cents: 820000, coverage_state: "COMPLETE", evidence_refs: ["planned-costs-fixture"] }),
    days_90: moneyRange({ low_cents: 980000, high_cents: 1250000, coverage_state: "COMPLETE", evidence_refs: ["planned-costs-fixture"] })
  },
  runway_or_reserve_state: "STRONG",
  revenue_range: moneyRange({ low_cents: 1800000, high_cents: 2200000, coverage_state: "COMPLETE", evidence_refs: ["sales-ledger-fixture"] }),
  contribution_profit_range: moneyRange({ low_cents: 1100000, high_cents: 1450000, coverage_state: "COMPLETE", evidence_refs: ["sales-ledger-fixture", "cost-ledger-fixture"] }),
  receivables_at_risk: moneyRange({ low_cents: 0, high_cents: 150000, coverage_state: "COMPLETE", evidence_refs: ["receivables-fixture"] }),
  concentration_risk: "STABLE",
  top_financial_change: "Confirmed contribution remains positive after direct production costs.",
  top_financial_risk: "No immediate cash risk in fixture coverage.",
  top_financial_opportunity: "Use reserve strength to prioritize high-authority original work over volume tactics.",
  source: "fixture",
  evidence_refs: [
    { ref_id: "bank-summary-fixture", source: "fixture", notes: "Synthetic cash range for contract testing." },
    { ref_id: "cost-ledger-fixture", source: "fixture", notes: "Synthetic direct cost coverage." },
    { ref_id: "planned-costs-fixture", source: "fixture", notes: "Synthetic planned outflow ranges." },
    { ref_id: "receivables-fixture", source: "fixture", notes: "Synthetic expected inflow and at-risk receivables." },
    { ref_id: "sales-ledger-fixture", source: "fixture", notes: "Synthetic revenue range." }
  ],
  confidence: confidence("HIGH", ["complete_fixture_cash_revenue_and_cost_coverage"]),
  key_uncertainty: "Fixture only; no live account credentials or persistence are used.",
  next_best_action: "Keep direct-cost coverage attached to every dashboard financial claim."
};

const MISSING_COST_SNAPSHOT: FinancialHealthSnapshotV1 = {
  ...HEALTHY_SNAPSHOT,
  snapshot_id: "financial-health-missing-unknown-cost-coverage",
  coverage_state: "PARTIAL",
  contribution_profit_range: unknownMoneyRange(["missing-cost-ledger-fixture"]),
  top_financial_change: "Revenue is visible, but contribution cannot be determined without cost coverage.",
  top_financial_risk: "UNKNOWN direct costs could materially change profitability.",
  top_financial_opportunity: "Collect direct production and fulfillment cost coverage before ranking projects financially.",
  evidence_refs: [
    { ref_id: "missing-cost-ledger-fixture", source: "fixture", notes: "Costs intentionally absent to prove UNKNOWN behavior." },
    { ref_id: "sales-ledger-fixture", source: "fixture", notes: "Synthetic revenue range." }
  ],
  confidence: qualifyConfidenceForCostCoverage({
    base: confidence("MEDIUM", ["revenue_fixture_present", "cash_fixture_present"]),
    costCoverage: "UNKNOWN",
    costLabel: "contribution_cost"
  }),
  key_uncertainty: "Direct cost coverage is UNKNOWN and must not be treated as zero.",
  next_best_action: "Attach cost evidence before using this snapshot for profit-sensitive recommendations."
};

const STRATEGIC_WEAK_DIRECT_PROJECT: ProjectEconomicsAssessmentV1 = {
  contract_version: PROJECT_ECONOMICS_ASSESSMENT_CONTRACT_VERSION_V1,
  assessment_id: "project-economics-strategic-weak-direct",
  project_id: "museum-authority-study",
  option_id: "option-authority-building",
  capital_required_range: moneyRange({ low_cents: 120000, high_cents: 180000, coverage_state: "COMPLETE", evidence_refs: ["project-budget-fixture"] }),
  direct_revenue_range: moneyRange({ low_cents: 0, high_cents: 50000, coverage_state: "PARTIAL", evidence_refs: ["project-revenue-fixture"] }),
  contribution_range: moneyRange({ low_cents: -180000, high_cents: -70000, coverage_state: "PARTIAL", evidence_refs: ["project-budget-fixture", "project-revenue-fixture"] }),
  time_required_range: timeRange({ low_hours: 28, high_hours: 44, coverage_state: "COMPLETE", evidence_refs: ["project-time-fixture"] }),
  opportunity_cost_notes: ["Consumes studio capacity that could otherwise produce a sellable original."],
  payback_window: "NOT_EXPECTED",
  direct_financial_value: "NEGATIVE",
  strategic_value_not_monetized: ["Institutional authority signal", "Premium positioning proof point"],
  key_assumptions: ["Strategic value is qualitative and intentionally not converted into dollars."],
  confidence: confidence("MEDIUM", ["capital_and_time_known", "direct_revenue_partially_known"], ["strategic_value_not_monetized"]),
  downside: ["Weak direct economics if no authority lift materializes."],
  break_even: moneyRange({ low_cents: 120000, high_cents: 180000, coverage_state: "COMPLETE", evidence_refs: ["project-budget-fixture"] }),
  what_would_change_the_recommendation: ["A committed buyer or sponsor covering direct cost."],
  evidence_refs: [
    { ref_id: "project-budget-fixture", source: "fixture", notes: "Synthetic capital requirement." },
    { ref_id: "project-revenue-fixture", source: "fixture", notes: "Synthetic direct revenue range." },
    { ref_id: "project-time-fixture", source: "fixture", notes: "Synthetic time estimate." }
  ]
};

const HIGH_REVENUE_HIGH_RISK_PROJECT: ProjectEconomicsAssessmentV1 = {
  contract_version: PROJECT_ECONOMICS_ASSESSMENT_CONTRACT_VERSION_V1,
  assessment_id: "project-economics-high-revenue-high-capital-concentration",
  project_id: "single-collector-large-commission",
  option_id: "option-high-capital-single-buyer",
  capital_required_range: moneyRange({ low_cents: 850000, high_cents: 1100000, coverage_state: "COMPLETE", evidence_refs: ["capital-fixture"] }),
  direct_revenue_range: moneyRange({ low_cents: 2800000, high_cents: 3500000, coverage_state: "COMPLETE", evidence_refs: ["buyer-revenue-fixture"] }),
  contribution_range: moneyRange({ low_cents: 900000, high_cents: 1500000, coverage_state: "COMPLETE", evidence_refs: ["buyer-revenue-fixture", "capital-fixture"] }),
  time_required_range: timeRange({ low_hours: 180, high_hours: 260, coverage_state: "COMPLETE", evidence_refs: ["capacity-fixture"] }),
  opportunity_cost_notes: ["Large single-buyer exposure delays diversified premium inventory."],
  payback_window: "31_90_DAYS",
  direct_financial_value: "POSITIVE",
  strategic_value_not_monetized: [],
  key_assumptions: ["Buyer proceeds on schedule and concentration risk is accepted."],
  confidence: confidence("MEDIUM", ["direct_revenue_and_capital_known"], ["high_concentration_risk"]),
  downside: ["High capital at risk before receipt.", "Single buyer concentration could distort pipeline decisions."],
  break_even: moneyRange({ low_cents: 850000, high_cents: 1100000, coverage_state: "COMPLETE", evidence_refs: ["capital-fixture"] }),
  what_would_change_the_recommendation: ["Deposit coverage or staged payment terms reduce concentration exposure."],
  evidence_refs: [
    { ref_id: "buyer-revenue-fixture", source: "fixture", notes: "Synthetic single-buyer revenue range." },
    { ref_id: "capital-fixture", source: "fixture", notes: "Synthetic upfront capital requirement." },
    { ref_id: "capacity-fixture", source: "fixture", notes: "Synthetic time requirement." }
  ]
};

const MISSING_COST_PROJECT: ProjectEconomicsAssessmentV1 = {
  ...HIGH_REVENUE_HIGH_RISK_PROJECT,
  assessment_id: "project-economics-missing-unknown-cost-coverage",
  project_id: "print-drop-unknown-fulfillment-cost",
  option_id: "option-cost-coverage-required",
  capital_required_range: unknownMoneyRange(["unknown-fulfillment-cost-fixture"]),
  contribution_range: unknownMoneyRange(["unknown-fulfillment-cost-fixture"]),
  direct_financial_value: "UNKNOWN",
  payback_window: "UNKNOWN",
  key_assumptions: ["Fulfillment and production costs are UNKNOWN, not zero."],
  confidence: qualifyConfidenceForCostCoverage({
    base: confidence("MEDIUM", ["direct_revenue_fixture_present"]),
    costCoverage: "UNKNOWN",
    costLabel: "project_cost"
  }),
  downside: ["Revenue could look attractive while contribution is negative after unknown costs."],
  break_even: unknownMoneyRange(["unknown-fulfillment-cost-fixture"]),
  what_would_change_the_recommendation: ["Confirmed production, fulfillment, platform, and packaging cost ranges."],
  evidence_refs: [
    { ref_id: "buyer-revenue-fixture", source: "fixture", notes: "Synthetic direct revenue range." },
    { ref_id: "unknown-fulfillment-cost-fixture", source: "fixture", notes: "Costs intentionally absent to prove UNKNOWN behavior." }
  ]
};

export const FINANCIAL_HEALTH_SNAPSHOT_FIXTURES_V1: FinancialHealthSnapshotV1[] = [
  HEALTHY_SNAPSHOT,
  MISSING_COST_SNAPSHOT
].sort((a, b) => a.snapshot_id.localeCompare(b.snapshot_id));

export const PROJECT_ECONOMICS_ASSESSMENT_FIXTURES_V1: ProjectEconomicsAssessmentV1[] = [
  HIGH_REVENUE_HIGH_RISK_PROJECT,
  MISSING_COST_PROJECT,
  STRATEGIC_WEAK_DIRECT_PROJECT
].sort((a, b) => a.assessment_id.localeCompare(b.assessment_id));

export function getFinancialIntelligenceFixtureBundleV1(): {
  snapshots: FinancialHealthSnapshotV1[];
  project_assessments: ProjectEconomicsAssessmentV1[];
} {
  return {
    snapshots: FINANCIAL_HEALTH_SNAPSHOT_FIXTURES_V1,
    project_assessments: PROJECT_ECONOMICS_ASSESSMENT_FIXTURES_V1
  };
}
