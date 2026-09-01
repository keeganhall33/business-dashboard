import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("watcher lease reconciliation is local-first and has no GitHub issue-state gate", () => {
  const source = fs.readFileSync(
    new URL("../scripts/orchestration-v3/watcher.mjs", import.meta.url),
    "utf8"
  );

  const start = source.indexOf("function reconcileLease(workerId)");
  const end = source.indexOf("function activeLeaseAssignments()", start);

  assert.notEqual(start, -1, "reconcileLease function must exist");
  assert.notEqual(end, -1, "activeLeaseAssignments boundary must exist");

  const block = source.slice(start, end);

  assert.match(block, /reconcileLeaseState\(workerId,\s*\{\s*recoverIdleWorker\s*\}\)/);
  assert.doesNotMatch(block, /issueIsRunning/);
  assert.doesNotMatch(block, /restIssue/);
  assert.doesNotMatch(block, /\bissue\(/);
});

test("watcher no longer defines the obsolete issueIsRunning lease gate", () => {
  const source = fs.readFileSync(
    new URL("../scripts/orchestration-v3/watcher.mjs", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(source, /function issueIsRunning\(/);
});
