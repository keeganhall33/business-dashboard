import test from "node:test";
import assert from "node:assert/strict";

import { M11_SCENARIOS } from "@/lib/actions/m11-scenarios";

test("Phase C selects exactly 22 unique scenario names", () => {
  assert.equal(M11_SCENARIOS.length, 22);
  const names = M11_SCENARIOS.map((s) => s.name);
  assert.equal(new Set(names).size, 22);
});

