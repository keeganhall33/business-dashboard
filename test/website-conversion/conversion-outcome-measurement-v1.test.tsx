import assert from "node:assert/strict";
import { test } from "node:test";

import {
  measureConversionOutcomeV1,
  type ConversionOutcomeMeasurementInputV1,
  type ConversionOutcomeWindowV1,
} from "../../src/lib/website-conversion/conversion-outcome-measurement-v1";

const GENERATED_AT = "2026-09-19T05:30:00.000Z";
const OBSERVED_AT = "2026-09-19T05:00:00.000Z";

function window(
  overrides: Partial<ConversionOutcomeWindowV1> = {},
): ConversionOutcomeWindowV1 {
  return {
    windowId: "baseline-window",
    startDate: "2026-09-04",
    endDate: "2026-09-10",
    timeZone: "America/Los_Angeles",
    observedAt: OBSERVED_AT,
    truthState: "COMPLETE",
    metricDefinitionId: "checkout_conversion_rate_v1",
    unit: "PERCENT",
    value: 2,
    evidenceRefs: ["woo:orders:baseline", "ga4:checkout:baseline"],
    ...overrides,
  };
}

function input(
  overrides: Partial<ConversionOutcomeMeasurementInputV1> = {},
): ConversionOutcomeMeasurementInputV1 {
  return {
    generatedAt: GENERATED_AT,
    recommendationId: "recommendation-checkout-friction-001",
    actionId: "action-checkout-test-001",
    metricDefinitionId: "checkout_conversion_rate_v1",
    unit: "PERCENT",
    evaluationWindow: { startDate: "2026-09-11", endDate: "2026-09-17" },
    predictedRange: { low: 2.2, expected: 2.5, high: 2.8 },
    baseline: window(),
    observed: window({
      windowId: "observed-window",
      startDate: "2026-09-11",
      endDate: "2026-09-17",
      value: 2.5,
      evidenceRefs: ["woo:orders:observed", "ga4:checkout:observed"],
    }),
    freshnessMaxAgeMs: 24 * 60 * 60 * 1_000,
    confounders: ["Promotion cadence changed during the evaluation window."],
    ...overrides,
  };
}

test("measures equal fixed windows without upgrading the observation to causal attribution", () => {
  const result = measureConversionOutcomeV1(input());

  assert.equal(result.status, "MEASURED");
  assert.equal(result.delta.absolute, 0.5);
  assert.equal(result.delta.relative, 0.25);
  assert.equal(result.delta.direction, "INCREASE");
  assert.equal(result.resultVsPrediction, "WITHIN_RANGE");
  assert.equal(result.learningMeasurement.observedOutcome.value, 2.5);
  assert.equal(result.learningMeasurement.observedOutcome.unit, "PERCENT");
  assert.equal(result.learningMeasurement.attributionConfidence, "UNKNOWN");
  assert.equal(result.learningMeasurement.attributionClass, "NOT_ESTABLISHED");
  assert.equal(result.authority.websiteMutationAllowed, false);
  assert.equal(result.authority.trackingMutationAllowed, false);
  assert.equal(result.authority.pricingMutationAllowed, false);
  assert.equal(result.authority.metaWriteAllowed, false);
  assert.equal(result.authority.approvalBypassAllowed, false);
  assert.equal(result.authority.externalActionAllowed, false);
  assert.equal(result.externalAccessPerformed, false);
  assert.equal(result.writesPerformed, false);
});

test("keeps relative change unknown when the baseline is zero", () => {
  const result = measureConversionOutcomeV1(
    input({
      baseline: window({ value: 0 }),
      observed: window({
        windowId: "observed-window",
        startDate: "2026-09-11",
        endDate: "2026-09-17",
        value: 1,
        evidenceRefs: ["woo:orders:observed"],
      }),
    }),
  );

  assert.equal(result.status, "MEASURED");
  assert.equal(result.delta.absolute, 1);
  assert.equal(result.delta.relative, null);
  assert.equal(result.delta.direction, "INCREASE");
});

test("fails closed on partial evidence and does not emit an observed learning value", () => {
  const result = measureConversionOutcomeV1(
    input({
      observed: window({
        windowId: "observed-window",
        startDate: "2026-09-11",
        endDate: "2026-09-17",
        truthState: "PARTIAL",
        value: 2.5,
        evidenceRefs: ["woo:orders:observed-partial"],
      }),
    }),
  );

  assert.equal(result.status, "INSUFFICIENT_EVIDENCE");
  assert.equal(result.delta.absolute, null);
  assert.equal(result.resultVsPrediction, "UNKNOWN");
  assert.equal(result.learningMeasurement.observedOutcome.value, null);
  assert.equal(result.learningMeasurement.attributionClass, "NOT_ESTABLISHED");
});

test("fails closed on explicit stale evidence", () => {
  const result = measureConversionOutcomeV1(
    input({ baseline: window({ truthState: "STALE" }) }),
  );

  assert.equal(result.status, "STALE");
  assert.deepEqual(result.reasonCodes, ["SOURCE_EVIDENCE_STALE"]);
  assert.equal(result.delta.direction, "UNKNOWN");
});

test("fails closed when evidence age exceeds the caller-defined freshness boundary", () => {
  const staleObservedAt = "2026-09-18T01:00:00.000Z";
  const result = measureConversionOutcomeV1(
    input({
      baseline: window({ observedAt: staleObservedAt }),
      observed: window({
        windowId: "observed-window",
        startDate: "2026-09-11",
        endDate: "2026-09-17",
        observedAt: staleObservedAt,
        value: 2.5,
        evidenceRefs: ["woo:orders:observed"],
      }),
      freshnessMaxAgeMs: 60 * 60 * 1_000,
    }),
  );

  assert.equal(result.status, "STALE");
  assert.equal(result.learningMeasurement.observedOutcome.value, null);
});

