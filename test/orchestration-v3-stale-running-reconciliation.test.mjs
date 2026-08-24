import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("V3 watcher reconciles stale running labels from authoritative live leases", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/watcher.mjs", "utf8");
  assert.match(source, /function runningIssues\(\)/);
  assert.match(source, /function activeLeaseIssueNumbers\(\)/);
  assert.match(source, /function reconcileRunningClaims\(\)/);
  assert.match(source, /NO_AUTHORITATIVE_LIVE_LEASE/);
  assert.match(source, /STALE_RUNNING_REQUEUED/);
  assert.match(source, /reconcileRunningClaims\(\);[\s\S]*const ready = readyIssues\(\)/);
  assert.match(source, /transitionLabels\(candidate\.number, \{ remove: \[ORCHESTRATION_V3\.queue\.running\], add: \[ORCHESTRATION_V3\.queue\.ready\] \}\)/);
});
