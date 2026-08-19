import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCalibrationEvaluationV1,
  confidenceCapForEvidenceV1,
  observedOutcomeMatchesPredictionV1
} from "@/lib/intelligence/performance-v2/phase-c/contracts";
import {
  PHASE_C_CALIBRATION_EVALUATION_FIXTURE_V1,
  PHASE_C_OUTCOME_LEARNING_FIXTURES_V1
} from "@/lib/intelligence/performance-v2/phase-c/fixtures";

const byRecommendation = (recommendationId: string) => {
  const record = PHASE_C_OUTCOME_LEARNING_FIXTURES_V1.find((item) => item.recommendation_id === recommendationId);
  assert.ok(record, `missing fixture ${recommendationId}`);
  return record;
};

test("confidence can be evaluated against observed outcomes over time", () => {
  const traffic = byRecommendation("rec-qualified-traffic-recovery");
  const prestige = byRecommendation("rec-prestige-partner-outreach");
  const evaluation = buildCalibrationEvaluationV1([traffic, prestige]);

  assert.equal(observedOutcomeMatchesPredictionV1(traffic), true);
  assert.equal(observedOutcomeMatchesPredictionV1(prestige), false);
  assert.equal(evaluation.records_evaluated, 2);
  assert.equal(evaluation.hit_rate, 0.5);
  assert.deepEqual(evaluation.misses, ["rec-prestige-partner-outreach"]);
});

test("low evidence cannot present high confidence without explicit exception evidence", () => {
  const prestige = byRecommendation("rec-prestige-partner-outreach");

  assert.equal(confidenceCapForEvidenceV1(prestige.recommendation_snapshot.evidence_snapshot), 0.5);
  assert.equal(prestige.recommendation_snapshot.stated_confidence.score, 0.5);
  assert.match(prestige.recommendation_snapshot.stated_confidence.cap_reason ?? "", /Evidence quality caps confidence/);
});

test("feedback capture distinguishes bounded reason codes without universalizing one decision", () => {
  const reasonCodes = new Set(PHASE_C_OUTCOME_LEARNING_FIXTURES_V1.flatMap((record) => record.feedback.map((feedback) => feedback.reason_code)));
  assert.ok(reasonCodes.has("FEASIBILITY"));
  assert.ok(reasonCodes.has("EVIDENCE_DISAGREEMENT"));
  assert.ok(reasonCodes.has("TIMING"));

  for (const record of PHASE_C_OUTCOME_LEARNING_FIXTURES_V1) {
    for (const feedback of record.feedback) {
      assert.equal(feedback.applies_universally, false);
      assert.ok(feedback.bounded_context.length > 0);
    }
  }
});

test("outcome attribution remains uncertain when causation is unclear", () => {
  const deferred = byRecommendation("rec-launch-collab-concept");
  const rejected = byRecommendation("rec-prestige-partner-outreach");

  assert.equal(deferred.observed_outcome.value, null);
  assert.equal(deferred.attribution.confidence, "UNKNOWN");
  assert.equal(observedOutcomeMatchesPredictionV1(deferred), null);
  assert.equal(rejected.action.taken, false);
  assert.equal(rejected.attribution.confidence, "LOW");
});

test("policy changes remain shadowed or require architect review before promotion", () => {
  const evaluation = PHASE_C_CALIBRATION_EVALUATION_FIXTURE_V1;

  assert.equal(evaluation.architect_review_required, true);
  assert.ok(evaluation.shadow_policy_suggestions.length >= 2);
  assert.ok(
    evaluation.shadow_policy_suggestions.every((lesson) =>
      lesson.policy_promotion_state === "SHADOW_ONLY" || lesson.policy_promotion_state === "ARCHITECT_REVIEW_REQUIRED"
    )
  );
});

test("fixture contract is deterministic and sorted", () => {
  assert.deepEqual(
    PHASE_C_OUTCOME_LEARNING_FIXTURES_V1.map((record) => record.record_id),
    [
      "phase-c-record-low-evidence-prestige",
      "phase-c-record-timing-deferred",
      "phase-c-record-traffic-recovery"
    ]
  );
  assert.equal(JSON.stringify(PHASE_C_OUTCOME_LEARNING_FIXTURES_V1), JSON.stringify([...PHASE_C_OUTCOME_LEARNING_FIXTURES_V1]));
});
