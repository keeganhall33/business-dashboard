import assert from "node:assert/strict";
import test from "node:test";

import { MetaAutopilotPolicyError, compileMetaAutopilotSimulationV1 } from "../../scripts/meta-control-plane/autopilot-policy-v1.mjs";

const options = { now: "2026-09-15T02:00:00.000Z" };

function fixture() {
  return {
    target: { objectType: "campaign", objectId: "campaign-123" },
    operation: "SET_BUDGET",
    budgetField: "daily_budget",
    beforeState: { status: "ACTIVE", daily_budget: "1500" },
    proposedState: { status: "ACTIVE", daily_budget: "1650" },
    accountTotalBudgetBefore: 1500,
    accountTotalBudgetAfter: 1500,
    evidence: ["META", "GA4", "WOO"].map((source) => ({ source, state: "AVAILABLE", confidence: "HIGH", observedAt: "2026-09-15T01:00:00Z", evidenceRefs: [`${source.toLowerCase()}:current`] })),
    rationale: "Shift only within the already approved bounded test",
    expectedUpside: "Improve qualified conversion efficiency",
    downside: "Short-term delivery volatility",
    measurementWindow: { startAt: "2026-09-16T07:00:00Z", endAt: "2026-09-23T07:00:00Z" },
    stopConditions: ["SPEND_WITHOUT_PURCHASE", "ROAS_DECLINE"]
  };
}

function code(expected) {
  return (error) => error instanceof MetaAutopilotPolicyError && error.code === expected;
}

test("creates a deterministic immutable simulation with no external capability", () => {
  const input = fixture();
  const original = structuredClone(input);
  const first = compileMetaAutopilotSimulationV1(input, options);
  const second = compileMetaAutopilotSimulationV1(structuredClone(input), options);
  assert.deepEqual(first, second);
  assert.deepEqual(input, original);
  assert.equal(first.mode, "SIMULATION_ONLY");
  assert.equal(first.liveWritesEnabled, false);
  assert.equal(first.credentialsAccessed, false);
  assert.equal(first.externalCallsPerformed, 0);
  assert.equal(first.writesPerformed, 0);
  assert.equal(first.approvalClass, "KEEGAN");
  assert.ok(Object.isFrozen(first));
});

test("caps a single simulated budget adjustment at 20 percent", () => {
  const atLimit = fixture();
  atLimit.proposedState.daily_budget = "1800";
  assert.equal(compileMetaAutopilotSimulationV1(atLimit, options).mutation.adjustmentPercent, 20);
  const tooLarge = fixture();
  tooLarge.proposedState.daily_budget = "1801";
  assert.throws(() => compileMetaAutopilotSimulationV1(tooLarge, options), code("BUDGET_ADJUSTMENT_EXCEEDS_LIMIT"));
});

test("requires total account budget preservation", () => {
  const input = fixture();
  input.accountTotalBudgetAfter = 1650;
  assert.throws(() => compileMetaAutopilotSimulationV1(input, options), code("TOTAL_BUDGET_CHANGE_FORBIDDEN"));
});

test("supports only bounded status proposals", () => {
  const input = fixture();
  input.operation = "SET_STATUS";
  input.beforeState = { status: "ACTIVE" };
  input.proposedState = { status: "PAUSED" };
  const result = compileMetaAutopilotSimulationV1(input, options);
  assert.deepEqual(result.mutation, { status: "PAUSED" });
  assert.deepEqual(result.rollbackMetadata.restore, { status: "ACTIVE" });
});

test("forbids creative, catalog, destination, billing, and permission operations", () => {
  for (const operation of ["CHANGE_CREATIVE", "CHANGE_CATALOG", "CHANGE_DESTINATION", "CHANGE_BILLING", "CHANGE_PERMISSIONS"]) {
    const input = fixture();
    input.operation = operation;
    assert.throws(() => compileMetaAutopilotSimulationV1(input, options), code("OPERATION_FORBIDDEN"));
  }
});

test("requires current Meta, GA4, and Woo evidence", () => {
  for (const source of ["META", "GA4", "WOO"]) {
    const input = fixture();
    input.evidence = input.evidence.filter((item) => item.source !== source);
    assert.throws(() => compileMetaAutopilotSimulationV1(input, options), code("MISSING_REQUIRED_SOURCE"));
  }
});

test("fails closed on stale, partial, conflicted, or low-confidence evidence", () => {
  const cases = [
    ["observedAt", "2026-09-10T00:00:00Z", "STALE_EVIDENCE"],
    ["state", "PARTIAL", "EVIDENCE_NOT_AVAILABLE"],
    ["conflicted", true, "CONFLICTED_EVIDENCE"],
    ["confidence", "LOW", "INSUFFICIENT_CONFIDENCE"]
  ];
  for (const [field, value, expected] of cases) {
    const input = fixture();
    input.evidence[0][field] = value;
    assert.throws(() => compileMetaAutopilotSimulationV1(input, options), code(expected));
  }
});

test("preserves rollback, measurement, downside, and stop-condition evidence", () => {
  const result = compileMetaAutopilotSimulationV1(fixture(), options);
  assert.deepEqual(result.rollbackMetadata.restore, { daily_budget: "1500" });
  assert.equal(result.measurementWindow.endAt, "2026-09-23T07:00:00.000Z");
  assert.equal(result.downside, "Short-term delivery volatility");
  assert.deepEqual(result.stopConditions, ["ROAS_DECLINE", "SPEND_WITHOUT_PURCHASE"]);
});

test("does not copy unknown fields or secrets into output", () => {
  const input = fixture();
  input.accessToken = "never-copy-this-secret";
  input.beforeState.access_token = "also-never-copy";
  const serialized = JSON.stringify(compileMetaAutopilotSimulationV1(input, options));
  assert.equal(serialized.includes("never-copy-this-secret"), false);
  assert.equal(serialized.includes("also-never-copy"), false);
  assert.equal(serialized.includes("accessToken"), false);
});

test("rejects invalid measurement windows and no-change status", () => {
  const invalidWindow = fixture();
  invalidWindow.measurementWindow.endAt = invalidWindow.measurementWindow.startAt;
  assert.throws(() => compileMetaAutopilotSimulationV1(invalidWindow, options), code("INVALID_MEASUREMENT_WINDOW"));
  const noChange = fixture();
  noChange.operation = "SET_STATUS";
  noChange.beforeState = { status: "ACTIVE" };
  noChange.proposedState = { status: "ACTIVE" };
  assert.throws(() => compileMetaAutopilotSimulationV1(noChange, options), code("NO_CHANGE"));
});
