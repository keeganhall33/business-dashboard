import assert from "node:assert/strict";
import test from "node:test";

import { createWorkflowState, type TaskContractV1, type VerificationResultV1 } from "../src/lib/agents/execution-control";
import { applyVerificationResult, authorizeSource, authorizeTool } from "../src/lib/agents/harness-runtime";

const contract: TaskContractV1 = {
  version: 1,
  taskId: "harness-1",
  objective: "Verify a bounded task",
  allowedTools: ["web", "crm"],
  allowedSources: ["official", "crm"],
  evidenceRequirements: [],
  successCriteria: [],
  constraints: [],
  approvalRequiredFor: [],
  outputRequirements: [],
  budget: { maxAttempts: 3, maxToolCalls: 20, maxRuntimeMs: 600_000 },
  stopConditions: [],
  escalationConditions: []
};

test("harness denies tools and sources outside the contract", () => {
  assert.equal(authorizeTool(contract, "web").allowed, true);
  assert.equal(authorizeTool(contract, "shell").allowed, false);
  assert.equal(authorizeSource(contract, "official").allowed, true);
  assert.equal(authorizeSource(contract, "rumor").allowed, false);
});

test("verification transitions are reflected in inspectable workflow state", () => {
  const initial = createWorkflowState(contract, "research");
  const verification: VerificationResultV1 = {
    accepted: false,
    disposition: "reroute",
    gates: [],
    failedRequiredGates: ["evidence:primary"],
    reason: "Same failure repeated without progress."
  };

  const next = applyVerificationResult({
    state: initial,
    verification,
    nextNode: "alternate-source",
    now: "2026-09-11T12:00:00.000Z"
  });

  assert.equal(next.status, "rerouting");
  assert.equal(next.currentNode, "alternate-source");
  assert.equal(next.attempt, 1);
  assert.equal(next.humanAttentionRequired, false);
});

test("escalation explicitly marks the task for human attention", () => {
  const initial = createWorkflowState(contract);
  const verification: VerificationResultV1 = {
    accepted: false,
    disposition: "escalate",
    gates: [],
    failedRequiredGates: [],
    reason: "Approval required."
  };

  const next = applyVerificationResult({ state: initial, verification });
  assert.equal(next.status, "escalated");
  assert.equal(next.humanAttentionRequired, true);
  assert.equal(next.blockedReason, "Approval required.");
});
