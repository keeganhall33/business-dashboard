import assert from "node:assert/strict";
import test from "node:test";

import {
  CHECKOUT_VALIDATION_OUTCOME_VERSION,
  evaluateCheckoutValidationOutcomeV1,
  type CheckoutValidationOutcomeInputV1,
  type CheckoutValidationOutcomeObservationV1,
} from "@/lib/checkout-diagnostics/checkout-validation-outcome-v1";
import type { CheckoutValidationPlanV1 } from "@/lib/checkout-diagnostics/checkout-validation-plan-v1";

const PLAN_ID = "checkout-shipping-copy-2026-09";
const PREPARED_AT = "2026-09-10T12:00:00.000Z";
const APPROVED_AT = "2026-09-10T13:00:00.000Z";
const APPLIED_AT = "2026-09-10T15:00:00.000Z";
const EVALUATED_AT = "2026-09-18T12:00:00.000Z";
const EVIDENCE_AS_OF = "2026-09-18T11:00:00.000Z";

function readyPlan(): CheckoutValidationPlanV1 {
  return {
    version: "CHECKOUT_VALIDATION_PLAN_V1",
    status: "READY_FOR_APPROVAL",
    reasonCode: "VALIDATION_PLAN_READY",
    preparedAt: PREPARED_AT,
    planId: PLAN_ID,
    observedSignal: {
      classification: "OBSERVED_OR_DERIVED_SIGNAL",
      recommendationKind: "FRICTION_INVESTIGATION",
      summary: "Checkout completion declined in matched evidence.",
      rationale: "FunnelKit and Woo corroborate the downstream leak.",
      baselineRange: { startDate: "2026-09-01", endDate: "2026-09-07" },
      evidenceAsOf: PREPARED_AT,
      completeThrough: "2026-09-07",
    },
    hypothesis: {
      classification: "HYPOTHESIS",
      statement: "Clearer shipping copy may reduce checkout hesitation.",
    },
    proposedChange: "Clarify shipping timing copy without changing price.",
    targetSurface: "/checkout",
    measurement: {
      design: "FIXED_BEFORE_AFTER_NON_CAUSAL",
      metricDefinitionId: "checkout_completion_rate_v1",
      unit: "RATE",
      successDirection: "INCREASE",
      baselineRange: { startDate: "2026-09-01", endDate: "2026-09-07" },
      evaluationRange: { startDate: "2026-09-11", endDate: "2026-09-17" },
      minimumSample: 100,
    },
    stopRule: "Stop if payment errors increase materially.",
    rollbackPlan: "Restore the prior checkout copy.",
    evidenceRefs: ["checkout-diagnostics:baseline:2026-09-07"],
    blockers: [],
    limitations: ["Association only."],
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
  };
}

function observation(
  range: { startDate: string; endDate: string },
  value: number,
  sampleSize = 120,
  evidenceRef = "checkout-outcome:evidence",
): CheckoutValidationOutcomeObservationV1 {
  return {
    metricDefinitionId: "checkout_completion_rate_v1",
    unit: "RATE",
    range,
    value,
    sampleSize,
    evidenceAsOf: EVIDENCE_AS_OF,
    completeThrough: "2026-09-17",
    sourceTruth: {
      META: "COMPLETE",
      GA4: "COMPLETE",
      FUNNELKIT: "COMPLETE",
      WOO: "COMPLETE",
    },
    evidenceRefs: [evidenceRef],
  };
}

function validInput(): CheckoutValidationOutcomeInputV1 {
  return {
    evaluatedAt: EVALUATED_AT,
    maxEvidenceAgeHours: 48,
    plan: readyPlan(),
    approval: {
      planId: PLAN_ID,
      approvedAt: APPROVED_AT,
      evidenceRef: "approval:checkout-shipping-copy-2026-09",
    },
    implementation: {
      planId: PLAN_ID,
      appliedAt: APPLIED_AT,
      targetSurface: "/checkout",
      evidenceRef: "implementation:checkout-shipping-copy-2026-09",
    },
    baseline: observation(
      { startDate: "2026-09-01", endDate: "2026-09-07" },
      0.4,
      120,
      "woo-funnel:baseline",
    ),
    evaluation: observation(
      { startDate: "2026-09-11", endDate: "2026-09-17" },
      0.5,
      130,
      "woo-funnel:evaluation",
    ),
    confounders: {
      state: "UNKNOWN",
      notes: [],
      evidenceRefs: [],
    },
  };
}

