import assert from "node:assert/strict";
import { test } from "node:test";

import { reconcileCheckoutCompletionSourcesV1 } from "../../src/lib/checkout-diagnostics/source-reconciliation-v1";
import { normalizeClarityBehaviorV1 } from "../../src/lib/website-conversion/clarity-behavior-normalizer-v1";
import { mapClarityExportV1 } from "../../src/lib/website-conversion/clarity-export-adapter-v1";
import { buildConversionFrictionDecisionBriefV1 } from "../../src/lib/website-conversion/conversion-friction-decision-brief-v1";

const GENERATED_AT = "2026-09-19T05:00:00.000Z";
const EXTRACTED_AT = "2026-09-19T04:30:00.000Z";
const START_AT = "2026-09-18T07:00:00.000Z";
const END_AT = "2026-09-19T06:59:59.000Z";

function clarityExport(overrides: Record<string, unknown> = {}) {
  return mapClarityExportV1(
    {
      projectId: "y9ntzyx3dk",
      period: {
        id: "2026-09-18",
        startAt: START_AT,
        endAt: END_AT,
        timeZone: "America/Los_Angeles",
      },
      extractedAt: EXTRACTED_AT,
      sourceStatus: { state: "AVAILABLE" },
      metrics: {
        sessions: 100,
        dead_clicks: 15,
        quick_backs: 5,
        active_time_seconds: 50,
      },
      smartEvents: [
        { observationId: "cart", name: "add_to_cart", count: 10 },
        { observationId: "checkout", name: "begin_checkout", count: 7 },
        { observationId: "purchase", name: "purchase", count: 4 },
      ],
      ...overrides,
    },
    { now: GENERATED_AT, staleAfterHours: 48 },
  );
}

function normalizedBehavior(exportEvidence = clarityExport()) {
  return normalizeClarityBehaviorV1({ current: exportEvidence.period });
}

function checkoutReconciliation(counts: [number, number] = [4, 4]) {
  return reconcileCheckoutCompletionSourcesV1({
    generatedAt: "2026-09-19T04:45:00.000Z",
    expectedRange: { startDate: "2026-09-18", endDate: "2026-09-18" },
    materialDifferenceRatio: 0.2,
    observations: [
      {
        source: "FUNNELKIT",
        truthState: "COMPLETE",
        range: { startDate: "2026-09-18", endDate: "2026-09-18" },
        observedAt: "2026-09-19T04:40:00.000Z",
        completeThrough: "2026-09-18",
        metricDefinitionId: "checkout_completed_orders_v1",
        completionCount: counts[0],
        evidenceRefs: ["funnelkit:checkout:2026-09-18"],
      },
      {
        source: "WOO",
        truthState: "COMPLETE",
        range: { startDate: "2026-09-18", endDate: "2026-09-18" },
        observedAt: "2026-09-19T04:41:00.000Z",
        completeThrough: "2026-09-18",
        metricDefinitionId: "checkout_completed_orders_v1",
        completionCount: counts[1],
        evidenceRefs: ["woo:orders:2026-09-18"],
      },
    ],
  });
}

test("joins fresh Clarity friction to corroborated checkout measurement without inventing causality or value", () => {
  const exportEvidence = clarityExport();
  const clarity = normalizedBehavior(exportEvidence);
  const checkout = checkoutReconciliation();
  assert.equal(checkout.status, "READY");

  const result = buildConversionFrictionDecisionBriefV1({
    generatedAt: GENERATED_AT,
    clarity,
    exportEvidence,
    checkoutReconciliation: checkout,
  });

  assert.equal(result.status, "READY_FOR_INTERNAL_REVIEW");
  assert.equal(result.checkoutEvidenceState, "READY");
  assert.equal(result.reasonCodes[0], "BEHAVIORAL_FRICTION_WITH_COMPARABLE_CHECKOUT_MEASUREMENT");
  assert.ok(result.candidates.some((candidate) => candidate.reasonCode === "DEAD_CLICK_RATE"));
  assert.ok(result.candidates.every((candidate) => candidate.causality === "NOT_ESTABLISHED"));
  assert.ok(result.candidates.every((candidate) => candidate.conversionAttribution === "NOT_ESTABLISHED"));
  assert.ok(result.candidates.every((candidate) => candidate.revenueImpact === null));
  assert.ok(result.candidates.every((candidate) => candidate.confidence === "NOT_ESTABLISHED"));
  assert.equal(result.authority.websiteMutationAllowed, false);
  assert.equal(result.authority.trackingMutationAllowed, false);
  assert.equal(result.authority.metaWriteAllowed, false);
  assert.equal(result.authority.externalActionAllowed, false);
  assert.equal(result.externalAccessPerformed, false);
  assert.equal(result.writesPerformed, false);
});

