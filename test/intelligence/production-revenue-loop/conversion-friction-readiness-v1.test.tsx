import assert from "node:assert/strict";
import test from "node:test";

import {
  reconcileCheckoutCompletionSourcesV1,
  type CheckoutSourceReconciliationV1,
} from "@/lib/checkout-diagnostics/source-reconciliation-v1";
import type { RevenueBehavioralCorroborationV1 } from "@/lib/intelligence/production-revenue-loop/behavioral-corroboration-v1";
import {
  buildConversionFrictionReadinessV1,
  type ConversionFrictionReadinessInputV1,
} from "@/lib/intelligence/production-revenue-loop/conversion-friction-readiness-v1";

const CURRENT = { startDate: "2026-08-16", endDate: "2026-09-14" };
const PRIOR = { startDate: "2026-07-17", endDate: "2026-08-15" };

function behavioral(
  options: {
    state?: RevenueBehavioralCorroborationV1["state"];
    facts?: string[];
    revenueDriver?: RevenueBehavioralCorroborationV1["decision"]["revenueDriver"];
  } = {},
): RevenueBehavioralCorroborationV1 {
  const state = options.state ?? "SUPPORTED_FOR_INVESTIGATION";
  return {
    version: "REVENUE_BEHAVIORAL_CORROBORATION_V1",
    state,
    reasonCode:
      state === "NOT_APPLICABLE"
        ? "REVENUE_DRIVER_NOT_CONVERSION"
        : state === "CONFLICTED"
          ? "BEHAVIORAL_EVIDENCE_CONFLICTED"
          : state === "INSUFFICIENT_EVIDENCE"
            ? "BEHAVIORAL_EVIDENCE_NOT_DECISION_GRADE"
            : state === "NOT_CORROBORATED"
              ? "NO_MATERIAL_BEHAVIORAL_FRICTION_SIGNAL"
              : "CONVERSION_SIGNAL_HAS_BEHAVIORAL_SUPPORT",
    decision: {
      recommendationId: "rev-rec-1",
      revenueStatus: "READY_FOR_DECISION",
      revenueDriver: options.revenueDriver ?? "CONVERSION",
      currentRange: { ...CURRENT },
      comparisonRange: { ...PRIOR },
    },
    sourceStatus: [
      {
        source: "CLARITY",
        state: "READY",
        decisionGrade: true,
        rangeMatch: true,
        eligible: true,
        observedAt: "2026-09-15T09:00:00.000Z",
        completeThrough: CURRENT.endDate,
      },
      {
        source: "CHECKOUT",
        state: "READY",
        decisionGrade: true,
        rangeMatch: true,
        eligible: true,
        observedAt: "2026-09-15T09:05:00.000Z",
        completeThrough: CURRENT.endDate,
      },
    ],
    supportingFacts:
      options.facts ?? [
        "Checkout: 40.0% adjacent-stage drop-off from Payment method selected to Place order clicked.",
        "Clarity: dead-click sessions increased in the selected range.",
      ],
    limitations: [],
    nextStep: {
      kind:
        state === "SUPPORTED_FOR_INVESTIGATION"
          ? "PREPARE_CONVERSION_EXPERIMENT"
          : state === "NOT_APPLICABLE"
            ? "NO_BEHAVIORAL_OVERRIDE"
            : state === "NOT_CORROBORATED"
              ? "CONTINUE_DIAGNOSIS"
              : "RECONCILE_EVIDENCE",
      description: "Canonical behavioral next step.",
      approvalClass:
        state === "SUPPORTED_FOR_INVESTIGATION"
          ? "KEEGAN_APPROVAL_REQUIRED"
          : "AUTO_CONTINUE",
      externalMutationAllowed: false,
      metaWriteAllowed: false,
    },
    causalClaim: false,
    attributionStatement:
      "Behavior may guide investigation but does not establish causality or attribution.",
  };
}

