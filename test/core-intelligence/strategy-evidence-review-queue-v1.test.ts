import assert from "node:assert/strict";
import { test } from "node:test";

import { buildStrategyEvidenceReviewQueueV1 } from "@/lib/core-intelligence/strategy-evidence-review/adapter";
import { STRATEGY_EVIDENCE_REVIEW_QUEUE_INPUT_V1, STRATEGY_EVIDENCE_REVIEW_QUEUE_RESULT_V1 } from "@/lib/core-intelligence/strategy-evidence-review/fixtures";

test("strategy evidence review queue ranks contradiction and confidence failures as REVIEW_NOW", () => {
  const result = STRATEGY_EVIDENCE_REVIEW_QUEUE_RESULT_V1;

  assert.equal(result.contract_version, "strategy_evidence_review_queue_v1");
  assert.equal(result.REVIEW_NOW.length, 1);
  assert.equal(result.REVIEW_NOW[0]?.recommendation_id, "rec-scale-meta-collector-campaign");
  assert.equal(result.REVIEW_NOW[0]?.truth_state, "CONFLICTED");
  assert.ok((result.REVIEW_NOW[0]?.contradiction_count ?? 0) > 0);
  assert.ok((result.REVIEW_NOW[0]?.conflicted_source_count ?? 0) > 0);
  assert.match(result.REVIEW_NOW[0]?.WHAT_TO_REVIEW_NEXT ?? "", /Resolve contradiction evidence/);
});

test("UNKNOWN evidence gaps become REVIEW_NEXT without fake certainty", () => {
  const result = STRATEGY_EVIDENCE_REVIEW_QUEUE_RESULT_V1;
  const item = result.REVIEW_NEXT.find((candidate) => candidate.recommendation_id === "rec-unknown-event-partnership");

  assert.ok(item);
  assert.equal(item.truth_state, "UNKNOWN");
  assert.equal(item.disposition, "REVIEW_NEXT");
  assert.ok(item.unknown_count > 0);
  assert.ok(item.WHY_REVIEW.some((reason) => reason.includes("UNKNOWN")));
  assert.match(item.WHAT_TO_REVIEW_NEXT, /UNKNOWN evidence gap/);
});

test("stable compatible recommendation is deferred with prior recommendation snapshots preserved", () => {
  const result = STRATEGY_EVIDENCE_REVIEW_QUEUE_RESULT_V1;
  const item = result.DEFER.find((candidate) => candidate.recommendation_id === "rec-refresh-product-page");

  assert.ok(item);
  assert.equal(item.truth_state, "KNOWN");
  assert.equal(item.disposition, "DEFER");
  assert.equal(item.contradiction_count, 0);
  assert.equal(item.unknown_count, 0);
  assert.equal(result.recommendation_snapshots.length, STRATEGY_EVIDENCE_REVIEW_QUEUE_INPUT_V1.recommendations.length);
  assert.equal(result.mutation_performed, false);
  assert.equal(result.keegan_action_required, "NO");
});

test("adapter is deterministic and does not mutate recommendations", () => {
  const input = structuredClone(STRATEGY_EVIDENCE_REVIEW_QUEUE_INPUT_V1);
  const before = structuredClone(input.recommendations);
  const first = buildStrategyEvidenceReviewQueueV1(input);
  const second = buildStrategyEvidenceReviewQueueV1(input);

  assert.deepEqual(input.recommendations, before);
  assert.deepEqual(first, second);
  assert.deepEqual(first.recommendation_snapshots, before);
  assert.deepEqual(first.queue.map((item) => item.disposition), ["REVIEW_NOW", "REVIEW_NEXT", "DEFER"]);
});
