import assert from "node:assert/strict";
import test from "node:test";

import {
  buildContextPacket,
  createWorkflowState,
  recordDecisionProvenance,
  verifyTask,
  type TaskContractV1
} from "../src/lib/agents/execution-control";

const contract: TaskContractV1 = {
  version: 1,
  taskId: "opportunity-1",
  objective: "Qualify a sponsor-backed sports opportunity",
  allowedTools: ["web", "crm"],
  allowedSources: ["official", "trusted_media", "crm"],
  allowedScopes: ["sports", "relationships", "sponsorship"],
  evidenceRequirements: [
    { key: "primary_source", description: "Official confirmation", minimumCount: 1 },
    { key: "relationship_path", description: "Credible access path", minimumCount: 1 }
  ],
  successCriteria: [
    { key: "entity_resolved", description: "Entities are resolved" },
    { key: "timing_supported", description: "Timing is supported" }
  ],
  constraints: ["Do not invent contacts"],
  approvalRequiredFor: ["send_outreach"],
  outputRequirements: ["recommendation", "provenance"],
  budget: { maxAttempts: 3, maxToolCalls: 20, maxRuntimeMs: 600_000 },
  stopConditions: ["no measurable progress"],
  escalationConditions: ["irreversible action", "ambiguous identity"]
};

test("accepts a task only when required evidence and success gates pass", () => {
  const result = verifyTask(
    contract,
    {
      evidenceCounts: { primary_source: 1, relationship_path: 1 },
      criterionResults: { entity_resolved: true, timing_supported: true },
      toolCalls: 8,
      runtimeMs: 20_000
    },
    1
  );

  assert.equal(result.accepted, true);
  assert.equal(result.disposition, "accept");
  assert.deepEqual(result.failedRequiredGates, []);
});

test("permits a bounded retry when missing evidence can still be gathered", () => {
  const result = verifyTask(
    contract,
    {
      evidenceCounts: { primary_source: 1, relationship_path: 0 },
      criterionResults: { entity_resolved: true, timing_supported: false },
      toolCalls: 7,
      runtimeMs: 25_000,
      meaningfulProgress: true
    },
    1
  );

  assert.equal(result.disposition, "retry");
  assert.ok(result.failedRequiredGates.includes("evidence:relationship_path"));
});

test("reroutes repeated failures without meaningful progress", () => {
  const result = verifyTask(
    contract,
    {
      evidenceCounts: { primary_source: 1, relationship_path: 0 },
      criterionResults: { entity_resolved: true, timing_supported: false },
      toolCalls: 12,
      runtimeMs: 40_000,
      failureSignature: "relationship-path-not-found",
      previousFailureSignature: "relationship-path-not-found",
      meaningfulProgress: false,
      alternateRouteAvailable: true
    },
    2
  );

  assert.equal(result.disposition, "reroute");
});

test("escalates instead of retrying once execution budget is exhausted", () => {
  const result = verifyTask(
    contract,
    {
      evidenceCounts: { primary_source: 1, relationship_path: 0 },
      criterionResults: { entity_resolved: true, timing_supported: false },
      toolCalls: 21,
      runtimeMs: 40_000
    },
    2
  );

  assert.equal(result.disposition, "escalate");
});

test("escalates actions that require human approval", () => {
  const result = verifyTask(
    contract,
    {
      evidenceCounts: { primary_source: 1, relationship_path: 1 },
      criterionResults: { entity_resolved: true, timing_supported: true },
      toolCalls: 5,
      runtimeMs: 10_000,
      approvalPending: true
    },
    1
  );

  assert.equal(result.accepted, false);
  assert.equal(result.disposition, "escalate");
});

test("context packets exclude unrelated domains", () => {
  const packet = buildContextPacket({
    taskId: contract.taskId,
    objective: contract.objective,
    allowedDomains: ["sports", "relationships"],
    items: [
      { key: "uw", domain: "sports", value: "UW", relevance: "target program" },
      { key: "warm-path", domain: "relationships", value: "Brian", relevance: "access path" },
      { key: "pagespeed", domain: "website", value: 46, relevance: "unrelated" }
    ]
  });

  assert.deepEqual(packet.items.map((item) => item.key), ["uw", "warm-path"]);
  assert.deepEqual(packet.excludedDomains, ["website"]);
});

test("decision provenance records why a result was accepted", () => {
  const verification = verifyTask(
    contract,
    {
      evidenceCounts: { primary_source: 1, relationship_path: 1 },
      criterionResults: { entity_resolved: true, timing_supported: true },
      toolCalls: 6,
      runtimeMs: 15_000
    },
    1
  );

  const provenance = recordDecisionProvenance({
    taskId: contract.taskId,
    decision: "Prioritize sponsor outreach",
    verification,
    evidenceRefs: ["official-announcement", "crm-path"],
    confidence: 0.87,
    nextAction: "Identify the sponsorship budget owner",
    now: "2026-09-11T12:00:00.000Z"
  });

  assert.equal(provenance.disposition, "accept");
  assert.equal(provenance.failedGates.length, 0);
  assert.ok(provenance.passedGates.includes("evidence:primary_source"));
  assert.equal(provenance.confidence, 0.87);
});

test("workflow state starts inspectable and conservative", () => {
  const state = createWorkflowState(contract, "qualify");

  assert.equal(state.currentNode, "qualify");
  assert.equal(state.status, "pending");
  assert.equal(state.humanAttentionRequired, false);
  assert.deepEqual(state.decisionProvenance, []);
});
