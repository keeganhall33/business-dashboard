import test from "node:test";
import assert from "node:assert/strict";
import { createInvocationTrackerV1 } from "../scripts/orchestration-invocation-metrics.mjs";

test("invocation tracker records attemptId/index and counts match attemptedAgents", () => {
  const t = createInvocationTrackerV1({ attemptId: "run-1" });
  t.record("local-d", "local");
  t.record("local-d", "local");
  t.record("main", "cloud");

  assert.equal(t.attemptId, "run-1");
  assert.equal(t.events.length, 3);
  assert.deepEqual(
    t.events.map((e) => ({ idx: e.attemptIndex, agent: e.agentId, kind: e.kind })),
    [
      { idx: 1, agent: "local-d", kind: "local" },
      { idx: 2, agent: "local-d", kind: "local" },
      { idx: 3, agent: "main", kind: "cloud" }
    ]
  );
  assert.equal(t.actualLocalInvocations(), 2);
  assert.equal(t.actualCloudInvocations(), 1);
  assert.deepEqual(t.attemptedAgentsRecorded(), ["local-d", "local-d", "main"]);
  assert.equal(t.attemptedAgentsRecorded().length, t.events.length);
});

