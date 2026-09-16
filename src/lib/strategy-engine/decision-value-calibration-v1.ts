import { createHash } from "node:crypto";

import type { DecisionEvidenceStateV1, DecisionPortfolioItemV1 } from "@/lib/strategy-engine/decision-portfolio-v1";
import type { DecisionScenarioComparisonV1, ScenarioQualitativeEffectV1 } from "@/lib/strategy-engine/decision-scenario-adapter-v1";

export const DECISION_VALUE_CALIBRATION_POLICY_VERSION_V1 = "decision_value_calibration_policy_v1.0.0" as const;

export type SupportedCentsRangeV1 = { downside: number; base: number; upside: number };
export type ProbabilityRangeV1 = { low: number; base: number; high: number };
export type ValueCalibrationStateV1 = "SUPPORTED" | "WIDENED" | "UNKNOWN" | "REFUSED";
export type ValueDispositionV1 = "PROCEED" | "WAIT" | "SUBSTITUTE_IOANA" | "SUBSTITUTE_JEEVES" | "DECLINE" | "GATHER_EVIDENCE";

export type DecisionValueReferenceClassV1 = {
  referenceClassId: string;
  evidenceState: DecisionEvidenceStateV1;
  observedAt: string;
  sampleSize: number;
  staleAfterDays: number;
  grossValueRangeCents: SupportedCentsRangeV1;
  successProbability: ProbabilityRangeV1;
  optionValueRangeCents: SupportedCentsRangeV1 | null;
  compoundingValueRangeCents: SupportedCentsRangeV1 | null;
  evidenceRefs: readonly string[];
};

export type FounderOpportunityCostV1 = {
  hourlyCostRangeCents: SupportedCentsRangeV1;
  deepWorkInterruptionHours: number;
  contextSwitchCount: number;
  contextSwitchHours: number;
  evidenceState: DecisionEvidenceStateV1;
  evidenceRefs: readonly string[];
};

export type DecisionSubstitutionV1 = {
  owner: "IOANA" | "JEEVES";
  eligible: boolean;
  keeganHoursSaved: number;
  replacementHours: number;
  evidenceState: DecisionEvidenceStateV1;
  evidenceRefs: readonly string[];
};

export type DecisionValueCalibrationV1 = {
  contractVersion: "DecisionValueCalibrationV1";
  policyVersion: typeof DECISION_VALUE_CALIBRATION_POLICY_VERSION_V1;
  calibrationId: string;
  portfolioId: string;
  candidateId: string;
  comparisonId: string;
  generatedAt: string;
  calibrationState: ValueCalibrationStateV1;
  disposition: ValueDispositionV1;
  monetary: {
    grossValueRangeCents: SupportedCentsRangeV1 | null;
    expectedValueRangeCents: SupportedCentsRangeV1 | null;
    optionValueRangeCents: SupportedCentsRangeV1 | null;
    compoundingValueRangeCents: SupportedCentsRangeV1 | null;
    founderOpportunityCostRangeCents: SupportedCentsRangeV1;
    netSupportedValueRangeCents: SupportedCentsRangeV1 | null;
    windowDecayFactor: number;
    qualitativeValueDollarized: false;
  };
  qualitativeValue: readonly ScenarioQualitativeEffectV1[];
  founderTime: {
    requestedKeeganHours: number;
    deepWorkInterruptionHours: number;
    contextSwitchHours: number;
    displacedKeeganHours: number;
    substitutedKeeganHours: number;
    remainingKeeganHours: number;
    substitutionOwner: "IOANA" | "JEEVES" | null;
  };
  uncertainty: {
    reasons: readonly string[];
    referenceClassAgeDays: number;
    permanentPreferenceInferred: false;
  };
  evidenceRefs: readonly string[];
  actionAuthority: {
    analysisOnly: true;
    externalActionAuthorized: false;
    approvalClassPreserved: DecisionPortfolioItemV1["candidate"]["approvalClass"];
  };
};

export class DecisionValueCalibrationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "DecisionValueCalibrationError";
  }
}

const WEAK_STATES = new Set<DecisionEvidenceStateV1>(["UNKNOWN", "CONFLICTED"]);
const MAX_REFS = 100;
const MIN_REFERENCE_SAMPLE = 3;

function required(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new DecisionValueCalibrationError("REQUIRED_FIELD", `${label} is required`);
  return value.trim();
}

