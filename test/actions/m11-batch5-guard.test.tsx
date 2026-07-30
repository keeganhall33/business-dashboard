import test from "node:test";
import assert from "node:assert/strict";

import { SCENARIO_RUNNERS } from "../../scripts/m11-run-action-center-scenarios";

test("Batch 5 runners (19–22) are implemented (no placeholders)", () => {
  const batch5 = [19, 20, 21, 22].map((n) => SCENARIO_RUNNERS[n - 1]);
  for (const r of batch5) {
    assert.ok(r, "Missing runner");
    const src = String(r.run);
    assert.ok(!src.includes("not_implemented"), `${r.name} still references not_implemented`);
    assert.ok(!src.includes("Scenario not implemented"), `${r.name} still references placeholder message`);
    assert.ok(src.includes("approveActionExpectedReject"), `${r.name} must include expected-reject approval step`);
  }
});

