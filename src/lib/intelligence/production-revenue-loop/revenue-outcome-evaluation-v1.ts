import type { RevenueTruthStateV1 } from "./decision-packet-v1";

export const REVENUE_OUTCOME_EVALUATION_VERSION = "REVENUE_OUTCOME_EVALUATION_V1" as const;

export type RevenueOutcomeSourceV1 = "WOO" | "GA4" | "META" | "CLARITY" | "FUNNELKIT";
export type RevenueOutcomeEvaluationStatusV1 =
  | "MEASURED"
  | "MEASURED_WITH_CONFOUNDERS"
  | "INSUFFICIENT_EVIDENCE"
  | "CONFLICTED"
  | "INVALID_INPUT";

export type RevenueOutcomeCriterionStatusV1 =
  | "MET"
  | "NOT_MET"
  | "NOT_EVALUATED";

export interface RevenueOutcomeDateRangeV1 {
  startDate: string;
  endDate: string;
}

export interface RevenueOutcomeObservationV1 {
  source: RevenueOutcomeSourceV1;
  metric: string;
  unit: string;
  value: number | null;
  truthState: RevenueTruthStateV1;
  range: RevenueOutcomeDateRangeV1;
  completeThrough: string | null;
  observedAt: string;
  evidenceRefs: string[];
}

export interface RevenueOutcomeConfounderV1 {
  label: string;
  truthState: RevenueTruthStateV1;
  observedAt: string;
  evidenceRefs: string[];
}

export interface RevenueOutcomeSuccessRuleV1 {
  source: RevenueOutcomeSourceV1;
  metric: string;
  unit: string;
  comparator:
    | "AT_LEAST_ABSOLUTE_CHANGE"
    | "AT_MOST_ABSOLUTE_CHANGE"
    | "AT_LEAST_RELATIVE_CHANGE"
    | "AT_MOST_RELATIVE_CHANGE";
  threshold: number;
  evidenceRef: string;
}

export interface RevenueOutcomeEvaluationInputV1 {
  decisionRef: string;
  implementationRef: string;
  implementedAt: string;
  evaluatedAt: string;
  implementationEvidenceRefs: string[];
  baseline: RevenueOutcomeObservationV1[];
  outcome: RevenueOutcomeObservationV1[];
  successRule?: RevenueOutcomeSuccessRuleV1 | null;
  confounders?: RevenueOutcomeConfounderV1[];
}

export interface RevenueOutcomeComparisonV1 {
  source: RevenueOutcomeSourceV1;
  metric: string;
  unit: string;
  baselineRange: Readonly<RevenueOutcomeDateRangeV1>;
  outcomeRange: Readonly<RevenueOutcomeDateRangeV1>;
  baselineValue: number;
  outcomeValue: number;
  absoluteChange: number;
  relativeChangeRatio: number | null;
  direction: "UP" | "DOWN" | "FLAT";
  evidenceRefs: readonly string[];
}

