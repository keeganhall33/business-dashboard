import assert from "node:assert/strict";
import test from "node:test";

import {
  CampaignWorkflowCompileError,
  compileCampaignWorkflowTaskV1,
  type CampaignWorkflowCompileInputV1
} from "../../src/lib/strategic-campaign-runtime/campaign-workflow-adapter-v1";
import { createCampaignSteeringSnapshotV1, waitCampaignV1 } from "../../src/lib/strategic-campaign-runtime/campaign-steering-v1";
import { createLongHorizonGoalRunV1, transitionGoalRunV1 } from "../../src/lib/strategic-campaign-runtime/long-horizon-goal-run-v1";

function fixture(): CampaignWorkflowCompileInputV1 {
  let run = createLongHorizonGoalRunV1({
    owner: "Jeeves",
    objective: "Secure a differentiated 2027 partnership",
    initialPlan: ["research-access", "prepare-brief"],
    successConditions: [{ metric: "signed", operator: "eq", value: 1 }],
    killConditions: [{ metric: "rightsDenied", operator: "eq", value: 1 }],
    createdAt: "2026-09-15T00:00:00.000Z"
  });
  run = transitionGoalRunV1(run, "ACTIVE", { actor: "Jeeves", at: "2026-09-15T00:01:00.000Z" });
  return {
    snapshot: createCampaignSteeringSnapshotV1(run),
    expectedPlanVersion: 1,
    resolvedDependencyIds: ["crm-ready"],
    candidate: {
      stepId: "research-access",
      objective: "Map the strongest authorized access path",
      evidenceRefs: ["evidence:b", "evidence:a"],
      allowedActions: ["READ_REPOSITORY", "WRITE_REPOSITORY"],
      forbiddenActions: ["SEND_MESSAGE", "SPEND_MONEY"],
      approvalClass: "REVIEW",
      dependencyIds: ["crm-ready"],
      validationChecks: ["TEST", "TYPECHECK"],
      expectedCompletionEvidence: ["PR", "TEST_RESULTS"],
      bounds: { timeoutSeconds: 900, maxCostUsd: 0, maxAttempts: 1, blastRadius: "REPOSITORY" }
    }
  };
}

function code(expected: string) {
  return (error: unknown) => error instanceof CampaignWorkflowCompileError && error.code === expected;
}

test("compiles an immutable deterministic task with complete lineage and bounds", () => {
  const input = fixture();
  const original = structuredClone(input);
  const first = compileCampaignWorkflowTaskV1(input);
  const second = compileCampaignWorkflowTaskV1(structuredClone(input));
  assert.deepEqual(first, second);
  assert.deepEqual(input, original);
  assert.equal(first.campaignId, input.snapshot.run.id);
  assert.equal(first.planVersion, 1);
  assert.deepEqual(first.evidenceRefs, ["evidence:a", "evidence:b"]);
  assert.equal(first.approvalClass, "REVIEW");
  assert.equal(first.externalSideEffectsPerformed, false);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.bounds));
});

test("rejects unresolved dependencies and missing authority", () => {
  const unresolved = fixture();
  unresolved.resolvedDependencyIds = [];
  assert.throws(() => compileCampaignWorkflowTaskV1(unresolved), code("UNRESOLVED_DEPENDENCY"));
  const noAuthority = fixture();
  noAuthority.candidate.allowedActions = [];
  assert.throws(() => compileCampaignWorkflowTaskV1(noAuthority), code("MISSING_AUTHORITY"));
});

test("rejects stale plan versions and steps outside the current plan", () => {
  const stale = fixture();
  stale.expectedPlanVersion = 2;
  assert.throws(() => compileCampaignWorkflowTaskV1(stale), code("STALE_PLAN_VERSION"));
  const missing = fixture();
  missing.candidate.stepId = "invented-step";
  assert.throws(() => compileCampaignWorkflowTaskV1(missing), code("STEP_NOT_IN_PLAN"));
});

test("never replays completed or in-flight work", () => {
  const completed = fixture();
  completed.snapshot = createCampaignSteeringSnapshotV1(completed.snapshot.run, ["research-access"]);
  assert.throws(() => compileCampaignWorkflowTaskV1(completed), code("STEP_ALREADY_COMPLETED"));
  const inFlight = fixture();
  inFlight.inFlightStepIds = ["research-access"];
  assert.throws(() => compileCampaignWorkflowTaskV1(inFlight), code("STEP_ALREADY_IN_FLIGHT"));
});

test("waiting requires a satisfied wake", () => {
  const input = fixture();
  input.snapshot = waitCampaignV1(input.snapshot, {
    actor: "Jeeves",
    at: "2026-09-15T00:02:00.000Z",
    reason: "Awaiting CRM update",
    wakeClass: "DEPENDENCY",
    triggerValue: "crm-ready"
  });
  assert.throws(() => compileCampaignWorkflowTaskV1(input), code("WAKE_NOT_SATISFIED"));
  input.wakeSatisfied = true;
  assert.equal(compileCampaignWorkflowTaskV1(input).stepId, "research-access");
});

test("terminal and draft campaigns cannot dispatch", () => {
  const draft = fixture();
  draft.snapshot = createCampaignSteeringSnapshotV1(createLongHorizonGoalRunV1({
    owner: "Jeeves", objective: "Draft", initialPlan: ["research-access"], successConditions: [], killConditions: [], createdAt: "2026-09-15T00:00:00Z"
  }));
  assert.throws(() => compileCampaignWorkflowTaskV1(draft), code("CAMPAIGN_NOT_ACTIVE"));
  const terminal = fixture();
  terminal.snapshot = createCampaignSteeringSnapshotV1(transitionGoalRunV1(terminal.snapshot.run, "KILLED", {
    actor: "Jeeves", at: "2026-09-15T00:03:00Z", reason: "Rights denied"
  }));
  assert.throws(() => compileCampaignWorkflowTaskV1(terminal), code("TERMINAL_CAMPAIGN"));
});

test("validates time, cost, retry, and blast-radius bounds", () => {
  for (const mutate of [
    (input: CampaignWorkflowCompileInputV1) => { input.candidate.bounds.timeoutSeconds = 0; },
    (input: CampaignWorkflowCompileInputV1) => { input.candidate.bounds.maxCostUsd = -1; },
    (input: CampaignWorkflowCompileInputV1) => { input.candidate.bounds.maxAttempts = 6; },
    (input: CampaignWorkflowCompileInputV1) => { input.candidate.bounds.blastRadius = "GLOBAL" as never; }
  ]) {
    const input = fixture();
    mutate(input);
    assert.throws(() => compileCampaignWorkflowTaskV1(input), code("INVALID_BOUND"));
  }
});

test("cannot falsely complete a campaign without independent success evidence", () => {
  const input = fixture();
  input.requestedCampaignOutcome = "SUCCEEDED";
  assert.throws(() => compileCampaignWorkflowTaskV1(input), code("SUCCESS_EVIDENCE_REQUIRED"));
  input.successEvidenceSatisfied = true;
  assert.equal(compileCampaignWorkflowTaskV1(input).requestedCampaignOutcome, "SUCCEEDED");
});

test("rejects conflicting authority and missing verification evidence", () => {
  const conflict = fixture();
  conflict.candidate.forbiddenActions = ["WRITE_REPOSITORY"];
  assert.throws(() => compileCampaignWorkflowTaskV1(conflict), code("CONFLICTING_AUTHORITY"));
  const missing = fixture();
  missing.candidate.validationChecks = [];
  assert.throws(() => compileCampaignWorkflowTaskV1(missing), code("VALIDATION_REQUIRED"));
});