function reconciliation(options: {
  range?: { startDate: string; endDate: string };
  funnelKit?: number;
  woo?: number;
  ga4?: number;
} = {}): CheckoutSourceReconciliationV1 {
  const range = options.range ?? CURRENT;
  return reconcileCheckoutCompletionSourcesV1({
    generatedAt: "2026-09-15T12:00:00.000Z",
    expectedRange: { ...range },
    materialDifferenceRatio: 0.1,
    observations: [
      {
        source: "FUNNELKIT",
        truthState: "COMPLETE",
        range: { ...range },
        observedAt: "2026-09-15T10:00:00.000Z",
        completeThrough: range.endDate,
        metricDefinitionId: "checkout_purchase_v1",
        completionCount: options.funnelKit ?? 20,
        evidenceRefs: ["funnelkit:purchase-count"],
      },
      {
        source: "WOO",
        truthState: "COMPLETE",
        range: { ...range },
        observedAt: "2026-09-15T10:05:00.000Z",
        completeThrough: range.endDate,
        metricDefinitionId: "checkout_purchase_v1",
        completionCount: options.woo ?? 20,
        evidenceRefs: ["woo:purchase-count"],
      },
      {
        source: "GA4",
        truthState: "COMPLETE",
        range: { ...range },
        observedAt: "2026-09-15T10:10:00.000Z",
        completeThrough: range.endDate,
        metricDefinitionId: "checkout_purchase_v1",
        completionCount: options.ga4 ?? 19,
        evidenceRefs: ["ga4:purchase-count"],
      },
    ],
  });
}

function input(
  overrides: Partial<ConversionFrictionReadinessInputV1> = {},
): ConversionFrictionReadinessInputV1 {
  return {
    behavioral: behavioral(),
    checkoutReconciliation: reconciliation(),
    ...overrides,
  };
}

test("allows bounded test preparation only after checkout measurement agrees within the caller-supplied tolerance", () => {
  const result = buildConversionFrictionReadinessV1(input());

  assert.equal(result.status, "READY_TO_PREPARE_TEST");
  assert.equal(result.reasonCode, "BEHAVIORAL_SUPPORT_AND_MEASUREMENT_AGREE");
  assert.equal(result.evidenceBasis.checkoutUsed, true);
  assert.equal(result.evidenceBasis.clarityUsed, true);
  assert.equal(result.checkoutMeasurement.required, true);
  assert.equal(result.checkoutMeasurement.status, "READY");
  assert.equal(result.checkoutMeasurement.comparisonCount, 3);
  assert.deepEqual(result.checkoutMeasurement.evidenceRefs, [
    "funnelkit:purchase-count",
    "ga4:purchase-count",
    "woo:purchase-count",
  ]);
  assert.equal(result.nextStep.kind, "PREPARE_BOUNDED_CONVERSION_TEST");
  assert.equal(result.nextStep.approvalClass, "KEEGAN_APPROVAL_REQUIRED");
  assert.equal(result.nextStep.externalMutationAllowed, false);
  assert.equal(result.nextStep.metaWriteAllowed, false);
  assert.equal(result.causalClaim, false);
  assert.equal(result.revenueAttributionClaim, false);
  assert.equal(result.expectedLift, null);
  assert.equal(result.monetaryValue, null);
  assert.match(result.limitations.join(" "), /does not establish checkout causality/);
});

test("fails closed when checkout friction is used without cross-source reconciliation", () => {
  const result = buildConversionFrictionReadinessV1(
    input({ checkoutReconciliation: null }),
  );

  assert.equal(result.status, "INSUFFICIENT_EVIDENCE");
  assert.equal(result.reasonCode, "CHECKOUT_RECONCILIATION_REQUIRED");
  assert.equal(result.checkoutMeasurement.status, "MISSING");
  assert.equal(result.nextStep.kind, "RECONCILE_EVIDENCE");
  assert.match(result.limitations.join(" "), /has not been reconciled/);
});

test("routes material FunnelKit/Woo/GA4 disagreement to tracking verification rather than checkout diagnosis", () => {
  const result = buildConversionFrictionReadinessV1(
    input({ checkoutReconciliation: reconciliation({ ga4: 12 }) }),
  );

  assert.equal(result.checkoutMeasurement.status, "VERIFY_TRACKING");
  assert.equal(result.status, "VERIFY_TRACKING");
  assert.equal(result.reasonCode, "CHECKOUT_MEASUREMENT_DISAGREEMENT");
  assert.equal(result.nextStep.kind, "VERIFY_TRACKING");
  assert.equal(result.nextStep.approvalClass, "AUTO_CONTINUE");
  assert.match(result.limitations.join(" "), /must be resolved/);
});

test("rejects checkout reconciliation from a different reporting period", () => {
  const result = buildConversionFrictionReadinessV1(
    input({
      checkoutReconciliation: reconciliation({
        range: { startDate: "2026-08-15", endDate: "2026-09-13" },
      }),
    }),
  );

  assert.equal(result.status, "INSUFFICIENT_EVIDENCE");
  assert.equal(result.reasonCode, "CHECKOUT_RECONCILIATION_RANGE_MISMATCH");
  assert.match(result.limitations.join(" "), /same current period/);
});

