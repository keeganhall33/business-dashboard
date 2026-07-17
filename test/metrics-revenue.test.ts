import test from "node:test";
import assert from "node:assert/strict";

import { computeRevenuePerVisitor } from "../src/lib/metrics/revenue.ts";

test("computeRevenuePerVisitor returns null without revenue", () => {
  assert.equal(computeRevenuePerVisitor(null, [100]), null);
  assert.equal(computeRevenuePerVisitor(undefined, [100]), null);
});

test("computeRevenuePerVisitor selects the first valid visitor candidate", () => {
  const result = computeRevenuePerVisitor(1000, [null, 0, 200]);
  assert.equal(result, 5);
});

test("computeRevenuePerVisitor ignores invalid visitor values", () => {
  const result = computeRevenuePerVisitor(500, [undefined, -10, NaN, 250]);
  assert.equal(result, 2);
});
