import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createLongHorizonGoalRunV1,
  transitionGoalRunV1
} from "../../src/lib/strategic-campaign-runtime/long-horizon-goal-run-v1";
import {
  createCampaignSteeringSnapshotV1,
  inspectCampaignWaitV1,
  resumeCampaignSnapshotV1,
  waitCampaignV1,
  wakeCampaignV1
} from "../../src/lib/strategic-campaign-runtime/campaign-steering-v1";

function activeSnapshot(completed: readonly string[] = []) {
  const draft = createLongHorizonGoalRunV1({
    owner: "Jeeves",
    objective: "Grow qualified collector demand",
    initialPlan: ["inspect", "test", "measure"],
    successConditions: [{ metric: "qualified_leads", operator: "gte", value: 10 }],
    killConditions: [{ metric: "risk", operator: "gte", value: 5 }],
    createdAt: "2026-09-15T00:00:00.000Z"
  });
  const run = transitionGoalRunV1(draft, "ACTIVE", { actor: "Jeeves", at: "2026-09-15T00:01:00.000Z" });
  return createCampaignSteeringSnapshotV1(run, completed);
}

const wakeClasses = [
  ["EVENT", "new-evidence"],
  ["SCHEDULE", "2026-09-16T00:00:00.000Z"],
  ["MANUAL", "approved-review"],
  ["DEPENDENCY", "issue-1700"]
] as const;

for (const [wakeClass, triggerValue] of wakeClasses) {
  test(`supports deterministic ${wakeClass} wait and wake`, () => {
    const waiting = waitCampaignV1(activeSnapshot(), {
      actor: "Jeeves", at: "2026-09-15T01:00:00.000Z", reason: "Awaiting authorized trigger", wakeClass, triggerValue
    });
    const result = wakeCampaignV1(waiting, {
      wakeId: `wake-${wakeClass}`, wakeClass, triggerValue, actor: "Jeeves", at: "2026-09-16T00:01:00.000Z"
    });
    assert.equal(result.outcome, "RESUMED");
    assert.equal(result.snapshot.run.state, "ACTIVE");
    assert.equal(result.snapshot.wakeHistory[0].wakeClass, wakeClass);
  });
}

test("WAITING requires a reason and a wake condition or review time", () => {
  assert.throws(() => waitCampaignV1(activeSnapshot(), { actor: "Jeeves", at: "2026-09-15T01:00:00Z", reason: "" }), /wait reason/);
  assert.throws(() => waitCampaignV1(activeSnapshot(), { actor: "Jeeves", at: "2026-09-15T01:00:00Z", reason: "Need evidence" }), /wake condition or review time/);
});

test("review time produces deterministic stale-wait metadata", () => {
  const waiting = waitCampaignV1(activeSnapshot(), {
    actor: "Jeeves", at: "2026-09-15T01:00:00Z", reason: "Review if no evidence arrives", reviewAt: "2026-09-16T00:00:00Z"
  });
  assert.deepEqual(inspectCampaignWaitV1(waiting, "2026-09-15T23:59:59Z"), {
    waiting: true,
    stale: false,
    reviewRequired: false,
    waitReason: "Review if no evidence arrives",
    wakeCondition: { kind: "AT_TIME", value: "2026-09-16T00:00:00.000Z" },
    reviewAt: "2026-09-16T00:00:00.000Z"
  });
  assert.equal(inspectCampaignWaitV1(waiting, "2026-09-16T00:00:00Z").reviewRequired, true);
});

test("material wake revisions require a reason and preserve plan history", () => {
  const waiting = waitCampaignV1(activeSnapshot(), {
    actor: "Jeeves", at: "2026-09-15T01:00:00Z", reason: "New evidence", wakeClass: "EVENT", triggerValue: "evidence"
  });
  assert.throws(() => wakeCampaignV1(waiting, {
    wakeId: "wake-1", wakeClass: "EVENT", triggerValue: "evidence", actor: "Jeeves", at: "2026-09-15T02:00:00Z",
    plan: { steps: ["inspect", "measure"] }
  }), /plan revision reason/);
  const result = wakeCampaignV1(waiting, {
    wakeId: "wake-1", wakeClass: "EVENT", triggerValue: "evidence", actor: "Jeeves", at: "2026-09-15T02:00:00Z",
    plan: { steps: ["inspect", "measure"], reason: "Testing is already complete" }
  });
  assert.equal(result.outcome, "PLAN_REVISED");
  assert.equal(result.snapshot.run.planVersion, 2);
  assert.equal(result.snapshot.run.plans.length, 2);
  assert.deepEqual(result.snapshot.run.plans[0].steps, ["inspect", "test", "measure"]);
});

