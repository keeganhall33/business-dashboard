import assert from "node:assert/strict";
import test from "node:test";
import {
  createLongHorizonGoalRunV1,
  evaluateGoalRunBoundariesV1,
  reviseGoalRunPlanV1,
  steerGoalRunV1,
  transitionGoalRunV1
} from "../../src/lib/strategic-campaign-runtime/long-horizon-goal-run-v1";

const input = () => ({
  owner: "Revenue Strategy",
  objective: "Reach 100 qualified collectors",
  initialPlan: ["Establish baseline", "Run bounded experiments"],
  successConditions: [{ metric: "qualifiedCollectors", operator: "gte" as const, value: 100 }],
  killConditions: [{ metric: "spend", operator: "gte" as const, value: 5000 }],
  sourceRef: "roadmap-a",
  createdAt: "2026-09-14T22:00:00.000Z"
});

test("identity is deterministic and ignores source provenance", () => {
  const a = createLongHorizonGoalRunV1(input());
  const b = createLongHorizonGoalRunV1({ ...input(), sourceRef: "roadmap-b" });
  assert.equal(a.id, b.id);
  assert.equal(a.dedupKey, b.dedupKey);
});

test("duplicate equivalent campaign from a new source is rejected", () => {
  const existing = createLongHorizonGoalRunV1(input());
  assert.throws(() => createLongHorizonGoalRunV1({ ...input(), sourceRef: "new-source" }, [existing]), /already exists/);
});

test("owner is required", () => {
  assert.throws(() => createLongHorizonGoalRunV1({ ...input(), owner: " " }), /owner is required/i);
});

test("valid transitions preserve ordered history", () => {
  const draft = createLongHorizonGoalRunV1(input());
  const active = transitionGoalRunV1(draft, "ACTIVE", { actor: "keegan", at: "2026-09-14T23:00:00.000Z" });
  const waiting = transitionGoalRunV1(active, "WAITING", { actor: "keegan", at: "2026-09-15T00:00:00.000Z", wakeCondition: { kind: "ON_SIGNAL", value: "new-weekly-data" } });
  assert.equal(waiting.state, "WAITING");
  assert.deepEqual(waiting.history.map((entry) => entry.sequence), [1, 2, 3]);
  assert.equal(waiting.wakeCondition?.value, "new-weekly-data");
});

test("invalid transition and WAITING without a wake condition fail closed", () => {
  const draft = createLongHorizonGoalRunV1(input());
  assert.throws(() => transitionGoalRunV1(draft, "SUCCEEDED", { actor: "keegan", at: "x", reason: "done" }), /Cannot transition/);
  const active = transitionGoalRunV1(draft, "ACTIVE", { actor: "keegan", at: "x" });
  assert.throws(() => transitionGoalRunV1(active, "WAITING", { actor: "keegan", at: "y" }), /wake condition/);
});

test("plan revisions require a reason and preserve immutable plan history", () => {
  const run = createLongHorizonGoalRunV1(input());
  assert.throws(() => reviseGoalRunPlanV1(run, { actor: "keegan", at: "x", steps: ["new"], reason: "" }), /explicit reason/);
  const revised = reviseGoalRunPlanV1(run, { actor: "keegan", at: "x", steps: ["new"], reason: "Evidence changed" });
  assert.equal(revised.planVersion, 2);
  assert.equal(revised.plans[0].steps[0], "Establish baseline");
  assert.equal(revised.plans[1].revisionReason, "Evidence changed");
  assert.notEqual(revised.plans, run.plans);
});

test("steering history is append-only", () => {
  const run = createLongHorizonGoalRunV1(input());
  const once = steerGoalRunV1(run, { actor: "keegan", at: "x", instruction: "Narrow segment", rationale: "Higher intent" });
  const twice = steerGoalRunV1(once, { actor: "keegan", at: "y", instruction: "Hold spend", rationale: "Await signal" });
  assert.equal(run.steeringHistory.length, 0);
  assert.equal(once.steeringHistory.length, 1);
  assert.equal(twice.steeringHistory.length, 2);
});

test("kill and success terminal reasons remain in history", () => {
  const draft = createLongHorizonGoalRunV1(input());
  const active = transitionGoalRunV1(draft, "ACTIVE", { actor: "keegan", at: "x" });
  const killed = transitionGoalRunV1(active, "KILLED", { actor: "keegan", at: "y", reason: "Kill boundary reached" });
  assert.equal(killed.terminalReason, "Kill boundary reached");
  assert.equal(killed.history.at(-1)?.detail.reason, "Kill boundary reached");
  assert.throws(() => transitionGoalRunV1(killed, "ACTIVE", { actor: "keegan", at: "z" }), /Cannot transition/);
});

test("boundary evaluation is deterministic with kill taking precedence", () => {
  const run = createLongHorizonGoalRunV1(input());
  assert.equal(evaluateGoalRunBoundariesV1(run, { qualifiedCollectors: 99, spend: 4999 }), "CONTINUE");
  assert.equal(evaluateGoalRunBoundariesV1(run, { qualifiedCollectors: 100, spend: 4999 }), "SUCCESS");
  assert.equal(evaluateGoalRunBoundariesV1(run, { qualifiedCollectors: 100, spend: 5000 }), "KILL");
});

test("creation and reduction do not mutate caller input", () => {
  const source = input();
  const before = structuredClone(source);
  const run = createLongHorizonGoalRunV1(source);
  transitionGoalRunV1(run, "ACTIVE", { actor: "keegan", at: "x" });
  assert.deepEqual(source, before);
  assert.equal(Object.isFrozen(run), true);
  assert.equal(Object.isFrozen(run.plans[0]), true);
});
