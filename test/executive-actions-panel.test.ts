import test from "node:test";
import assert from "node:assert/strict";

import { rankActions } from "../src/lib/executive-actions.ts";
import type { ExecutiveActionPlan } from "../src/lib/dashboard/executive-layout";

test("rankActions sorts by priority then confidence", () => {
  const baseAction = {
    title: "",
    impact: "",
    owner: null,
    evidence: "",
    due: null,
    weight: 0,
    sourceDomain: "overall" as const,
    whyNow: "",
    nextStep: ""
  };
  const actions: ExecutiveActionPlan[] = [
    { id: "a", priority: "P2", confidence: "medium", ...baseAction },
    { id: "b", priority: "P1", confidence: "low", ...baseAction },
    { id: "c", priority: "P2", confidence: "high", ...baseAction }
  ];
  const ranked = rankActions(actions);
  assert.equal(ranked[0].id, "b", "P1 should rank first");
  assert.equal(ranked[1].id, "c", "Higher confidence should break ties");
});

test("rankActions handles empty list", () => {
  assert.deepEqual(rankActions([]), []);
});
