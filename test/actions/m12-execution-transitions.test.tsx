import test from "node:test";
import assert from "node:assert/strict";

import { isValidExecutionTransition } from "@/lib/actions/execution/execution-transitions";

test("execution transition matrix allows required transitions", () => {
  const ok = [
    ["requested", "dry_run_succeeded"],
    ["dry_run_succeeded", "confirmation_required"],
    ["confirmation_required", "confirmed"],
    ["confirmed", "queued"],
    ["queued", "started"],
    ["started", "succeeded"],
    ["started", "partial_succeeded"],
    ["started", "failed"],
    ["started", "timeout"],
    ["queued", "cancel_requested"],
    ["confirmed", "cancel_requested"],
    ["started", "cancel_requested"],
    ["cancel_requested", "cancelled"],
    ["failed", "rollback_requested"],
    ["partial_succeeded", "rollback_requested"],
    ["rollback_requested", "rolled_back"],
    ["rollback_requested", "rollback_failed"],
    ["requested", "blocked"],
    ["started", "blocked"]
  ] as const;
  for (const [from, to] of ok) {
    assert.equal(isValidExecutionTransition({ from, to }), true, `${from} -> ${to} should be valid`);
  }
});

test("execution transition matrix rejects invalid transitions", () => {
  assert.equal(isValidExecutionTransition({ from: "requested", to: "confirmed" }), false);
  assert.equal(isValidExecutionTransition({ from: "confirmed", to: "succeeded" }), false);
});
