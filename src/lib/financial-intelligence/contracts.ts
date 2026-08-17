export const FINANCIAL_INTELLIGENCE_SNAPSHOT_CONTRACT_VERSION_V1 = "financial_health_snapshot_v1.0" as const;
export const PROJECT_ECONOMICS_ASSESSMENT_CONTRACT_VERSION_V1 = "project_economics_assessment_v1.0" as const;

export type CoverageStateV1 = "COMPLETE" | "PARTIAL" | "UNKNOWN";
export type ConfidenceLevelV1 = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
export type FinancialStateV1 = "STRONG" | "STABLE" | "WATCH" | "AT_RISK" | "UNKNOWN";
export type PaybackWindowV1 = "IMMEDIATE" | "0_30_DAYS" | "31_90_DAYS" | "90_PLUS_DAYS" | "UNKNOWN" | "NOT_EXPECTED";
export type DirectFinancialValueV1 = "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "UNKNOWN";

export type EvidenceRefV1 = {
  ref_id: string;
  source: string;
  notes: string;
};

export type MoneyRangeV1 = {
  currency: "USD" | "UNKNOWN";
  low_cents: number | null;
  high_cents: number | null;
  coverage_state: CoverageStateV1;
  evidence_refs: string[];
};

export type TimeRangeV1 = {
  low_hours: number | null;
  high_hours: number | null;
  coverage_state: CoverageStateV1;
  evidence_refs: string[];
};

export type ConfidenceV1 = {
  level: ConfidenceLevelV1;
  reasons: string[];
  qualifiers: string[];
};

export type FinancialHealthSnapshotV1 = {
  contract_version: typeof FINANCIAL_INTELLIGENCE_SNAPSHOT_CONTRACT_VERSION_V1;
  snapshot_id: string;
  as_of: string;
  coverage_state: CoverageStateV1;
  cash_position: MoneyRangeV1;
  cash_range: MoneyRangeV1;
  expected_30_60_90_day_inflow_range: {
    days_30: MoneyRangeV1;
    days_60: MoneyRangeV1;
    days_90: MoneyRangeV1;
  };
  expected_30_60_90_day_outflow_range: {
    days_30: MoneyRangeV1;
    days_60: MoneyRangeV1;
    days_90: MoneyRangeV1;
  };
  runway_or_reserve_state: FinancialStateV1;
  revenue_range: MoneyRangeV1;
  contribution_profit_range: MoneyRangeV1;
  receivables_at_risk: MoneyRangeV1;
  concentration_risk: FinancialStateV1;
  top_financial_change: string;
  top_financial_risk: string;
  top_financial_opportunity: string;
  source: "fixture" | "adapter";
  evidence_refs: EvidenceRefV1[];
  confidence: ConfidenceV1;
  key_uncertainty: string;
  next_best_action: string;
};

export type ProjectEconomicsAssessmentV1 = {
  contract_version: typeof PROJECT_ECONOMICS_ASSESSMENT_CONTRACT_VERSION_V1;
  assessment_id: string;
  project_id: string;
  option_id: string | null;
  capital_required_range: MoneyRangeV1;
  direct_revenue_range: MoneyRangeV1;
  contribution_range: MoneyRangeV1;
  time_required_range: TimeRangeV1;
  opportunity_cost_notes: string[];
  payback_window: PaybackWindowV1;
  direct_financial_value: DirectFinancialValueV1;
  strategic_value_not_monetized: string[];
  key_assumptions: string[];
  confidence: ConfidenceV1;
  downside: string[];
  break_even: MoneyRangeV1;
  what_would_change_the_recommendation: string[];
  evidence_refs: EvidenceRefV1[];
};

export function moneyRange(input: Omit<MoneyRangeV1, "currency"> & { currency?: "USD" | "UNKNOWN" }): MoneyRangeV1 {
  return {
    currency: input.currency ?? "USD",
    low_cents: input.low_cents,
    high_cents: input.high_cents,
    coverage_state: input.coverage_state,
    evidence_refs: [...input.evidence_refs].sort()
  };
}

export function unknownMoneyRange(evidence_refs: string[] = []): MoneyRangeV1 {
  return moneyRange({
    currency: "UNKNOWN",
    low_cents: null,
    high_cents: null,
    coverage_state: "UNKNOWN",
    evidence_refs
  });
}

export function timeRange(input: TimeRangeV1): TimeRangeV1 {
  return {
    low_hours: input.low_hours,
    high_hours: input.high_hours,
    coverage_state: input.coverage_state,
    evidence_refs: [...input.evidence_refs].sort()
  };
}

export function hasKnownMoneyValue(range: MoneyRangeV1): boolean {
  return range.low_cents !== null || range.high_cents !== null;
}