export interface RevenueOutcomeEvaluationV1 {
  version: typeof REVENUE_OUTCOME_EVALUATION_VERSION;
  evaluationId: string;
  status: RevenueOutcomeEvaluationStatusV1;
  decisionRef: string;
  implementationRef: string;
  implementedAt: string;
  evaluatedAt: string;
  comparisons: readonly Readonly<RevenueOutcomeComparisonV1>[];
  criterion: {
    status: RevenueOutcomeCriterionStatusV1;
    rule: Readonly<RevenueOutcomeSuccessRuleV1> | null;
    observedValue: number | null;
    evidenceRef: string | null;
  };
  confounders: readonly Readonly<RevenueOutcomeConfounderV1>[];
  causalAttribution: "NOT_ESTABLISHED";
  interpretation: string;
  reasonCodes: readonly string[];
  evidenceRefs: readonly string[];
  authority: {
    externalMutationAllowed: false;
    metaWriteAllowed: false;
    actionExecutionAllowed: false;
    approvalBypassAllowed: false;
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const SOURCES = new Set<RevenueOutcomeSourceV1>(["WOO", "GA4", "META", "CLARITY", "FUNNELKIT"]);
const TRUTH_STATES = new Set<RevenueTruthStateV1>(["CURRENT", "PARTIAL", "STALE", "UNKNOWN", "CONFLICTED"]);
const MAX_OBSERVATIONS_PER_SIDE = 50;
const MAX_CONFOUNDERS = 20;
const MAX_EVIDENCE_REFS = 20;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function validText(value: unknown, max = 240): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function validInstant(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function dateOnlyMs(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const milliseconds = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(milliseconds)) return null;
  return new Date(milliseconds).toISOString().slice(0, 10) === value ? milliseconds : null;
}

function validRange(range: unknown): range is RevenueOutcomeDateRangeV1 {
  if (!range || typeof range !== "object" || Array.isArray(range)) return false;
  const candidate = range as Partial<RevenueOutcomeDateRangeV1>;
  const start = dateOnlyMs(candidate.startDate);
  const end = dateOnlyMs(candidate.endDate);
  return start !== null && end !== null && end >= start;
}

function rangeDays(range: RevenueOutcomeDateRangeV1): number {
  return ((dateOnlyMs(range.endDate) as number) - (dateOnlyMs(range.startDate) as number)) / DAY_MS + 1;
}

function validEvidenceRefs(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length > 0
    && value.length <= MAX_EVIDENCE_REFS
    && value.every((ref) => validText(ref, 240));
}

function observationKey(observation: RevenueOutcomeObservationV1): string {
  return `${observation.source}\u0000${observation.metric}\u0000${observation.unit}`;
}

function validObservation(value: unknown, evaluatedAtMs: number): value is RevenueOutcomeObservationV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const observation = value as Partial<RevenueOutcomeObservationV1>;
  if (!SOURCES.has(observation.source as RevenueOutcomeSourceV1)) return false;
  if (!validText(observation.metric, 120) || !validText(observation.unit, 80)) return false;
  if (observation.value !== null && !(typeof observation.value === "number" && Number.isFinite(observation.value))) return false;
  if (!TRUTH_STATES.has(observation.truthState as RevenueTruthStateV1)) return false;
  if (!validRange(observation.range)) return false;
  if (observation.completeThrough !== null && dateOnlyMs(observation.completeThrough) === null) return false;
  if (!validInstant(observation.observedAt) || Date.parse(observation.observedAt) > evaluatedAtMs) return false;
  return validEvidenceRefs(observation.evidenceRefs);
}

function validConfounder(value: unknown, evaluatedAtMs: number): value is RevenueOutcomeConfounderV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const confounder = value as Partial<RevenueOutcomeConfounderV1>;
  return Boolean(
    validText(confounder.label, 240)
    && TRUTH_STATES.has(confounder.truthState as RevenueTruthStateV1)
    && validInstant(confounder.observedAt)
    && Date.parse(confounder.observedAt as string) <= evaluatedAtMs
    && validEvidenceRefs(confounder.evidenceRefs),
  );
}

function validSuccessRule(value: unknown): value is RevenueOutcomeSuccessRuleV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const rule = value as Partial<RevenueOutcomeSuccessRuleV1>;
  return Boolean(
    SOURCES.has(rule.source as RevenueOutcomeSourceV1)
    && validText(rule.metric, 120)
    && validText(rule.unit, 80)
    && [
      "AT_LEAST_ABSOLUTE_CHANGE",
      "AT_MOST_ABSOLUTE_CHANGE",
      "AT_LEAST_RELATIVE_CHANGE",
      "AT_MOST_RELATIVE_CHANGE",
    ].includes(rule.comparator as string)
    && typeof rule.threshold === "number"
    && Number.isFinite(rule.threshold)
    && validText(rule.evidenceRef, 240),
  );
}

