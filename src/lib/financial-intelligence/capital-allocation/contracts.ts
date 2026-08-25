import type {
  ConfidenceV1,
  FinancialHealthSnapshotV1,
  MoneyRangeV1,
  PaybackWindowV1,
  ProjectEconomicsAssessmentV1,
  TimeRangeV1
} from "@/lib/financial-intelligence/contracts";

export const CAPITAL_ALLOCATION_ASSESSMENT_VERSION_V1 = "capital_allocation_assessment_v1.0" as const;
export const CAPITAL_ALLOCATION_VIEW_VERSION_V1 = "capital_allocation_view_v1.0" as const;

export type CapitalAllocationTruthStateV1 = "KNOWN" | "INFERRED" | "UNKNOWN" | "STALE" | "CONFLICTED";
export type CapitalAllocationAlternativeKindV1 = "HIGH_CASH_LOW_TIME_GROWTH" | "HIGH_TIME_ORIGINAL_COMMISSION" | "PARTNERSHIP_LICENSING_STRATEGIC";
export type CapitalAllocationReversibilityV1 = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
export type CapitalAllocationLiquidityImpactV1 = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
export type CapitalAllocationRecommendationV1 = "DO_NOW" | "PREPARE" | "WAIT_FOR_EVIDENCE" | "DEFER";

export type CapitalAllocationConstraintsV1 = {
  cash_reserve: MoneyRangeV1;
  minimum_cash_buffer: MoneyRangeV1;
  creative_time_available: TimeRangeV1;
};

export type CapitalAllocationAlternativeV1 = {
  alternative_id: string;
  label: string;
  kind: CapitalAllocationAlternativeKindV1;
  source_project_id: string;
  direct_financial_range: MoneyRangeV1;
  capital_required: MoneyRangeV1;
  creative_time_burden: TimeRangeV1;
  payback_window: PaybackWindowV1;
  liquidity_impact: CapitalAllocationLiquidityImpactV1;
  reversibility: CapitalAllocationReversibilityV1;
  strategic_value_not_monetized: ProjectEconomicsAssessmentV1["STRATEGIC_OPTION_VALUE"];
  learning_value: {
    level: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
    summary: string;
  };
  opportunity_cost: ProjectEconomicsAssessmentV1["OPPORTUNITY_COST"];
  confidence: ConfidenceV1;
  truth_state: CapitalAllocationTruthStateV1;
  key_unknown_inputs: string[];
  recommendation: CapitalAllocationRecommendationV1;
  next_safe_action: string;
};

export type CapitalAllocationAssessmentV1 = {
  contract_version: typeof CAPITAL_ALLOCATION_ASSESSMENT_VERSION_V1;
  assessment_id: string;
  as_of: string;
  source: "fixture" | "adapter";
  financial_snapshot_id: FinancialHealthSnapshotV1["snapshot_id"];
  constraints: CapitalAllocationConstraintsV1;
  alternatives: CapitalAllocationAlternativeV1[];
  recommended_alternative_id: string;
  recommendation_reason: string;
  truth_state: CapitalAllocationTruthStateV1;
  confidence: ConfidenceV1;
  guardrails: {
    direct_financial_and_strategic_value_separate: true;
    unknown_cost_blocks_profit_precision: true;
    no_live_account_connection: true;
    no_money_movement_or_spend_change: true;
    keegan_action_required: "NO";
  };
};

export type CapitalAllocationViewModelV1 = {
  view_version: typeof CAPITAL_ALLOCATION_VIEW_VERSION_V1;
  assessment_id: string;
  recommended_alternative_id: string;
  recommendation_reason: string;
  rows: Array<{
    alternative_id: string;
    label: string;
    kind: CapitalAllocationAlternativeKindV1;
    direct_financial_range: MoneyRangeV1;
    capital_required: MoneyRangeV1;
    creative_time_burden: TimeRangeV1;
    payback_window: PaybackWindowV1;
    liquidity_impact: CapitalAllocationLiquidityImpactV1;
    reversibility: CapitalAllocationReversibilityV1;
    strategic_value_not_monetized: string[];
    learning_value: string;
    opportunity_cost: string[];
    confidence: ConfidenceV1;
    truth_state: CapitalAllocationTruthStateV1;
    key_unknown_inputs: string[];
    recommendation: CapitalAllocationRecommendationV1;
    next_safe_action: string;
  }>;
  guardrails: CapitalAllocationAssessmentV1["guardrails"];
  keegan_action_required: "NO";
};