test("blocks conflicted evidence rather than averaging through disagreement", () => {
  const result = measureConversionOutcomeV1(
    input({ baseline: window({ truthState: "CONFLICTED" }) }),
  );

  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(result.reasonCodes, ["SOURCE_EVIDENCE_CONFLICTED"]);
});

test("blocks a metric identity mismatch", () => {
  const result = measureConversionOutcomeV1(
    input({
      observed: window({
        windowId: "observed-window",
        startDate: "2026-09-11",
        endDate: "2026-09-17",
        metricDefinitionId: "purchase_rate_v2",
        value: 2.5,
        evidenceRefs: ["woo:orders:observed"],
      }),
    }),
  );

  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(result.reasonCodes, ["METRIC_DEFINITION_MISMATCH"]);
});

test("blocks a unit mismatch", () => {
  const result = measureConversionOutcomeV1(
    input({
      observed: window({
        windowId: "observed-window",
        startDate: "2026-09-11",
        endDate: "2026-09-17",
        unit: "COUNT",
        value: 5,
        evidenceRefs: ["woo:orders:observed"],
      }),
    }),
  );

  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(result.reasonCodes, ["METRIC_UNIT_MISMATCH"]);
});

test("blocks a time-zone mismatch instead of silently shifting business dates", () => {
  const badObserved = {
    ...window({
      windowId: "observed-window",
      startDate: "2026-09-11",
      endDate: "2026-09-17",
      value: 2.5,
      evidenceRefs: ["woo:orders:observed"],
    }),
    timeZone: "UTC",
  } as unknown as ConversionOutcomeWindowV1;

  const result = measureConversionOutcomeV1(input({ observed: badObserved }));

  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(result.reasonCodes, ["TIME_ZONE_MISMATCH"]);
});

test("blocks evidence that does not match the declared evaluation range", () => {
  const result = measureConversionOutcomeV1(
    input({
      observed: window({
        windowId: "observed-window",
        startDate: "2026-09-12",
        endDate: "2026-09-18",
        value: 2.5,
        evidenceRefs: ["woo:orders:observed"],
      }),
    }),
  );

  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(result.reasonCodes, ["EVALUATION_WINDOW_MISMATCH"]);
});

test("blocks overlapping baseline and observation windows", () => {
  const result = measureConversionOutcomeV1(
    input({
      baseline: window({ startDate: "2026-09-05", endDate: "2026-09-11" }),
    }),
  );

  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(result.reasonCodes, ["MEASUREMENT_WINDOWS_OVERLAP"]);
});

test("blocks unequal fixed-window durations", () => {
  const result = measureConversionOutcomeV1(
    input({ baseline: window({ startDate: "2026-09-05", endDate: "2026-09-10" }) }),
  );

  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(result.reasonCodes, ["MEASUREMENT_WINDOW_DURATION_MISMATCH"]);
});

test("blocks future-dated source observation evidence", () => {
  const result = measureConversionOutcomeV1(
    input({
      observed: window({
        windowId: "observed-window",
        startDate: "2026-09-11",
        endDate: "2026-09-17",
        observedAt: "2026-09-19T06:00:00.000Z",
        value: 2.5,
        evidenceRefs: ["woo:orders:observed"],
      }),
    }),
  );

  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(result.reasonCodes, ["EVIDENCE_FUTURE_DATED"]);
});

test("does not invent a prediction result when no predicted range exists", () => {
  const result = measureConversionOutcomeV1(input({ predictedRange: null }));

  assert.equal(result.status, "MEASURED");
  assert.equal(result.resultVsPrediction, "UNKNOWN");
  assert.deepEqual(result.reasonCodes, ["FIXED_WINDOW_OUTCOME_MEASURED_PREDICTION_NOT_ESTABLISHED"]);
});

test("maps ratio outcomes to UNKNOWN learning units rather than inventing semantics", () => {
  const result = measureConversionOutcomeV1(
    input({
      metricDefinitionId: "checkout_to_purchase_ratio_v1",
      unit: "RATIO",
      predictedRange: null,
      baseline: window({
        metricDefinitionId: "checkout_to_purchase_ratio_v1",
        unit: "RATIO",
        value: 0.5,
      }),
      observed: window({
        windowId: "observed-window",
        startDate: "2026-09-11",
        endDate: "2026-09-17",
        metricDefinitionId: "checkout_to_purchase_ratio_v1",
        unit: "RATIO",
        value: 0.6,
        evidenceRefs: ["woo:ratio:observed"],
      }),
    }),
  );

  assert.equal(result.status, "MEASURED");
  assert.equal(result.learningMeasurement.observedOutcome.unit, "UNKNOWN");
  assert.equal(result.learningMeasurement.attributionConfidence, "UNKNOWN");
});

test("is deterministic, immutable, and does not mutate the input", () => {
  const source = input({ confounders: ["Seasonality", "Seasonality", "Campaign mix changed"] });
  const before = JSON.stringify(source);
  const first = measureConversionOutcomeV1(source);
  const second = measureConversionOutcomeV1(source);

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(source), before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.delta), true);
  assert.equal(Object.isFrozen(first.learningMeasurement), true);
  assert.equal(Object.isFrozen(first.confounders), true);
  assert.deepEqual(first.confounders, ["Campaign mix changed", "Seasonality"]);
});