function duplicateKeys(observations: RevenueOutcomeObservationV1[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const observation of observations) {
    const key = observationKey(observation);
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return [...duplicates].sort();
}

function stableId(input: RevenueOutcomeEvaluationInputV1): string {
  const value = `${input.decisionRef}:${input.implementationRef}:${input.implementedAt}:${input.evaluatedAt}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `revenue-outcome:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function baseResult(
  input: RevenueOutcomeEvaluationInputV1,
  status: RevenueOutcomeEvaluationStatusV1,
  reasonCodes: string[],
  interpretation: string,
  comparisons: RevenueOutcomeComparisonV1[] = [],
  criterion: RevenueOutcomeEvaluationV1["criterion"] = {
    status: "NOT_EVALUATED",
    rule: null,
    observedValue: null,
    evidenceRef: null,
  },
): RevenueOutcomeEvaluationV1 {
  const confounders = Array.isArray(input.confounders)
    ? input.confounders.map((item) => ({ ...item, evidenceRefs: [...item.evidenceRefs] }))
    : [];
  const evidenceRefs = [
    ...(Array.isArray(input.implementationEvidenceRefs) ? input.implementationEvidenceRefs : []),
    ...comparisons.flatMap((item) => item.evidenceRefs),
    ...confounders.flatMap((item) => item.evidenceRefs),
    ...(criterion.evidenceRef ? [criterion.evidenceRef] : []),
  ].filter((ref): ref is string => validText(ref, 240));

  return deepFreeze({
    version: REVENUE_OUTCOME_EVALUATION_VERSION,
    evaluationId: stableId(input),
    status,
    decisionRef: input.decisionRef,
    implementationRef: input.implementationRef,
    implementedAt: input.implementedAt,
    evaluatedAt: input.evaluatedAt,
    comparisons,
    criterion,
    confounders,
    causalAttribution: "NOT_ESTABLISHED",
    interpretation,
    reasonCodes: [...new Set(reasonCodes)],
    evidenceRefs: [...new Set(evidenceRefs)].sort(),
    authority: {
      externalMutationAllowed: false,
      metaWriteAllowed: false,
      actionExecutionAllowed: false,
      approvalBypassAllowed: false,
    },
  });
}

function evaluateCriterion(
  rule: RevenueOutcomeSuccessRuleV1 | null | undefined,
  comparisons: RevenueOutcomeComparisonV1[],
): RevenueOutcomeEvaluationV1["criterion"] {
  if (!rule) {
    return { status: "NOT_EVALUATED", rule: null, observedValue: null, evidenceRef: null };
  }
  const key = `${rule.source}\u0000${rule.metric}\u0000${rule.unit}`;
  const comparison = comparisons.find((item) => `${item.source}\u0000${item.metric}\u0000${item.unit}` === key);
  if (!comparison) {
    return { status: "NOT_EVALUATED", rule: { ...rule }, observedValue: null, evidenceRef: rule.evidenceRef };
  }

  const relative = comparison.relativeChangeRatio;
  let observedValue: number | null = null;
  let met = false;
  if (rule.comparator === "AT_LEAST_ABSOLUTE_CHANGE") {
    observedValue = comparison.absoluteChange;
    met = observedValue >= rule.threshold;
  } else if (rule.comparator === "AT_MOST_ABSOLUTE_CHANGE") {
    observedValue = comparison.absoluteChange;
    met = observedValue <= rule.threshold;
  } else if (relative !== null && rule.comparator === "AT_LEAST_RELATIVE_CHANGE") {
    observedValue = relative;
    met = observedValue >= rule.threshold;
  } else if (relative !== null && rule.comparator === "AT_MOST_RELATIVE_CHANGE") {
    observedValue = relative;
    met = observedValue <= rule.threshold;
  } else {
    return { status: "NOT_EVALUATED", rule: { ...rule }, observedValue: null, evidenceRef: rule.evidenceRef };
  }

  return {
    status: met ? "MET" : "NOT_MET",
    rule: { ...rule },
    observedValue,
    evidenceRef: rule.evidenceRef,
  };
}

/**
 * Compares directly observed pre/post revenue and behavior metrics after an
 * explicitly evidenced implementation. It measures arithmetic change only.
 * It never claims the implementation caused the change and grants no action
 * authority.
 */
export function evaluateRevenueOutcomeV1(input: RevenueOutcomeEvaluationInputV1): RevenueOutcomeEvaluationV1 {
  const evaluatedAtMs = Date.parse(input?.evaluatedAt ?? "");
  const implementedAtMs = Date.parse(input?.implementedAt ?? "");
  const commonValid = Boolean(
    input
    && validText(input.decisionRef)
    && validText(input.implementationRef)
    && Number.isFinite(evaluatedAtMs)
    && Number.isFinite(implementedAtMs)
    && implementedAtMs <= evaluatedAtMs
    && validEvidenceRefs(input.implementationEvidenceRefs)
    && Array.isArray(input.baseline)
    && input.baseline.length > 0
    && input.baseline.length <= MAX_OBSERVATIONS_PER_SIDE
    && Array.isArray(input.outcome)
    && input.outcome.length > 0
    && input.outcome.length <= MAX_OBSERVATIONS_PER_SIDE
    && (input.successRule === undefined || input.successRule === null || validSuccessRule(input.successRule))
    && (input.confounders === undefined
      || (Array.isArray(input.confounders)
        && input.confounders.length <= MAX_CONFOUNDERS
        && input.confounders.every((item) => validConfounder(item, evaluatedAtMs))))
  );

  if (!commonValid) {
    return baseResult(input, "INVALID_INPUT", ["INVALID_INPUT"], "Outcome evaluation input is invalid or exceeds bounded limits.");
  }

  if (!input.baseline.every((item) => validObservation(item, evaluatedAtMs))
    || !input.outcome.every((item) => validObservation(item, evaluatedAtMs))) {
    return baseResult(input, "INVALID_INPUT", ["INVALID_OBSERVATION"], "One or more outcome observations are malformed or future-dated.");
  }

  if (duplicateKeys(input.baseline).length > 0 || duplicateKeys(input.outcome).length > 0) {
    return baseResult(input, "CONFLICTED", ["DUPLICATE_METRIC_OBSERVATION"], "Competing observations exist for the same source, metric, and unit; reconcile them before measuring the outcome.");
  }

  if ([...input.baseline, ...input.outcome].some((item) => item.truthState === "CONFLICTED")) {
    return baseResult(input, "CONFLICTED", ["SOURCE_EVIDENCE_CONFLICTED"], "Conflicted source evidence cannot support measured outcome learning.");
  }

  const incomplete = [...input.baseline, ...input.outcome].filter((item) => item.truthState !== "CURRENT");
  if (incomplete.length > 0) {
    return baseResult(input, "INSUFFICIENT_EVIDENCE", ["SOURCE_EVIDENCE_NOT_CURRENT"], "Partial, stale, unknown, or otherwise non-current evidence remains explicit and cannot become a measured outcome.");
  }

  const baselineByKey = new Map(input.baseline.map((item) => [observationKey(item), item]));
  const outcomeByKey = new Map(input.outcome.map((item) => [observationKey(item), item]));
  const allKeys = [...new Set([...baselineByKey.keys(), ...outcomeByKey.keys()])].sort();
  if (allKeys.some((key) => !baselineByKey.has(key) || !outcomeByKey.has(key))) {
    return baseResult(input, "INSUFFICIENT_EVIDENCE", ["METRIC_PAIR_MISSING"], "Baseline and outcome evidence must contain the same source, metric, and unit pairs.");
  }

  const implementationDateMs = dateOnlyMs(new Date(implementedAtMs).toISOString().slice(0, 10)) as number;
  const comparisons: RevenueOutcomeComparisonV1[] = [];
  for (const key of allKeys) {
    const baseline = baselineByKey.get(key) as RevenueOutcomeObservationV1;
    const outcome = outcomeByKey.get(key) as RevenueOutcomeObservationV1;
    if (baseline.value === null || outcome.value === null) {
      return baseResult(input, "INSUFFICIENT_EVIDENCE", ["METRIC_VALUE_UNKNOWN"], "Unknown metric values remain unknown and cannot be converted to zero.");
    }
    const baselineEnd = dateOnlyMs(baseline.range.endDate) as number;
    const outcomeStart = dateOnlyMs(outcome.range.startDate) as number;
    if (baselineEnd >= implementationDateMs || outcomeStart < implementationDateMs) {
      return baseResult(input, "CONFLICTED", ["IMPLEMENTATION_WINDOW_OVERLAP"], "Baseline must end before implementation and outcome measurement must begin on or after implementation.");
    }
    if (rangeDays(baseline.range) !== rangeDays(outcome.range)) {
      return baseResult(input, "CONFLICTED", ["COMPARISON_WINDOW_LENGTH_MISMATCH"], "Baseline and outcome windows must have equal duration for direct comparison.");
    }
    const baselineComplete = dateOnlyMs(baseline.completeThrough);
    const outcomeComplete = dateOnlyMs(outcome.completeThrough);
    if (baselineComplete === null || outcomeComplete === null
      || baselineComplete < (dateOnlyMs(baseline.range.endDate) as number)
      || outcomeComplete < (dateOnlyMs(outcome.range.endDate) as number)) {
      return baseResult(input, "INSUFFICIENT_EVIDENCE", ["COVERAGE_INCOMPLETE"], "Source coverage must be complete through each measurement window before outcome learning.");
    }

    const absoluteChange = outcome.value - baseline.value;
    const relativeChangeRatio = baseline.value === 0 ? null : absoluteChange / Math.abs(baseline.value);
    comparisons.push({
      source: baseline.source,
      metric: baseline.metric,
      unit: baseline.unit,
      baselineRange: { ...baseline.range },
      outcomeRange: { ...outcome.range },
      baselineValue: baseline.value,
      outcomeValue: outcome.value,
      absoluteChange,
      relativeChangeRatio,
      direction: absoluteChange > 0 ? "UP" : absoluteChange < 0 ? "DOWN" : "FLAT",
      evidenceRefs: [...new Set([...baseline.evidenceRefs, ...outcome.evidenceRefs])].sort(),
    });
  }

  const criterion = evaluateCriterion(input.successRule, comparisons);
  const supportedConfounders = (input.confounders ?? []).filter((item) => item.truthState === "CURRENT");
  const status: RevenueOutcomeEvaluationStatusV1 = supportedConfounders.length > 0
    ? "MEASURED_WITH_CONFOUNDERS"
    : "MEASURED";
  const reasonCodes = ["DIRECT_PRE_POST_CHANGE_MEASURED"];
  if (supportedConfounders.length > 0) reasonCodes.push("EXPLICIT_CONFOUNDERS_PRESENT");
  if (criterion.status === "MET") reasonCodes.push("PREDECLARED_CRITERION_MET");
  if (criterion.status === "NOT_MET") reasonCodes.push("PREDECLARED_CRITERION_NOT_MET");
  if (input.successRule && criterion.status === "NOT_EVALUATED") reasonCodes.push("PREDECLARED_CRITERION_NOT_EVALUABLE");

  return baseResult(
    input,
    status,
    reasonCodes,
    supportedConfounders.length > 0
      ? "Observed changes are measurable, but explicit confounders are present. This is not causal attribution."
      : "Observed changes are measurable as pre/post arithmetic only. This is not causal attribution.",
    comparisons,
    criterion,
  );
}
