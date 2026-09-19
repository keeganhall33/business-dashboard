import type {
  CheckoutValidationMetricUnitV1,
  CheckoutValidationPlanV1,
} from "./checkout-validation-plan-v1";

export const CHECKOUT_VALIDATION_OUTCOME_VERSION =
  "CHECKOUT_VALIDATION_OUTCOME_V1" as const;

export type CheckoutValidationOutcomeSourceTruthV1 = Readonly<{
  META: "COMPLETE" | "PARTIAL" | "MISSING" | "CONFLICTED";
  GA4: "COMPLETE" | "PARTIAL" | "MISSING" | "CONFLICTED";
  FUNNELKIT: "COMPLETE" | "PARTIAL" | "MISSING" | "CONFLICTED";
  WOO: "COMPLETE" | "PARTIAL" | "MISSING" | "CONFLICTED";
}>;

export type CheckoutValidationOutcomeObservationV1 = Readonly<{
  metricDefinitionId: string;
  unit: CheckoutValidationMetricUnitV1;
  range: Readonly<{ startDate: string; endDate: string }>;
  value: number;
  sampleSize: number;
  evidenceAsOf: string;
  completeThrough: string;
  sourceTruth: CheckoutValidationOutcomeSourceTruthV1;
  evidenceRefs: readonly string[];
}>;

export type CheckoutValidationOutcomeInputV1 = Readonly<{
  evaluatedAt: string;
  maxEvidenceAgeHours: number;
  plan: CheckoutValidationPlanV1;
  approval: Readonly<{
    planId: string;
    approvedAt: string;
    evidenceRef: string;
  }>;
  implementation: Readonly<{
    planId: string;
    appliedAt: string;
    targetSurface: string;
    evidenceRef: string;
  }>;
  baseline: CheckoutValidationOutcomeObservationV1;
  evaluation: CheckoutValidationOutcomeObservationV1;
  confounders: Readonly<{
    state: "UNKNOWN" | "NONE_OBSERVED" | "OBSERVED";
    notes: readonly string[];
    evidenceRefs: readonly string[];
  }>;
}>;

export type CheckoutValidationOutcomeV1 = Readonly<{
  version: typeof CHECKOUT_VALIDATION_OUTCOME_VERSION;
  status: "JUDGABLE" | "NOT_YET_JUDGABLE" | "BLOCKED" | "INVALID_INPUT";
  reasonCode:
    | "OUTCOME_JUDGABLE"
    | "INSUFFICIENT_SAMPLE"
    | "PLAN_NOT_READY"
    | "APPROVAL_EVIDENCE_INVALID"
    | "IMPLEMENTATION_EVIDENCE_INVALID"
    | "MEASUREMENT_IDENTITY_MISMATCH"
    | "MEASUREMENT_RANGE_MISMATCH"
    | "SOURCE_TRUTH_INCOMPLETE"
    | "EVIDENCE_FUTURE_DATED"
    | "EVIDENCE_STALE"
    | "MEASUREMENT_INCOMPLETE"
    | "INVALID_INPUT";
  planId: string | null;
  evaluatedAt: string | null;
  metric: Readonly<{
    metricDefinitionId: string;
    unit: CheckoutValidationMetricUnitV1;
    successDirection: "INCREASE" | "DECREASE";
    baselineValue: number;
    evaluationValue: number;
    absoluteChange: number;
    relativeChangePercent: number | null;
    baselineSampleSize: number;
    evaluationSampleSize: number;
    minimumSample: number;
    movement:
      | "ALIGNED_WITH_EXPECTED_DIRECTION"
      | "OPPOSED_TO_EXPECTED_DIRECTION"
      | "NO_CHANGE";
  }> | null;
  windows: Readonly<{
    baselineRange: Readonly<{ startDate: string; endDate: string }>;
    evaluationRange: Readonly<{ startDate: string; endDate: string }>;
  }> | null;
  evidenceRefs: readonly string[];
  blockers: readonly string[];
  confounders: Readonly<{
    state: "UNKNOWN" | "NONE_OBSERVED" | "OBSERVED";
    notes: readonly string[];
    evidenceRefs: readonly string[];
  }> | null;
  limitations: readonly string[];
  safeguards: Readonly<{
    directionalAssociationOnly: true;
    statisticalSignificanceEstablished: false;
    causalityEstablished: false;
    attributionEstablished: false;
    confidence: null;
    monetaryValue: null;
    websiteWritesAllowed: false;
    checkoutWritesAllowed: false;
    metaWritesAllowed: false;
    externalWritesAllowed: false;
  }>;
}>;

