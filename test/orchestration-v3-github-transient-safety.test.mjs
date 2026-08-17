import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("scripts/orchestration-v3/watcher.mjs", "utf8");

test("V3 retries transient GitHub failures with bounded backoff", () => {
  assert.match(source, /function isTransientGhError/);
  assert.match(source, /GH_TRANSIENT_RETRY/);
  assert.match(source, /attempts = 3/);
});

test("V3 never converts unknown GitHub running state into a stale live lease", () => {
  assert.match(source, /ISSUE_RUNNING_STATE_UNKNOWN/);
  assert.match(source, /return null;/);
  assert.match(source, /if \(pidAlive && issueRunning !== false\) return lease;/);
  assert.match(source, /if \(issueRunning === null\) return lease;/);
});

test("V3 defers one candidate on transient GitHub failure instead of aborting the whole ready queue", () => {
  assert.match(source, /CANDIDATE_DEFERRED_GITHUB_TRANSIENT/);
  assert.match(source, /for \(const candidate of ready\)/);
});
