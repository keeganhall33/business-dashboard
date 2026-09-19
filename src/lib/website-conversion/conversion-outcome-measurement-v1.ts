import type {
  ObservedOutcomeV1,
  OutcomeAttributionClassV1,
  ResultVsPredictionV1,
} from "@/lib/learning-engine/decision-record-v1";

export const CONVERSION_OUTCOME_MEASUREMENT_VERSION_V1 =
  "ConversionOutcomeMeasurementV1" as const;

export type ConversionOutcomeTruthStateV1 =
  | "COMPLETE"
  | "PARTIAL"
  | "UNKNOWN"
  | "STALE"
  | "CONFLICTED"
  | "UNAVAILABLE";

export type ConversionOutcomeMeasurementStatusV1 =
  | "MEASURED"
  | "INSUFFICIENT_EVIDENCE"
  | "STALE"
  | "BLOCKED";

export type ConversionOutcomeMetricUnitV1 =
  | "COUNT"
  | "PERCENT"
  | "USD_CENTS"
  | "RATIO";

export type ConversionOutcomeWindowV1 = Readonly<{
  windowId: string;
  startDate: string;
  endDate: string;
  timeZone: "America/Los_Angeles";
  observedAt: string;
  truthState: ConversionOutcomeTruthStateV1;
  metricDefinitionId: string;
  unit: ConversionOutcomeMetricUnitV1;
  value: number | null;
  evidenceRefs: readonly string[];
}>;

export type ConversionOutcomePredictedRangeV1 = Readonly<{
  low: number | null;
  expected: number | null;
  high: number | null;
}>;

export type ConversionOutcomeMeasurementInputV1 = Readonly<{
  generatedAt: string;
  recommendationId: string;
  actionId: string;
  metricDefinitionId: string;
  unit: ConversionOutcomeMetricUnitV1;
  evaluationWindow: Readonly<{
    startDate: string;
    endDate: string;
  }>;
  predictedRange?: ConversionOutcomePredictedRangeV1 | null;
  baseline: ConversionOutcomeWindowV1;
  observed: ConversionOutcomeWindowV1;
  freshnessMaxAgeMs: number;
  confounders?: readonly string[];
}>;

export type ConversionOutcomeMeasurementV1 = Readonly<{
  contractVersion: typeof CONVERSION_OUTCOME_MEASUREMENT_VERSION_V1;
  status: ConversionOutcomeMeasurementStatusV1;
  generatedAt: string;
  recommendationId: string;
  actionId: string;
  metricDefinitionId: string;
  unit: ConversionOutcomeMetricUnitV1;
  evaluationWindow: Readonly<{
    startDate: string;
    endDate: string;
  }>;
  baseline: ConversionOutcomeWindowV1;
  observed: ConversionOutcomeWindowV1;
  delta: Readonly<{
    absolute: number | null;
    relative: number | null;
    direction: "INCREASE" | "DECREASE" | "NO_CHANGE" | "UNKNOWN";
  }>;
  resultVsPrediction: ResultVsPredictionV1;
  learningMeasurement: Readonly<{
    observedOutcome: ObservedOutcomeV1;
    attributionConfidence: "UNKNOWN";
    attributionClass: Extract<OutcomeAttributionClassV1, "NOT_ESTABLISHED">;
    resultVsPrediction: ResultVsPredictionV1;
  }>;
  confounders: readonly string[];
  reasonCodes: readonly string[];
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    internalReviewAllowed: true;
    learningHandoffAllowed: true;
    websiteMutationAllowed: false;
    trackingMutationAllowed: false;
    pricingMutationAllowed: false;
    metaWriteAllowed: false;
    approvalBypassAllowed: false;
    externalActionAllowed: false;
  }>;
  externalAccessPerformed: false;
  writesPerformed: false;
}>;

const MAX_FRESHNESS_AGE_MS = 30 * 24 * 60 * 60 * 1_000;
const PACIFIC_TIME_ZONE = "America/Los_Angeles" as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  internalReviewAllowed: true as const,
  learningHandoffAllowed: true as const,
  websiteMutationAllowed: false as const,
  trackingMutationAllowed: false as const,
  pricingMutationAllowed: false as const,
  metaWriteAllowed: false as const,
  approvalBypassAllowed: false as const,
  externalActionAllowed: false as const,
});

