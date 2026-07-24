import test from "node:test";
import assert from "node:assert/strict";
import { clampFreshnessHours } from "./helpers";

test("clampFreshnessHours leaves positive values", () => {
  assert.equal(clampFreshnessHours(2.5), 2.5);
});

test("clampFreshnessHours clamps negatives to zero", () => {
  assert.equal(clampFreshnessHours(-0.3), 0);
});

test("clampFreshnessHours passes through null", () => {
  assert.equal(clampFreshnessHours(null), null);
});
