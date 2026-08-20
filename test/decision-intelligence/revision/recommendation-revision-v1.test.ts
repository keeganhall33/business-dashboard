import assert from "node:assert/strict";
import test from "node:test";

import { reviseRecommendationVersionV1 } from "@/lib/decision-intelligence/revision/adapter";
import {
  RECOMMENDATION_REVISION_BASE_VERSION_V1,
  RECOMMENDATION_REVISION_CORRECTION_RESULT_V1,
  RECOMMENDATION_REVISION_HUMAN_FACT_RESULT_V1,
  RECOMMENDATION_REVISION_HYPOTHETICAL_RESULT_V1,
  RECOMMENDATION_REVISION_INPUT_FIXTURES_V1
} from "@/lib/decision-intelligence/revision/fixtures";

test("hypothetical input never mutates memory, facts, or recommendation versions", () => {
  const result = RECOMMENDATION_REVISION_HYPOTHETICAL_RESULT_V1;

  assert.equal(result.classification, "HYPOTHETICAL");
  assert.equal(result.facts_mutated, false);
  assert.equal(result.memory_mutated, false);
  assert.equal(result.hypothetical_not_promoted_to_fact, true);
  assert.equal(result.diff, null);
  assert.equal(result.active_recommendation.version, 1);
  assert.deepEqual(result.active_recommendation, result.old_recommendation);
  assert.equal(result.provenance.memory_write_allowed, false);
});

test("human-reported fact preserves provenance and creates transparent N to N+1 diff", () => {
  const result = RECOMMENDATION_REVISION_HUMAN_FACT_RESULT_V1;

  assert.equal(result.classification, "HUMAN_REPORTED_FACT");
  assert.equal(result.facts_mutated, true);
  assert.equal(result.memory_mutated, true);
  assert.equal(result.old_recommendation.version, 1);
  assert.equal(result.active_recommendation.version, 2);
  assert.equal(result.preserved_versions.at(-1)?.version, 1);
  assert.ok(result.diff);
  assert.equal(result.diff.previous_version, 1);
  assert.equal(result.diff.next_version, 2);
  assert.equal(result.diff.confidence_delta.direction, "UP");
  assert.equal(result.diff.urgency_delta, "CHANGED");
  assert.equal(result.diff.action_delta, "CHANGED");
  assert.deepEqual(result.diff.added_evidence_ids, ["ev-human-confirmed-host-intro"]);
  assert.deepEqual(result.diff.changed_assumption_ids, ["as-access-can-be-tested"]);
  assert.ok(result.diff.why_changed.some((item) => item.includes("access-route unknown")));
  assert.ok(result.active_recommendation.evidence_refs.some((item) => item.evidence_id === "ev-human-confirmed-host-intro" && item.provenance.kind === "HUMAN_REPORTED_FACT"));
  assert.ok(result.unknowns_explicit);
});

test("correction creates a new version, preserves history, and keeps conflicted evidence explicit", () => {
  const result = RECOMMENDATION_REVISION_CORRECTION_RESULT_V1;

  assert.equal(result.classification, "CORRECTION");
  assert.equal(result.old_recommendation.version, 2);
  assert.equal(result.active_recommendation.version, 3);
  assert.equal(result.preserved_versions.map((item) => item.version).join(","), "1,2");
  assert.ok(result.diff);
  assert.equal(result.diff.confidence_delta.direction, "DOWN");
  assert.equal(result.diff.approval_class_delta, "CHANGED");
  assert.equal(result.diff.before.approval_level, "L1_RECOMMENDATION");
  assert.equal(result.diff.after.approval_level, "L0_INSIGHT");
  assert.ok(result.diff.after.conflicts.includes("Reported intro exists, but decision-maker access is conflicted."));
  assert.ok(result.active_recommendation.evidence_refs.some((item) => item.truth_state === "CONFLICTED"));
  assert.equal(result.conflicted_evidence_explicit, true);
  assert.ok(result.unknowns_explicit);
});

test("UNKNOWN evidence remains explicit and is not collapsed to no evidence", () => {
  const base = RECOMMENDATION_REVISION_BASE_VERSION_V1;

  assert.ok(base.evidence_refs.some((item) => item.truth_state === "UNKNOWN"));
  assert.ok(base.unknowns.includes("Verified host/sponsor route"));
  assert.ok(RECOMMENDATION_REVISION_HUMAN_FACT_RESULT_V1.active_recommendation.unknowns.includes("Direct event economics"));
  assert.ok(RECOMMENDATION_REVISION_CORRECTION_RESULT_V1.active_recommendation.unknowns.includes("Verified host/sponsor route"));
});

test("adapter is deterministic for fixture replay", () => {
  const replay = reviseRecommendationVersionV1({
    current: RECOMMENDATION_REVISION_BASE_VERSION_V1,
    revisionInput: RECOMMENDATION_REVISION_INPUT_FIXTURES_V1[1]!
  });

  assert.deepEqual(replay, RECOMMENDATION_REVISION_HUMAN_FACT_RESULT_V1);
  assert.equal(replay.contract_version, "recommendation_revision_v1");
  assert.equal(replay.keegan_action_required, "NO");
});
