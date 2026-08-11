import test from "node:test";
import assert from "node:assert/strict";

import { formatResultContractMarkdown, stableTaskRunId } from "../src/lib/agent-orchestration-v1/github-task";

test("github task: result markdown is stable json codeblock", () => {
  const md = formatResultContractMarkdown({
    TASK_ID: "t1",
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
  });
  assert.ok(md.includes("```json"));
  assert.ok(md.includes("\"TASK_ID\": \"t1\""));
});

test("github task: stableTaskRunId is deterministic", () => {
  const a = stableTaskRunId({ task_id: "t", issue_number: 193, head_sha: "abc" });
  const b = stableTaskRunId({ task_id: "t", issue_number: 193, head_sha: "abc" });
  assert.equal(a, b);
});