const LIMITATIONS = Object.freeze([
  "This contract reports a before/after observation only; it does not establish that the action caused the change.",
  "Revenue impact is not inferred from a conversion metric or behavioral change unless the measured metric itself is an authoritative revenue metric.",
  "Confounders are source-supplied observations; absence of listed confounders does not prove that none exist.",
  "Production mutations, Meta writes, pricing changes, tracking changes, and approval bypass remain outside this contract.",
] as const);

function nonEmpty(value: string, label: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${label} must be a non-empty string`);
  return normalized;
}

function canonicalTimestamp(value: string, label: string): string {
  const parsed = Date.parse(value);
  if (!value || !Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`${label} must be a canonical ISO timestamp`);
  }
  return value;
}

function businessDate(value: string, label: string): string {
  if (!DATE_RE.test(value)) throw new Error(`${label} must use YYYY-MM-DD`);
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} must be a valid calendar date`);
  }
  return value;
}

function dayNumber(value: string): number {
  return Date.parse(`${value}T00:00:00.000Z`) / (24 * 60 * 60 * 1_000);
}

function inclusiveDayCount(startDate: string, endDate: string): number {
  return dayNumber(endDate) - dayNumber(startDate) + 1;
}

function evidenceRefs(values: readonly string[], label: string): readonly string[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`${label} must contain at least one evidence reference`);
  }
  const normalized = values.map((value, index) => nonEmpty(value, `${label}[${index}]`));
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${label} must not contain duplicate evidence references`);
  }
  return Object.freeze([...normalized].sort((a, b) => a.localeCompare(b)));
}

function normalizeConfounders(values: readonly string[] | undefined): readonly string[] {
  if (!values) return Object.freeze([]);
  const normalized = values.map((value, index) => nonEmpty(value, `confounders[${index}]`));
  return Object.freeze([...new Set(normalized)].sort((a, b) => a.localeCompare(b)));
}

function validateFreshnessMaxAge(value: number): number {
  if (!Number.isFinite(value) || value <= 0 || value > MAX_FRESHNESS_AGE_MS) {
    throw new Error("freshnessMaxAgeMs must be finite, positive, and no greater than 30 days");
  }
  return value;
}

function normalizeWindow(window: ConversionOutcomeWindowV1, label: string): ConversionOutcomeWindowV1 {
  const startDate = businessDate(window.startDate, `${label}.startDate`);
  const endDate = businessDate(window.endDate, `${label}.endDate`);
  if (dayNumber(endDate) < dayNumber(startDate)) {
    throw new Error(`${label}.endDate cannot precede ${label}.startDate`);
  }
  const value = window.value;
  if (value !== null && !Number.isFinite(value)) {
    throw new Error(`${label}.value must be finite when present`);
  }
  if (window.truthState === "COMPLETE" && value === null) {
    throw new Error(`${label}.value is required when truthState is COMPLETE`);
  }
  return Object.freeze({
    windowId: nonEmpty(window.windowId, `${label}.windowId`),
    startDate,
    endDate,
    timeZone: window.timeZone,
    observedAt: canonicalTimestamp(window.observedAt, `${label}.observedAt`),
    truthState: window.truthState,
    metricDefinitionId: nonEmpty(window.metricDefinitionId, `${label}.metricDefinitionId`),
    unit: window.unit,
    value,
    evidenceRefs: evidenceRefs(window.evidenceRefs, `${label}.evidenceRefs`),
  });
}

function validatePredictedRange(
  predictedRange: ConversionOutcomePredictedRangeV1 | null | undefined,
): ConversionOutcomePredictedRangeV1 | null {
  if (!predictedRange) return null;
  for (const [key, value] of Object.entries(predictedRange)) {
    if (value !== null && !Number.isFinite(value)) {
      throw new Error(`predictedRange.${key} must be finite when present`);
    }
  }
  if (
    predictedRange.low !== null &&
    predictedRange.high !== null &&
    predictedRange.low > predictedRange.high
  ) {
    throw new Error("predictedRange.low cannot exceed predictedRange.high");
  }
  if (
    predictedRange.expected !== null &&
    predictedRange.low !== null &&
    predictedRange.expected < predictedRange.low
  ) {
    throw new Error("predictedRange.expected cannot be below predictedRange.low");
  }
  if (
    predictedRange.expected !== null &&
    predictedRange.high !== null &&
    predictedRange.expected > predictedRange.high
  ) {
    throw new Error("predictedRange.expected cannot exceed predictedRange.high");
  }
  return Object.freeze({ ...predictedRange });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function learningUnit(unit: ConversionOutcomeMetricUnitV1): ObservedOutcomeV1["unit"] {
  if (unit === "COUNT" || unit === "PERCENT" || unit === "USD_CENTS") return unit;
  return "UNKNOWN";
}

function resultVsPrediction(
  observedValue: number,
  predictedRange: ConversionOutcomePredictedRangeV1 | null,
): ResultVsPredictionV1 {
  if (!predictedRange || predictedRange.low === null || predictedRange.high === null) return "UNKNOWN";
  if (observedValue < predictedRange.low) return "MISSED_LOW";
  if (observedValue > predictedRange.high) return "MISSED_HIGH";
  return "WITHIN_RANGE";
}

function buildResult(input: {
  status: ConversionOutcomeMeasurementStatusV1;
  generatedAt: string;
  recommendationId: string;
  actionId: string;
  metricDefinitionId: string;
  unit: ConversionOutcomeMetricUnitV1;
  evaluationWindow: { startDate: string; endDate: string };
  baseline: ConversionOutcomeWindowV1;
  observed: ConversionOutcomeWindowV1;
  confounders: readonly string[];
  reasonCodes: readonly string[];
  absolute?: number | null;
  relative?: number | null;
  direction?: "INCREASE" | "DECREASE" | "NO_CHANGE" | "UNKNOWN";
  predictionResult?: ResultVsPredictionV1;
}): ConversionOutcomeMeasurementV1 {
  const measured = input.status === "MEASURED";
  const predictionResult = measured ? input.predictionResult ?? "UNKNOWN" : "UNKNOWN";
  const observedOutcome: ObservedOutcomeV1 = {
    metric: input.metricDefinitionId,
    value: measured ? input.observed.value : null,
    unit: learningUnit(input.unit),
    observed_at: measured ? input.observed.observedAt : null,
    evidence_refs: measured ? [...input.observed.evidenceRefs] : [],
    unknown_reason: measured ? null : input.reasonCodes.join(",") || "MEASUREMENT_NOT_ESTABLISHED",
  };

  return deepFreeze({
    contractVersion: CONVERSION_OUTCOME_MEASUREMENT_VERSION_V1,
    status: input.status,
    generatedAt: input.generatedAt,
    recommendationId: input.recommendationId,
    actionId: input.actionId,
    metricDefinitionId: input.metricDefinitionId,
    unit: input.unit,
    evaluationWindow: Object.freeze({ ...input.evaluationWindow }),
    baseline: input.baseline,
    observed: input.observed,
    delta: Object.freeze({
      absolute: measured ? input.absolute ?? null : null,
      relative: measured ? input.relative ?? null : null,
      direction: measured ? input.direction ?? "UNKNOWN" : "UNKNOWN",
    }),
    resultVsPrediction: predictionResult,
    learningMeasurement: Object.freeze({
      observedOutcome,
      attributionConfidence: "UNKNOWN" as const,
      attributionClass: "NOT_ESTABLISHED" as const,
      resultVsPrediction: predictionResult,
    }),
    confounders: input.confounders,
    reasonCodes: Object.freeze([...new Set(input.reasonCodes.filter(Boolean))].sort((a, b) => a.localeCompare(b))),
    limitations: LIMITATIONS,
    authority: AUTHORITY,
    externalAccessPerformed: false as const,
    writesPerformed: false as const,
  });
}

/**
 * Measures a fixed before/after conversion outcome using already-governed
 * evidence. This is intentionally not an attribution engine: the handoff is
 * always UNKNOWN / NOT_ESTABLISHED until a separate causal or attribution
 * process supplies evidence under its own governance.
 */
export function measureConversionOutcomeV1(
  input: ConversionOutcomeMeasurementInputV1,
): ConversionOutcomeMeasurementV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("input must be an object");
  }

  const generatedAt = canonicalTimestamp(input.generatedAt, "generatedAt");
  const generatedAtMs = Date.parse(generatedAt);
  const recommendationId = nonEmpty(input.recommendationId, "recommendationId");
  const actionId = nonEmpty(input.actionId, "actionId");
  const metricDefinitionId = nonEmpty(input.metricDefinitionId, "metricDefinitionId");
  const evaluationWindow = Object.freeze({
    startDate: businessDate(input.evaluationWindow.startDate, "evaluationWindow.startDate"),
    endDate: businessDate(input.evaluationWindow.endDate, "evaluationWindow.endDate"),
  });
  if (dayNumber(evaluationWindow.endDate) < dayNumber(evaluationWindow.startDate)) {
    throw new Error("evaluationWindow.endDate cannot precede evaluationWindow.startDate");
  }

  const baseline = normalizeWindow(input.baseline, "baseline");
  const observed = normalizeWindow(input.observed, "observed");
  const predictedRange = validatePredictedRange(input.predictedRange);
  const freshnessMaxAgeMs = validateFreshnessMaxAge(input.freshnessMaxAgeMs);
  const confounders = normalizeConfounders(input.confounders);

  const base = {
    generatedAt,
    recommendationId,
    actionId,
    metricDefinitionId,
    unit: input.unit,
    evaluationWindow,
    baseline,
    observed,
    confounders,
  };

  if (baseline.timeZone !== PACIFIC_TIME_ZONE || observed.timeZone !== PACIFIC_TIME_ZONE) {
    return buildResult({ ...base, status: "BLOCKED", reasonCodes: ["TIME_ZONE_MISMATCH"] });
  }

  if (
    baseline.metricDefinitionId !== metricDefinitionId ||
    observed.metricDefinitionId !== metricDefinitionId
  ) {
    return buildResult({ ...base, status: "BLOCKED", reasonCodes: ["METRIC_DEFINITION_MISMATCH"] });
  }

  if (baseline.unit !== input.unit || observed.unit !== input.unit) {
    return buildResult({ ...base, status: "BLOCKED", reasonCodes: ["METRIC_UNIT_MISMATCH"] });
  }

  if (
    observed.startDate !== evaluationWindow.startDate ||
    observed.endDate !== evaluationWindow.endDate
  ) {
    return buildResult({ ...base, status: "BLOCKED", reasonCodes: ["EVALUATION_WINDOW_MISMATCH"] });
  }

  if (dayNumber(baseline.endDate) >= dayNumber(observed.startDate)) {
    return buildResult({ ...base, status: "BLOCKED", reasonCodes: ["MEASUREMENT_WINDOWS_OVERLAP"] });
  }

  if (
    inclusiveDayCount(baseline.startDate, baseline.endDate) !==
    inclusiveDayCount(observed.startDate, observed.endDate)
  ) {
    return buildResult({ ...base, status: "BLOCKED", reasonCodes: ["MEASUREMENT_WINDOW_DURATION_MISMATCH"] });
  }

  const baselineObservedAtMs = Date.parse(baseline.observedAt);
  const observedObservedAtMs = Date.parse(observed.observedAt);
  if (baselineObservedAtMs > generatedAtMs || observedObservedAtMs > generatedAtMs) {
    return buildResult({ ...base, status: "BLOCKED", reasonCodes: ["EVIDENCE_FUTURE_DATED"] });
  }

  if (baseline.truthState === "CONFLICTED" || observed.truthState === "CONFLICTED") {
    return buildResult({ ...base, status: "BLOCKED", reasonCodes: ["SOURCE_EVIDENCE_CONFLICTED"] });
  }

  if (
    baseline.truthState === "STALE" ||
    observed.truthState === "STALE" ||
    generatedAtMs - baselineObservedAtMs > freshnessMaxAgeMs ||
    generatedAtMs - observedObservedAtMs > freshnessMaxAgeMs
  ) {
    return buildResult({ ...base, status: "STALE", reasonCodes: ["SOURCE_EVIDENCE_STALE"] });
  }

  const incompleteStates: ConversionOutcomeTruthStateV1[] = ["PARTIAL", "UNKNOWN", "UNAVAILABLE"];
  if (
    incompleteStates.includes(baseline.truthState) ||
    incompleteStates.includes(observed.truthState) ||
    baseline.value === null ||
    observed.value === null
  ) {
    return buildResult({ ...base, status: "INSUFFICIENT_EVIDENCE", reasonCodes: ["COMPLETE_COMPARABLE_EVIDENCE_REQUIRED"] });
  }

  const absolute = observed.value - baseline.value;
  const relative = baseline.value === 0 ? null : absolute / Math.abs(baseline.value);
  const direction = absolute > 0 ? "INCREASE" : absolute < 0 ? "DECREASE" : "NO_CHANGE";
  const predictionResult = resultVsPrediction(observed.value, predictedRange);

  return buildResult({
    ...base,
    status: "MEASURED",
    reasonCodes: [
      predictionResult === "UNKNOWN"
        ? "FIXED_WINDOW_OUTCOME_MEASURED_PREDICTION_NOT_ESTABLISHED"
        : "FIXED_WINDOW_OUTCOME_MEASURED",
    ],
    absolute,
    relative,
    direction,
    predictionResult,
  });
}
