import assert from "node:assert/strict";
import test from "node:test";

import {
  auditMetaFixedWindowsV1,
  type MetaFixedWindowAuditInputV1,
  type MetaFixedWindowObservationV1
} from "../../src/lib/revenue-intelligence/meta-fixed-window-audit-v1";

function observation(
  window: MetaFixedWindowObservationV1["window"],
  startDate: string,
  endDate: string,
  value: number,
  overrides: Partial<MetaFixedWindowObservationV1> = {}
): MetaFixedWindowObservationV1 {
  return {
    window,
    level: "AD",
    scopeId: "meta-ad-123",
    metricName: "OUTBOUND_CTR",
    metricDefinitionId: "meta.outbound_ctr.v1",
    range: { startDate, endDate },
    observedAt: "2026-09-19T10:00:00.000Z",
    completeThrough: endDate,
    truthState: "COMPLETE",
    value,
    evidenceRefs: [`meta:${window}:123`],
    ...overrides
  };
}

function input(
  values: { current7: number; prior7: number; current14: number; prior14: number }
): MetaFixedWindowAuditInputV1 {
  return {
    generatedAt: "2026-09-19T11:00:00.000Z",
    maximumEvidenceAgeHours: 6,
    materialChangeRatio: 0.15,
    direction: "HIGHER_IS_BETTER",
    observations: [
      observation("CURRENT_7D", "2026-09-13", "2026-09-19", values.current7),
      observation("PRIOR_7D", "2026-09-06", "2026-09-12", values.prior7),
      observation("CURRENT_14D", "2026-09-06", "2026-09-19", values.current14),
      observation("PRIOR_14D", "2026-08-23", "2026-09-05", values.prior14)
    ]
  };
}

test("classifies evidence-backed deterioration only when both fixed windows materially worsen", () => {
  const result = auditMetaFixedWindowsV1(
    input({ current7: 0.02, prior7: 0.03, current14: 0.022, prior14: 0.03 })
  );

  assert.equal(result.status, "READY");
  assert.equal(result.signal, "CONSISTENT_DETERIORATION");
  assert.deepEqual(
    result.comparisons.map((comparison) => comparison.direction),
    ["DETERIORATION", "DETERIORATION"]
  );
  assert.equal(result.causalityEstablished, false);
  assert.equal(result.attributionEstablished, false);
  assert.equal(result.confidenceEstablished, false);
  assert.equal(result.monetaryImpactEstablished, false);
  assert.equal(result.externalMutationPerformed, false);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.comparisons));
});

test("keeps a 7-day-only drop separate from a durable deterioration claim", () => {
  const result = auditMetaFixedWindowsV1(
    input({ current7: 0.02, prior7: 0.03, current14: 0.029, prior14: 0.03 })
  );

  assert.equal(result.status, "READY");
  assert.equal(result.signal, "SHORT_WINDOW_ONLY_DETERIORATION");
  assert.equal(result.comparisons[0]?.direction, "DETERIORATION");
  assert.equal(result.comparisons[1]?.direction, "NO_MATERIAL_CHANGE");
  assert.match(result.limitations.join(" "), /not proof of a rolling-window artifact/i);
});

test("fails closed when any fixed-window evidence is partial or stale", () => {
  const partial = input({ current7: 0.02, prior7: 0.03, current14: 0.022, prior14: 0.03 });
  partial.observations[0] = {
    ...partial.observations[0],
    truthState: "PARTIAL"
  };

  const partialResult = auditMetaFixedWindowsV1(partial);
  assert.equal(partialResult.status, "VERIFY_EVIDENCE");
  assert.equal(partialResult.signal, null);
  assert.equal(partialResult.reasonCode, "SOURCE_EVIDENCE_NOT_DECISION_GRADE");

  const stale = input({ current7: 0.02, prior7: 0.03, current14: 0.022, prior14: 0.03 });
  stale.observations = stale.observations.map((item) => ({
    ...item,
    observedAt: "2026-09-18T00:00:00.000Z"
  }));
  const staleResult = auditMetaFixedWindowsV1(stale);
  assert.equal(staleResult.status, "VERIFY_EVIDENCE");
  assert.ok(staleResult.limitations.some((item) => item.includes("freshness ceiling")));
});

test("rejects rolling or malformed periods that are not exact adjacent 7-day and 14-day pairs", () => {
  const malformed = input({ current7: 0.02, prior7: 0.03, current14: 0.022, prior14: 0.03 });
  malformed.observations[1] = observation(
    "PRIOR_7D",
    "2026-09-05",
    "2026-09-11",
    0.03
  );

  const result = auditMetaFixedWindowsV1(malformed);
  assert.equal(result.status, "VERIFY_EVIDENCE");
  assert.equal(result.reasonCode, "FIXED_WINDOWS_NOT_COMPARABLE");
  assert.equal(result.signal, null);
});

test("fails closed on metric identity drift instead of comparing unlike Meta definitions", () => {
  const drifted = input({ current7: 10, prior7: 12, current14: 11, prior14: 12 });
  drifted.observations[2] = {
    ...drifted.observations[2],
    metricDefinitionId: "meta.outbound_ctr.v2"
  };

  const result = auditMetaFixedWindowsV1(drifted);
  assert.equal(result.status, "VERIFY_EVIDENCE");
  assert.equal(result.reasonCode, "IDENTITY_OR_METRIC_DRIFT");
  assert.equal(result.comparisons.length, 0);
});

test("supports lower-is-better metrics without converting movement into a recommendation", () => {
  const lowerBetter = input({ current7: 18, prior7: 24, current14: 19, prior14: 25 });
  lowerBetter.direction = "LOWER_IS_BETTER";
  lowerBetter.observations = lowerBetter.observations.map((item) => ({
    ...item,
    metricName: "CPA",
    metricDefinitionId: "meta.cpa.purchase.v1"
  }));

  const result = auditMetaFixedWindowsV1(lowerBetter);
  assert.equal(result.status, "READY");
  assert.equal(result.signal, "CONSISTENT_IMPROVEMENT");
  assert.equal(result.externalMutationPerformed, false);
  assert.match(result.limitations.join(" "), /No audience, creative, funnel, scaling, pause, budget/i);
});
