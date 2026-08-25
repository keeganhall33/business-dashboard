import assert from "node:assert/strict";
import test from "node:test";

import { resolveRelationshipNextStepAgingV1 } from "@/lib/relationship-intelligence/next-step-aging/adapter";
import {
  RELATIONSHIP_NEXT_STEP_AGING_FIXTURES_V1,
  RELATIONSHIP_NEXT_STEP_AGING_INPUT_FIXTURES_V1
} from "@/lib/relationship-intelligence/next-step-aging/fixtures";

function fixture(id: string) {
  const item = RELATIONSHIP_NEXT_STEP_AGING_FIXTURES_V1.find((candidate) => candidate.target_id === id);
  assert.ok(item, `missing fixture ${id}`);
  return item;
}

test("fixtures cover timely, aging, dormant intentional, and UNKNOWN timing states", () => {
  assert.deepEqual(
    RELATIONSHIP_NEXT_STEP_AGING_FIXTURES_V1.map((item) => item.target_id),
    [
      "aging-timely-collector-bridge",
      "aging-boardroom-editorial-window",
      "aging-dormant-intentional-brand",
      "aging-unknown-timing-cultural-bridge"
    ]
  );
  assert.deepEqual(
    RELATIONSHIP_NEXT_STEP_AGING_FIXTURES_V1.map((item) => item.timing_trigger),
    ["TIMELY", "AGING", "DORMANT_INTENTIONAL", "UNKNOWN"]
  );
});

test("timely next step stays visible without review escalation", () => {
  const timely = fixture("aging-timely-collector-bridge");

  assert.equal(timely.contract_version, "relationship_next_step_aging_v1.0");
  assert.equal(timely.next_step_age_days, 2);
  assert.equal(timely.timing_trigger, "TIMELY");
  assert.equal(timely.REVIEW_REQUIRED, false);
  assert.match(timely.WHY_IT_MATTERS, /inside its useful window/i);
  assert.equal(timely.external_action_allowed, false);
});

test("meaningful aging surfaces before opportunity loss", () => {
  const aging = fixture("aging-boardroom-editorial-window");

  assert.equal(aging.next_step_age_days, 17);
  assert.equal(aging.useful_window_days, 10);
  assert.equal(aging.timing_trigger, "AGING");
  assert.equal(aging.opportunity_importance, "HIGH");
  assert.equal(aging.REVIEW_REQUIRED, true);
  assert.match(aging.WHAT_AGED.join(" "), /17 days old against 10 day useful window/);
  assert.match(aging.WHY_IT_MATTERS, /reviewed before relationship context goes stale/i);
  assert.match(aging.NEXT_SAFE_INTERNAL_ACTION, /Review the internal next step and refresh evidence/i);
});

test("intentional defer is not mislabeled stale", () => {
  const dormant = fixture("aging-dormant-intentional-brand");

  assert.equal(dormant.evidence_freshness, "STALE");
  assert.equal(dormant.timing_trigger, "DORMANT_INTENTIONAL");
  assert.equal(dormant.REVIEW_REQUIRED, false);
  assert.equal(dormant.intentional_defer_preserved, true);
  assert.match(dormant.WHY_IT_MATTERS, /Intentional defer is preserved/);
  assert.match(dormant.NEXT_SAFE_INTERNAL_ACTION, /Keep deferred internally/);
});

test("UNKNOWN timing remains explicit and blocks fake urgency", () => {
  const unknown = fixture("aging-unknown-timing-cultural-bridge");

  assert.equal(unknown.next_step_age_days, null);
  assert.equal(unknown.useful_window_days, null);
  assert.equal(unknown.timing_trigger, "UNKNOWN");
  assert.equal(unknown.unknown_timing_explicit, true);
  assert.equal(unknown.REVIEW_REQUIRED, false);
  assert.match(unknown.WHAT_AGED.join(" "), /age UNKNOWN/);
  assert.match(unknown.WHY_IT_MATTERS, /Timing remains UNKNOWN/);
  assert.match(unknown.NEXT_SAFE_INTERNAL_ACTION, /Clarify timing evidence internally/);
});

test("adapter replay is deterministic and read-only", () => {
  const replay = RELATIONSHIP_NEXT_STEP_AGING_INPUT_FIXTURES_V1.map((input) => resolveRelationshipNextStepAgingV1(input));

  assert.deepEqual(replay, RELATIONSHIP_NEXT_STEP_AGING_FIXTURES_V1);
  assert.ok(replay.every((item) => item.external_action_allowed === false));
  assert.ok(replay.every((item) => item.NEXT_SAFE_INTERNAL_ACTION.length > 0));
  assert.ok(replay.every((item) => item.WHAT_AGED.length > 0));
  assert.ok(replay.every((item) => item.WHY_IT_MATTERS.length > 0));
});
