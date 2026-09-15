import { createHash } from "node:crypto";

import type { DecisionEvidenceStateV1, DecisionPortfolioItemV1 } from "@/lib/strategy-engine/decision-portfolio-v1";

export type DecisionScenarioKindV1 = "DO" | "DO_NOT" | "DELAY" | "ALTERNATIVE";
export type DecisionScenarioSupportV1 = "SUPPORTED" | "HYPOTHESIS" | "BLOCKED";
export type ScenarioReversibilityV1 = "REVERSIBLE" | "PARTIALLY_REVERSIBLE" | "IRREVERSIBLE" | "UNKNOWN";
export type ScenarioDirectionV1 = "NEGATIVE" | "NEUTRAL" | "POSITIVE" | "MIXED" | "UNKNOWN";

export type ScenarioNumericRangeV1 = {
  unit: "USD_CENTS" | "HOURS" | "PERCENT" | "COUNT";
  downside: number;
  base: number;
  upside: number;
};

export type ScenarioQualitativeEffectV1 = {
  dimension: "PRESTIGE" | "RELATIONSHIP" | "REPUTATION" | "CREATIVE" | "ACCESS" | "OPTIONALITY" | "CHARITY";
  direction: ScenarioDirectionV1;
  rationale: string;
  evidenceRefs: readonly string[];
};

export type DecisionScenarioAlternativeInputV1 = {
  scenarioId: string;
  kind: DecisionScenarioKindV1;
  label: string;
  support: DecisionScenarioSupportV1;
  evidenceState: DecisionEvidenceStateV1;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  monetaryRange: ScenarioNumericRangeV1 | null;
  keeganHoursRange: ScenarioNumericRangeV1 | null;
  measurableEffects: readonly { metric: string; range: ScenarioNumericRangeV1; evidenceRefs: readonly string[] }[];
  qualitativeEffects: readonly ScenarioQualitativeEffectV1[];
  firstOrderConsequences: readonly string[];
  secondOrderConsequences: readonly string[];
  assumptions: readonly string[];
  contradictions: readonly string[];
  sensitivityVariables: readonly { variable: string; lowCase: string; highCase: string; evidenceRefs: readonly string[] }[];
  breakEvenConditions: readonly { condition: string; evidenceState: DecisionEvidenceStateV1; evidenceRefs: readonly string[] }[];
  strongestCaseAgainst: string;
  weakestAssumption: string;
  reversibility: ScenarioReversibilityV1;
  whatWouldChangeTheAnswer: readonly string[];
};

export type DecisionScenarioComparisonV1 = {
  contractVersion: "DecisionScenarioComparisonV1";
  policyVersion: "decision_scenario_policy_v1.0.0";
  comparisonId: string;
  portfolioId: string;
  candidateId: string;
  generatedAt: string;
  decisionMode: "COMPARE" | "RESEARCH_FIRST" | "HUMAN_JUDGMENT_REQUIRED";
  alternatives: readonly DecisionScenarioAlternativeInputV1[];
  uncertainty: {
    evidenceState: DecisionEvidenceStateV1;
    unsupportedVariableIds: readonly string[];
    widestRangeScenarioIds: readonly string[];
    contradictionsPresent: boolean;
    qualitativeValueNotDollarized: true;
  };
  challenge: {
    strongestCasesAgainst: readonly { scenarioId: string; caseAgainst: string; weakestAssumption: string }[];
    irreversibleScenarioIds: readonly string[];
    whatWouldChangeTheAnswer: readonly string[];
  };
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  actionAuthority: {
    simulationOnly: true;
    externalActionAuthorized: false;
    approvalClassPreserved: DecisionPortfolioItemV1["candidate"]["approvalClass"];
  };
};

export class DecisionScenarioError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "DecisionScenarioError";
  }
}

const ORDER: Readonly<Record<DecisionScenarioKindV1, number>> = { DO: 0, DO_NOT: 1, DELAY: 2, ALTERNATIVE: 3 };
const WEAK_STATES = new Set<DecisionEvidenceStateV1>(["UNKNOWN", "STALE", "CONFLICTED"]);
const MAX_LIST = 50;

function required(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new DecisionScenarioError("REQUIRED_FIELD", `${label} is required`);
  return value.trim();
}

