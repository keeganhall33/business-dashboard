import test from "node:test";
import assert from "node:assert/strict";

import { parseOrchestrationTaskFromIssueBody } from "../src/lib/agent-orchestration-v1/issue-parser";
import { canTransition } from "../src/lib/agent-orchestration-v1/state-machine";

test("issue parser: extracts required fields", () => {
  const parsed = parseOrchestrationTaskFromIssueBody({
    issue_number: 1,
    body: "**task_id:** t\n**milestone:** M\n**stream:** AGENT_ORCHESTRATION\n**requested_by:** ARCHITECT\n**assigned_agent:** JEEVES\n**priority:** P1\n**human_approval_required:** false\n"
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.task.task_id, "t");
    assert.equal(parsed.task.milestone, "M");
    assert.equal(parsed.task.human_approval.required, false);
    assert.equal(parsed.task.status, "READY");
  }
});

test("issue parser: rejects missing human approval field", () => {
  const parsed = parseOrchestrationTaskFromIssueBody({
    issue_number: 1,
    body: "**task_id:** t\n**milestone:** M\n**stream:** AGENT_ORCHESTRATION\n**requested_by:** ARCHITECT\n**priority:** P1\n"
  });
  assert.equal(parsed.ok, false);
});

test("state machine: READY -> RUNNING is permitted for claim", () => {
  assert.equal(canTransition("READY", "RUNNING"), true);
});

