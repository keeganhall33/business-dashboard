import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("V3 backfill wakes immediately on worker exit and coalesces through one watcher loop", () => {
  const watcher = fs.readFileSync("scripts/orchestration-v3/watcher.mjs", "utf8");
  assert.match(watcher, /arg\("--interval", "20"\)/);
  assert.match(watcher, /child\.on\("exit"/);
  assert.match(watcher, /requestWake\("WORKER_EXIT"/);
  assert.match(watcher, /waitForWakeOrTimeout/);
  assert.match(watcher, /wakePending/);
  assert.match(watcher, /wakeResolver/);
  assert.match(watcher, /pollInFlight/);
  assert.match(watcher, /pollWakePending/);
  assert.match(watcher, /coalescedWithInFlightPoll/);
  assert.match(watcher, /POLL_WAKE_COALESCED/);
  assert.match(watcher, /POLL_COALESCED_WAKE_DRAINED/);
  assert.match(watcher, /await runSerializedPoll\(nextPollReason\)/);
  assert.doesNotMatch(watcher, /setTimeout\(resolve, intervalSeconds \* 1000\)/);
});

test("V3 backfill reconciles stale leases before ready selection and never overlaps poll passes", () => {
  const watcher = fs.readFileSync("scripts/orchestration-v3/watcher.mjs", "utf8");
  assert.match(watcher, /function reconcileLease\(workerId\)/);
  assert.match(watcher, /STALE_LEASE_RECLAIMED/);
  assert.match(watcher, /function reconcileRunningClaims\(\)/);
  assert.match(watcher, /reconcileRunningClaims\(\);[\s\S]*const claimedWorkersThisPass = new Set\(\);[\s\S]*const ready = readyIssues\(\)/);
  assert.match(watcher, /if \(pollInFlight\) \{[\s\S]*pollWakePending = true;[\s\S]*return;[\s\S]*\}/);
  assert.match(watcher, /do \{[\s\S]*await poll\(\);[\s\S]*\} while \(pollWakePending\);/);
});

test("V3 backfill can claim all four dependency-safe workers in one pass without double-claiming", () => {
  const watcher = fs.readFileSync("scripts/orchestration-v3/watcher.mjs", "utf8");
  const config = fs.readFileSync("scripts/orchestration-v3/config.mjs", "utf8");
  assert.match(config, /"local-a"[\s\S]*CORE_INTELLIGENCE/);
  assert.match(config, /"local-b"[\s\S]*DISCOVERY_INTELLIGENCE/);
  assert.match(config, /"local-c"[\s\S]*INTELLIGENCE_UX/);
  assert.match(config, /"local-d"[\s\S]*AGENT_ORCHESTRATION/);
  assert.match(watcher, /for \(const candidate of ready\)/);
  assert.match(watcher, /workerCandidatesForStream\(stream\)/);
  assert.match(watcher, /claimedWorkersThisPass\.has\(candidateWorkerId\)/);
  assert.match(watcher, /claimedWorkersThisPass\.add\(workerId\);[\s\S]*claim\(snapshot\.number\);[\s\S]*launch\(workerId, snapshot\.number\);/);
  assert.match(watcher, /claimedWorkersThisPass\.delete\(workerId\);/);
});

test("V3 backfill never treats a running label alone as an authoritative running claim", () => {
  const watcher = fs.readFileSync("scripts/orchestration-v3/watcher.mjs", "utf8");
  assert.match(watcher, /const activeIssues = activeLeaseIssueNumbers\(\);/);
  assert.match(watcher, /if \(activeIssues\.has\(Number\(candidate\.number\)\)\) continue;/);
  assert.match(watcher, /NO_AUTHORITATIVE_LIVE_LEASE/);
  assert.match(watcher, /--remove-label", ORCHESTRATION_V3\.queue\.running, "--add-label", ORCHESTRATION_V3\.queue\.ready/);
});

test("V3 backfill keeps background Ollama proof behind product priority", () => {
  const watcher = fs.readFileSync("scripts/orchestration-v3/watcher.mjs", "utf8");
  assert.match(watcher, /BACKGROUND_OLLAMA_PROOF_ISSUE = 337/);
  assert.match(watcher, /PRIORITY_RANK/);
  assert.match(watcher, /priorityRank\(left\.body, left\.number\)/);
});

test("V3 canonical activation uses a 20 second safety poll", () => {
  const activation = fs.readFileSync("scripts/orchestration-v3/activate-host.mjs", "utf8");
  assert.match(activation, /<string>--interval<\/string><string>20<\/string>/);
  assert.match(activation, /safetyPollSeconds: 20/);
  assert.doesNotMatch(activation, /<string>--interval<\/string><string>60<\/string>/);
});
