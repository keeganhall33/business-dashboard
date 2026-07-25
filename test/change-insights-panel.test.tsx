import test from "node:test";
import assert from "node:assert/strict";
import { formatChangeInsightsValue } from "../src/components/dashboard/ChangeInsightsPanel";

test("ROAS multiplier renders as 1.00x (not percent)", () => {
  assert.equal(formatChangeInsightsValue("multiplier", 1), "1.00x");
  assert.equal(formatChangeInsightsValue("multiplier", 2.35), "2.35x");
});
