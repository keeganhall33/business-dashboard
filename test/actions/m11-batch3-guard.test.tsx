import test from "node:test";
import assert from "node:assert/strict";

import { SCENARIO_RUNNERS } from "../../scripts/m11-run-action-center-scenarios";

test("Batch 3 runners (10–13) are implemented (no placeholders)", () => {
  const batch3 = [10, 11, 12, 13].map((n) => SCENARIO_RUNNERS[n - 1]);
  for (const r of batch3) {
    assert.ok(r, "Missing runner");
    const src = String(r.run);
    assert.ok(!src.includes("not_implemented"), `${r.name} still references not_implemented`);
    assert.ok(!src.includes("Scenario not implemented"), `${r.name} still references placeholder message`);
    assert.ok(src.includes("approve"), `${r.name} must include approval flow`);
  }
});

