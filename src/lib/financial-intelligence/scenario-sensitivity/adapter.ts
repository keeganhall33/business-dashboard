import {
  orderCapitalAllocationAlternativesV1,
  type CapitalAllocationAlternativeV1,
  type CapitalAllocationConstraintsV1
} from "@/lib/financial-intelligence/capital-allocation/contracts";
import { moneyRange, timeRange, unknownMoneyRange, type MoneyRangeV1, type TimeRangeV1 } from "@/lib/financial-intelligence/contracts";
import {
  SCENARIO_SENSITIVITY_VERSION_V1,
  type ScenarioSensitivityInputV1,
  type ScenarioSensitivityScenarioV1,
  type ScenarioSensitivityV1
} from "@/lib/financial-intelligence/scenario-sensitivity/contracts";

type ScenarioConfig = {
  scenario_id: string;
  label: string;
  cashMultiplier: number;
  timeMultiplier: number;
  revenueMultiplier: number;
  costMultiplier: number | "UNKNOWN";
};

const SCENARIOS: ScenarioConfig[] = [
  { scenario_id: "base", label: "Base assumptions", cashMultiplier: 1, timeMultiplier: 1, revenueMultiplier: 1, costMultiplier: 1 },
  { scenario_id: "low-cash-high-cost", label: "Lower reserve / higher cost", cashMultiplier: 0.62, timeMultiplier: 1, revenueMultiplier: 0.85, costMultiplier: 1.35 },
  { scenario_id: "high-time-upside", label: "More creative time / revenue upside", cashMultiplier: 1, timeMultiplier: 2.35, revenueMultiplier: 1.45, costMultiplier: 1 },
  { scenario_id: "unknown-cost", label: "UNKNOWN cost coverage", cashMultiplier: 1, timeMultiplier: 1, revenueMultiplier: 1.15, costMultiplier: "UNKNOWN" }
];

function scaleMoney(range: MoneyRangeV1, multiplier: number): MoneyRangeV1 {
  if (range.currency === "UNKNOWN" || (range.low_cents === null && range.high_cents === null)) return unknownMoneyRange(range.evidence_refs);
  return moneyRange({
    low_cents: range.low_cents === null ? null : Math.round(range.low_cents * multiplier),
    high_cents: range.high_cents === null ? null : Math.round(range.high_cents * multiplier),
    coverage_state: range.coverage_state,
    evidence_refs: range.evidence_refs
  });
}

function scaleTime(range: TimeRangeV1, multiplier: number): TimeRangeV1 {
  return timeRange({
    low_hours: range.low_hours === null ? null : Math.round(range.low_hours * multiplier),
    high_hours: range.high_hours === null ? null : Math.round(range.high_hours * multiplier),
    coverage_state: range.coverage_state,
    evidence_refs: range.evidence_refs
  });
}

function rangeHigh(range: MoneyRangeV1) {
  return range.high_cents ?? range.low_cents;
}

function formatCents(cents: number | null) {
  if (cents === null) return "UNKNOWN";
  const dollars = Math.round(cents / 100);
  return `$${dollars.toLocaleString("en-US")}`;
}

function scenarioConstraints(base: CapitalAllocationConstraintsV1, config: ScenarioConfig): CapitalAllocationConstraintsV1 {
  return {
    ...base,
    cash_reserve: scaleMoney(base.cash_reserve, config.cashMultiplier),
    creative_time_available: scaleTime(base.creative_time_available, config.timeMultiplier)
  };
}

function scenarioAlternative(alternative: CapitalAllocationAlternativeV1, config: ScenarioConfig): CapitalAllocationAlternativeV1 {
  const costUnknown = config.costMultiplier === "UNKNOWN";
  const capitalRequired = costUnknown
    ? unknownMoneyRange(alternative.capital_required.evidence_refs)
    : scaleMoney(alternative.capital_required, Number(config.costMultiplier));
  return {
    ...alternative,
    direct_financial_range: costUnknown ? unknownMoneyRange(alternative.direct_financial_range.evidence_refs) : scaleMoney(alternative.direct_financial_range, config.revenueMultiplier),
    capital_required: capitalRequired,
    truth_state: costUnknown ? "UNKNOWN" : alternative.truth_state,
    key_unknown_inputs: costUnknown
      ? [...new Set([...alternative.key_unknown_inputs, "Scenario cost uncertainty"])]
      : alternative.key_unknown_inputs,
    recommendation: costUnknown ? "WAIT_FOR_EVIDENCE" : alternative.recommendation
  };
}

