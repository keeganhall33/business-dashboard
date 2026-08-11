import test from "node:test";
import assert from "node:assert/strict";

import { canTransition, MAX_AUTONOMOUS_REVIEW_ITERATIONS_DEFAULT } from "../src/lib/agent-orchestration-v1/state-machine";

test("agent orchestration v1: transition matrix allows required transitions", () => {
  assert.ok(canTransition("DRAFT", "READY"));
  assert.ok(canTransition("READY", "RUNNING"));
  assert.ok(canTransition("RUNNING", "AWAITING_REVIEW"));
  assert.ok(canTransition("AWAITING_REVIEW", "APPROVED"));
  assert.ok(canTransition("APPROVED", "COMPLETED"));
});

test("agent orchestration v1: invalid transitions are rejected", () => {
  assert.equal(canTransition("COMPLETED", "RUNNING"), false);
  assert.equal(canTransition("DRAFT", "COMPLETED"), false);
});

test("agent orchestration v1: review loop default max iterations is conservative", () => {
  assert.equal(MAX_AUTONOMOUS_REVIEW_ITERATIONS_DEFAULT, 2);
});

