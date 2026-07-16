import test from "node:test";
import assert from "node:assert/strict";

import { rankActions } from "../src/lib/executive-actions.ts";
import type { ExecutiveActionPlan } from "../src/lib/dashboard/executive-layout";

test("rankActions sorts by priority then confidence", () => {
  const actions: ExecutiveActionPlan[] = [
    { id: "a", priority: "P2", title: "", impact: "", confidence: "medium", owner: null, evidence: "", due: null, weight: 0 },
    { id: "b", priority: "P1", title: "", impact: "", confidence: "low", owner: null, evidence: "", due: null, weight: 0 },
    { id: "c", priority: "P2", title: "", impact: "", confidence: "high", owner: null, evidence: "", due: null, weight: 0 }
  ];
  const ranked = rankActions(actions);
  assert.equal(ranked[0].id, "b", "P1 should rank first");
  assert.equal(ranked[1].id, "c", "Higher confidence should break ties");
});

test("rankActions handles empty list", () => {
  assert.deepEqual(rankActions([]), []);
});