function list(values: readonly string[], label: string, requiredList = false): string[] {
  if (!Array.isArray(values) || values.length > MAX_LIST || (requiredList && values.length === 0)) throw new DecisionScenarioError("INVALID_LIST", `${label} is invalid`);
  return [...new Set(values.map((value) => required(value, label)))].sort((a, b) => a.localeCompare(b));
}

function state(value: DecisionEvidenceStateV1, label: string): DecisionEvidenceStateV1 {
  if (!new Set(["KNOWN", "INFERRED", "UNKNOWN", "STALE", "CONFLICTED"]).has(value)) throw new DecisionScenarioError("INVALID_EVIDENCE_STATE", `${label} is invalid`);
  return value;
}

function range(value: ScenarioNumericRangeV1, label: string, expectedUnit?: ScenarioNumericRangeV1["unit"]): ScenarioNumericRangeV1 {
  if (!value || typeof value !== "object") throw new DecisionScenarioError("RANGE_REQUIRED", `${label} is required`);
  if (!new Set(["USD_CENTS", "HOURS", "PERCENT", "COUNT"]).has(value.unit) || (expectedUnit && value.unit !== expectedUnit)) throw new DecisionScenarioError("INVALID_UNIT", `${label} has an invalid unit`);
  for (const key of ["downside", "base", "upside"] as const) {
    if (typeof value[key] !== "number" || !Number.isFinite(value[key])) throw new DecisionScenarioError("INVALID_RANGE", `${label}.${key} must be finite`);
  }
  if (!(value.downside <= value.base && value.base <= value.upside)) throw new DecisionScenarioError("INVALID_RANGE", `${label} must be ordered downside/base/upside`);
  return { ...value };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical((value as Record<string, unknown>)[key])]));
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function normalizeAlternative(input: DecisionScenarioAlternativeInputV1): DecisionScenarioAlternativeInputV1 {
  const scenarioId = required(input.scenarioId, "scenarioId");
  if (!(input.kind in ORDER)) throw new DecisionScenarioError("INVALID_KIND", `${scenarioId} kind is invalid`);
  if (!new Set(["SUPPORTED", "HYPOTHESIS", "BLOCKED"]).has(input.support)) throw new DecisionScenarioError("INVALID_SUPPORT", `${scenarioId} support is invalid`);
  const evidenceState = state(input.evidenceState, `${scenarioId}.evidenceState`);
  const evidenceRefs = list(input.evidenceRefs, `${scenarioId}.evidenceRefs`, input.support === "SUPPORTED");
  if (input.support === "SUPPORTED" && WEAK_STATES.has(evidenceState)) throw new DecisionScenarioError("UNSUPPORTED_CERTAINTY", `${scenarioId} cannot be supported by ${evidenceState} evidence`);
  if (input.support === "BLOCKED" && !WEAK_STATES.has(evidenceState)) throw new DecisionScenarioError("BLOCK_REASON_REQUIRED", `${scenarioId} BLOCKED requires weak evidence state`);
  const monetaryRange = input.monetaryRange == null ? null : range(input.monetaryRange, `${scenarioId}.monetaryRange`, "USD_CENTS");
  const keeganHoursRange = input.keeganHoursRange == null ? null : range(input.keeganHoursRange, `${scenarioId}.keeganHoursRange`, "HOURS");
  if (evidenceState === "INFERRED") {
    for (const [label, item] of [["monetaryRange", monetaryRange], ["keeganHoursRange", keeganHoursRange]] as const) {
      if (item && item.downside === item.upside) throw new DecisionScenarioError("FAKE_PRECISION", `${scenarioId}.${label} must widen inferred uncertainty`);
    }
  }
  if (!Array.isArray(input.measurableEffects) || input.measurableEffects.length > MAX_LIST) throw new DecisionScenarioError("INVALID_LIST", `${scenarioId}.measurableEffects is invalid`);
  const measurableEffects = input.measurableEffects.map((effect) => ({ metric: required(effect.metric, `${scenarioId}.metric`), range: range(effect.range, `${scenarioId}.${effect.metric}.range`), evidenceRefs: list(effect.evidenceRefs, `${scenarioId}.${effect.metric}.evidenceRefs`, true) })).sort((a, b) => a.metric.localeCompare(b.metric));
  if (!Array.isArray(input.qualitativeEffects) || input.qualitativeEffects.length > MAX_LIST) throw new DecisionScenarioError("INVALID_LIST", `${scenarioId}.qualitativeEffects is invalid`);
  const qualitativeEffects = input.qualitativeEffects.map((effect) => {
    if (!new Set(["PRESTIGE", "RELATIONSHIP", "REPUTATION", "CREATIVE", "ACCESS", "OPTIONALITY", "CHARITY"]).has(effect.dimension)) throw new DecisionScenarioError("INVALID_DIMENSION", `${scenarioId} qualitative dimension is invalid`);
    if (!new Set(["NEGATIVE", "NEUTRAL", "POSITIVE", "MIXED", "UNKNOWN"]).has(effect.direction)) throw new DecisionScenarioError("INVALID_DIRECTION", `${scenarioId} qualitative direction is invalid`);
    return { ...structuredClone(effect), rationale: required(effect.rationale, `${scenarioId}.${effect.dimension}.rationale`), evidenceRefs: list(effect.evidenceRefs, `${scenarioId}.${effect.dimension}.evidenceRefs`) };
  }).sort((a, b) => a.dimension.localeCompare(b.dimension));
  if (qualitativeEffects.some((effect) => /\$|usd|dollar/i.test(effect.rationale))) throw new DecisionScenarioError("QUALITATIVE_VALUE_DOLLARIZED", `${scenarioId} qualitative effects cannot be dollarized`);
  if (!Array.isArray(input.sensitivityVariables) || input.sensitivityVariables.length > MAX_LIST) throw new DecisionScenarioError("INVALID_LIST", `${scenarioId}.sensitivityVariables is invalid`);
  const sensitivityVariables = input.sensitivityVariables.map((item) => ({ variable: required(item.variable, `${scenarioId}.sensitivity.variable`), lowCase: required(item.lowCase, `${scenarioId}.sensitivity.lowCase`), highCase: required(item.highCase, `${scenarioId}.sensitivity.highCase`), evidenceRefs: list(item.evidenceRefs, `${scenarioId}.sensitivity.evidenceRefs`) })).sort((a, b) => a.variable.localeCompare(b.variable));
  if (!Array.isArray(input.breakEvenConditions) || input.breakEvenConditions.length > MAX_LIST) throw new DecisionScenarioError("INVALID_LIST", `${scenarioId}.breakEvenConditions is invalid`);
  const breakEvenConditions = input.breakEvenConditions.map((item) => ({ condition: required(item.condition, `${scenarioId}.breakEven.condition`), evidenceState: state(item.evidenceState, `${scenarioId}.breakEven.evidenceState`), evidenceRefs: list(item.evidenceRefs, `${scenarioId}.breakEven.evidenceRefs`) })).sort((a, b) => a.condition.localeCompare(b.condition));
  if (!new Set(["REVERSIBLE", "PARTIALLY_REVERSIBLE", "IRREVERSIBLE", "UNKNOWN"]).has(input.reversibility)) throw new DecisionScenarioError("INVALID_REVERSIBILITY", `${scenarioId} reversibility is invalid`);
  return {
    ...structuredClone(input), scenarioId, label: required(input.label, `${scenarioId}.label`), evidenceState, evidenceRefs,
    sourceRefs: list(input.sourceRefs, `${scenarioId}.sourceRefs`), monetaryRange, keeganHoursRange, measurableEffects, qualitativeEffects,
    firstOrderConsequences: list(input.firstOrderConsequences, `${scenarioId}.firstOrderConsequences`, true),
    secondOrderConsequences: list(input.secondOrderConsequences, `${scenarioId}.secondOrderConsequences`, true),
    assumptions: list(input.assumptions, `${scenarioId}.assumptions`, true), contradictions: list(input.contradictions, `${scenarioId}.contradictions`),
    sensitivityVariables, breakEvenConditions, strongestCaseAgainst: required(input.strongestCaseAgainst, `${scenarioId}.strongestCaseAgainst`),
    weakestAssumption: required(input.weakestAssumption, `${scenarioId}.weakestAssumption`), reversibility: input.reversibility,
    whatWouldChangeTheAnswer: list(input.whatWouldChangeTheAnswer, `${scenarioId}.whatWouldChangeTheAnswer`, true)
  };
}

