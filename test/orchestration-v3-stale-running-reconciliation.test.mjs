import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("V3 watcher reconciles stale running labels from authoritative live leases", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/watcher.mjs", "utf8");

  assert.match(source, /function runningIssues\(\)/);
  assert.match(source, /function activeLeaseIssueNumbers\(\)/);
  assert.match(source, /function reconcileRunningClaims\(activeAssignments = activeLeaseAssignments\(\)\)/);
  assert.match(source, /NO_AUTHORITATIVE_LIVE_LEASE/);
  assert.match(source, /STALE_RUNNING_REQUEUED/);

  assert.match(
    source,
    /const activeAssignments = activeLeaseAssignments\(\);[\s\S]*reconcileRunningClaims\(activeAssignments\);[\s\S]*const ready = readyIssues\(\)/
  );

  // Normal stale running work is requeued only when no current gate exists.
  assert.match(
    source,
    /transitionLabels\(candidate\.number,\s*\{[\s\S]*?remove:\s*\[ORCHESTRATION_V3\.queue\.running\],[\s\S]*?add:\s*\[ORCHESTRATION_V3\.queue\.ready\][\s\S]*?\}\)/
  );

  // A stale running issue that is currently blocked/review/human-gated is
  // dequeued without being resurrected into orch:ready.
  assert.match(source, /STALE_RUNNING_DEQUEUED_GATED/);
  assert.match(
    source,
    /NO_AUTHORITATIVE_LIVE_LEASE_AND_CURRENTLY_GATED/
  );
  assert.match(
    source,
    /labels\.has\(ORCHESTRATION_V3\.queue\.blocked\)/
  );
  assert.match(
    source,
    /labels\.has\(ORCHESTRATION_V3\.queue\.awaitingReview\)/
  );
  assert.match(
    source,
    /labels\.has\(ORCHESTRATION_V3\.queue\.humanApproval\)/
  );
});
