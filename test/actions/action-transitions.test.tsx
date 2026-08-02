import test from "node:test";
import assert from "node:assert/strict";

import { isValidTransition } from "@/lib/actions/action-transitions";

test("action transition matrix: allows minimum required transitions", () => {
  assert.equal(
    isValidTransition({
      from_status: "recommended",
      to_status: "draft_prepared",
      from_level: "L1_RECOMMENDATION",
      to_level: "L2_DRAFT_PREPARED"
    }),
    true
  );

  assert.equal(
    isValidTransition({
      from_status: "draft_prepared",
      to_status: "awaiting_approval",
      from_level: "L2_DRAFT_PREPARED",
      to_level: "L3_READY_FOR_APPROVAL"
    }),
    true
  );

  assert.equal(
    isValidTransition({
      from_status: "awaiting_approval",
      to_status: "approved",
      from_level: "L3_READY_FOR_APPROVAL",
      to_level: "L4_APPROVED_FOR_EXECUTION"
    }),
    true
  );
});

test("action transition matrix: rejects invalid transition", () => {
  assert.equal(
    isValidTransition({
      from_status: "recommended",
      to_status: "approved",
      from_level: "L1_RECOMMENDATION",
      to_level: "L4_APPROVED_FOR_EXECUTION"
    }),
    false
  );
});

test("action transition matrix: supports synthetic measurement lane", () => {
  assert.equal(
    isValidTransition({
      from_status: "approved",
      to_status: "measuring",
      from_level: "L4_APPROVED_FOR_EXECUTION",
      to_level: "L5_EXECUTED_AND_MEASURED"
    }),
    true
  );

  assert.equal(
    isValidTransition({
      from_status: "measuring",
      to_status: "successful",
      from_level: "L5_EXECUTED_AND_MEASURED",
      to_level: "L5_EXECUTED_AND_MEASURED"
    }),
    true
  );
});

test("action transition matrix: supports snooze and unsnooze", () => {
  assert.equal(
    isValidTransition({
      from_status: "awaiting_approval",
      to_status: "snoozed",
      from_level: "L3_READY_FOR_APPROVAL",
      to_level: "L3_READY_FOR_APPROVAL"
    }),
    true
  );
  assert.equal(
    isValidTransition({
      from_status: "snoozed",
      to_status: "awaiting_approval",
      from_level: "L3_READY_FOR_APPROVAL",
      to_level: "L3_READY_FOR_APPROVAL"
    }),
    true
  );
});