function width(alternative: DecisionScenarioAlternativeInputV1): number {
  const ranges = [alternative.monetaryRange, alternative.keeganHoursRange, ...alternative.measurableEffects.map((effect) => effect.range)].filter((item): item is ScenarioNumericRangeV1 => item != null);
  return ranges.reduce((sum, item) => sum + Math.abs(item.upside - item.downside), 0);
}

export function buildDecisionScenarioComparisonV1(input: {
  portfolioId: string;
  portfolioItem: DecisionPortfolioItemV1;
  alternatives: readonly DecisionScenarioAlternativeInputV1[];
  generatedAt: string;
}): DecisionScenarioComparisonV1 {
  const portfolioId = required(input.portfolioId, "portfolioId");
  const candidateId = required(input.portfolioItem?.candidate?.id, "portfolioItem.candidate.id");
  if (!Array.isArray(input.alternatives) || input.alternatives.length !== 4) throw new DecisionScenarioError("COUNTERFACTUAL_SET_REQUIRED", "Exactly DO, DO_NOT, DELAY, and ALTERNATIVE are required");
  const alternatives = input.alternatives.map(normalizeAlternative).sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.scenarioId.localeCompare(b.scenarioId));
  const kinds = new Set(alternatives.map((item) => item.kind));
  if (kinds.size !== 4) throw new DecisionScenarioError("COUNTERFACTUAL_SET_REQUIRED", "Each counterfactual kind must appear exactly once");
  if (new Set(alternatives.map((item) => item.scenarioId)).size !== 4) throw new DecisionScenarioError("DUPLICATE_SCENARIO", "Scenario ids must be unique");
  const generatedAt = required(input.generatedAt, "generatedAt");
  if (!Number.isFinite(Date.parse(generatedAt))) throw new DecisionScenarioError("INVALID_TIMESTAMP", "generatedAt is invalid");
  const weak = alternatives.filter((item) => WEAK_STATES.has(item.evidenceState) || item.support === "BLOCKED");
  const humanJudgment = alternatives.some((item) => item.reversibility === "IRREVERSIBLE") || input.portfolioItem.candidate.approvalClass === "KEEGAN";
  const widths = alternatives.map((item) => ({ id: item.scenarioId, width: width(item) }));
  const widest = Math.max(...widths.map((item) => item.width));
  const identity = { portfolioId, candidateId, generatedAt, alternatives };
  return freeze({
    contractVersion: "DecisionScenarioComparisonV1", policyVersion: "decision_scenario_policy_v1.0.0",
    comparisonId: `decision_scenario_${createHash("sha256").update(JSON.stringify(canonical(identity))).digest("hex").slice(0, 20)}`,
    portfolioId, candidateId, generatedAt,
    decisionMode: weak.length > 0 ? "RESEARCH_FIRST" : humanJudgment ? "HUMAN_JUDGMENT_REQUIRED" : "COMPARE",
    alternatives,
    uncertainty: {
      evidenceState: input.portfolioItem.candidate.evidenceState,
      unsupportedVariableIds: weak.map((item) => item.scenarioId),
      widestRangeScenarioIds: widths.filter((item) => item.width === widest && widest > 0).map((item) => item.id).sort(),
      contradictionsPresent: alternatives.some((item) => item.contradictions.length > 0),
      qualitativeValueNotDollarized: true
    },
    challenge: {
      strongestCasesAgainst: alternatives.map((item) => ({ scenarioId: item.scenarioId, caseAgainst: item.strongestCaseAgainst, weakestAssumption: item.weakestAssumption })),
      irreversibleScenarioIds: alternatives.filter((item) => item.reversibility === "IRREVERSIBLE").map((item) => item.scenarioId),
      whatWouldChangeTheAnswer: list(alternatives.flatMap((item) => item.whatWouldChangeTheAnswer), "comparison.whatWouldChangeTheAnswer", true)
    },
    evidenceRefs: list([...(input.portfolioItem.candidate.evidenceRefs ?? []), ...alternatives.flatMap((item) => item.evidenceRefs)], "comparison.evidenceRefs"),
    sourceRefs: list([...(input.portfolioItem.candidate.sourceRefs ?? []), ...alternatives.flatMap((item) => item.sourceRefs)], "comparison.sourceRefs"),
    actionAuthority: { simulationOnly: true, externalActionAuthorized: false, approvalClassPreserved: input.portfolioItem.candidate.approvalClass }
  });
}
