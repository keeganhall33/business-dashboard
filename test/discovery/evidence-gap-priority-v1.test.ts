import assert from "node:assert/strict";
import test from "node:test";

import { prioritizeEvidenceGapsV1 } from "@/lib/discovery/evidence-gap-priority/adapter";
import { EVIDENCE_GAP_PRIORITY_INPUT_V1, EVIDENCE_GAP_PRIORITY_RESULT_V1 } from "@/lib/discovery/evidence-gap-priority/fixtures";

test("evidence gap priority queue ranks the material decision-changing gap first", () => {
  const result = EVIDENCE_GAP_PRIORITY_RESULT_V1;

  assert.equal(result.contract_version, "evidence_gap_priority_v1");
  assert.equal(result.TOP_GAP?.gap_id, "gap-decision-maker-access");
  assert.equal(result.TOP_GAP?.decision_impact, "DECISION_CHANGING");
  assert.equal(result.TOP_GAP?.authority_gap, 4);
  assert.equal(result.TOP_GAP?.priority_state, "UNKNOWN");
  assert.match(result.TOP_GAP?.WHY_IT_MATTERS ?? "", /speculative exposure/);
  assert.match(result.TOP_GAP?.WHAT_TO_VERIFY_NEXT ?? "", /named host or decision-maker/);
});

test("UNKNOWN and conflicted evidence remain explicit in the queue", () => {
  const result = EVIDENCE_GAP_PRIORITY_RESULT_V1;

  assert.deepEqual(result.preserved_unknown_gap_ids, ["gap-decision-maker-access"]);
  assert.deepEqual(result.preserved_conflict_gap_ids, ["gap-budget-authority-conflict"]);
  assert.ok(result.queue.some((item) => item.gap_id === "gap-decision-maker-access" && item.truth_state === "UNKNOWN"));
  assert.ok(result.queue.some((item) => item.gap_id === "gap-budget-authority-conflict" && item.truth_state === "CONFLICTED"));
  assert.ok(result.WHAT_TO_VERIFY_NEXT.some((item) => item.includes("official budget owner")));
});

test("freshness, authority gap, reversibility, and verification cost affect deterministic priority", () => {
  const result = EVIDENCE_GAP_PRIORITY_RESULT_V1;
  const byId = new Map(result.queue.map((item) => [item.gap_id, item]));
  const access = byId.get("gap-decision-maker-access");
  const staleFit = byId.get("gap-partner-fit-refresh");
  const lowImpact = byId.get("gap-low-impact-merch-detail");

  assert.ok(access && staleFit && lowImpact);
  assert.ok(access.priority_score > staleFit.priority_score);
  assert.ok(staleFit.priority_score > lowImpact.priority_score);
  assert.equal(staleFit.freshness_state, "STALE");
  assert.equal(staleFit.authority_gap, 2);
  assert.equal(lowImpact.priority_state, "DEFER");
  assert.equal(lowImpact.verification_cost, "NOT_WORTH_IT");
});

test("adapter is deterministic and does not mutate gap evidence records", () => {
  const input = structuredClone(EVIDENCE_GAP_PRIORITY_INPUT_V1);
  const before = structuredClone(input);
  const first = prioritizeEvidenceGapsV1(input);
  const second = prioritizeEvidenceGapsV1(input);

  assert.deepEqual(input, before);
  assert.deepEqual(first, second);
  assert.equal(first.keegan_action_required, "NO");
  assert.deepEqual(first.WHY_IT_MATTERS, first.queue.map((item) => `${item.gap_id}: ${item.WHY_IT_MATTERS}`));
});
