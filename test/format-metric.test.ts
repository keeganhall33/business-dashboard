import test from "node:test";
import assert from "node:assert/strict";

import { formatMetricValue } from "../src/lib/utils/format.ts";

test("formatMetricValue renders usd_precise with two decimals", () => {
  assert.equal(formatMetricValue(12.345, "usd_precise"), "$12.35");
  assert.equal(formatMetricValue(0.5, "usd_precise"), "$0.50");
});
