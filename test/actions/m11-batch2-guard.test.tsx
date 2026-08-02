import test from "node:test";
import assert from "node:assert/strict";

import { SCENARIO_RUNNERS } from "../../scripts/m11-run-action-center-scenarios";

test("Batch 2 runners (6–9) are implemented (no placeholders) and have steps", () => {
  const batch2 = [6, 7, 8, 9].map((n) => SCENARIO_RUNNERS[n - 1]);
  for (const r of batch2) {
    assert.ok(r, "Missing runner");
    const src = String(r.run);
    assert.ok(!src.includes("not_implemented"), `${r.name} still references not_implemented`);
    assert.ok(!src.includes("Scenario not implemented"), `${r.name} still references placeholder message`);
    assert.ok(src.includes("createAction"), `${r.name} must call createAction (real API steps)`);
  }
});
