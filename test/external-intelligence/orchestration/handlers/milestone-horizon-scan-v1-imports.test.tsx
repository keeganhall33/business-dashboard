import test from "node:test";
import assert from "node:assert/strict";

import { runMilestoneHorizonScanV1WithDeps } from "@/lib/external-intelligence/orchestration/handlers/milestone-horizon-scan-v1";

test("milestone-horizon-scan-v1 handler does not depend on legacy milestone-horizon schema module", () => {
  const src = String(runMilestoneHorizonScanV1WithDeps);
  assert.equal(src.includes("milestone-horizon"), false);
});
