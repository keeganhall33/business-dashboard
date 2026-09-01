import assert from "node:assert/strict";
import { test } from "node:test";
import { assessDecisionConfidenceGuardV1 } from "@/lib/decision-intelligence/confidence-guard/adapter";
import {
  DECISION_CONFIDENCE_GUARD_CONFLICTED_RESULT_V1,
  DECISION_CONFIDENCE_GUARD_DEGRADED_RESULT_V1,
  DECISION_CONFIDENCE_GUARD_INPUT_FIXTURES_V1,
  DECISION_CONFIDENCE_GUARD_STABLE_RESULT_V1
} from "@/lib/decision-intelligence/confidence-guard/fixtures";

test("stable evidence keeps recommendation current and prior rationale inspectable", () => {
  const result = DECISION_CONFIDENCE_GUARD_STABLE_RESULT_V1;

  assert.equal(result.contract_version, "decision_confidence_guard_v1");
  assert.equal(result.guard_state, "CURRENT");
  assert.equal(result.review_required, false);
  assert.equal(result.confidence_before, "likely");
  assert.equal(result.confidence_now, "likely");
  assert.equal(result.confidence_delta, "UNCHANGED");
  assert.equal(result.history_preserved, true);
  assert.equal(result.mutation_performed, false);
  assert.equal(result.prior_rationale.version, result.active_recommendation_snapshot.version);
  assert.equal(result.dashboard_projection.prior_rationale_visible, true);
  assert.deepEqual(result.degrading_inputs, []);
});

test("material evidence degradation forces review and cannot masquerade as actionable current confidence", () => {
  const result = DECISION_CONFIDENCE_GUARD_DEGRADED_RESULT_V1;

  assert.equal(result.guard_state, "REVIEW_REQUIRED");
  assert.equal(result.review_required, true);
  assert.equal(result.confidence_before, "likely");
  assert.equal(result.confidence_now, "possible");
  assert.equal(result.confidence_delta, "DOWN");
  assert.ok(result.degrading_inputs.some((item) => item.reason === "STALE"));
  assert.ok(result.degrading_inputs.some((item) => item.reason === "LOW_QUALITY"));
  assert.equal(result.stale_sources.length, 1);
  assert.equal(result.conflicted_sources.length, 0);
  assert.equal(result.dashboard_projection.status, "REVIEW_REQUIRED");
  assert.equal(result.dashboard_projection.degrading_input_count, 2);
});

test("conflicted evidence forces insufficient confidence and remains explicit", () => {
  const result = DECISION_CONFIDENCE_GUARD_CONFLICTED_RESULT_V1;

  assert.equal(result.guard_state, "REVIEW_REQUIRED");
  assert.equal(result.review_required, true);
  assert.equal(result.confidence_now, "insufficient_evidence");
  assert.equal(result.conflicted_sources.length, 1);
  assert.ok(result.degrading_inputs.some((item) => item.reason === "CONFLICTED"));
  assert.equal(result.dashboard_projection.conflicted_source_count, 1);
  assert.ok(result.dashboard_projection.rows.some((row) => row.state === "CONFLICTED"));
});

test("guard preserves prior recommendation object instead of silently downgrading history", () => {
  const input = DECISION_CONFIDENCE_GUARD_INPUT_FIXTURES_V1[1]!;
  const before = structuredClone(input.recommendation);
  const result = assessDecisionConfidenceGuardV1(input);

  assert.deepEqual(input.recommendation, before);
  assert.deepEqual(result.active_recommendation_snapshot, before);
  assert.equal(result.active_recommendation_snapshot.confidence, "likely");
  assert.equal(result.confidence_now, "possible");
  assert.equal(result.prior_rationale.summary, before.recommendation_summary);
  assert.equal(result.keegan_action_required, "NO");
});