test("judges fixed-window directional movement without claiming causality or attribution", () => {
  const result = evaluateCheckoutValidationOutcomeV1(validInput());

  assert.equal(result.version, CHECKOUT_VALIDATION_OUTCOME_VERSION);
  assert.equal(result.status, "JUDGABLE");
  assert.equal(result.reasonCode, "OUTCOME_JUDGABLE");
  assert.equal(result.planId, PLAN_ID);
  assert.equal(result.metric?.metricDefinitionId, "checkout_completion_rate_v1");
  assert.equal(result.metric?.baselineValue, 0.4);
  assert.equal(result.metric?.evaluationValue, 0.5);
  assert.ok(Math.abs((result.metric?.absoluteChange ?? 0) - 0.1) < 1e-12);
  assert.ok(
    Math.abs((result.metric?.relativeChangePercent ?? 0) - 25) < 1e-12,
  );
  assert.equal(result.metric?.movement, "ALIGNED_WITH_EXPECTED_DIRECTION");
  assert.equal(result.metric?.baselineSampleSize, 120);
  assert.equal(result.metric?.evaluationSampleSize, 130);
  assert.equal(result.metric?.minimumSample, 100);
  assert.deepEqual(result.windows, {
    baselineRange: { startDate: "2026-09-01", endDate: "2026-09-07" },
    evaluationRange: { startDate: "2026-09-11", endDate: "2026-09-17" },
  });
  assert.equal(result.confounders?.state, "UNKNOWN");
  assert.equal(result.safeguards.directionalAssociationOnly, true);
  assert.equal(result.safeguards.statisticalSignificanceEstablished, false);
  assert.equal(result.safeguards.causalityEstablished, false);
  assert.equal(result.safeguards.attributionEstablished, false);
  assert.equal(result.safeguards.confidence, null);
  assert.equal(result.safeguards.monetaryValue, null);
  assert.equal(result.safeguards.websiteWritesAllowed, false);
  assert.equal(result.safeguards.checkoutWritesAllowed, false);
  assert.equal(result.safeguards.metaWritesAllowed, false);
  assert.equal(result.safeguards.externalWritesAllowed, false);
  assert.ok(result.evidenceRefs.includes("checkout-diagnostics:baseline:2026-09-07"));
  assert.ok(result.evidenceRefs.includes("approval:checkout-shipping-copy-2026-09"));
  assert.ok(result.evidenceRefs.includes("implementation:checkout-shipping-copy-2026-09"));
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.metric));
  assert.ok(Object.isFrozen(result.evidenceRefs));
});

test("withholds directional judgement until both fixed windows meet explicit sample minimum", () => {
  const input = validInput();
  const result = evaluateCheckoutValidationOutcomeV1({
    ...input,
    evaluation: { ...input.evaluation, sampleSize: 99 },
  });

  assert.equal(result.status, "NOT_YET_JUDGABLE");
  assert.equal(result.reasonCode, "INSUFFICIENT_SAMPLE");
  assert.equal(result.metric, null);
  assert.deepEqual(result.windows, {
    baselineRange: { startDate: "2026-09-01", endDate: "2026-09-07" },
    evaluationRange: { startDate: "2026-09-11", endDate: "2026-09-17" },
  });
  assert.ok(result.evidenceRefs.includes("woo-funnel:evaluation"));
});

test("fails closed when metric identity, fixed ranges, or four-source truth drift", () => {
  const input = validInput();

  const metricMismatch = evaluateCheckoutValidationOutcomeV1({
    ...input,
    evaluation: {
      ...input.evaluation,
      metricDefinitionId: "purchase_rate_v2",
    },
  });
  assert.equal(metricMismatch.status, "BLOCKED");
  assert.equal(metricMismatch.reasonCode, "MEASUREMENT_IDENTITY_MISMATCH");

  const rangeMismatch = evaluateCheckoutValidationOutcomeV1({
    ...input,
    evaluation: {
      ...input.evaluation,
      range: { startDate: "2026-09-12", endDate: "2026-09-18" },
    },
  });
  assert.equal(rangeMismatch.status, "BLOCKED");
  assert.equal(rangeMismatch.reasonCode, "MEASUREMENT_RANGE_MISMATCH");

  const partialSource = evaluateCheckoutValidationOutcomeV1({
    ...input,
    evaluation: {
      ...input.evaluation,
      sourceTruth: { ...input.evaluation.sourceTruth, META: "PARTIAL" },
    },
  });
  assert.equal(partialSource.status, "BLOCKED");
  assert.equal(partialSource.reasonCode, "SOURCE_TRUTH_INCOMPLETE");
});

