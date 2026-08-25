import assert from "node:assert/strict";
import test from "node:test";

import { resolveRelationshipOpportunityConfidenceAgingV1 } from "@/lib/relationship-intelligence/opportunity-confidence-aging/adapter";
import {
  RELATIONSHIP_OPPORTUNITY_CONFIDENCE_AGING_FIXTURES_V1,
  RELATIONSHIP_OPPORTUNITY_CONFIDENCE_AGING_INPUT_FIXTURES_V1
} from "@/lib/relationship-intelligence/opportunity-confidence-aging/fixtures";

function fixture(id: string) {
  const item = RELATIONSHIP_OPPORTUNITY_CONFIDENCE_AGING_FIXTURES_V1.find((candidate) => candidate.opportunity_id === id);
  assert.ok(item, `missing fixture ${id}`);
  return item;
}

test("fixtures cover fresh aged and UNKNOWN relationship opportunity confidence states", () => {
  assert.deepEqual(
    RELATIONSHIP_OPPORTUNITY_CONFIDENCE_AGING_FIXTURES_V1.map((item) => item.opportunity_id),
    ["confidence-fresh-collector-circle", "confidence-aged-boardroom-story-fit", "confidence-unknown-cultural-bridge"]
  );
  assert.deepEqual(
    RELATIONSHIP_OPPORTUNITY_CONFIDENCE_AGING_FIXTURES_V1.map((item) => item.REVIEW_REQUIRED),
    [false, true, false]
  );
});

test("fresh high-confidence opportunity stays read-only without review escalation", () => {
  const fresh = fixture("confidence-fresh-collector-circle");

  assert.equal(fresh.contract_version, "relationship_opportunity_confidence_aging_v1.0");
  assert.equal(fresh.evidence_age_days, 2);
  assert.equal(fresh.confidence_age_days, 2);
  assert.equal(fresh.timing_age_days, 1);
  assert.equal(fresh.confidence, "likely");
  assert.equal(fresh.truth_state, "KNOWN");
  assert.equal(fresh.REVIEW_REQUIRED, false);
  assert.deepEqual(fresh.REVIEW_REASON, []);
  assert.match(fresh.NEXT_SAFE_INTERNAL_ACTION, /Defer outreach/);
  assert.equal(fresh.external_action_allowed, false);
});

test("aged relationship evidence and confidence require bounded internal review", () => {
  const aged = fixture("confidence-aged-boardroom-story-fit");

  assert.equal(aged.evidence_age_days, 24);
  assert.equal(aged.confidence_age_days, 23);
  assert.equal(aged.timing_age_days, 20);
  assert.equal(aged.truth_state, "STALE");
  assert.equal(aged.REVIEW_REQUIRED, true);
  assert.deepEqual(aged.REVIEW_REASON, ["EVIDENCE_AGED", "TIMING_AGED", "CONFIDENCE_OUTDATED", "TRUTH_STATE_RISK"]);
  assert.match(aged.WHAT_AGED.join(" "), /Evidence age: 24 days against 14 day review window/);
  assert.match(aged.WHY_IT_MATTERS, /aged or uncertain relationship evidence/i);
  assert.match(aged.NEXT_SAFE_INTERNAL_ACTION, /Review Boardroom evidence freshness/);
  assert.equal(aged.external_action_allowed, false);
});

test("UNKNOWN evidence and timing remain explicit without fake certainty or outreach", () => {
  const unknown = fixture("confidence-unknown-cultural-bridge");

  assert.equal(unknown.evidence_age_days, null);
  assert.equal(unknown.confidence_age_days, null);
  assert.equal(unknown.timing_age_days, null);
  assert.equal(unknown.confidence, "insufficient_evidence");
  assert.equal(unknown.truth_state, "UNKNOWN");
  assert.equal(unknown.timing_state, "UNKNOWN");
  assert.equal(unknown.REVIEW_REQUIRED, false);
  assert.deepEqual(unknown.REVIEW_REASON, ["UNKNOWN_EVIDENCE", "TRUTH_STATE_RISK"]);
  assert.match(unknown.UNKNOWN.join(" "), /Evidence age is UNKNOWN/);
  assert.match(unknown.WHY_IT_MATTERS, /cannot rely on aged or uncertain relationship evidence/i);
  assert.equal(unknown.external_action_allowed, false);
});

test("adapter replay is deterministic and preserves no-outreach safety", () => {
  const replay = RELATIONSHIP_OPPORTUNITY_CONFIDENCE_AGING_INPUT_FIXTURES_V1.map((input) =>
    resolveRelationshipOpportunityConfidenceAgingV1(input)
  );

  assert.deepEqual(replay, RELATIONSHIP_OPPORTUNITY_CONFIDENCE_AGING_FIXTURES_V1);
  assert.ok(replay.every((item) => item.external_action_allowed === false));
  assert.ok(replay.every((item) => item.WHAT_AGED.length > 0));
  assert.ok(replay.every((item) => item.WHY_IT_MATTERS.length > 0));
  assert.ok(replay.every((item) => item.NEXT_SAFE_INTERNAL_ACTION.length > 0));
});
