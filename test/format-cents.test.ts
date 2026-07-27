import test from "node:test";
import assert from "node:assert/strict";
import { formatCurrency, formatMetricValue } from "../src/lib/utils/format";

test("formatCurrency preserves cents for values below $1", () => {
  assert.equal(formatCurrency(0.14, { maximumFractionDigits: 2 }), "$0.14");
  assert.equal(formatCurrency(0.14), "$0.14");
  // default should not round to $0 when small
  assert.ok(formatMetricValue(0.14, "usd").includes("$0."));
});