test("requires explicit approval and implementation evidence bound to the exact plan", () => {
  const input = validInput();

  const wrongApproval = evaluateCheckoutValidationOutcomeV1({
    ...input,
    approval: { ...input.approval, planId: "different-plan" },
  });
  assert.equal(wrongApproval.status, "BLOCKED");
  assert.equal(wrongApproval.reasonCode, "APPROVAL_EVIDENCE_INVALID");

  const afterEvaluationStarts = evaluateCheckoutValidationOutcomeV1({
    ...input,
    implementation: {
      ...input.implementation,
      appliedAt: "2026-09-11T00:00:00.000Z",
    },
  });
  assert.equal(afterEvaluationStarts.status, "BLOCKED");
  assert.equal(
    afterEvaluationStarts.reasonCode,
    "IMPLEMENTATION_EVIDENCE_INVALID",
  );

  const surfaceDrift = evaluateCheckoutValidationOutcomeV1({
    ...input,
    implementation: { ...input.implementation, targetSurface: "/cart" },
  });
  assert.equal(surfaceDrift.status, "BLOCKED");
  assert.equal(surfaceDrift.reasonCode, "IMPLEMENTATION_EVIDENCE_INVALID");
});

test("fails closed on future, stale, or incomplete window evidence", () => {
  const input = validInput();

  const future = evaluateCheckoutValidationOutcomeV1({
    ...input,
    evaluation: {
      ...input.evaluation,
      evidenceAsOf: "2026-09-18T13:00:00.000Z",
    },
  });
  assert.equal(future.reasonCode, "EVIDENCE_FUTURE_DATED");

  const stale = evaluateCheckoutValidationOutcomeV1({
    ...input,
    maxEvidenceAgeHours: 1,
    baseline: {
      ...input.baseline,
      evidenceAsOf: "2026-09-18T10:00:00.000Z",
    },
    evaluation: {
      ...input.evaluation,
      evidenceAsOf: "2026-09-18T10:00:00.000Z",
    },
  });
  assert.equal(stale.reasonCode, "EVIDENCE_STALE");

  const incomplete = evaluateCheckoutValidationOutcomeV1({
    ...input,
    evaluation: { ...input.evaluation, completeThrough: "2026-09-16" },
  });
  assert.equal(incomplete.reasonCode, "MEASUREMENT_INCOMPLETE");
});

test("preserves observed confounders and refuses to infer them away", () => {
  const input = validInput();
  const result = evaluateCheckoutValidationOutcomeV1({
    ...input,
    confounders: {
      state: "OBSERVED",
      notes: ["Free-shipping promotion overlapped the evaluation window."],
      evidenceRefs: ["promo-calendar:free-shipping:2026-09-14"],
    },
  });

  assert.equal(result.status, "JUDGABLE");
  assert.equal(result.confounders?.state, "OBSERVED");
  assert.deepEqual(result.confounders?.notes, [
    "Free-shipping promotion overlapped the evaluation window.",
  ]);
  assert.ok(
    result.evidenceRefs.includes("promo-calendar:free-shipping:2026-09-14"),
  );
  assert.equal(result.safeguards.causalityEstablished, false);
});

test("keeps zero baselines unresolved for relative percent while preserving directional movement", () => {
  const input = validInput();
  const result = evaluateCheckoutValidationOutcomeV1({
    ...input,
    baseline: { ...input.baseline, value: 0 },
    evaluation: { ...input.evaluation, value: 0.1 },
  });

  assert.equal(result.status, "JUDGABLE");
  assert.equal(result.metric?.relativeChangePercent, null);
  assert.equal(result.metric?.absoluteChange, 0.1);
  assert.equal(result.metric?.movement, "ALIGNED_WITH_EXPECTED_DIRECTION");
});

test("rejects blocked plans and secret-like provenance before producing outcome evidence", () => {
  const input = validInput();
  const blockedPlan = {
    ...input.plan,
    status: "BLOCKED" as const,
    reasonCode: "EVIDENCE_STALE" as const,
  };
  const blocked = evaluateCheckoutValidationOutcomeV1({
    ...input,
    plan: blockedPlan,
  });
  assert.equal(blocked.status, "BLOCKED");
  assert.equal(blocked.reasonCode, "PLAN_NOT_READY");

  const secretRef = evaluateCheckoutValidationOutcomeV1({
    ...input,
    evaluation: {
      ...input.evaluation,
      evidenceRefs: ["access_token=must-not-appear"],
    },
  });
  assert.equal(secretRef.status, "INVALID_INPUT");
  assert.equal(secretRef.reasonCode, "INVALID_INPUT");
  assert.deepEqual(secretRef.evidenceRefs, []);
});
