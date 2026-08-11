import test from "node:test";
import assert from "node:assert/strict";

import { classifyExecution } from "../src/lib/agent-orchestration-v1/execution-classifier";
import { buildCompactAgentPrompt } from "../src/lib/agent-orchestration-v1/prompt-builder";
import { parseOrchestrationResult } from "../src/lib/agent-orchestration-v1/result-parser";

test("classifier: human approval forces KEEGAN_APPROVAL_REQUIRED", () => {
  const c = classifyExecution({ stream: "AGENT_ORCHESTRATION", humanApprovalRequired: true, body: "" });
  assert.equal(c.executionClass, "KEEGAN_APPROVAL_REQUIRED");
});

test("classifier: core intelligence stream is architect review required", () => {
  const c = classifyExecution({ stream: "CORE_INTELLIGENCE", humanApprovalRequired: false, body: "" });
  assert.equal(c.executionClass, "ARCHITECT_REVIEW_REQUIRED");
});

test("prompt builder: uses REFERENCE + DELTA sections", () => {
  const prompt = buildCompactAgentPrompt({
    repo: "o/r",
    issueNumber: 1,
    title: "T",
    executionClass: "AUTO_CONTINUE",
    body: "### Reference\n- A\n\n### Delta\nDo X\n"
  });
  assert.ok(prompt.includes("REFERENCE:"));
  assert.ok(prompt.includes("DELTA:"));
});

test("prompt builder: architect review required asks for ArchitectCheckpointV1", () => {
  const prompt = buildCompactAgentPrompt({
    repo: "o/r",
    issueNumber: 1,
    title: "T",
    executionClass: "ARCHITECT_REVIEW_REQUIRED",
    body: "### Reference\n- A\n\n### Delta\nDo X\n"
  });
  assert.ok(prompt.includes("ArchitectCheckpointV1"));
});

test("result parser: parses OrchestrationResultContractV1 JSON", () => {
  const parsed = parseOrchestrationResult(
    JSON.stringify({
      TASK_ID: "t",
      STATUS: "COMPLETED",
      SUMMARY: "ok",
      CHANGES: [],
      FILES_CHANGED: [],
      DB_CHANGES: "NO",
      MIGRATION: null,
      TESTS: "npm test",
      PR: null,
      MERGE_STATUS: "N/A",
      PRODUCTION_CHANGE: "NO",
      UNEXPECTED_RESULTS: [],
      DECISIONS_REQUIRED: [],
      BLOCKERS: [],
      NEXT_RECOMMENDED_TASK: null,
      SESSION_HEALTH: "GOOD",
      SESSION_CONTEXT: "UNKNOWN"
    })
  );
  assert.equal(parsed.kind, "result");
});

test("result parser: parses ArchitectCheckpointV1 JSON", () => {
  const parsed = parseOrchestrationResult(
    JSON.stringify({
      TASK_ID: "t",
      CHECKPOINT_ID: "c",
      QUESTION_OR_DECISION: "q",
      PROPOSED_INTERPRETATION: "p",
      FILES_SURFACES_TO_CHANGE: [],
      WHY_REVIEW_REQUIRED: "w",
      ALTERNATIVES_CONSIDERED: [],
      RECOMMENDATION: "r"
    })
  );
  assert.equal(parsed.kind, "checkpoint");
});

