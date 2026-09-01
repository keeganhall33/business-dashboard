import assert from "node:assert/strict";
import { test } from "node:test";

import { assessStrategyRecommendationFreshnessV1 } from "@/lib/core-intelligence/strategy-recommendation-freshness/adapter";
import {
  STRATEGY_RECOMMENDATION_FRESHNESS_INPUTS_V1,
  STRATEGY_RECOMMENDATION_FRESHNESS_RESULTS_V1
} from "@/lib/core-intelligence/strategy-recommendation-freshness/fixtures";

function result(id: string) {
  const item = STRATEGY_RECOMMENDATION_FRESHNESS_RESULTS_V1.find((candidate) => candidate.recommendation_id === id);
  assert.ok(item, `missing result ${id}`);
  return item;
}

test("strategy recommendation freshness fixtures cover current stale and conflicted states", () => {
  assert.deepEqual(
    STRATEGY_RECOMMENDATION_FRESHNESS_RESULTS_V1.map((item) => item.freshness_state),
    ["CURRENT", "STALE", "CONFLICTED"]
  );
  assert.deepEqual(
    STRATEGY_RECOMMENDATION_FRESHNESS_RESULTS_V1.map((item) => item.REVIEW_REQUIRED),
    [false, true, true]
  );
});

test("current recommendation remains valid with prior rationale inspectable", () => {
  const current = result("rec-current-private-room-proof");

  assert.equal(current.contract_version, "strategy_recommendation_freshness_v1");
  assert.equal(current.review_age_days, 3);
  assert.equal(current.material_new_evidence_since_review.length, 0);
  assert.equal(current.stale_inputs.length, 0);
  assert.equal(current.conflicted_inputs.length, 0);
  assert.equal(current.freshness_state, "CURRENT");
  assert.equal(current.CURRENT_DASHBOARD_PROJECTION.truth_state, "KNOWN");
  assert.equal(current.REVIEW_REQUIRED, false);
  assert.match(current.prior_rationale.reason, /still aligns/);
  assert.equal(current.mutation_performed, false);
  assert.equal(current.keegan_action_required, "NO");
});

test("material new evidence after last review forces stale review state", () => {
  const stale = result("rec-stale-event-path");

  assert.equal(stale.review_age_days, 20);
  assert.equal(stale.material_new_evidence_since_review.length, 1);
  assert.equal(stale.stale_inputs.length, 1);
  assert.equal(stale.freshness_state, "STALE");
  assert.equal(stale.CURRENT_DASHBOARD_PROJECTION.truth_state, "STALE");
  assert.equal(stale.REVIEW_REQUIRED, true);
  assert.match(stale.REVIEW_REASON.join(" "), /material new evidence/i);
  assert.match(stale.CURRENT_DASHBOARD_PROJECTION.what_to_review_next, /Review material new or stale evidence/);
  assert.match(stale.prior_rationale.reason, /Older evidence suggested prestige upside/);
});

test("conflicted evidence cannot masquerade as current", () => {
  const conflicted = result("rec-conflicted-scale-meta");

  assert.equal(conflicted.material_new_evidence_since_review.length, 1);
  assert.equal(conflicted.conflicted_inputs.length, 1);
  assert.equal(conflicted.freshness_state, "CONFLICTED");
  assert.equal(conflicted.CURRENT_DASHBOARD_PROJECTION.truth_state, "CONFLICTED");
  assert.equal(conflicted.REVIEW_REQUIRED, true);
  assert.match(conflicted.REVIEW_REASON.join(" "), /conflicted evidence/i);
  assert.match(conflicted.CURRENT_DASHBOARD_PROJECTION.what_to_review_next, /Resolve conflicted evidence/);
  assert.match(conflicted.prior_rationale.assumptions.join(" "), /matchback not required/);
});

test("adapter is deterministic and preserves recommendation snapshots without mutation", () => {
  const input = structuredClone(STRATEGY_RECOMMENDATION_FRESHNESS_INPUTS_V1[1]!);
  const before = structuredClone(input.recommendation);
  const first = assessStrategyRecommendationFreshnessV1(input);
  const second = assessStrategyRecommendationFreshnessV1(input);

  assert.deepEqual(first, second);
  assert.deepEqual(input.recommendation, before);
  assert.deepEqual(first.recommendation_snapshot, before);
  assert.equal(first.mutation_performed, false);
});
