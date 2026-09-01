import assert from "node:assert/strict";
import { test } from "node:test";
import { assessRecommendationContradictionsV1 } from "@/lib/core-intelligence/recommendation-contradiction/adapter";
import {
  RECOMMENDATION_CONTRADICTION_COMPATIBLE_INPUT_V1,
  RECOMMENDATION_CONTRADICTION_COMPATIBLE_RESULT_V1,
  RECOMMENDATION_CONTRADICTION_CONFLICTING_INPUT_V1,
  RECOMMENDATION_CONTRADICTION_CONFLICTING_RESULT_V1,
  RECOMMENDATION_CONTRADICTION_UNKNOWN_RESULT_V1
} from "@/lib/core-intelligence/recommendation-contradiction/fixtures";

test("compatible recommendations remain review-free with prior rationale preserved", () => {
  const result = RECOMMENDATION_CONTRADICTION_COMPATIBLE_RESULT_V1;

  assert.equal(result.contract_version, "recommendation_contradiction_v1");
  assert.equal(result.REVIEW_REQUIRED, false);
  assert.deepEqual(result.WHAT_CONFLICTS, []);
  assert.equal(result.compatible_pairs.length, 1);
  assert.equal(result.compatible_pairs[0]?.truth_state, "KNOWN");
  assert.equal(result.prior_rationale.length, 2);
  assert.equal(result.prior_rationale[0]?.reason, RECOMMENDATION_CONTRADICTION_COMPATIBLE_INPUT_V1.recommendations[0]?.reason);
  assert.equal(result.mutation_performed, false);
  assert.equal(result.keegan_action_required, "NO");
});

test("conflicting recommendations surface objective, resource, timing, and evidence assumption conflicts", () => {
  const result = RECOMMENDATION_CONTRADICTION_CONFLICTING_RESULT_V1;
  const axes = new Set(result.WHAT_CONFLICTS.map((item) => item.axis));

  assert.equal(result.REVIEW_REQUIRED, true);
  assert.equal(result.WHAT_CONFLICTS.every((item) => item.truth_state === "CONFLICTED"), true);
  assert.equal(result.WHAT_CONFLICTS.every((item) => item.REVIEW_REQUIRED), true);
  assert.equal(result.WHAT_CONFLICTS.every((item) => item.prior_rationale_preserved), true);
  assert.ok(axes.has("OBJECTIVE"));
  assert.ok(axes.has("RESOURCE_USE"));
  assert.ok(axes.has("TIMING"));
  assert.ok(axes.has("EVIDENCE_ASSUMPTION"));
  assert.ok(result.WHY.some((item) => item.includes("OBJECTIVE")));
  assert.ok(result.WHY.some((item) => item.includes("EVIDENCE_ASSUMPTION")));
});

test("UNKNOWN cases stay explicit instead of becoming fake contradictions", () => {
  const result = RECOMMENDATION_CONTRADICTION_UNKNOWN_RESULT_V1;

  assert.equal(result.REVIEW_REQUIRED, false);
  assert.deepEqual(result.WHAT_CONFLICTS, []);
  assert.ok(result.UNKNOWN.some((item) => item.field === "cost"));
  assert.ok(result.UNKNOWN.some((item) => item.field === "effort"));
  assert.ok(result.UNKNOWN.some((item) => item.field === "timing"));
  assert.ok(result.UNKNOWN.some((item) => item.field === "evidence"));
  assert.ok(result.UNKNOWN.some((item) => item.field === "assumptions"));
  assert.equal(result.compatible_pairs.length, 0);
  assert.equal(result.WHY[0], "No explicit contradiction was detected across current recommendation records.");
});

test("assessment is deterministic and does not mutate recommendation records", () => {
  const input = structuredClone(RECOMMENDATION_CONTRADICTION_CONFLICTING_INPUT_V1);
  const before = structuredClone(input.recommendations);
  const first = assessRecommendationContradictionsV1(input);
  const second = assessRecommendationContradictionsV1(input);

  assert.deepEqual(input.recommendations, before);
  assert.deepEqual(first, second);
  assert.deepEqual(first.recommendation_snapshots, before);
  assert.equal(first.prior_rationale[0]?.recommended_action, before[0]?.recommended_action);
});
