import test from "node:test";
import assert from "node:assert/strict";
import { formatMetricValue } from "../src/lib/utils/format";

test("formatMetricValue renders small USD values with cents (no misleading $0)", () => {
  assert.equal(formatMetricValue(0.56, "usd"), "$0.56");
});

test("formatMetricValue returns Unavailable for null", () => {
  assert.equal(formatMetricValue(null, "usd"), "Unavailable");
});
