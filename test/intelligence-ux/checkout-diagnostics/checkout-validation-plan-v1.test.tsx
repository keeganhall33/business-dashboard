import assert from "node:assert/strict";
import test from "node:test";

import {
  prepareCheckoutValidationPlanV1,
  type CheckoutValidationPlanInputV1,
} from "../../../src/lib/checkout-diagnostics/checkout-validation-plan-v1";
import {
  buildCheckoutDiagnosticsViewModelV1,
  type CheckoutDiagnosticsInputV1,
  type CheckoutStageKey,
} from "../../../src/lib/checkout-diagnostics/view-model-v1";

const currentCounts: Record<CheckoutStageKey, number> = {
  CHECKOUT_LOADED: 100,
  CUSTOMER_INFO_STARTED: 90,
  CUSTOMER_INFO_COMPLETED: 80,
  SHIPPING_METHODS_LOADED: 70,
  SHIPPING_METHOD_SELECTED: 65,
  SHIPPING_TOTAL_SHOWN: 60,
  PAYMENT_SECTION_VISIBLE: 58,
  PAYMENT_METHODS_LOADED: 55,
  PAYMENT_METHOD_SELECTED: 50,
  PLACE_ORDER_CLICKED: 45,
  ORDER_CREATED: 42,
  PURCHASE: 40,
};

const priorCounts: Record<CheckoutStageKey, number> = {
  CHECKOUT_LOADED: 90,
  CUSTOMER_INFO_STARTED: 82,
  CUSTOMER_INFO_COMPLETED: 75,
  SHIPPING_METHODS_LOADED: 68,
  SHIPPING_METHOD_SELECTED: 63,
  SHIPPING_TOTAL_SHOWN: 59,
  PAYMENT_SECTION_VISIBLE: 57,
  PAYMENT_METHODS_LOADED: 54,
  PAYMENT_METHOD_SELECTED: 50,
  PLACE_ORDER_CLICKED: 46,
  ORDER_CREATED: 43,
  PURCHASE: 41,
};

function diagnosticsInput(
  overrides: Partial<CheckoutDiagnosticsInputV1> = {},
): CheckoutDiagnosticsInputV1 {
  return {
    instrumentation: "ACTIVE",
    range: {
      current: { startDate: "2026-09-01", endDate: "2026-09-07" },
      prior: { startDate: "2026-08-25", endDate: "2026-08-31" },
    },
    current: { stages: currentCounts },
    prior: { stages: priorCounts },
    errors: {
      validationErrors: 0,
      paymentErrors: 0,
      checkoutAjaxErrors: 0,
    },
    shippingLatency: {
      sampleSize: 20,
      waitsAtLeastFourSeconds: 8,
      medianMs: 2500,
      p95Ms: 6200,
      mobileChromeSampleSize: 12,
      mobileChromeMedianMs: 3100,
      mobileChromeP95Ms: 6800,
      buckets: [
        { label: "<2s", count: 8 },
        { label: "2-4s", count: 4 },
        { label: "4s+", count: 8 },
      ],
    },
    segments: [
      {
        device: "Mobile",
        source: "Paid social",
        checkoutLoaded: 60,
        purchases: 20,
      },
      {
        device: "Desktop",
        source: "Direct",
        checkoutLoaded: 40,
        purchases: 20,
      },
    ],
    sourceTruth: {
      META: "COMPLETE",
      GA4: "COMPLETE",
      FUNNELKIT: "COMPLETE",
      WOO: "COMPLETE",
    },
    freshness: {
      asOf: "2026-09-08T08:00:00.000Z",
      completeThrough: "2026-09-07",
    },
    ...overrides,
  };
}

