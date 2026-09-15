import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { compileMetaAutopilotSimulationV1 } from "../../scripts/meta-control-plane/autopilot-policy-v1.mjs";
import {
  MetaAutopilotReviewBridgeError,
  compileMetaAutopilotReviewInputV1
} from "../../scripts/meta-control-plane/autopilot-review-bridge-v1.mjs";

const evidence = ["META", "GA4", "WOO"].map((source) => ({
  source,
  state: "AVAILABLE",
  confidence: "HIGH",
  observedAt: "2026-09-15T01:00:00Z",
  evidenceRefs: [`evidence:${source.toLowerCase()}`]
}));

function budgetSimulation() {
  return compileMetaAutopilotSimulationV1({
    operation: "SET_BUDGET",
    target: { objectType: "adset", objectId: "adset_1" },
    evidence,
    beforeState: { daily_budget: 1000 },
    proposedState: { daily_budget: 1100 },
    budgetField: "daily_budget",
    accountTotalBudgetBefore: 1500,
    accountTotalBudgetAfter: 1500,
    rationale: "Shift budget toward supported purchase intent",
    expectedUpside: "More qualified sessions without increasing spend",
    downside: "Lower reach on the reduced ad set",
    measurementWindow: { startAt: "2026-09-16T00:00:00Z", endAt: "2026-09-23T00:00:00Z" },
    stopConditions: ["Purchase efficiency declines", "Evidence becomes stale"]
  }, { now: "2026-09-15T02:00:00Z" });
}

function statusSimulation() {
  return compileMetaAutopilotSimulationV1({
    operation: "SET_STATUS",
    target: { objectType: "campaign", objectId: "campaign_1" },
    evidence,
    beforeState: { status: "ACTIVE" },
    proposedState: { status: "PAUSED" },
    accountTotalBudgetBefore: 1500,
    accountTotalBudgetAfter: 1500,
    rationale: "Pause a campaign with supported waste evidence",
    expectedUpside: "Stop inefficient delivery",
    downside: "Reduced reach while paused",
    measurementWindow: { startAt: "2026-09-16T00:00:00Z", endAt: "2026-09-23T00:00:00Z" },
    stopConditions: ["Evidence changes"]
  }, { now: "2026-09-15T02:00:00Z" });
}

describe("Meta autopilot simulation to review bridge v1", () => {
  it("compiles a budget simulation into an approval-gated dry-run review input", () => {
    const result = compileMetaAutopilotReviewInputV1(budgetSimulation(), {
      expectedTarget: { objectType: "adset", objectId: "adset_1" },
      expectedAccountTotalBudget: 1500
    });
    assert.deepEqual(result.reviewInput.proposedState, { daily_budget: 1100 });
    assert.deepEqual(result.beforeStateEvidence, { daily_budget: 1000 });
    assert.equal(result.approvalClass, "KEEGAN");
    assert.equal(result.executionMode, "DRY_RUN_ONLY");
    assert.equal(result.liveWritesEnabled, false);
    assert.equal(result.externalCallsPerformed, 0);
    assert.equal(result.writesPerformed, 0);
  });

  it("preserves status rollback, evidence, measurement, and stop conditions", () => {
    const result = compileMetaAutopilotReviewInputV1(statusSimulation());
    assert.deepEqual(result.reviewInput.proposedState, { status: "PAUSED" });
    assert.deepEqual(result.beforeStateEvidence, { status: "ACTIVE" });
    assert.deepEqual(result.reviewInput.supportingMetrics.evidence.map((item) => item.source), ["GA4", "META", "WOO"]);
    assert.equal(result.reviewInput.supportingMetrics.measurementWindow.endAt, "2026-09-23T00:00:00.000Z");
    assert.deepEqual(result.reviewInput.supportingMetrics.stopConditions, ["Evidence changes"]);
  });

  it("rejects moved targets and changed total budget", () => {
    assert.throws(
      () => compileMetaAutopilotReviewInputV1(budgetSimulation(), { expectedTarget: { objectType: "adset", objectId: "moved" } }),
      (error) => error instanceof MetaAutopilotReviewBridgeError && error.code === "TARGET_MOVED"
    );
    assert.throws(
      () => compileMetaAutopilotReviewInputV1(budgetSimulation(), { expectedAccountTotalBudget: 1600 }),
      (error) => error instanceof MetaAutopilotReviewBridgeError && error.code === "TOTAL_BUDGET_MISMATCH"
    );
  });

  it("rejects stale, missing, or conflicted evidence", () => {
    const missing = structuredClone(budgetSimulation());
    missing.evidence.pop();
    assert.throws(() => compileMetaAutopilotReviewInputV1(missing), /Exactly one Meta, GA4, and Woo/);
    const stale = structuredClone(budgetSimulation());
    stale.evidence[0].state = "STALE";
    assert.throws(() => compileMetaAutopilotReviewInputV1(stale), /not current and reviewable/);
    const duplicate = structuredClone(budgetSimulation());
    duplicate.evidence[0].source = "META";
    assert.throws(() => compileMetaAutopilotReviewInputV1(duplicate), /must be unique/);
  });

  it("rejects rollback mismatch and a reconstructed adjustment above 20 percent", () => {
    const mismatch = structuredClone(budgetSimulation());
    mismatch.rollbackMetadata.restore.daily_budget = 900;
    assert.throws(
      () => compileMetaAutopilotReviewInputV1(mismatch),
      (error) => error instanceof MetaAutopilotReviewBridgeError && error.code === "ROLLBACK_OR_BOUND_MISMATCH"
    );
  });

  it("rejects forbidden operations and weakened approval", () => {
    const forbidden = structuredClone(budgetSimulation());
    forbidden.operation = "CHANGE_DESTINATION";
    assert.throws(() => compileMetaAutopilotReviewInputV1(forbidden), /cannot enter review mode/);
    const approval = structuredClone(budgetSimulation());
    approval.approvalRequired = false;
    assert.throws(() => compileMetaAutopilotReviewInputV1(approval), /must require Keegan approval/);
  });

  it("rejects execution, live authority, credential access, calls, or writes", () => {
    for (const mutation of [
      { executionState: "SUCCEEDED" },
      { liveWritesEnabled: true },
      { credentialsAccessed: true },
      { externalCallsPerformed: 1 },
      { writesPerformed: 1 }
    ]) {
      assert.throws(() => compileMetaAutopilotReviewInputV1({ ...budgetSimulation(), ...mutation }), /no live authority/);
    }
  });

  it("is deterministic, immutable, idempotent, and does not expose tokens", () => {
    const simulation = budgetSimulation();
    const first = compileMetaAutopilotReviewInputV1(simulation);
    const second = compileMetaAutopilotReviewInputV1(structuredClone(simulation));
    assert.deepEqual(first, second);
    assert.match(first.reviewInput.idempotencyKey, /^meta_review_[a-f0-9]{64}$/);
    assert.equal(Object.isFrozen(first), true);
    assert.equal(Object.isFrozen(first.reviewInput.supportingMetrics.evidence), true);
    assert.equal(JSON.stringify(first).includes("token"), false);
    assert.equal(first.credentialsAccessed, false);
  });
});
