import type { CheckoutDiagnosticsViewModelV1 } from "./view-model-v1";

export const CHECKOUT_VALIDATION_PLAN_VERSION =
  "CHECKOUT_VALIDATION_PLAN_V1" as const;

export type CheckoutValidationMetricUnitV1 =
  | "RATE"
  | "COUNT"
  | "MILLISECONDS";

export type CheckoutValidationDirectionV1 = "INCREASE" | "DECREASE";

export type CheckoutValidationPlanInputV1 = {
  preparedAt: string;
  maxEvidenceAgeHours: number;
  diagnostics: CheckoutDiagnosticsViewModelV1;
  evidenceRefs: string[];
  plan: {
    planId: string;
    targetSurface: string;
    hypothesis: string;
    proposedChange: string;
    primaryMetric: {
      metricDefinitionId: string;
      unit: CheckoutValidationMetricUnitV1;
      successDirection: CheckoutValidationDirectionV1;
    };
    evaluationRange: {
      startDate: string;
      endDate: string;
    };
    minimumSample: number;
    stopRule: string;
    rollbackPlan: string;
  };
};

export type CheckoutValidationPlanV1 = {
  version: typeof CHECKOUT_VALIDATION_PLAN_VERSION;
  status: "READY_FOR_APPROVAL" | "BLOCKED" | "INVALID_INPUT";
  reasonCode:
    | "VALIDATION_PLAN_READY"
    | "DIAGNOSTICS_NOT_DECISION_GRADE"
    | "SOURCE_TRUTH_INCOMPLETE"
    | "NO_ACTIONABLE_DIAGNOSTIC_SIGNAL"
    | "EVIDENCE_FUTURE_DATED"
    | "EVIDENCE_STALE"
    | "MEASUREMENT_WINDOW_INVALID"
    | "VALIDATION_PLAN_INCOMPLETE"
    | "INVALID_INPUT";
  preparedAt: string;
  planId: string | null;
  observedSignal: Readonly<{
    classification: "OBSERVED_OR_DERIVED_SIGNAL";
    recommendationKind: "FRICTION_INVESTIGATION" | "ERROR_INVESTIGATION";
    summary: string;
    rationale: string;
    baselineRange: Readonly<{ startDate: string; endDate: string }>;
    evidenceAsOf: string;
    completeThrough: string;
  }> | null;
  hypothesis: Readonly<{
    classification: "HYPOTHESIS";
    statement: string;
  }> | null;
  proposedChange: string | null;
  targetSurface: string | null;
  measurement: Readonly<{
    design: "FIXED_BEFORE_AFTER_NON_CAUSAL";
    metricDefinitionId: string;
    unit: CheckoutValidationMetricUnitV1;
    successDirection: CheckoutValidationDirectionV1;
    baselineRange: Readonly<{ startDate: string; endDate: string }>;
    evaluationRange: Readonly<{ startDate: string; endDate: string }>;
    minimumSample: number;
  }> | null;
  stopRule: string | null;
  rollbackPlan: string | null;
  evidenceRefs: readonly string[];
  blockers: readonly string[];
  limitations: readonly string[];
  approval: Readonly<{
    required: true;
    state: "PENDING";
  }>;
  safeguards: Readonly<{
    websiteWritesAllowed: false;
    checkoutWritesAllowed: false;
    metaWritesAllowed: false;
    externalWritesAllowed: false;
    causalityEstablished: false;
    attributionEstablished: false;
    confidence: null;
    monetaryValue: null;
  }>;
};

const SOURCE_KEYS = ["META", "GA4", "FUNNELKIT", "WOO"] as const;
const METRIC_UNITS: readonly CheckoutValidationMetricUnitV1[] = [
  "RATE",
  "COUNT",
  "MILLISECONDS",
];
const DIRECTIONS: readonly CheckoutValidationDirectionV1[] = [
  "INCREASE",
  "DECREASE",
];
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 1_000;
const MAX_REF = 300;
const MAX_EVIDENCE_REFS = 20;

function validText(value: unknown, maxLength = MAX_TEXT): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength &&
    !/[\r\n]/.test(value)
  );
}