function readyInput(
  overrides: Partial<CheckoutValidationPlanInputV1> = {},
): CheckoutValidationPlanInputV1 {
  const diagnostics = buildCheckoutDiagnosticsViewModelV1(diagnosticsInput());
  assert.equal(diagnostics.state, "READY");
  assert.equal(diagnostics.recommendation?.kind, "FRICTION_INVESTIGATION");

  return {
    preparedAt: "2026-09-08T12:00:00.000Z",
    maxEvidenceAgeHours: 12,
    diagnostics,
    evidenceRefs: [
      "checkout:diagnostics:2026-09-01:2026-09-07",
      "clarity:shipping-latency:2026-09-01:2026-09-07",
    ],
    plan: {
      planId: "checkout-shipping-latency-20260908",
      targetSurface: "Checkout shipping-method loading",
      hypothesis:
        "Reducing the observed shipping-method loading delay may improve checkout progression.",
      proposedChange:
        "Prepare one bounded checkout performance change for approval and keep the current implementation available for rollback.",
      primaryMetric: {
        metricDefinitionId: "checkout_shipping_latency_ms_v1",
        unit: "MILLISECONDS",
        successDirection: "DECREASE",
      },
      evaluationRange: {
        startDate: "2026-09-09",
        endDate: "2026-09-15",
      },
      minimumSample: 20,
      stopRule:
        "Stop the validation if checkout errors increase or the approved change cannot be measured on the defined metric.",
      rollbackPlan:
        "Restore the exact pre-change checkout implementation if the approved stop rule is triggered.",
    },
    ...overrides,
  };
}

test("prepares an approval-only validation plan from fresh four-source decision-grade checkout evidence", () => {
  const input = readyInput();
  const output = prepareCheckoutValidationPlanV1(input);

  assert.equal(output.status, "READY_FOR_APPROVAL");
  assert.equal(output.reasonCode, "VALIDATION_PLAN_READY");
  assert.equal(output.observedSignal?.classification, "OBSERVED_OR_DERIVED_SIGNAL");
  assert.equal(output.observedSignal?.recommendationKind, "FRICTION_INVESTIGATION");
  assert.equal(output.hypothesis?.classification, "HYPOTHESIS");
  assert.equal(output.measurement?.design, "FIXED_BEFORE_AFTER_NON_CAUSAL");
  assert.deepEqual(output.measurement?.baselineRange, {
    startDate: "2026-09-01",
    endDate: "2026-09-07",
  });
  assert.deepEqual(output.measurement?.evaluationRange, {
    startDate: "2026-09-09",
    endDate: "2026-09-15",
  });
  assert.deepEqual(output.approval, { required: true, state: "PENDING" });
  assert.deepEqual(output.safeguards, {
    websiteWritesAllowed: false,
    checkoutWritesAllowed: false,
    metaWritesAllowed: false,
    externalWritesAllowed: false,
    causalityEstablished: false,
    attributionEstablished: false,
    confidence: null,
    monetaryValue: null,
  });
});

test("fails closed when checkout diagnostics are partial", () => {
  const partialCurrent = { ...currentCounts } as Partial<Record<CheckoutStageKey, number>>;
  delete partialCurrent.SHIPPING_METHODS_LOADED;
  const diagnostics = buildCheckoutDiagnosticsViewModelV1(
    diagnosticsInput({ current: { stages: partialCurrent } }),
  );
  const output = prepareCheckoutValidationPlanV1(
    readyInput({ diagnostics }),
  );

  assert.equal(diagnostics.state, "PARTIAL");
  assert.equal(output.status, "BLOCKED");
  assert.equal(output.reasonCode, "DIAGNOSTICS_NOT_DECISION_GRADE");
  assert.equal(output.proposedChange, null);
});

test("independently blocks incomplete Meta truth even if an upstream object incorrectly claims readiness", () => {
  const base = readyInput().diagnostics;
  const diagnostics = {
    ...base,
    sourceTruth: { ...base.sourceTruth, META: "PARTIAL" as const },
  };
  const output = prepareCheckoutValidationPlanV1(
    readyInput({ diagnostics }),
  );

  assert.equal(output.status, "BLOCKED");
  assert.equal(output.reasonCode, "SOURCE_TRUTH_INCOMPLETE");
  assert.equal(output.safeguards.metaWritesAllowed, false);
});

