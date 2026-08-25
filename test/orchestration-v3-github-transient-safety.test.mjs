import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const watcherSource = fs.readFileSync("scripts/orchestration-v3/watcher.mjs", "utf8");
const workerSource = fs.readFileSync("scripts/orchestration-v3/worker.mjs", "utf8");
const configSource = fs.readFileSync("scripts/orchestration-v3/config.mjs", "utf8");

test("V3 retries transient GitHub failures with bounded backoff", () => {
  assert.match(watcherSource, /function isTransientGhError/);
  assert.match(watcherSource, /GH_TRANSIENT_RETRY/);
  assert.match(watcherSource, /attempts = 3/);
});

test("V3 worker retries transient GitHub failures with bounded backoff", () => {
  assert.match(workerSource, /function isTransientGhError/);
  assert.match(workerSource, /WORKER_GH_TRANSIENT_RETRY/);
  assert.match(workerSource, /attempts = 3/);
  assert.match(workerSource, /function gh\(args, \{ attempts = 3 \} = \{\}\)/);
});

test("V3 never converts unknown GitHub running state into a stale live lease", () => {
  assert.match(watcherSource, /ISSUE_RUNNING_STATE_UNKNOWN/);
  assert.match(watcherSource, /return null;/);
  assert.match(watcherSource, /if \(issueRunning === null\) return currentLease;/);
  assert.match(watcherSource, /reconcileLeaseState\(workerId, \{ recoverIdleWorker \}\)/);
  assert.match(watcherSource, /if \(inspection\.reconciliation_decision === "LIVE_LEASE_PRESERVED"\) return result\.lease;/);
});

test("V3 defers one candidate on transient GitHub failure instead of aborting the whole ready queue", () => {
  assert.match(watcherSource, /CANDIDATE_DEFERRED_GITHUB_TRANSIENT/);
  assert.match(watcherSource, /for \(const candidate of ready\)/);
});

test("V3 recovery keeps Useful V1 preferred lanes claimable", () => {
  assert.match(watcherSource, /RECOVERY_PRIORITY_ISSUES/);
  assert.match(watcherSource, /537, 535, 536, 538, 416, 542/);
  assert.match(configSource, /LEARNING_INTELLIGENCE/);
});
