import assert from "node:assert/strict";
import test from "node:test";

import type { RevenueDecisionPacketV1 } from "@/lib/intelligence/production-revenue-loop/decision-packet-v1";
import {
  attachObservedRevenueOutcomeV1,
  type SupportedRevenueOutcomeV1
} from "@/lib/learning/revenue-outcome-attachment-v1";

function packet(overrides: Partial<RevenueDecisionPacketV1> = {}): RevenueDecisionPacketV1 {
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

function outcome(overrides: Partial<SupportedRevenueOutcomeV1> = {}): SupportedRevenueOutcomeV1 {
  return {
    version: "REVENUE_OBSERVED_OUTCOME_V1",
    observationId: "observation-1",
    recommendationId: "revenue-action:12345678",
    actionId: "durable-action-1",
    actionState: "TAKEN",
    observedAt: "2026-09-28T18:00:00.000Z",
    evaluationWindow: { startDate: "2026-09-15", endDate: "2026-09-28" },
    metric: "GA4 sessions",
    baseline: 1200,
    observedValue: 1320,
    statement: "Sessions increased during the bounded measurement window.",
    truthState: "CURRENT",
    evidenceRefs: ["ga4:outcome:1", "woo:guardrail:1"],
    attributionConfidence: "MEDIUM",
    confounders: ["A concurrent organic mention may have influenced traffic."],
    ...overrides
  };
}

test("attaches one matching observed result with exact decision and action traceability", () => {
  const result = attachObservedRevenueOutcomeV1({ decisionPacket: packet(), observedOutcome: outcome() });

  assert.equal(result.status, "OUTCOME_READY");
  assert.equal(result.reasonCode, "OUTCOME_ATTACHED");
  assert.equal(result.record?.recommendationId, "revenue-action:12345678");
  assert.equal(result.record?.actionId, "durable-action-1");
  assert.equal(result.record?.measurement.baseline, 1200);
  assert.equal(result.record?.measurement.observedValue, 1320);
  assert.equal(result.record?.measurement.timingState, "ON_TIME");
  assert.deepEqual(result.record?.traceability.packetEvidenceRefs, [
    "GA4:ga4:period:1",
    "META:meta:period:1",
    "WOO:woo:period:1"
  ]);
});

test("rejects mismatched recommendation identity and a missing action identity", () => {
  assert.equal(
    attachObservedRevenueOutcomeV1({
      decisionPacket: packet(),
      observedOutcome: outcome({ recommendationId: "revenue-action:other" })
    }).reasonCode,
    "RECOMMENDATION_ID_MISMATCH"
  );
  assert.equal(
    attachObservedRevenueOutcomeV1({
      decisionPacket: packet(),
      observedOutcome: outcome({ actionId: "" })
    }).reasonCode,
    "ACTION_ID_MISSING"
  );
});

test("requires evidence that the action was actually taken", () => {
  for (const actionState of ["NOT_TAKEN", "PENDING", "UNKNOWN"] as const) {
    assert.equal(
      attachObservedRevenueOutcomeV1({ decisionPacket: packet(), observedOutcome: outcome({ actionState }) }).reasonCode,
      "ACTION_NOT_TAKEN"
    );
  }
});

test("fails closed when the canonical baseline is missing or does not match", () => {
  assert.equal(
    attachObservedRevenueOutcomeV1({
      decisionPacket: packet({ measurement: { ...packet().measurement, baseline: null } }),
      observedOutcome: outcome({ baseline: null })
    }).reasonCode,
    "BASELINE_UNAVAILABLE"
  );
  assert.equal(
    attachObservedRevenueOutcomeV1({ decisionPacket: packet(), observedOutcome: outcome({ baseline: 1199 }) }).reasonCode,
    "BASELINE_MISMATCH"
  );
});

test("rejects mismatched metrics and evaluation windows", () => {
  assert.equal(
    attachObservedRevenueOutcomeV1({ decisionPacket: packet(), observedOutcome: outcome({ metric: "Woo orders" }) }).reasonCode,
    "METRIC_MISMATCH"
  );
  assert.equal(
    attachObservedRevenueOutcomeV1({
      decisionPacket: packet(),
      observedOutcome: outcome({ evaluationWindow: { startDate: "2026-09-16", endDate: "2026-09-28" } })
    }).reasonCode,
    "EVALUATION_WINDOW_MISMATCH"
  );
});

test("rejects an early observation and preserves an explicitly late observation", () => {
  assert.equal(
    attachObservedRevenueOutcomeV1({
      decisionPacket: packet(),
      observedOutcome: outcome({ observedAt: "2026-09-27T23:59:59.999Z" })
    }).reasonCode,
    "OBSERVATION_TOO_EARLY"
  );

  const late = attachObservedRevenueOutcomeV1({
    decisionPacket: packet(),
    observedOutcome: outcome({ observedAt: "2026-10-02T12:00:00.000Z" })
  });
  assert.equal(late.status, "OUTCOME_READY");
  assert.equal(late.record?.measurement.timingState, "LATE");
});

test("requires a supported observed value and evidence while preserving zero", () => {
  for (const observedOutcome of [
    outcome({ observedValue: null }),
    outcome({ evidenceRefs: [] }),
    outcome({ truthState: "UNKNOWN" }),
    outcome({ truthState: "CONFLICTED" })
  ]) {
    assert.equal(
      attachObservedRevenueOutcomeV1({ decisionPacket: packet(), observedOutcome }).reasonCode,
      "OUTCOME_EVIDENCE_UNSUPPORTED"
    );
  }

  const zero = attachObservedRevenueOutcomeV1({
    decisionPacket: packet(),
    observedOutcome: outcome({ observedValue: 0 })
  });
  assert.equal(zero.status, "OUTCOME_READY");
  assert.equal(zero.record?.measurement.observedValue, 0);
});

test("preserves confounders and UNKNOWN attribution without inventing causality", () => {
  const result = attachObservedRevenueOutcomeV1({
    decisionPacket: packet(),
    observedOutcome: outcome({
      attributionConfidence: "UNKNOWN",
      confounders: ["Email traffic was not separately measured.", "A product launch overlapped the window."]
    })
  });

  assert.equal(result.status, "OUTCOME_READY");
  assert.equal(result.record?.causalClaim.state, "UNKNOWN");
  assert.match(result.record?.causalClaim.statement ?? "", /Causality is UNKNOWN/);
  assert.deepEqual(result.record?.outcome.confounders, [
    "Email traffic was not separately measured.",
    "A product launch overlapped the window."
  ]);
  assert.match(result.record?.lesson.statement ?? "", /cannot promote policy or prove causation/);
});

test("rejects caller-supplied causal claims from a single observation", () => {
  assert.equal(
    attachObservedRevenueOutcomeV1({
      decisionPacket: packet(),
      observedOutcome: outcome({ statement: "The acquisition test caused the session increase." })
    }).reasonCode,
    "UNSUPPORTED_CAUSAL_LANGUAGE"
  );
});

test("bounds one observation to a candidate with no promotion or mutation authority", () => {
  const result = attachObservedRevenueOutcomeV1({ decisionPacket: packet(), observedOutcome: outcome() });

  assert.equal(result.record?.lesson.state, "CANDIDATE_ONLY");
  assert.deepEqual(result.record?.governance, {
    singleObservation: true,
    policyUpdateAllowed: false,
    promotionAllowed: false,
    externalMutationPerformed: false
  });
});

test("is deterministic, deeply immutable, and leaves both inputs unchanged", () => {
  const decisionPacket = packet();
  const observedOutcome = outcome({ evidenceRefs: ["woo:guardrail:1", "ga4:outcome:1", "ga4:outcome:1"] });
  const beforePacket = structuredClone(decisionPacket);
  const beforeOutcome = structuredClone(observedOutcome);

  const first = attachObservedRevenueOutcomeV1({ decisionPacket, observedOutcome });
  const second = attachObservedRevenueOutcomeV1({ decisionPacket, observedOutcome });

  assert.deepEqual(first, second);
  assert.deepEqual(decisionPacket, beforePacket);
  assert.deepEqual(observedOutcome, beforeOutcome);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.record), true);
  assert.equal(Object.isFrozen(first.record?.measurement), true);
  assert.equal(Object.isFrozen(first.record?.outcome.evidenceRefs), true);
  assert.deepEqual(first.record?.outcome.evidenceRefs, ["ga4:outcome:1", "woo:guardrail:1"]);
});