test("does not manufacture an experiment when complete diagnostics contain no material investigation signal", () => {
  const diagnostics = buildCheckoutDiagnosticsViewModelV1(
    diagnosticsInput({
      shippingLatency: {
        sampleSize: 20,
        waitsAtLeastFourSeconds: 2,
        medianMs: 1200,
        p95Ms: 3300,
        mobileChromeSampleSize: 10,
        mobileChromeMedianMs: 1500,
        mobileChromeP95Ms: 3600,
        buckets: [{ label: "4s+", count: 2 }],
      },
    }),
  );
  const output = prepareCheckoutValidationPlanV1(
    readyInput({ diagnostics }),
  );

  assert.equal(diagnostics.state, "READY");
  assert.equal(diagnostics.recommendation, null);
  assert.equal(output.status, "BLOCKED");
  assert.equal(output.reasonCode, "NO_ACTIONABLE_DIAGNOSTIC_SIGNAL");
});

test("blocks stale evidence using the caller-supplied freshness ceiling", () => {
  const output = prepareCheckoutValidationPlanV1(
    readyInput({
      preparedAt: "2026-09-10T12:00:00.000Z",
      maxEvidenceAgeHours: 24,
    }),
  );

  assert.equal(output.status, "BLOCKED");
  assert.equal(output.reasonCode, "EVIDENCE_STALE");
});

test("blocks future-dated checkout evidence", () => {
  const diagnostics = buildCheckoutDiagnosticsViewModelV1(
    diagnosticsInput({
      freshness: {
        asOf: "2026-09-09T08:00:00.000Z",
        completeThrough: "2026-09-07",
      },
    }),
  );
  const output = prepareCheckoutValidationPlanV1(
    readyInput({ diagnostics }),
  );

  assert.equal(diagnostics.state, "READY");
  assert.equal(output.status, "BLOCKED");
  assert.equal(output.reasonCode, "EVIDENCE_FUTURE_DATED");
});

test("requires a fixed non-overlapping evaluation range with the same duration as baseline", () => {
  const overlapping = readyInput();
  overlapping.plan.evaluationRange = {
    startDate: "2026-09-07",
    endDate: "2026-09-13",
  };
  const wrongDuration = readyInput();
  wrongDuration.plan.evaluationRange = {
    startDate: "2026-09-09",
    endDate: "2026-09-14",
  };

  const overlapResult = prepareCheckoutValidationPlanV1(overlapping);
  const durationResult = prepareCheckoutValidationPlanV1(wrongDuration);

  assert.equal(overlapResult.status, "BLOCKED");
  assert.equal(overlapResult.reasonCode, "MEASUREMENT_WINDOW_INVALID");
  assert.equal(durationResult.status, "BLOCKED");
  assert.equal(durationResult.reasonCode, "MEASUREMENT_WINDOW_INVALID");
});

test("rejects incomplete or unbounded validation plans instead of filling missing values", () => {
  const missingEvidence = readyInput({ evidenceRefs: [] });
  const invalidSample = readyInput();
  invalidSample.plan.minimumSample = 2.5;

  const missingEvidenceResult = prepareCheckoutValidationPlanV1(missingEvidence);
  const invalidSampleResult = prepareCheckoutValidationPlanV1(invalidSample);

  assert.equal(missingEvidenceResult.status, "INVALID_INPUT");
  assert.equal(missingEvidenceResult.reasonCode, "INVALID_INPUT");
  assert.equal(invalidSampleResult.status, "INVALID_INPUT");
  assert.equal(invalidSampleResult.reasonCode, "INVALID_INPUT");
});

test("is deterministic and immutable without mutating caller evidence or elevating attribution", () => {
  const input = readyInput({
    evidenceRefs: [
      "z:evidence",
      "a:evidence",
      "z:evidence",
    ],
  });
  const before = structuredClone(input);
  const first = prepareCheckoutValidationPlanV1(input);
  const second = prepareCheckoutValidationPlanV1(input);

  assert.deepEqual(first, second);
  assert.deepEqual(input, before);
  assert.deepEqual(first.evidenceRefs, ["a:evidence", "z:evidence"]);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.evidenceRefs), true);
  assert.equal(Object.isFrozen(first.measurement), true);
  assert.equal(first.safeguards.attributionEstablished, false);
  assert.equal(first.safeguards.causalityEstablished, false);
  assert.equal(first.safeguards.confidence, null);
  assert.equal(first.safeguards.monetaryValue, null);
});