const SOURCE_KEYS = ["META", "GA4", "FUNNELKIT", "WOO"] as const;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 1_000;
const MAX_REF = 300;
const MAX_REFS_PER_OBSERVATION = 30;
const MAX_CONFOUNDER_NOTES = 20;
const DAY_MS = 24 * 60 * 60 * 1_000;

function canonicalInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function dateOnlyMs(value: unknown): number | null {
  if (typeof value !== "string" || !DATE_ONLY.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10) === value ? parsed : null;
}

function validText(value: unknown, maxLength = MAX_TEXT): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength &&
    !/[\r\n]/.test(value)
  );
}

function validRef(value: unknown): value is string {
  return (
    validText(value, MAX_REF) &&
    !/(?:bearer\s+|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)=?/i.test(
      value,
    )
  );
}

function validRefs(value: unknown, max: number): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= max &&
    value.every(validRef)
  );
}

function sameRange(
  left: Readonly<{ startDate: string; endDate: string }>,
  right: Readonly<{ startDate: string; endDate: string }>,
): boolean {
  return left.startDate === right.startDate && left.endDate === right.endDate;
}

function completeSourceTruth(value: CheckoutValidationOutcomeSourceTruthV1): boolean {
  return SOURCE_KEYS.every((source) => value?.[source] === "COMPLETE");
}

function validObservation(
  value: CheckoutValidationOutcomeObservationV1,
): boolean {
  if (!value || !validText(value.metricDefinitionId, 150)) return false;
  if (!["RATE", "COUNT", "MILLISECONDS"].includes(value.unit)) return false;
  if (
    !value.range ||
    dateOnlyMs(value.range.startDate) === null ||
    dateOnlyMs(value.range.endDate) === null ||
    (dateOnlyMs(value.range.endDate) as number) <
      (dateOnlyMs(value.range.startDate) as number)
  ) {
    return false;
  }
  if (!Number.isFinite(value.value) || value.value < 0) return false;
  if (!Number.isSafeInteger(value.sampleSize) || value.sampleSize < 0) return false;
  if (!canonicalInstant(value.evidenceAsOf)) return false;
  if (dateOnlyMs(value.completeThrough) === null) return false;
  if (!value.sourceTruth || !validRefs(value.evidenceRefs, MAX_REFS_PER_OBSERVATION)) {
    return false;
  }
  return SOURCE_KEYS.every((source) =>
    ["COMPLETE", "PARTIAL", "MISSING", "CONFLICTED"].includes(
      value.sourceTruth[source],
    ),
  );
}

