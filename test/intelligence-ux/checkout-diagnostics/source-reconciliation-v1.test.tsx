import assert from "node:assert/strict";
import test from "node:test";

import {
  reconcileCheckoutCompletionSourcesV1,
  type CheckoutReconciliationObservationV1,
  type CheckoutSourceReconciliationInputV1
} from "@/lib/checkout-diagnostics/source-reconciliation-v1";

const RANGE = { startDate: "2026-09-01", endDate: "2026-09-07" };
const DEFINITION = "canonical-checkout-completion-v1";

function observation(
  source: CheckoutReconciliationObservationV1["source"],
  completionCount: number,
  overrides: Partial<CheckoutReconciliationObservationV1> = {}
): CheckoutReconciliationObservationV1 {
  return {
    source,
    truthState: "COMPLETE",
    range: RANGE,
    observedAt: "2026-09-08T10:00:00.000Z",
    completeThrough: RANGE.endDate,
    metricDefinitionId: DEFINITION,
    completionCount,
    evidenceRefs: [`evidence:${source.toLowerCase()}:2026-09-01:2026-09-07`],
    ...overrides
  };
}

function input(
  observations: CheckoutReconciliationObservationV1[],
  overrides: Partial<CheckoutSourceReconciliationInputV1> = {}
): CheckoutSourceReconciliationInputV1 {
  return {
    generatedAt: "2026-09-08T12:00:00.000Z",
    expectedRange: RANGE,
    materialDifferenceRatio: 0.1,
    observations,
    ...overrides
  };
}

test("treats like-for-like complete counts within caller tolerance as corroborated measurement only", () => {
  const result = reconcileCheckoutCompletionSourcesV1(
    input([
      observation("FUNNELKIT", 100),
      observation("WOO", 96),
      observation("GA4", 94)
    ])
  );

  assert.equal(result.status, "READY");
  assert.equal(result.reasonCode, "COUNTS_WITHIN_CALLER_SUPPLIED_TOLERANCE");
  assert.equal(result.comparisons.length, 3);
  assert.ok(result.comparisons.every((comparison) => comparison.materialDifference === false));
  assert.match(result.attributionNote, /does not prove checkout friction/i);
  assert.equal(result.externalMutationPerformed, false);
});

test("surfaces a material cross-source difference without blaming a source or claiming causality", () => {
  const result = reconcileCheckoutCompletionSourcesV1(
    input([
      observation("FUNNELKIT", 100),
      observation("WOO", 75)
    ])
  );

  assert.equal(result.status, "VERIFY_TRACKING");
  assert.equal(result.reasonCode, "MATERIAL_CROSS_SOURCE_DIFFERENCE");
  assert.equal(result.comparisons.length, 1);
  assert.equal(result.comparisons[0].absoluteDifference, 25);
  assert.equal(result.comparisons[0].relativeDifference, 0.25);
  assert.equal(result.comparisons[0].materialDifference, true);
  assert.ok(result.limitations.some((value) => value.includes("tracking or definition verification")));
});

test("refuses to compare counts whose metric definitions are not explicitly identical", () => {
  const result = reconcileCheckoutCompletionSourcesV1(
    input([
      observation("FUNNELKIT", 100),
      observation("WOO", 100, { metricDefinitionId: "woo-order-created-v2" })
    ])
  );

  assert.equal(result.status, "INSUFFICIENT_EVIDENCE");
  assert.equal(result.reasonCode, "METRIC_DEFINITIONS_NOT_COMPARABLE");
  assert.deepEqual(result.comparisons, []);
});

test("fails closed when COMPLETE evidence does not cover the requested range", () => {
  const result = reconcileCheckoutCompletionSourcesV1(
    input([
      observation("FUNNELKIT", 100),
      observation("WOO", 98, { completeThrough: "2026-09-06" })
    ])
  );

  assert.equal(result.status, "CONFLICTED");
  assert.equal(result.reasonCode, "SOURCE_EVIDENCE_CONTRADICTION");
  assert.deepEqual(result.comparisons, []);
});

test("fails closed on source range mismatch and future-dated evidence", () => {
  const result = reconcileCheckoutCompletionSourcesV1(
    input([
      observation("FUNNELKIT", 100, {
        range: { startDate: "2026-09-02", endDate: "2026-09-08" }
      }),
      observation("WOO", 98, { observedAt: "2026-09-09T12:00:00.000Z" })
    ])
  );

  assert.equal(result.status, "CONFLICTED");
  assert.equal(result.reasonCode, "SOURCE_EVIDENCE_CONTRADICTION");
  assert.ok(result.limitations.some((value) => value.includes("range does not match")));
  assert.ok(result.limitations.some((value) => value.includes("future-dated")));
});

test("requires evidence provenance before COMPLETE source truth can participate", () => {
  const result = reconcileCheckoutCompletionSourcesV1(
    input([
      observation("FUNNELKIT", 100, { evidenceRefs: [] }),
      observation("WOO", 98)
    ])
  );

  assert.equal(result.status, "CONFLICTED");
  assert.equal(result.reasonCode, "SOURCE_EVIDENCE_CONTRADICTION");
});

test("partial or stale evidence cannot manufacture a cross-source conclusion", () => {
  const result = reconcileCheckoutCompletionSourcesV1(
    input([
      observation("FUNNELKIT", 100, { truthState: "PARTIAL" }),
      observation("WOO", 98, { truthState: "STALE" }),
      observation("GA4", 97)
    ])
  );

  assert.equal(result.status, "INSUFFICIENT_EVIDENCE");
  assert.equal(result.reasonCode, "COMPARABLE_SOURCE_COVERAGE_INCOMPLETE");
  assert.deepEqual(result.comparisons, []);
});

test("is deterministic, immutable, and leaves the caller input untouched", () => {
  const value = input([observation("FUNNELKIT", 100), observation("WOO", 98)]);
  const before = structuredClone(value);
  const first = reconcileCheckoutCompletionSourcesV1(value);
  const second = reconcileCheckoutCompletionSourcesV1(structuredClone(value));

  assert.deepEqual(first, second);
  assert.deepEqual(value, before);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.expectedRange));
  assert.ok(Object.isFrozen(first.sourceCoverage));
  assert.ok(Object.isFrozen(first.sourceCoverage[0].evidenceRefs));
  assert.ok(Object.isFrozen(first.comparisons));
  assert.ok(Object.isFrozen(first.limitations));
});