function instantMs(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateOnlyMs(value: unknown): number | null {
  if (typeof value !== "string" || !DATE_ONLY.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10) === value ? parsed : null;
}

function rangeDays(range: { startDate: string; endDate: string }): number | null {
  const start = dateOnlyMs(range.startDate);
  const end = dateOnlyMs(range.endDate);
  if (start === null || end === null || end < start) return null;
  return Math.floor((end - start) / DAY_MS) + 1;
}

function validEvidenceRefs(refs: unknown): refs is string[] {
  return (
    Array.isArray(refs) &&
    refs.length > 0 &&
    refs.length <= MAX_EVIDENCE_REFS &&
    refs.every((ref) => validText(ref, MAX_REF))
  );
}

function freezeResult(value: CheckoutValidationPlanV1): CheckoutValidationPlanV1 {
  if (value.observedSignal) {
    Object.freeze(value.observedSignal.baselineRange);
    Object.freeze(value.observedSignal);
  }
  if (value.hypothesis) Object.freeze(value.hypothesis);
  if (value.measurement) {
    Object.freeze(value.measurement.baselineRange);
    Object.freeze(value.measurement.evaluationRange);
    Object.freeze(value.measurement);
  }
  Object.freeze(value.evidenceRefs);
  Object.freeze(value.blockers);
  Object.freeze(value.limitations);
  Object.freeze(value.approval);
  Object.freeze(value.safeguards);
  return Object.freeze(value);
}

function result(
  input: CheckoutValidationPlanInputV1,
  status: CheckoutValidationPlanV1["status"],
  reasonCode: CheckoutValidationPlanV1["reasonCode"],
  blockers: string[],
  includePlan: boolean,
): CheckoutValidationPlanV1 {
  const diagnostics = input?.diagnostics;
  const recommendation = diagnostics?.recommendation;
  const observedSignal =
    includePlan &&
    recommendation &&
    recommendation.kind !== "DATA_QUALITY" &&
    diagnostics.asOf &&
    diagnostics.completeThrough
      ? {
          classification: "OBSERVED_OR_DERIVED_SIGNAL" as const,
          recommendationKind: recommendation.kind,
          summary: recommendation.summary,
          rationale: recommendation.rationale,
          baselineRange: { ...diagnostics.currentRange },
          evidenceAsOf: diagnostics.asOf,
          completeThrough: diagnostics.completeThrough,
        }
      : null;

  const measurement = includePlan
    ? {
        design: "FIXED_BEFORE_AFTER_NON_CAUSAL" as const,
        metricDefinitionId: input.plan.primaryMetric.metricDefinitionId,
        unit: input.plan.primaryMetric.unit,
        successDirection: input.plan.primaryMetric.successDirection,
        baselineRange: { ...diagnostics.currentRange },
        evaluationRange: { ...input.plan.evaluationRange },
        minimumSample: input.plan.minimumSample,
      }
    : null;

  return freezeResult({
    version: CHECKOUT_VALIDATION_PLAN_VERSION,
    status,
    reasonCode,
    preparedAt: input?.preparedAt ?? "UNKNOWN",
    planId: includePlan ? input.plan.planId : null,
    observedSignal,
    hypothesis: includePlan
      ? { classification: "HYPOTHESIS", statement: input.plan.hypothesis }
      : null,
    proposedChange: includePlan ? input.plan.proposedChange : null,
    targetSurface: includePlan ? input.plan.targetSurface : null,
    measurement,
    stopRule: includePlan ? input.plan.stopRule : null,
    rollbackPlan: includePlan ? input.plan.rollbackPlan : null,
    evidenceRefs: validEvidenceRefs(input?.evidenceRefs)
      ? [...new Set(input.evidenceRefs)].sort()
      : [],
    blockers: [...new Set(blockers)].sort(),
    limitations: [
      "This plan preserves the diagnostic signal as observed or deterministically derived evidence and preserves the proposed mechanism as a hypothesis.",
      "A fixed before/after comparison can measure association only. It does not establish causal lift, channel attribution, confidence, or monetary impact.",
      "Recommendation preparation does not authorize website, checkout, Meta, tracking, pricing, or other external writes.",
    ],
    approval: { required: true, state: "PENDING" },
    safeguards: {
      websiteWritesAllowed: false,
      checkoutWritesAllowed: false,
      metaWritesAllowed: false,
      externalWritesAllowed: false,
      causalityEstablished: false,
      attributionEstablished: false,
      confidence: null,
      monetaryValue: null,
    },
  });
}

function validPlanShape(input: CheckoutValidationPlanInputV1): boolean {
  const plan = input?.plan;
  return Boolean(
    plan &&
      validText(plan.planId, 120) &&
      validText(plan.targetSurface, 200) &&
      validText(plan.hypothesis) &&
      validText(plan.proposedChange) &&
      plan.primaryMetric &&
      validText(plan.primaryMetric.metricDefinitionId, 150) &&
      METRIC_UNITS.includes(plan.primaryMetric.unit) &&
      DIRECTIONS.includes(plan.primaryMetric.successDirection) &&
      Number.isInteger(plan.minimumSample) &&
      plan.minimumSample > 0 &&
      validText(plan.stopRule) &&
      validText(plan.rollbackPlan) &&
      validEvidenceRefs(input.evidenceRefs)
  );
}

export function prepareCheckoutValidationPlanV1(
  input: CheckoutValidationPlanInputV1,
): CheckoutValidationPlanV1 {
  const preparedAtMs = instantMs(input?.preparedAt);
  if (
    !input ||
    preparedAtMs === null ||
    typeof input.maxEvidenceAgeHours !== "number" ||
    !Number.isFinite(input.maxEvidenceAgeHours) ||
    input.maxEvidenceAgeHours <= 0 ||
    input.maxEvidenceAgeHours > 168 ||
    !input.diagnostics ||
    !validPlanShape(input)
  ) {
    return result(
      input,
      "INVALID_INPUT",
      "INVALID_INPUT",
      ["Validation-plan input is invalid, incomplete, or unbounded."],
      false,
    );
  }

  const diagnostics = input.diagnostics;
  if (
    diagnostics.state !== "READY" ||
    diagnostics.decisionGrade !== true ||
    diagnostics.integrityIssues.length > 0
  ) {
    return result(
      input,
      "BLOCKED",
      "DIAGNOSTICS_NOT_DECISION_GRADE",
      ["Checkout diagnostics must be READY, decision-grade, and free of integrity issues before a validation plan can be prepared."],
      false,
    );
  }

  if (SOURCE_KEYS.some((source) => diagnostics.sourceTruth[source] !== "COMPLETE")) {
    return result(
      input,
      "BLOCKED",
      "SOURCE_TRUTH_INCOMPLETE",
      ["Meta, GA4, FunnelKit, and Woo source truth must all be COMPLETE for the selected baseline range."],
      false,
    );
  }

  if (!diagnostics.recommendation || diagnostics.recommendation.kind === "DATA_QUALITY") {
    return result(
      input,
      "BLOCKED",
      "NO_ACTIONABLE_DIAGNOSTIC_SIGNAL",
      ["No decision-grade checkout friction or error investigation signal exists for the selected baseline range."],
      false,
    );
  }

  const evidenceAsOfMs = instantMs(diagnostics.asOf);
  const completeThroughMs = dateOnlyMs(diagnostics.completeThrough);
  const baselineEndMs = dateOnlyMs(diagnostics.currentRange.endDate);
  if (evidenceAsOfMs === null || completeThroughMs === null || baselineEndMs === null) {
    return result(
      input,
      "BLOCKED",
      "VALIDATION_PLAN_INCOMPLETE",
      ["Checkout evidence freshness or complete-through metadata is unavailable."],
      false,
    );
  }
  if (evidenceAsOfMs > preparedAtMs) {
    return result(
      input,
      "BLOCKED",
      "EVIDENCE_FUTURE_DATED",
      ["Checkout evidence is future-dated relative to validation-plan preparation."],
      false,
    );
  }
  if (completeThroughMs < baselineEndMs) {
    return result(
      input,
      "BLOCKED",
      "VALIDATION_PLAN_INCOMPLETE",
      ["Checkout evidence does not cover the full selected baseline range."],
      false,
    );
  }
  if (preparedAtMs - evidenceAsOfMs > input.maxEvidenceAgeHours * 60 * 60 * 1000) {
    return result(
      input,
      "BLOCKED",
      "EVIDENCE_STALE",
      ["Checkout evidence exceeds the caller-supplied freshness ceiling."],
      false,
    );
  }

  const baselineDays = rangeDays(diagnostics.currentRange);
  const evaluationDays = rangeDays(input.plan.evaluationRange);
  const evaluationStartMs = dateOnlyMs(input.plan.evaluationRange.startDate);
  if (
    baselineDays === null ||
    evaluationDays === null ||
    evaluationStartMs === null ||
    evaluationDays !== baselineDays ||
    evaluationStartMs <= baselineEndMs
  ) {
    return result(
      input,
      "BLOCKED",
      "MEASUREMENT_WINDOW_INVALID",
      ["The evaluation window must be a valid, non-overlapping range with the same duration as the fixed baseline window."],
      false,
    );
  }

  return result(
    input,
    "READY_FOR_APPROVAL",
    "VALIDATION_PLAN_READY",
    [],
    true,
  );
}
