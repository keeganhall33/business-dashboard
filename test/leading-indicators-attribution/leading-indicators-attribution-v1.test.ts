import assert from "node:assert/strict";
import test from "node:test";

import {
  attributionCanUpdateCausalPolicy,
  buildLearningHandoffRecordV1,
  deterioratingIndicators,
  registryTriggersReview
} from "@/lib/leading-indicators-attribution/contracts";
import {
  LEADING_INDICATOR_ATTRIBUTION_FIXTURES_V1,
  LEADING_INDICATOR_REGISTRY_FIXTURE_V1,
  MULTI_TOUCH_ATTRIBUTION_RECORD_FIXTURE_V1,
  UNKNOWN_ATTRIBUTION_RECORD_FIXTURE_V1
} from "@/lib/leading-indicators-attribution/fixtures";
import { toDecisionLearningRecordCard } from "@/lib/learning-engine/decision-record-v1";

test("leading-indicator registry renders deterministic inspectable definitions", () => {
  const registry = LEADING_INDICATOR_REGISTRY_FIXTURE_V1;

  assert.equal(registry.contract_version, "leading_indicator_registry_v1.0");
  assert.deepEqual(
    registry.definitions.map((definition) => definition.category).sort(),
    [
      "AUDIENCE_MEDIA_REACH",
      "CONVERSION_AOV",
      "PARTNERSHIP_LICENSING",
      "QUALIFIED_COLLECTOR_GROWTH",
      "WARM_INTRO_RELATIONSHIP"
    ].sort()
  );
  assert.ok(registry.definitions.every((definition) => definition.metric_id && definition.source && definition.decision_use));
  assert.ok(registry.definitions.every((definition) => definition.target_range.rationale.length > 10));
  assert.equal(JSON.stringify(LEADING_INDICATOR_ATTRIBUTION_FIXTURES_V1), JSON.stringify(LEADING_INDICATOR_ATTRIBUTION_FIXTURES_V1));
});

test("deteriorating leading indicators trigger review without pretending revenue changed", () => {
  const weakening = deterioratingIndicators(LEADING_INDICATOR_REGISTRY_FIXTURE_V1);

  assert.equal(registryTriggersReview(LEADING_INDICATOR_REGISTRY_FIXTURE_V1), true);
  assert.deepEqual(weakening.map((item) => item.metric_id), ["warm_intro_progression", "audience_media_reach_quality"]);
  assert.ok(weakening.every((item) => item.review_state === "REVIEW_TRIGGERED"));
  assert.ok(weakening.every((item) => item.revenue_conclusion === "UNKNOWN"));
  assert.equal(LEADING_INDICATOR_REGISTRY_FIXTURE_V1.dashboard_summary.revenue_has_changed, "UNKNOWN");
});

test("multi-touch attribution retains multiple contributors instead of winner-take-all", () => {
  const record = MULTI_TOUCH_ATTRIBUTION_RECORD_FIXTURE_V1;

  assert.equal(record.contract_version, "multi_touch_attribution_v1.0");
  assert.equal(record.contributors.length, 3);
  assert.deepEqual(
    record.contributors.map((contributor) => contributor.role),
    ["PRIMARY_CONTRIBUTOR", "SUPPORTING_CONTRIBUTOR", "SUPPORTING_CONTRIBUTOR"]
  );
  assert.equal(record.winner_take_all_blocked, true);
  assert.equal(record.contributors.reduce((sum, contributor) => sum + (contributor.contribution_weight ?? 0), 0), 1);
  assert.equal(record.attribution_confidence, "LOW");
});

test("correlation is not upgraded to causal fact or policy learning", () => {
  const record = MULTI_TOUCH_ATTRIBUTION_RECORD_FIXTURE_V1;
  const handoff = buildLearningHandoffRecordV1(record);
  const card = toDecisionLearningRecordCard(handoff);

  assert.equal(record.causal_claim_state, "CORRELATION_ONLY");
  assert.equal(attributionCanUpdateCausalPolicy(record), false);
  assert.equal(handoff.ATTRIBUTION_CONFIDENCE, "LOW");
  assert.equal(card.dashboard_flags.learning_strength, "WEAK_SIGNAL_ONLY");
  assert.equal(card.dashboard_flags.can_update_policy, false);
  assert.equal(card.POLICY_UPDATE_CANDIDATE, null);
});

test("missing attribution remains UNKNOWN", () => {
  const record = UNKNOWN_ATTRIBUTION_RECORD_FIXTURE_V1;
  const handoff = buildLearningHandoffRecordV1(record);

  assert.equal(record.attribution_confidence, "UNKNOWN");
  assert.equal(record.causal_claim_state, "UNKNOWN");
  assert.equal(record.contributors[0]?.contribution_weight, null);
  assert.equal(handoff.RESULT_VS_PREDICTION, "UNKNOWN");
  assert.equal(handoff.OBSERVED_OUTCOME.value, null);
  assert.match(handoff.OBSERVED_OUTCOME.unknown_reason ?? "", /missing/i);
});

test("forecast-vs-actual and attribution-confidence handoff uses existing learning semantics", () => {
  const handoff = LEADING_INDICATOR_ATTRIBUTION_FIXTURES_V1.learning_handoff;
  const card = toDecisionLearningRecordCard(handoff);

  assert.equal(handoff.PREDICTED_OUTCOME_RANGE.metric, handoff.OBSERVED_OUTCOME.metric);
  assert.equal(handoff.RESULT_VS_PREDICTION, "WITHIN_RANGE");
  assert.equal(handoff.ATTRIBUTION_CONFIDENCE, "LOW");
  assert.equal(card.dashboard_flags.is_successful_prediction, true);
  assert.equal(card.dashboard_flags.is_low_attribution, true);
  assert.equal(card.dashboard_flags.can_update_policy, false);
});

test("UNKNOWN indicator definitions never collapse to zero false or causal certainty", () => {
  const licensing = LEADING_INDICATOR_REGISTRY_FIXTURE_V1.definitions.find((definition) => definition.metric_id === "partnership_licensing_movement");
  const observation = LEADING_INDICATOR_REGISTRY_FIXTURE_V1.observations.find((item) => item.metric_id === "partnership_licensing_movement");

  assert.ok(licensing);
  assert.ok(observation);
  assert.equal(licensing.truth_state, "UNKNOWN");
  assert.equal(licensing.unit, "UNKNOWN");
  assert.equal(licensing.target_range.low, null);
  assert.equal(observation.current_value, null);
  assert.equal(observation.direction, "UNKNOWN");
  assert.equal(observation.revenue_conclusion, "UNKNOWN");
});
