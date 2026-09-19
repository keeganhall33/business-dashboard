import assert from "node:assert/strict";
import { test } from "node:test";

import {
  reconcileCheckoutCompletionSourcesV1,
  type CheckoutReconciliationObservationV1,
} from "../../src/lib/checkout-diagnostics/source-reconciliation-v1";
import { assessRevenueClosedLoopReadinessV1 } from "../../src/lib/checkout-diagnostics/closed-loop-readiness-v1";

const GENERATED_AT = "2026-09-19T06:30:00.000Z";
const RANGE = { startDate: "2026-09-18", endDate: "2026-09-18" };

function observation(
  source: CheckoutReconciliationObservationV1["source"],
  completionCount = 100,
  overrides: Partial<CheckoutReconciliationObservationV1> = {},
): CheckoutReconciliationObservationV1 {
  return {
    source,
    truthState: "COMPLETE",
    range: RANGE,
    observedAt: "2026-09-19T06:00:00.000Z",
    completeThrough: "2026-09-18",
    metricDefinitionId: "completed_checkout_v1",
    completionCount,
    evidenceRefs: [`${source.toLowerCase()}:checkout:2026-09-18`],
    ...overrides,
  };
}

function reconcile(
  observations: CheckoutReconciliationObservationV1[],
) {
  return reconcileCheckoutCompletionSourcesV1({
    generatedAt: GENERATED_AT,
    expectedRange: RANGE,
    materialDifferenceRatio: 0.2,
    observations,
  });
}

function allSources(
  overrides: Partial<Record<CheckoutReconciliationObservationV1["source"], number>> = {},
): CheckoutReconciliationObservationV1[] {
  return [
    observation("FUNNELKIT", overrides.FUNNELKIT ?? 100),
    observation("WOO", overrides.WOO ?? 100),
    observation("GA4", overrides.GA4 ?? 100),
    observation("META", overrides.META ?? 100),
  ];
}

test("reconciles Meta read-only alongside WooCommerce, FunnelKit, and GA4", () => {
  const reconciliation = reconcile(allSources());

  assert.equal(reconciliation.status, "READY");
  assert.equal(reconciliation.sourceCoverage.length, 4);
  assert.deepEqual(
    reconciliation.sourceCoverage.map((coverage) => coverage.source),
    ["FUNNELKIT", "WOO", "GA4", "META"],
  );
  assert.equal(reconciliation.comparisons.length, 6);
  assert.ok(
    reconciliation.comparisons.some(
      (comparison) =>
        comparison.leftSource === "GA4" && comparison.rightSource === "META",
    ),
  );
  assert.equal(reconciliation.externalMutationPerformed, false);
});

test("forces tracking verification when Meta materially disagrees with the other checkout sources", () => {
  const reconciliation = reconcile(allSources({ META: 50 }));
  const readiness = assessRevenueClosedLoopReadinessV1(reconciliation);

  assert.equal(reconciliation.status, "VERIFY_TRACKING");
  assert.ok(
    reconciliation.comparisons.some(
      (comparison) => comparison.rightSource === "META" && comparison.materialDifference,
    ),
  );
  assert.equal(readiness.status, "VERIFY_TRACKING");
  assert.equal(readiness.decisionGrade, false);
  assert.equal(readiness.reasonCode, "MATERIAL_CROSS_SOURCE_DIFFERENCE");
});

test("fails closed when Meta coverage is missing instead of treating three-source agreement as a closed loop", () => {
  const reconciliation = reconcile([
    observation("FUNNELKIT"),
    observation("WOO"),
    observation("GA4"),
  ]);
  assert.equal(reconciliation.status, "READY");

  const readiness = assessRevenueClosedLoopReadinessV1(reconciliation);

  assert.equal(readiness.status, "INCOMPLETE");
  assert.equal(readiness.decisionGrade, false);
  assert.equal(readiness.reasonCode, "REQUIRED_SOURCE_COVERAGE_INCOMPLETE");
  assert.deepEqual(readiness.incompleteSources, ["META"]);
});

test("fails closed when Meta is stale or partial", () => {
  for (const truthState of ["STALE", "PARTIAL"] as const) {
    const reconciliation = reconcile([
      observation("FUNNELKIT"),
      observation("WOO"),
      observation("GA4"),
      observation("META", 100, {
        truthState,
        completionCount: null,
        metricDefinitionId: null,
        completeThrough: null,
      }),
    ]);

    const readiness = assessRevenueClosedLoopReadinessV1(reconciliation);
    assert.equal(readiness.status, "INCOMPLETE");
    assert.equal(readiness.decisionGrade, false);
    assert.deepEqual(readiness.incompleteSources, ["META"]);
  }
});

test("rejects future-dated or range-mismatched Meta evidence", () => {
  const future = reconcile([
    observation("FUNNELKIT"),
    observation("WOO"),
    observation("GA4"),
    observation("META", 100, { observedAt: "2026-09-19T07:00:00.000Z" }),
  ]);
  assert.equal(future.status, "CONFLICTED");
  assert.equal(future.reasonCode, "SOURCE_EVIDENCE_CONTRADICTION");

  const wrongRange = reconcile([
    observation("FUNNELKIT"),
    observation("WOO"),
    observation("GA4"),
    observation("META", 100, {
      range: { startDate: "2026-09-17", endDate: "2026-09-17" },
    }),
  ]);
  assert.equal(wrongRange.status, "CONFLICTED");
  assert.equal(wrongRange.reasonCode, "SOURCE_EVIDENCE_CONTRADICTION");
});

test("becomes recommendation-ready only after all four sources reconcile across all six pairs", () => {
  const reconciliation = reconcile(allSources({
    FUNNELKIT: 101,
    WOO: 100,
    GA4: 99,
    META: 100,
  }));
  const readiness = assessRevenueClosedLoopReadinessV1(reconciliation);

  assert.equal(readiness.status, "READY_FOR_RECOMMENDATION");
  assert.equal(readiness.decisionGrade, true);
  assert.equal(readiness.reasonCode, "ALL_REQUIRED_SOURCES_RECONCILED");
  assert.deepEqual(readiness.incompleteSources, []);
  assert.equal(readiness.evidenceRefs.length, 4);
  assert.deepEqual(readiness.safeguards, {
    metaWritesAllowed: false,
    externalWritesAllowed: false,
    attributionEstablished: false,
    causalityEstablished: false,
    monetaryValueEstablished: false,
  });
});

test("closed-loop readiness is deterministic, immutable, and analysis-only", () => {
  const reconciliation = reconcile(allSources());
  const first = assessRevenueClosedLoopReadinessV1(reconciliation);
  const second = assessRevenueClosedLoopReadinessV1(reconciliation);

  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.requiredSources), true);
  assert.equal(Object.isFrozen(first.evidenceRefs), true);
  assert.equal(Object.isFrozen(first.safeguards), true);
  assert.equal(first.safeguards.metaWritesAllowed, false);
  assert.equal(first.safeguards.externalWritesAllowed, false);
});