test("forces measurement verification when checkout sources materially disagree", () => {
  const exportEvidence = clarityExport();
  const clarity = normalizedBehavior(exportEvidence);
  const checkout = checkoutReconciliation([10, 4]);
  assert.equal(checkout.status, "VERIFY_TRACKING");

  const result = buildConversionFrictionDecisionBriefV1({
    generatedAt: GENERATED_AT,
    clarity,
    exportEvidence,
    checkoutReconciliation: checkout,
  });

  assert.equal(result.status, "VERIFY_TRACKING");
  assert.equal(result.reasonCodes[0], "CHECKOUT_MEASUREMENT_DISAGREEMENT_REQUIRES_VERIFICATION");
  assert.ok(
    result.candidates.every(
      (candidate) => candidate.nextInternalAction === "VERIFY_CHECKOUT_MEASUREMENT_BEFORE_CRO_CHANGE",
    ),
  );
});

test("fails closed on stale Clarity evidence", () => {
  const exportEvidence = clarityExport({ extractedAt: "2026-09-15T04:30:00.000Z" });
  const result = buildConversionFrictionDecisionBriefV1({
    generatedAt: GENERATED_AT,
    clarity: normalizedBehavior(exportEvidence),
    exportEvidence,
  });

  assert.equal(result.status, "STALE");
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.reasonCodes, ["CLARITY_EVIDENCE_STALE"]);
});

test("fails closed on partial Clarity evidence", () => {
  const exportEvidence = clarityExport({ sourceStatus: { state: "PARTIAL", reason: "export missing one family" } });
  const result = buildConversionFrictionDecisionBriefV1({
    generatedAt: GENERATED_AT,
    clarity: normalizedBehavior(exportEvidence),
    exportEvidence,
  });

  assert.equal(result.status, "INSUFFICIENT_EVIDENCE");
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.reasonCodes, ["CLARITY_SOURCE_PARTIAL"]);
});

test("blocks normalized findings whose provenance does not exist in the export evidence", () => {
  const exportEvidence = clarityExport();
  const clarity = normalizedBehavior(exportEvidence);
  assert.ok(clarity.findings.length > 0);
  const forged = {
    ...clarity,
    findings: clarity.findings.map((finding, index) =>
      index === 0 ? { ...finding, evidenceRefs: ["clarity:unknown:forged"] } : finding,
    ),
  };

  const result = buildConversionFrictionDecisionBriefV1({
    generatedAt: GENERATED_AT,
    clarity: forged,
    exportEvidence,
  });

  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(result.reasonCodes, ["CLARITY_FINDING_PROVENANCE_MISMATCH"]);
});

test("blocks checkout evidence from a different date range", () => {
  const exportEvidence = clarityExport();
  const clarity = normalizedBehavior(exportEvidence);
  const checkout = {
    ...checkoutReconciliation(),
    expectedRange: { startDate: "2026-09-17", endDate: "2026-09-17" },
  };

  const result = buildConversionFrictionDecisionBriefV1({
    generatedAt: GENERATED_AT,
    clarity,
    exportEvidence,
    checkoutReconciliation: checkout,
  });

  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(result.reasonCodes, ["CHECKOUT_RANGE_MISMATCH"]);
});

test("blocks conflicted checkout truth instead of using it as corroboration", () => {
  const exportEvidence = clarityExport();
  const clarity = normalizedBehavior(exportEvidence);
  const checkout = {
    ...checkoutReconciliation(),
    status: "CONFLICTED" as const,
    reasonCode: "SOURCE_EVIDENCE_CONTRADICTION",
  };

  const result = buildConversionFrictionDecisionBriefV1({
    generatedAt: GENERATED_AT,
    clarity,
    exportEvidence,
    checkoutReconciliation: checkout,
  });

  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(result.reasonCodes, ["CHECKOUT_CONFLICTED"]);
});

test("reports no material friction without manufacturing a recommendation", () => {
  const exportEvidence = clarityExport({
    metrics: {
      sessions: 100,
      dead_clicks: 5,
      quick_backs: 5,
      active_time_seconds: 50,
    },
  });
  const clarity = normalizedBehavior(exportEvidence);
  assert.equal(clarity.findings.length, 0);

  const result = buildConversionFrictionDecisionBriefV1({
    generatedAt: GENERATED_AT,
    clarity,
    exportEvidence,
    checkoutReconciliation: checkoutReconciliation(),
  });

  assert.equal(result.status, "NO_MATERIAL_FRICTION");
  assert.deepEqual(result.candidates, []);
});

test("remains deterministic, immutable, and analysis-only", () => {
  const exportEvidence = clarityExport();
  const input = {
    generatedAt: GENERATED_AT,
    clarity: normalizedBehavior(exportEvidence),
    exportEvidence,
    checkoutReconciliation: checkoutReconciliation(),
  };
  const before = JSON.stringify(input);
  const first = buildConversionFrictionDecisionBriefV1(input);
  const second = buildConversionFrictionDecisionBriefV1(input);

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(input), before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.candidates), true);
  assert.equal(Object.isFrozen(first.candidates[0]), true);
  assert.equal(first.authority.approvalBypassAllowed, false);
});
