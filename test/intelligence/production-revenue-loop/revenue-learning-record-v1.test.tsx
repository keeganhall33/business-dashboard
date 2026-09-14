import assert from "node:assert/strict";
import test from "node:test";

import type { RevenueDecisionPacketV1 } from "../../../src/lib/intelligence/production-revenue-loop/decision-packet-v1";
import { projectRevenueDecisionPacketToDurableActionInputV1 } from "../../../src/lib/intelligence/production-revenue-loop/revenue-learning-record-v1";

function packet(
  overrides: Partial<RevenueDecisionPacketV1> = {}
): RevenueDecisionPacketV1 {
  return {
    version: "REVENUE_DECISION_PACKET_V1",
    status: "READY_FOR_DECISION",
    reasonCode: "BOUNDED_CONTRIBUTOR_SUPPORTED",
    generatedAt: "2026-09-14T00:00:00.000Z",
    whatChanged: {
      metric: "REVENUE",
      baselineCents: 100_000,
      currentCents: 112_000,
      absoluteChangeCents: 12_000,
      percentChange: 0.12,
      direction: "UP"
    },
    sourceCoverage: [
      { source: "WOO", truthState: "CURRENT", evidenceRefs: ["woo:period:1"] },
      { source: "GA4", truthState: "CURRENT", evidenceRefs: ["ga4:period:1"] },
      { source: "META", truthState: "CURRENT", evidenceRefs: ["meta:period:1"] }
    ],
    primaryDriver: {
      state: "SUPPORTED",
      driver: "TRAFFIC",
      statement: "Traffic is the best-supported contributor, not a proven cause.",
      confidence: "MEDIUM"
    },
    corroboratingEvidence: ["Traffic moved with revenue."],
    conflictingEvidence: [],
    alternativeHypotheses: ["Product mix may have changed."],
    recommendedAction: {
      id: "revenue-action:12345678",
      description: "Run one bounded acquisition test.",
      approvalClass: "KEEGAN_APPROVAL_REQUIRED",
      executesMutation: false
    },
    measurement: {
      metric: "GA4 sessions",
      baseline: 1200,
      evaluationWindow: { startDate: "2026-09-15", endDate: "2026-09-28" },
      successThreshold: "Improve sessions by at least 5% without a material revenue decline.",
      stopRule: "Stop if matched revenue declines more than 10%."
    },
    assumptions: ["The matched periods are comparable."],
    limitations: ["Inventory effects are unmeasured."],
    outcomeState: "IMPLEMENTED_NEEDS_OUTCOME",
    ...overrides
  };
}

test("projects a supported packet into the canonical durable-action input", () => {
  const result = projectRevenueDecisionPacketToDurableActionInputV1(packet());

  assert.equal(result.recommendationId, "revenue-action:12345678");
  assert.equal(result.fingerprint, "revenue-decision:revenue-action:12345678");
  assert.equal(result.confidence, "strongly_supported");
  assert.equal(result.risk, "medium");
  assert.deepEqual(result.approval_requirements, {
    approvalClass: "KEEGAN_APPROVAL_REQUIRED",
    keeganApprovalRequired: true,
    executesMutation: false
  });
  assert.deepEqual(result.measurement_window, {
    metric: "GA4 sessions",
    success_metric: "GA4 sessions",
    baseline: 1200,
    start: "2026-09-15",
    end: "2026-09-28",
    success_threshold: "Improve sessions by at least 5% without a material revenue decline.",
    stop_rule: "Stop if matched revenue declines more than 10%.",
    outcome_state: "IMPLEMENTED_NEEDS_OUTCOME"
  });
  assert.deepEqual(result.assumptions, ["The matched periods are comparable."]);
  assert.deepEqual(result.limitations, ["Inventory effects are unmeasured."]);
});

test("preserves exact source truth, evidence references, and non-causal wording", () => {
  const result = projectRevenueDecisionPacketToDurableActionInputV1(packet());
  const snapshot = result.evidence_snapshot;

  assert.deepEqual(snapshot.source_coverage, [
    { source: "WOO", truthState: "CURRENT", evidenceRefs: ["woo:period:1"] },
    { source: "GA4", truthState: "CURRENT", evidenceRefs: ["ga4:period:1"] },
    { source: "META", truthState: "CURRENT", evidenceRefs: ["meta:period:1"] }
  ]);
  assert.equal(snapshot.hypothesis, "Traffic is the best-supported contributor, not a proven cause.");
  assert.equal(snapshot.outcome_state, "IMPLEMENTED_NEEDS_OUTCOME");
  assert.equal(snapshot.expected_mechanism, null);
  assert.equal(result.estimated_impact.baseline, 1200);
});

test("keeps an evidence-reconciliation packet pending without invented driver or outcome", () => {
  const result = projectRevenueDecisionPacketToDurableActionInputV1(
    packet({
      status: "INSUFFICIENT_EVIDENCE",
      reasonCode: "SOURCE_COVERAGE_INCOMPLETE",
      sourceCoverage: [
        { source: "WOO", truthState: "CURRENT", evidenceRefs: ["woo:period:1"] },
        { source: "GA4", truthState: "STALE", evidenceRefs: ["ga4:period:old"] },
        { source: "META", truthState: "UNKNOWN", evidenceRefs: [] }
      ],
      primaryDriver: {
        state: "UNKNOWN",
        driver: null,
        statement: "The primary driver is UNKNOWN.",
        confidence: "UNKNOWN"
      },
      recommendedAction: {
        id: "revenue-action:87654321",
        description: "Reconcile source evidence before changing the business.",
        approvalClass: "AUTO_CONTINUE",
        executesMutation: false
      },
      measurement: {
        metric: "Source coverage",
        baseline: 1,
        evaluationWindow: null,
        successThreshold: "All three sources must be CURRENT.",
        stopRule: "Do not execute a consequential revenue action."
      },
      limitations: ["GA4 coverage is STALE.", "META coverage is UNKNOWN."]
    })
  );

  assert.equal(result.confidence, "insufficient_evidence");
  assert.equal(result.risk, "low");
  assert.equal(result.approval_requirements.keeganApprovalRequired, false);
  assert.equal(result.approval_requirements.executesMutation, false);
  assert.equal(result.evidence_snapshot.hypothesis, null);
  assert.equal(result.evidence_snapshot.outcome_state, "IMPLEMENTED_NEEDS_OUTCOME");
  assert.equal(result.measurement_window.start, null);
  assert.equal(result.measurement_window.end, null);
  assert.deepEqual(result.limitations, [
    "GA4 coverage is STALE.",
    "META coverage is UNKNOWN."
  ]);
});

test("rejects invalid packets before producing a canonical action input", () => {
  assert.throws(
    () => projectRevenueDecisionPacketToDurableActionInputV1(packet({ status: "INVALID_INPUT" })),
    /INVALID_REVENUE_DECISION_PACKET/
  );
});

test("is deterministic, immutable, and leaves the packet unchanged", () => {
  const input = packet();
  const before = structuredClone(input);
  const first = projectRevenueDecisionPacketToDurableActionInputV1(input);
  const second = projectRevenueDecisionPacketToDurableActionInputV1(input);

  assert.deepEqual(first, second);
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.evidence_snapshot), true);
  assert.equal(Object.isFrozen(first.evidence_snapshot.source_coverage), true);
  assert.equal(Object.isFrozen(first.measurement_window), true);
  assert.equal(first.actor, "REVENUE_DECISION_PACKET_V1");
  assert.equal(first.idempotencyKey, "revenue-decision:revenue-action:12345678:2026-09-14T00:00:00.000Z");
});