function breakEvenChange(alternative: CapitalAllocationAlternativeV1) {
  if (alternative.direct_financial_range.currency === "UNKNOWN" || alternative.capital_required.currency === "UNKNOWN") {
    return "UNKNOWN cost or revenue input blocks break-even precision.";
  }
  const contributionHigh = rangeHigh(alternative.direct_financial_range);
  const capitalHigh = rangeHigh(alternative.capital_required);
  if (contributionHigh === null || capitalHigh === null) return "UNKNOWN input blocks break-even precision.";
  return `${alternative.label}: high-case contribution ${formatCents(contributionHigh)} vs high-case capital required ${formatCents(capitalHigh)}.`;
}

function scenarioFor(input: ScenarioSensitivityInputV1, config: ScenarioConfig): ScenarioSensitivityScenarioV1 {
  const constraints = scenarioConstraints(input.assessment.constraints, config);
  const alternatives = input.assessment.alternatives.map((alternative) => scenarioAlternative(alternative, config));
  const ordered = orderCapitalAllocationAlternativesV1(alternatives, constraints);
  const recommended = ordered.find((alternative) => alternative.truth_state !== "UNKNOWN") ?? ordered[0] ?? null;
  const unknown = alternatives.flatMap((alternative) =>
    alternative.truth_state === "UNKNOWN" || alternative.direct_financial_range.currency === "UNKNOWN" || alternative.capital_required.currency === "UNKNOWN"
      ? [`${alternative.alternative_id}: UNKNOWN cost/revenue prevents fake profit precision.`]
      : []
  );

  return {
    scenario_id: config.scenario_id,
    label: config.label,
    cash_reserve: constraints.cash_reserve,
    creative_time_available: constraints.creative_time_available,
    revenue_multiplier: config.revenueMultiplier,
    cost_multiplier: config.costMultiplier,
    recommended_alternative_id: recommended?.truth_state === "UNKNOWN" ? null : recommended?.alternative_id ?? null,
    recommendation: recommended?.truth_state === "UNKNOWN" ? "UNKNOWN" : recommended?.recommendation ?? "UNKNOWN",
    direct_financial_range: recommended?.direct_financial_range ?? unknownMoneyRange(),
    break_even_change: recommended ? breakEvenChange(recommended) : "UNKNOWN: no recommended alternative.",
    unknown,
    strategic_value_not_monetized: recommended?.strategic_value_not_monetized ?? { not_monetized: true, notes: [] }
  };
}

export function buildScenarioSensitivityV1(input: ScenarioSensitivityInputV1): ScenarioSensitivityV1 {
  const scenarios = SCENARIOS.map((config) => scenarioFor(input, config));
  const recommendedIds = new Set(scenarios.map((scenario) => scenario.recommended_alternative_id ?? "UNKNOWN"));
  const allUnknowns = [...new Set(scenarios.flatMap((scenario) => scenario.unknown))].sort((a, b) => a.localeCompare(b));
  const changedScenarios = scenarios.filter((scenario) => scenario.recommended_alternative_id !== input.assessment.recommended_alternative_id);
  const stability = allUnknowns.length > 0
    ? "BLOCKED_BY_UNKNOWN"
    : recommendedIds.size > 1
      ? "SENSITIVE"
      : "STABLE";

  return {
    contract_version: SCENARIO_SENSITIVITY_VERSION_V1,
    sensitivity_id: input.sensitivity_id,
    source_assessment_id: input.assessment.assessment_id,
    as_of: input.assessment.as_of,
    ASSUMPTIONS_THAT_MATTER: [
      "cash reserve versus minimum buffer",
      "creative time burden versus available studio capacity",
      "direct revenue range",
      "cost and capital requirement uncertainty"
    ],
    BREAK_EVEN_CHANGE: scenarios.map((scenario) => `${scenario.scenario_id}: ${scenario.break_even_change}`),
    RECOMMENDATION_STABILITY: stability,
    UNKNOWN: allUnknowns,
    base_recommended_alternative_id: input.assessment.recommended_alternative_id,
    scenarios,
    guardrails: {
      strategic_prestige_value_not_dollarized: true,
      unknown_cost_blocks_fake_precision: true,
      no_live_account_connection: true,
      no_money_movement_or_spend_change: true,
      keegan_action_required: "NO"
    },
    truth_state: allUnknowns.length > 0 ? "UNKNOWN" : "INFERRED"
  };
}
