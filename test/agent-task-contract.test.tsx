import assert from "node:assert/strict";
import test from "node:test";

import { createAgentTaskContract } from "../src/lib/agents/task-contract";

test("agent task contracts inherit canonical operating-model guardrails", () => {
  const contract = createAgentTaskContract({
    taskId: "noah-opportunity-1",
    agentKey: "noah",
    objective: "Qualify a partnership opportunity",
    allowedTools: ["web", "crm"],
    allowedSources: ["official", "crm"],
    evidenceRequirements: [
      { key: "source", description: "Primary or trusted source" }
    ],
    successCriteria: [
      { key: "access_path", description: "Credible access path identified" }
    ]
  });

  assert.ok(contract.constraints.some((value) => value.includes("fake researched targets")));
  assert.ok(contract.outputRequirements.includes("verification_result"));
  assert.ok(contract.outputRequirements.includes("decision_provenance"));
  assert.ok(contract.stopConditions.some((value) => value.includes("no measurable progress")));
  assert.equal(contract.budget.maxAttempts, 3);
  assert.equal(contract.budget.maxToolCalls, 20);
});

test("task-specific limits override defaults without removing governance", () => {
  const contract = createAgentTaskContract({
    taskId: "sloan-test-1",
    agentKey: "sloan",
    objective: "Validate a pricing hypothesis",
    allowedTools: ["commerce"],
    allowedSources: ["woo"],
    evidenceRequirements: [],
    successCriteria: [{ key: "metric", description: "Metric threshold met" }],
    budget: { maxAttempts: 2, maxToolCalls: 8 },
    approvalRequiredFor: ["change_live_price"]
  });

  assert.equal(contract.budget.maxAttempts, 2);
  assert.equal(contract.budget.maxToolCalls, 8);
  assert.equal(contract.budget.maxRuntimeMs, 600_000);
  assert.ok(contract.approvalRequiredFor.includes("change_live_price"));
  assert.ok(contract.approvalRequiredFor.includes("consequential_or_irreversible_action"));
});