function moneyHigh(range: MoneyRangeV1): number | null {
  return range.high_cents ?? range.low_cents;
}

function moneyLow(range: MoneyRangeV1): number | null {
  return range.low_cents ?? range.high_cents;
}

function hoursHigh(range: TimeRangeV1): number | null {
  return range.high_hours ?? range.low_hours;
}

export function hasKnownCapitalAllocationMoneyV1(range: MoneyRangeV1): boolean {
  return range.low_cents !== null || range.high_cents !== null;
}

export function scoreCapitalAllocationAlternativeV1(
  alternative: CapitalAllocationAlternativeV1,
  constraints: CapitalAllocationConstraintsV1
): number {
  const directFinancial = hasKnownCapitalAllocationMoneyV1(alternative.direct_financial_range) ? Math.min(30, (moneyHigh(alternative.direct_financial_range) ?? 0) / 50000) : -28;
  const capitalRequired = moneyHigh(alternative.capital_required);
  const cashReserveLow = moneyLow(constraints.cash_reserve);
  const minimumBufferHigh = moneyHigh(constraints.minimum_cash_buffer);
  const cashAfterAllocation =
    capitalRequired !== null && cashReserveLow !== null && minimumBufferHigh !== null ? cashReserveLow - capitalRequired - minimumBufferHigh : null;
  const liquidityPenalty = cashAfterAllocation === null ? 9 : cashAfterAllocation < 0 ? 58 : cashAfterAllocation < 500000 ? 18 : 0;
  const creativeHours = hoursHigh(alternative.creative_time_burden);
  const timeAvailable = hoursHigh(constraints.creative_time_available);
  const timePenalty = creativeHours === null || timeAvailable === null ? 12 : creativeHours > timeAvailable ? 42 : creativeHours / 10;
  const highTimeOriginalFitBonus =
    alternative.kind === "HIGH_TIME_ORIGINAL_COMMISSION" && timeAvailable !== null && creativeHours !== null && creativeHours <= timeAvailable ? 72 : 0;
  const reversibilityBonus = alternative.reversibility === "HIGH" ? 14 : alternative.reversibility === "MEDIUM" ? 7 : alternative.reversibility === "LOW" ? -8 : -3;
  const learningBonus = alternative.learning_value.level === "HIGH" ? 12 : alternative.learning_value.level === "MEDIUM" ? 7 : alternative.learning_value.level === "LOW" ? 2 : 0;
  const strategicBonus = alternative.strategic_value_not_monetized.notes.length * 7;
  const unknownPenalty = alternative.key_unknown_inputs.length * 7 + (alternative.truth_state === "UNKNOWN" ? 20 : 0);
  const confidenceBonus = alternative.confidence.level === "HIGH" ? 12 : alternative.confidence.level === "MEDIUM" ? 7 : alternative.confidence.level === "LOW" ? 2 : 0;
  const recommendationBonus = alternative.recommendation === "DO_NOW" ? 12 : alternative.recommendation === "PREPARE" ? 8 : alternative.recommendation === "WAIT_FOR_EVIDENCE" ? -6 : -12;

  return directFinancial + reversibilityBonus + learningBonus + strategicBonus + confidenceBonus + recommendationBonus + highTimeOriginalFitBonus - liquidityPenalty - timePenalty - unknownPenalty;
}

export function orderCapitalAllocationAlternativesV1(
  alternatives: CapitalAllocationAlternativeV1[],
  constraints: CapitalAllocationConstraintsV1
): CapitalAllocationAlternativeV1[] {
  return [...alternatives].sort((a, b) => {
    const scoreDelta = scoreCapitalAllocationAlternativeV1(b, constraints) - scoreCapitalAllocationAlternativeV1(a, constraints);
    return scoreDelta === 0 ? a.alternative_id.localeCompare(b.alternative_id) : scoreDelta;
  });
}
