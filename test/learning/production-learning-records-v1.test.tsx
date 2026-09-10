import assert from "node:assert/strict";
import test from "node:test";

import type { DurableAction } from "@/lib/actions/action-contract";
import {
  loadProductionLearningRecordsV1,
  projectDurableActionToLearningRecordV1
} from "@/lib/learning/production-learning-records-v1";

function action(overrides: Partial<DurableAction> = {}): DurableAction {
  return {
    id: "action-1",
    recommendation_id: "recommendation-1",
    opportunity_id: null,
    title: "Measure a bounded checkout improvement",
    description: null,
    category: "measurement",
    channel: "website",
    approval_level: "L1_RECOMMENDATION",
    affected_products: [],
    affected_audiences: [],
    current_level: "L1_RECOMMENDATION",
    status: "measuring",
    priority_score: {},
    confidence: "likely",
    expected_outcome: "Qualified checkout starts improve within the stated range.",
    estimated_impact: { metric: "checkout_start_rate", unit: "PERCENT", low: 2, expected: 5, high: 8 },
    estimated_cost: {},
    estimated_effort: {},
    risk: "low",
    evidence_snapshot_id: "snapshot-1",
    evidence_snapshot_hash: "fingerprint-1",
    evidence_snapshot: {
      decision_id: "decision-1",
      hypothesis: "A clearer next step will improve qualified checkout starts.",
      expected_mechanism: "Lower decision friction at the checkout boundary."
    },
    assumptions: ["Traffic mix remains materially stable."],
    limitations: ["Seasonality remains unmeasured."],
    prepared_assets: [],
    execution_plan: {},
    approval_requirements: {},
    last_idempotency_key: null,
    approved_by: null,
    approved_at: null,
    rejected_by: null,
    rejected_at: null,
    rejection_reason: null,
    snoozed_until: null,
    expires_at: null,
    executed_at: "2026-09-01T00:00:00.000Z",
    measurement_window: {
      start: "2026-09-01",
      end: "2026-09-14",
      success_metric: "checkout_start_rate"
    },
    baseline_snapshot: { checkout_start_rate: 10 },
    result_snapshot: null,
    outcome: {
      summary: "Checkout-start rate increased during the bounded evaluation window.",
      attribution_confidence: "MEDIUM",
      confounders: ["A concurrent traffic-mix shift cannot be excluded."],
      calibration_error: "WITHIN_QUALITATIVE_RANGE"
    },
    lessons: "The result is consistent with lower checkout decision friction.",
    recommendation_fingerprint: "recommendation-fingerprint-1",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-15T00:00:00.000Z",
    ...overrides
  };
}

test("projects canonical durable action evidence without creating a second store", () => {
  const record = projectDurableActionToLearningRecordV1(action());

  assert.equal(record.source, "CANONICAL_DURABLE_ACTION");
  assert.equal(record.id, "action-1");
  assert.equal(record.recommendationId, "recommendation-1");
  assert.equal(record.decisionId, "decision-1");
  assert.equal(record.hypothesis, "A clearer next step will improve qualified checkout starts.");
  assert.equal(record.expectedMechanism, "Lower decision friction at the checkout boundary.");
  assert.deepEqual(record.predictedOutcomeRange, {
    metric: "checkout_start_rate",
    unit: "PERCENT",
    low: 2,
    expected: 5,
    high: 8
  });
  assert.deepEqual(record.keyAssumptions, ["Traffic mix remains materially stable."]);
  assert.equal(record.successMetric, "checkout_start_rate");
  assert.equal(record.evaluationWindow, "2026-09-01 through 2026-09-14");
  assert.equal(record.actionStatus, "TAKEN");
  assert.match(record.observedOutcome ?? "", /increased during the bounded evaluation window/);
  assert.equal(record.attributionConfidence, "MEDIUM");
  assert.deepEqual(record.confounders, ["A concurrent traffic-mix shift cannot be excluded."]);
  assert.equal(record.lessonState, "LESSON_CANDIDATE");
  assert.equal(record.policyUpdateAllowed, false);
  assert.equal(record.traceability.evidenceFingerprint, "fingerprint-1");
});

test("does not manufacture an outcome, lesson, or known evidence", () => {
  const record = projectDurableActionToLearningRecordV1(
    action({
      status: "recommended",
      evidence_snapshot_id: null,
      evidence_snapshot_hash: null,
      evidence_snapshot: null,
      measurement_window: {},
      outcome: null,
      result_snapshot: null,
      lessons: "This must not surface before an outcome exists."
    })
  );

  assert.equal(record.actionStatus, "PENDING");
  assert.equal(record.observedOutcome, null);
  assert.equal(record.lesson, null);
  assert.equal(record.lessonState, "NO_LESSON");
  assert.equal(record.evidenceState, "UNKNOWN");
  assert.match(record.unknowns.join(" "), /Observed outcome has not been recorded/);
  assert.match(record.unknowns.join(" "), /Evaluation window is not present/);
});

test("reports implemented-needs-outcome until a real canonical outcome exists", async () => {
  const pending = await loadProductionLearningRecordsV1({
    list: async () => [action({ outcome: null, result_snapshot: null, lessons: null })]
  });
  assert.equal(pending.status, "AVAILABLE");
  assert.equal(pending.capability, "IMPLEMENTED_NEEDS_OUTCOME");

  const candidate = await loadProductionLearningRecordsV1({
    list: async () => [action()]
  });
  assert.equal(candidate.status, "AVAILABLE");
  assert.equal(candidate.capability, "LESSON_CANDIDATE_AVAILABLE");
  assert.equal(candidate.records[0]?.policyUpdateAllowed, false);
});

test("fails closed when the canonical action store is unavailable", async () => {
  const feed = await loadProductionLearningRecordsV1({
    list: async () => {
      throw new Error("database unavailable");
    }
  });

  assert.deepEqual(feed.records, []);
  assert.equal(feed.status, "UNAVAILABLE");
  assert.equal(feed.capability, "IMPLEMENTED_NEEDS_OUTCOME");
  assert.match(feed.reason, /No synthetic learning records were substituted/);
});