test("no-change wake does not create a plan version", () => {
  const waiting = waitCampaignV1(activeSnapshot(), {
    actor: "Jeeves", at: "2026-09-15T01:00:00Z", reason: "Scheduled review", wakeClass: "SCHEDULE", triggerValue: "2026-09-16T00:00:00Z"
  });
  const result = wakeCampaignV1(waiting, {
    wakeId: "scheduled-1", wakeClass: "SCHEDULE", triggerValue: "2026-09-16T00:00:00Z", actor: "Jeeves", at: "2026-09-16T00:00:00Z",
    plan: { steps: ["inspect", "test", "measure"] }
  });
  assert.equal(result.outcome, "NO_CHANGE");
  assert.equal(result.snapshot.run.planVersion, 1);
  assert.equal(result.snapshot.run.plans.length, 1);
});

test("resume is idempotent and never replays completed step IDs", () => {
  const serialized = JSON.parse(JSON.stringify(activeSnapshot(["inspect", "test"])));
  const first = resumeCampaignSnapshotV1(serialized);
  const second = resumeCampaignSnapshotV1(JSON.parse(JSON.stringify(first.snapshot)));
  assert.deepEqual(first.pendingStepIds, ["measure"]);
  assert.deepEqual(second.pendingStepIds, ["measure"]);
  assert.deepEqual(first.replayedCompletedStepIds, []);
  assert.deepEqual(second.snapshot, first.snapshot);
});

test("duplicate wake IDs are idempotent and add no history", () => {
  const waiting = waitCampaignV1(activeSnapshot(), {
    actor: "Jeeves", at: "2026-09-15T01:00:00Z", reason: "Dependency", wakeClass: "DEPENDENCY", triggerValue: "issue-1"
  });
  const first = wakeCampaignV1(waiting, { wakeId: "wake-1", wakeClass: "DEPENDENCY", triggerValue: "issue-1", actor: "Jeeves", at: "2026-09-15T02:00:00Z" });
  const duplicate = wakeCampaignV1(first.snapshot, { wakeId: "wake-1", wakeClass: "DEPENDENCY", triggerValue: "issue-1", actor: "Jeeves", at: "2026-09-15T03:00:00Z" });
  assert.equal(duplicate.outcome, "DUPLICATE");
  assert.equal(duplicate.snapshot.wakeHistory.length, 1);
  assert.deepEqual(duplicate.snapshot, first.snapshot);
});

test("rejects mismatched triggers and terminal steering", () => {
  const waiting = waitCampaignV1(activeSnapshot(), {
    actor: "Jeeves", at: "2026-09-15T01:00:00Z", reason: "Event", wakeClass: "EVENT", triggerValue: "expected"
  });
  assert.throws(() => wakeCampaignV1(waiting, { wakeId: "wake", wakeClass: "EVENT", triggerValue: "other", actor: "Jeeves", at: "2026-09-15T02:00:00Z" }), /does not match/);
  const terminalRun = transitionGoalRunV1(waiting.run, "KILLED", { actor: "Jeeves", at: "2026-09-15T02:00:00Z", reason: "Kill boundary met" });
  const terminal = { ...waiting, run: terminalRun };
  assert.throws(() => wakeCampaignV1(terminal, { wakeId: "wake", wakeClass: "EVENT", triggerValue: "expected", actor: "Jeeves", at: "2026-09-15T03:00:00Z" }), /Terminal campaigns/);
});

test("input remains immutable and outputs have no side effects", () => {
  const source = activeSnapshot();
  const before = JSON.stringify(source);
  const waiting = waitCampaignV1(source, {
    actor: "Jeeves", at: "2026-09-15T01:00:00Z", reason: "Manual review", wakeClass: "MANUAL", triggerValue: "approved"
  });
  const result = wakeCampaignV1(waiting, {
    wakeId: "manual-1", wakeClass: "MANUAL", triggerValue: "approved", actor: "Jeeves", at: "2026-09-15T02:00:00Z"
  });
  assert.equal(JSON.stringify(source), before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.snapshot), true);
  assert.equal(result.externalSideEffects, 0);
});