test("does not require checkout reconciliation for a Clarity-only behavioral investigation", () => {
  const result = buildConversionFrictionReadinessV1(
    input({
      behavioral: behavioral({
        facts: ["Clarity: rage-click sessions increased in the selected range."],
      }),
      checkoutReconciliation: null,
    }),
  );

  assert.equal(result.status, "READY_TO_PREPARE_TEST");
  assert.equal(result.reasonCode, "CLARITY_SUPPORT_WITHOUT_CHECKOUT_CLAIM");
  assert.equal(result.evidenceBasis.checkoutUsed, false);
  assert.equal(result.evidenceBasis.clarityUsed, true);
  assert.equal(result.checkoutMeasurement.required, false);
  assert.equal(result.checkoutMeasurement.status, "NOT_REQUIRED");
  assert.equal(result.nextStep.approvalClass, "KEEGAN_APPROVAL_REQUIRED");
  assert.match(result.limitations.join(" "), /does not establish the cause/);
});

test("preserves non-corroborated, insufficient, conflicted, and non-conversion states without manufacturing readiness", () => {
  const notCorroborated = buildConversionFrictionReadinessV1(
    input({
      behavioral: behavioral({ state: "NOT_CORROBORATED", facts: [] }),
    }),
  );
  assert.equal(notCorroborated.status, "CONTINUE_DIAGNOSIS");
  assert.equal(notCorroborated.nextStep.kind, "CONTINUE_DIAGNOSIS");

  const insufficient = buildConversionFrictionReadinessV1(
    input({
      behavioral: behavioral({ state: "INSUFFICIENT_EVIDENCE", facts: [] }),
    }),
  );
  assert.equal(insufficient.status, "INSUFFICIENT_EVIDENCE");
  assert.equal(insufficient.nextStep.kind, "RECONCILE_EVIDENCE");

  const conflicted = buildConversionFrictionReadinessV1(
    input({ behavioral: behavioral({ state: "CONFLICTED", facts: [] }) }),
  );
  assert.equal(conflicted.status, "CONFLICTED");
  assert.equal(conflicted.nextStep.kind, "RECONCILE_EVIDENCE");

  const notApplicable = buildConversionFrictionReadinessV1(
    input({
      behavioral: behavioral({
        state: "NOT_APPLICABLE",
        facts: [],
        revenueDriver: "TRAFFIC",
      }),
    }),
  );
  assert.equal(notApplicable.status, "NOT_APPLICABLE");
  assert.equal(notApplicable.nextStep.kind, "NO_BEHAVIORAL_OVERRIDE");
});

test("rejects a supported state that carries no supporting behavioral fact", () => {
  const result = buildConversionFrictionReadinessV1(
    input({ behavioral: behavioral({ facts: [] }) }),
  );

  assert.equal(result.status, "INSUFFICIENT_EVIDENCE");
  assert.equal(result.reasonCode, "SUPPORTED_STATE_WITHOUT_SUPPORTING_EVIDENCE");
  assert.equal(result.nextStep.externalMutationAllowed, false);
  assert.equal(result.nextStep.metaWriteAllowed, false);
});

test("fails closed when a claimed READY reconciliation lacks coherent comparisons or evidence", () => {
  const forged = structuredClone(reconciliation()) as CheckoutSourceReconciliationV1;
  forged.comparisons = [];

  const result = buildConversionFrictionReadinessV1(
    input({ checkoutReconciliation: forged }),
  );

  assert.equal(result.status, "CONFLICTED");
  assert.equal(result.reasonCode, "CHECKOUT_RECONCILIATION_INTEGRITY_FAILURE");
  assert.equal(result.nextStep.kind, "RECONCILE_EVIDENCE");
});

test("is deterministic, deeply immutable, and never mutates supplied canonical evidence", () => {
  const supplied = input();
  const before = structuredClone(supplied);

  const first = buildConversionFrictionReadinessV1(supplied);
  const second = buildConversionFrictionReadinessV1(supplied);

  assert.deepEqual(first, second);
  assert.deepEqual(supplied, before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.evidenceBasis), true);
  assert.equal(Object.isFrozen(first.evidenceBasis.supportingFacts), true);
  assert.equal(Object.isFrozen(first.checkoutMeasurement), true);
  assert.equal(Object.isFrozen(first.checkoutMeasurement.evidenceRefs), true);
  assert.equal(Object.isFrozen(first.limitations), true);
  assert.equal(Object.isFrozen(first.nextStep), true);
  assert.equal(first.nextStep.externalMutationAllowed, false);
  assert.equal(first.nextStep.metaWriteAllowed, false);
});
