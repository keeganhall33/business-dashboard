import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDecisionLearningSnapshot,
  decisionLearningFixturesV1,
  decisionLearningSnapshotFixtureV1,
  learningStrengthFor,
  toDecisionLearningRecordCard
} from "@/lib/learning-engine/decision-record-v1";

test("decision learning snapshot is dashboard-consumable and deterministic", () => {
  const snapshot = decisionLearningSnapshotFixtureV1;

  assert.equal(snapshot.data_mode, "FIXTURE_BASELINE");
  assert.equal(snapshot.summary.total_records, 3);
  assert.equal(snapshot.summary.successful_predictions, 1);
  assert.equal(snapshot.summary.missed_predictions, 1);
  assert.equal(snapshot.summary.low_attribution_outcomes, 1);
  assert.equal(snapshot.summary.unknown_outcomes, 1);
  assert.equal(snapshot.summary.policy_update_candidates, 1);

  assert.deepEqual(
    snapshot.cards.map((card) => card.RESULT_VS_PREDICTION),
    ["WITHIN_RANGE", "MISSED_LOW", "UNKNOWN"]
  );
});

test("successful prediction can produce strong causal learning and a policy candidate", () => {
  const card = toDecisionLearningRecordCard(decisionLearningFixturesV1[0]);

  assert.equal(card.dashboard_flags.is_successful_prediction, true);
  assert.equal(card.dashboard_flags.learning_strength, "STRONG_CAUSAL_LEARNING");
  assert.equal(card.dashboard_flags.can_update_policy, true);
  assert.match(card.POLICY_UPDATE_CANDIDATE ?? "", /conservative traffic recovery ranges/i);
  assert.equal(card.CALIBRATION_ERROR, "LOW");
});

test("missed prediction is visible without inventing a policy update", () => {
  const card = toDecisionLearningRecordCard(decisionLearningFixturesV1[1]);

  assert.equal(card.dashboard_flags.is_missed_prediction, true);
  assert.equal(card.RESULT_VS_PREDICTION, "MISSED_LOW");
  assert.equal(card.CALIBRATION_ERROR, "MEDIUM");
  assert.equal(card.dashboard_flags.learning_strength, "DIRECTIONAL_LEARNING");
  assert.equal(card.dashboard_flags.can_update_policy, false);
  assert.equal(card.POLICY_UPDATE_CANDIDATE, null);
});

test("low attribution outcomes cannot be represented as strong causal learning", () => {
  const card = toDecisionLearningRecordCard(decisionLearningFixturesV1[2]);

  assert.equal(card.ATTRIBUTION_CONFIDENCE, "LOW");
  assert.equal(card.dashboard_flags.is_low_attribution, true);
  assert.equal(card.dashboard_flags.learning_strength, "WEAK_SIGNAL_ONLY");
  assert.equal(card.dashboard_flags.can_update_policy, false);
  assert.equal(card.POLICY_UPDATE_CANDIDATE, null);
  assert.notEqual(learningStrengthFor(decisionLearningFixturesV1[2]), "STRONG_CAUSAL_LEARNING");
  assert.match(card.LESSON, /weak signal only/i);
});

test("UNKNOWN remains explicit for unresolved observed outcome", () => {
  const card = toDecisionLearningRecordCard(decisionLearningFixturesV1[2]);

  assert.equal(card.RESULT_VS_PREDICTION, "UNKNOWN");
  assert.equal(card.CALIBRATION_ERROR, "UNKNOWN");
  assert.equal(card.OBSERVED_OUTCOME.value, null);
  assert.match(card.OBSERVED_OUTCOME.unknown_reason ?? "", /conflicts with commerce-source evidence/i);
  assert.equal(card.dashboard_flags.is_unknown_outcome, true);
  assert.notEqual(card.RESULT_VS_PREDICTION, "NONE");
  assert.notEqual(card.RESULT_VS_PREDICTION, false);
  assert.notEqual(card.RESULT_VS_PREDICTION, null);
});

test("custom snapshot preserves action status, assumptions, success criteria, and evaluation window", () => {
  const snapshot = buildDecisionLearningSnapshot([decisionLearningFixturesV1[0]], "2026-08-17T21:00:00.000Z");
  const [card] = snapshot.cards;

  assert.equal(snapshot.generated_at, "2026-08-17T21:00:00.000Z");
  assert.equal(card.ACTION_STATUS, "successful");
  assert.ok(card.KEY_ASSUMPTIONS.length > 0);
  assert.ok(card.SUCCESS_CRITERIA.length > 0);
  assert.deepEqual(card.EVALUATION_WINDOW, { start: "2026-08-01", end: "2026-08-07" });
  assert.equal(card.PREDICTED_OUTCOME_RANGE.metric, card.OBSERVED_OUTCOME.metric);
});
