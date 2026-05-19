import test from "node:test";
import assert from "node:assert/strict";

import { computeDeltaPercent, computeMetricStatus } from "../src/lib/metrics/scoreboardMath.mjs";

test("computeDeltaPercent returns null for invalid inputs", () => {
  assert.equal(computeDeltaPercent(null, 10), null);
  assert.equal(computeDeltaPercent(10, null), null);
  assert.equal(computeDeltaPercent(10, 0), null);
});

test("computeDeltaPercent computes percent vs target", () => {
  assert.equal(computeDeltaPercent(110, 100), 10);
  assert.equal(computeDeltaPercent(90, 100), -10);
});

test("computeMetricStatus returns expected tiers", () => {
  assert.equal(computeMetricStatus(100, 100), "good");
  assert.equal(computeMetricStatus(95, 100), "warning");
  assert.equal(computeMetricStatus(80, 100), "critical");
  assert.equal(computeMetricStatus(NaN, 100), "unknown");
});