function number(value: unknown, label: string, minimum: number, maximum: number, integer = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum || (integer && !Number.isInteger(value))) {
    throw new DecisionValueCalibrationError("INVALID_NUMBER", `${label} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function timestamp(value: string, label: string): string {
  const normalized = required(value, label);
  if (!Number.isFinite(Date.parse(normalized))) throw new DecisionValueCalibrationError("INVALID_TIMESTAMP", `${label} is invalid`);
  return normalized;
}

function refs(values: readonly string[], label: string): string[] {
  if (!Array.isArray(values) || values.length > MAX_REFS) throw new DecisionValueCalibrationError("INVALID_LIST", `${label} is invalid`);
  return [...new Set(values.map((value) => required(value, label)))].sort((a, b) => a.localeCompare(b));
}

function centsRange(value: SupportedCentsRangeV1, label: string): SupportedCentsRangeV1 {
  const downside = number(value?.downside, `${label}.downside`, -100_000_000_000, 100_000_000_000, true);
  const base = number(value?.base, `${label}.base`, -100_000_000_000, 100_000_000_000, true);
  const upside = number(value?.upside, `${label}.upside`, -100_000_000_000, 100_000_000_000, true);
  if (!(downside <= base && base <= upside)) throw new DecisionValueCalibrationError("INVALID_RANGE", `${label} must be ordered`);
  return { downside, base, upside };
}

function probabilityRange(value: ProbabilityRangeV1): ProbabilityRangeV1 {
  const low = number(value?.low, "successProbability.low", 0, 1);
  const base = number(value?.base, "successProbability.base", 0, 1);
  const high = number(value?.high, "successProbability.high", 0, 1);
  if (!(low <= base && base <= high)) throw new DecisionValueCalibrationError("INVALID_RANGE", "successProbability must be ordered");
  return { low, base, high };
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

function add(...ranges: SupportedCentsRangeV1[]): SupportedCentsRangeV1 {
  return ranges.reduce((sum, value) => ({ downside: sum.downside + value.downside, base: sum.base + value.base, upside: sum.upside + value.upside }), { downside: 0, base: 0, upside: 0 });
}

function multiplyRange(value: SupportedCentsRangeV1, probability: ProbabilityRangeV1): SupportedCentsRangeV1 {
  const products = [value.downside, value.upside].flatMap((amount) => [amount * probability.low, amount * probability.high]);
  return {
    downside: Math.round(Math.min(...products)),
    base: Math.round(value.base * probability.base),
    upside: Math.round(Math.max(...products))
  };
}

function scale(value: SupportedCentsRangeV1, factor: number): SupportedCentsRangeV1 {
  return { downside: Math.round(value.downside * factor), base: Math.round(value.base * factor), upside: Math.round(value.upside * factor) };
}

function widen(value: SupportedCentsRangeV1, factor: number): SupportedCentsRangeV1 {
  const span = Math.max(1, value.upside - value.downside);
  return {
    downside: Math.round(value.downside - span * factor),
    base: value.base,
    upside: Math.round(value.upside + span * factor)
  };
}

function subtractCost(value: SupportedCentsRangeV1, cost: SupportedCentsRangeV1): SupportedCentsRangeV1 {
  return { downside: value.downside - cost.upside, base: value.base - cost.base, upside: value.upside - cost.downside };
}

function opportunityCost(hours: number, hourly: SupportedCentsRangeV1): SupportedCentsRangeV1 {
  return { downside: Math.round(hours * hourly.downside), base: Math.round(hours * hourly.base), upside: Math.round(hours * hourly.upside) };
}

function windowDecay(item: DecisionPortfolioItemV1, generatedAt: string): number {
  const start = Date.parse(item.candidate.evaluationWindow.start);
  const end = Date.parse(item.candidate.evaluationWindow.end);
  const now = Date.parse(generatedAt);
  if (now <= start) return 1;
  if (now >= end) return 0;
  return Math.round(((end - now) / Math.max(1, end - start)) * 10_000) / 10_000;
}

function positiveQualitative(effects: readonly ScenarioQualitativeEffectV1[]): boolean {
  return effects.some((effect) => effect.direction === "POSITIVE" || effect.direction === "MIXED");
}

export function calibrateDecisionValueV1(input: {
  portfolioId: string;
  portfolioItem: DecisionPortfolioItemV1;
  scenarioComparison: DecisionScenarioComparisonV1;
  referenceClass: DecisionValueReferenceClassV1;
  founderOpportunityCost: FounderOpportunityCostV1;
  substitutions?: readonly DecisionSubstitutionV1[];
  generatedAt: string;
}): DecisionValueCalibrationV1 {
  const portfolioId = required(input.portfolioId, "portfolioId");
  const candidateId = required(input.portfolioItem?.candidate?.id, "portfolioItem.candidate.id");
  const comparisonId = required(input.scenarioComparison?.comparisonId, "scenarioComparison.comparisonId");
  if (input.scenarioComparison.candidateId !== candidateId || input.scenarioComparison.portfolioId !== portfolioId) {
    throw new DecisionValueCalibrationError("IDENTITY_MISMATCH", "Portfolio, candidate, and scenario identities must match");
  }
  const generatedAt = timestamp(input.generatedAt, "generatedAt");
  const observedAt = timestamp(input.referenceClass.observedAt, "referenceClass.observedAt");
  const ageDays = Math.max(0, (Date.parse(generatedAt) - Date.parse(observedAt)) / 86_400_000);
  const sampleSize = number(input.referenceClass.sampleSize, "referenceClass.sampleSize", 0, 1_000_000, true);
  const staleAfterDays = number(input.referenceClass.staleAfterDays, "referenceClass.staleAfterDays", 1, 3_650, true);
  const gross = centsRange(input.referenceClass.grossValueRangeCents, "referenceClass.grossValueRangeCents");
  const probabilities = probabilityRange(input.referenceClass.successProbability);
  const option = input.referenceClass.optionValueRangeCents == null ? { downside: 0, base: 0, upside: 0 } : centsRange(input.referenceClass.optionValueRangeCents, "referenceClass.optionValueRangeCents");
  const compounding = input.referenceClass.compoundingValueRangeCents == null ? { downside: 0, base: 0, upside: 0 } : centsRange(input.referenceClass.compoundingValueRangeCents, "referenceClass.compoundingValueRangeCents");
  const hourlyCost = centsRange(input.founderOpportunityCost.hourlyCostRangeCents, "founderOpportunityCost.hourlyCostRangeCents");
  const requestedHours = number(input.portfolioItem.candidate.resources.keeganHours, "candidate.resources.keeganHours", 0, 10_000);
  const deepWorkHours = number(input.founderOpportunityCost.deepWorkInterruptionHours, "founderOpportunityCost.deepWorkInterruptionHours", 0, 1_000);
  const switchCount = number(input.founderOpportunityCost.contextSwitchCount, "founderOpportunityCost.contextSwitchCount", 0, 10_000, true);
  const hoursPerSwitch = number(input.founderOpportunityCost.contextSwitchHours, "founderOpportunityCost.contextSwitchHours", 0, 24);
  const substitutions = (input.substitutions ?? []).map((item) => ({
    ...structuredClone(item),
    keeganHoursSaved: number(item.keeganHoursSaved, `${item.owner}.keeganHoursSaved`, 0, requestedHours),
    replacementHours: number(item.replacementHours, `${item.owner}.replacementHours`, 0, 100_000),
    evidenceRefs: refs(item.evidenceRefs, `${item.owner}.evidenceRefs`)
  }));
  if (new Set(substitutions.map((item) => item.owner)).size !== substitutions.length) throw new DecisionValueCalibrationError("DUPLICATE_SUBSTITUTION", "Each substitute owner may appear once");

  const uncertainty: string[] = [];
  const referenceWeak = WEAK_STATES.has(input.referenceClass.evidenceState) || sampleSize === 0;
  const founderWeak = WEAK_STATES.has(input.founderOpportunityCost.evidenceState);
  const stale = input.referenceClass.evidenceState === "STALE" || ageDays > staleAfterDays;
  const thin = input.referenceClass.evidenceState === "INFERRED" || sampleSize < MIN_REFERENCE_SAMPLE;
  if (referenceWeak) uncertainty.push("REFERENCE_CLASS_UNSUPPORTED");
  if (founderWeak) uncertainty.push("FOUNDER_COST_UNSUPPORTED");
  if (stale) uncertainty.push("REFERENCE_CLASS_STALE");
  if (thin) uncertainty.push("REFERENCE_CLASS_THIN");
  if (input.scenarioComparison.decisionMode === "RESEARCH_FIRST") uncertainty.push("SCENARIO_RESEARCH_REQUIRED");

  const validSubstitutions = substitutions
    .filter((item) => item.eligible && !WEAK_STATES.has(item.evidenceState) && item.keeganHoursSaved > 0)
    .sort((a, b) => b.keeganHoursSaved - a.keeganHoursSaved || a.replacementHours - b.replacementHours || a.owner.localeCompare(b.owner));
  const chosen = validSubstitutions[0] ?? null;
  const minimumApprovalHours = input.portfolioItem.candidate.approvalClass === "KEEGAN" ? Math.min(0.25, requestedHours) : 0;
  const remainingKeeganHours = Math.max(minimumApprovalHours, requestedHours - (chosen?.keeganHoursSaved ?? 0));
  const contextSwitchHours = switchCount * hoursPerSwitch;
  const displacedHours = remainingKeeganHours + deepWorkHours + contextSwitchHours;
  const founderCost = opportunityCost(displacedHours, hourlyCost);
  const decay = windowDecay(input.portfolioItem, generatedAt);
  const qualitative = input.scenarioComparison.alternatives.flatMap((alternative) => alternative.qualitativeEffects).map((effect) => structuredClone(effect));

  let calibrationState: ValueCalibrationStateV1 = "SUPPORTED";
  let expected: SupportedCentsRangeV1 | null = multiplyRange(gross, probabilities);
  let net: SupportedCentsRangeV1 | null;
  if (referenceWeak || founderWeak || input.scenarioComparison.decisionMode === "RESEARCH_FIRST") {
    calibrationState = referenceWeak || founderWeak ? "UNKNOWN" : "REFUSED";
    expected = null;
    net = null;
  } else {
    const decayAdjusted = add(scale(expected, decay), scale(option, decay), scale(compounding, decay));
    const uncertaintyFactor = (stale ? 0.5 : 0) + (thin ? 0.25 : 0);
    const supported = uncertaintyFactor > 0 ? widen(decayAdjusted, uncertaintyFactor) : decayAdjusted;
    calibrationState = uncertaintyFactor > 0 ? "WIDENED" : "SUPPORTED";
    net = subtractCost(supported, founderCost);
  }

  let disposition: ValueDispositionV1;
  if (net == null) disposition = "GATHER_EVIDENCE";
  else if (stale) disposition = "WAIT";
  else if (chosen && net.base >= 0) disposition = chosen.owner === "JEEVES" ? "SUBSTITUTE_JEEVES" : "SUBSTITUTE_IOANA";
  else if (net.upside < 0 && !positiveQualitative(qualitative)) disposition = "DECLINE";
  else if (net.base < 0 || decay === 0) disposition = "WAIT";
  else disposition = "PROCEED";

  const evidenceRefs = refs([
    ...input.portfolioItem.candidate.evidenceRefs,
    ...input.scenarioComparison.evidenceRefs,
    ...input.referenceClass.evidenceRefs,
    ...input.founderOpportunityCost.evidenceRefs,
    ...substitutions.flatMap((item) => item.evidenceRefs)
  ], "evidenceRefs");
  const identity = { portfolioId, candidateId, comparisonId, generatedAt, referenceClass: input.referenceClass, founderOpportunityCost: input.founderOpportunityCost, substitutions };
  return freeze({
    contractVersion: "DecisionValueCalibrationV1",
    policyVersion: DECISION_VALUE_CALIBRATION_POLICY_VERSION_V1,
    calibrationId: `decision_value_${createHash("sha256").update(JSON.stringify(canonical(identity))).digest("hex").slice(0, 20)}`,
    portfolioId, candidateId, comparisonId, generatedAt, calibrationState, disposition,
    monetary: {
      grossValueRangeCents: calibrationState === "UNKNOWN" ? null : gross,
      expectedValueRangeCents: expected,
      optionValueRangeCents: calibrationState === "UNKNOWN" ? null : option,
      compoundingValueRangeCents: calibrationState === "UNKNOWN" ? null : compounding,
      founderOpportunityCostRangeCents: founderCost,
      netSupportedValueRangeCents: net,
      windowDecayFactor: decay,
      qualitativeValueDollarized: false
    },
    qualitativeValue: qualitative,
    founderTime: {
      requestedKeeganHours: requestedHours,
      deepWorkInterruptionHours: deepWorkHours,
      contextSwitchHours,
      displacedKeeganHours: displacedHours,
      substitutedKeeganHours: chosen?.keeganHoursSaved ?? 0,
      remainingKeeganHours,
      substitutionOwner: chosen?.owner ?? null
    },
    uncertainty: { reasons: [...new Set(uncertainty)].sort(), referenceClassAgeDays: Math.round(ageDays * 100) / 100, permanentPreferenceInferred: false },
    evidenceRefs,
    actionAuthority: { analysisOnly: true, externalActionAuthorized: false, approvalClassPreserved: input.portfolioItem.candidate.approvalClass }
  });
}
