import test from "node:test";
import assert from "node:assert/strict";

import { SCENARIO_RUNNERS } from "../../scripts/m11-run-action-center-scenarios";

test("Batch 1 runners (2–5) are implemented (no placeholders)", () => {
  // Scenario numbers are 1-indexed.
  const batch1 = [2, 3, 4, 5].map((n) => SCENARIO_RUNNERS[n - 1]);
  for (const r of batch1) {
    assert.ok(r, "Missing runner");
    const src = String(r.run);
    assert.ok(!src.includes("not_implemented"), `${r.name} still references not_implemented`);
    assert.ok(!src.includes("Scenario not implemented"), `${r.name} still references placeholder message`);
    assert.ok(src.includes("createAction"), `${r.name} must call shared createAction helper`);
  }
});
