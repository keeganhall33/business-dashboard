import test from "node:test";
import assert from "node:assert/strict";
import { createInvocationTrackerV1 } from "../scripts/orchestration-invocation-metrics.mjs";

test("reconcile invariant: attemptedAgents length must equal invocation events length", () => {
  const t = createInvocationTrackerV1({ attemptId: "run-x" });
  t.record("local-d", "local");
  t.record("local-d", "local");
  t.record("main", "cloud");

  const attemptedAgents = ["local-d", "local-d", "main"];
  assert.equal(attemptedAgents.length, t.events.length);
});