function validConfounders(
  value: CheckoutValidationOutcomeInputV1["confounders"],
): boolean {
  if (!value || !["UNKNOWN", "NONE_OBSERVED", "OBSERVED"].includes(value.state)) {
    return false;
  }
  if (
    !Array.isArray(value.notes) ||
    value.notes.length > MAX_CONFOUNDER_NOTES ||
    !value.notes.every((note) => validText(note))
  ) {
    return false;
  }
  if (!Array.isArray(value.evidenceRefs) || value.evidenceRefs.length > MAX_REFS_PER_OBSERVATION) {
    return false;
  }
  if (!value.evidenceRefs.every(validRef)) return false;
  if (value.state === "OBSERVED") {
    return value.notes.length > 0 && value.evidenceRefs.length > 0;
  }
  return true;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

function baseResult(
  input: Partial<CheckoutValidationOutcomeInputV1>,
  status: CheckoutValidationOutcomeV1["status"],
  reasonCode: CheckoutValidationOutcomeV1["reasonCode"],
  blockers: readonly string[],
): CheckoutValidationOutcomeV1 {
  return deepFreeze({
    version: CHECKOUT_VALIDATION_OUTCOME_VERSION,
    status,
    reasonCode,
    planId: validText(input.plan?.planId, 120) ? input.plan.planId : null,
    evaluatedAt: canonicalInstant(input.evaluatedAt) ? input.evaluatedAt : null,
    metric: null,
    windows: null,
    evidenceRefs: [],
    blockers: [...new Set(blockers)].sort(),
    confounders: null,
    limitations: [
      "Before/after movement is a directional association only. It does not establish causality, attribution, confidence, statistical significance, or monetary impact.",
      "Confounder state is preserved exactly as supplied and is not inferred from metric movement.",
      "Outcome evaluation does not authorize website, checkout, Meta, pricing, tracking, or other external writes.",
    ],
    safeguards: {
      directionalAssociationOnly: true as const,
      statisticalSignificanceEstablished: false as const,
      causalityEstablished: false as const,
      attributionEstablished: false as const,
      confidence: null,
      monetaryValue: null,
      websiteWritesAllowed: false as const,
      checkoutWritesAllowed: false as const,
      metaWritesAllowed: false as const,
      externalWritesAllowed: false as const,
    },
  });
}

function validPlanForOutcome(plan: CheckoutValidationPlanV1): boolean {
  return Boolean(
    plan &&
      plan.version === "CHECKOUT_VALIDATION_PLAN_V1" &&
      plan.status === "READY_FOR_APPROVAL" &&
      plan.reasonCode === "VALIDATION_PLAN_READY" &&
      validText(plan.planId, 120) &&
      plan.measurement &&
      plan.observedSignal &&
      plan.hypothesis &&
      validText(plan.targetSurface, 200) &&
      plan.approval?.required === true &&
      plan.approval.state === "PENDING" &&
      plan.safeguards?.websiteWritesAllowed === false &&
      plan.safeguards?.checkoutWritesAllowed === false &&
      plan.safeguards?.metaWritesAllowed === false &&
      plan.safeguards?.externalWritesAllowed === false &&
      plan.safeguards?.causalityEstablished === false &&
      plan.safeguards?.attributionEstablished === false
  );
}

export function evaluateCheckoutValidationOutcomeV1(
  input: CheckoutValidationOutcomeInputV1,
): CheckoutValidationOutcomeV1 {
  const evaluatedAtMs = Date.parse(input?.evaluatedAt ?? "");
  if (
    !input ||
    !canonicalInstant(input.evaluatedAt) ||
    !Number.isFinite(evaluatedAtMs) ||
    !Number.isFinite(input.maxEvidenceAgeHours) ||
    input.maxEvidenceAgeHours <= 0 ||
    input.maxEvidenceAgeHours > 168 ||
    !validObservation(input.baseline) ||
    !validObservation(input.evaluation) ||
    !validConfounders(input.confounders)
  ) {
    return baseResult(
      input ?? {},
      "INVALID_INPUT",
      "INVALID_INPUT",
      ["Outcome input is invalid, incomplete, or unbounded."],
    );
  }

  const plan = input.plan;
  if (!validPlanForOutcome(plan)) {
    return baseResult(input, "BLOCKED", "PLAN_NOT_READY", [
      "The source validation plan must be decision-grade and READY_FOR_APPROVAL; outcome evidence cannot repair or bypass a blocked plan.",
    ]);
  }

  const measurement = plan.measurement!;
  const planId = plan.planId!;
  const approvalMs = Date.parse(input.approval?.approvedAt ?? "");
  const preparedAtMs = Date.parse(plan.preparedAt);
  if (
    !input.approval ||
    input.approval.planId !== planId ||
    !canonicalInstant(input.approval.approvedAt) ||
    !Number.isFinite(approvalMs) ||
    approvalMs < preparedAtMs ||
    approvalMs > evaluatedAtMs ||
    !validRef(input.approval.evidenceRef)
  ) {
    return baseResult(input, "BLOCKED", "APPROVAL_EVIDENCE_INVALID", [
      "Explicit approval evidence bound to this exact validation plan is required before an implemented change can be evaluated.",
    ]);
  }

  const appliedMs = Date.parse(input.implementation?.appliedAt ?? "");
  const evaluationStartMs = dateOnlyMs(measurement.evaluationRange.startDate)!;
  if (
    !input.implementation ||
    input.implementation.planId !== planId ||
    !canonicalInstant(input.implementation.appliedAt) ||
    !Number.isFinite(appliedMs) ||
    appliedMs < approvalMs ||
    appliedMs >= evaluationStartMs ||
    appliedMs > evaluatedAtMs ||
    input.implementation.targetSurface !== plan.targetSurface ||
    !validRef(input.implementation.evidenceRef)
  ) {
    return baseResult(input, "BLOCKED", "IMPLEMENTATION_EVIDENCE_INVALID", [
      "Implementation evidence must bind to the approved plan and target surface and precede the fixed evaluation window.",
    ]);
  }

  for (const observation of [input.baseline, input.evaluation]) {
    if (
      observation.metricDefinitionId !== measurement.metricDefinitionId ||
      observation.unit !== measurement.unit
    ) {
      return baseResult(input, "BLOCKED", "MEASUREMENT_IDENTITY_MISMATCH", [
        "Baseline and evaluation evidence must use the exact metric definition and unit declared by the validation plan.",
      ]);
    }
  }

  if (
    !sameRange(input.baseline.range, measurement.baselineRange) ||
    !sameRange(input.evaluation.range, measurement.evaluationRange)
  ) {
    return baseResult(input, "BLOCKED", "MEASUREMENT_RANGE_MISMATCH", [
      "Outcome evidence must match the validation plan's fixed baseline and evaluation windows exactly.",
    ]);
  }

  if (
    !completeSourceTruth(input.baseline.sourceTruth) ||
    !completeSourceTruth(input.evaluation.sourceTruth)
  ) {
    return baseResult(input, "BLOCKED", "SOURCE_TRUTH_INCOMPLETE", [
      "Meta, GA4, FunnelKit, and Woo source truth must all be COMPLETE for both fixed outcome windows.",
    ]);
  }

  const maxAgeMs = input.maxEvidenceAgeHours * 60 * 60 * 1_000;
  for (const observation of [input.baseline, input.evaluation]) {
    const asOfMs = Date.parse(observation.evidenceAsOf);
    const completeThroughMs = dateOnlyMs(observation.completeThrough)!;
    const rangeEndMs = dateOnlyMs(observation.range.endDate)!;
    if (asOfMs > evaluatedAtMs) {
      return baseResult(input, "BLOCKED", "EVIDENCE_FUTURE_DATED", [
        "Outcome evidence is future-dated relative to evaluation time.",
      ]);
    }
    if (evaluatedAtMs - asOfMs > maxAgeMs) {
      return baseResult(input, "BLOCKED", "EVIDENCE_STALE", [
        "Outcome evidence exceeds the caller-supplied freshness ceiling.",
      ]);
    }
    if (completeThroughMs < rangeEndMs) {
      return baseResult(input, "BLOCKED", "MEASUREMENT_INCOMPLETE", [
        "Outcome evidence does not cover its full fixed measurement window.",
      ]);
    }
  }

  const evidenceRefs = [
    ...plan.evidenceRefs,
    input.approval.evidenceRef,
    input.implementation.evidenceRef,
    ...input.baseline.evidenceRefs,
    ...input.evaluation.evidenceRefs,
    ...input.confounders.evidenceRefs,
  ];
  const dedupedEvidenceRefs = [...new Set(evidenceRefs)].sort();
  const confounders = {
    state: input.confounders.state,
    notes: [...input.confounders.notes],
    evidenceRefs: [...input.confounders.evidenceRefs],
  } as const;
  const windows = {
    baselineRange: { ...measurement.baselineRange },
    evaluationRange: { ...measurement.evaluationRange },
  } as const;

  if (
    input.baseline.sampleSize < measurement.minimumSample ||
    input.evaluation.sampleSize < measurement.minimumSample
  ) {
    const result = baseResult(input, "NOT_YET_JUDGABLE", "INSUFFICIENT_SAMPLE", [
      "Both fixed windows must satisfy the validation plan's explicit minimum sample before directional movement is judged.",
    ]);
    return deepFreeze({
      ...result,
      planId,
      evidenceRefs: dedupedEvidenceRefs,
      windows,
      confounders,
    });
  }

  const absoluteChange = input.evaluation.value - input.baseline.value;
  const relativeChangePercent =
    input.baseline.value === 0
      ? null
      : (absoluteChange / Math.abs(input.baseline.value)) * 100;
  const movement =
    absoluteChange === 0
      ? "NO_CHANGE"
      : measurement.successDirection === "INCREASE"
        ? absoluteChange > 0
          ? "ALIGNED_WITH_EXPECTED_DIRECTION"
          : "OPPOSED_TO_EXPECTED_DIRECTION"
        : absoluteChange < 0
          ? "ALIGNED_WITH_EXPECTED_DIRECTION"
          : "OPPOSED_TO_EXPECTED_DIRECTION";

  return deepFreeze({
    ...baseResult(input, "JUDGABLE", "OUTCOME_JUDGABLE", []),
    planId,
    metric: {
      metricDefinitionId: measurement.metricDefinitionId,
      unit: measurement.unit,
      successDirection: measurement.successDirection,
      baselineValue: input.baseline.value,
      evaluationValue: input.evaluation.value,
      absoluteChange,
      relativeChangePercent,
      baselineSampleSize: input.baseline.sampleSize,
      evaluationSampleSize: input.evaluation.sampleSize,
      minimumSample: measurement.minimumSample,
      movement,
    },
    windows,
    evidenceRefs: dedupedEvidenceRefs,
    confounders,
  });
}
