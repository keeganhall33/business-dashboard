import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("V3 leases require authoritative live evidence and never treat transient GitHub unknown as stopped", () => {
  const watcher = fs.readFileSync("scripts/orchestration-v3/watcher.mjs", "utf8");
  const reconciliation = fs.readFileSync("scripts/orchestration-v3/lease-reconciliation.mjs", "utf8");

  // GitHub running-state lookup remains fail-safe: transient GitHub failure is UNKNOWN,
  // and UNKNOWN preserves the current lease rather than reclaiming it.
  assert.match(watcher, /function issueIsRunning\(issueNumber\)/);
  assert.match(watcher, /typeof label === "string" \? label : label\.name/);
  assert.match(watcher, /=== ORCHESTRATION_V3\.queue\.running/);
  assert.match(watcher, /if \(issueRunning === null\) return currentLease/);
  assert.match(watcher, /ISSUE_RUNNING_STATE_UNKNOWN/);

  // The watcher delegates authoritative PID\/session\/worktree\/heartbeat decisions to
  // the lease reconciler instead of duplicating that logic inline.
  assert.match(watcher, /reconcileLeaseState\(workerId, \{ recoverIdleWorker \}\)/);
  assert.match(watcher, /inspection\.reconciliation_decision === "LIVE_LEASE_PRESERVED"/);
  assert.match(watcher, /inspection\.reconciliation_decision === "INSUFFICIENT_EVIDENCE_PRESERVE"/);
  assert.match(watcher, /STALE_LEASE_RECLAIMED/);
  assert.match(watcher, /lease && alive\(Number\(lease\.pid\)\)/);

  // Reconciliation requires multiple authoritative signals. A live PID by itself is
  // insufficient; the process command, worktree identity, and heartbeat must agree.
  assert.match(reconciliation, /process\.kill\(pid, 0\)/);
  assert.match(reconciliation, /command\.includes\("scripts\/orchestration-v3\/worker\.mjs"\)/);
  assert.match(reconciliation, /command\.includes\(`--worker \$\{lease\.workerId\}`\)/);
  assert.match(reconciliation, /command\.includes\(`--issue \$\{Number\(lease\.issueNumber\)\}`\)/);
  assert.match(reconciliation, /heartbeatAgeMs <= LEASE_TTL_CONTRACT\.heartbeatFreshMs/);
  assert.match(reconciliation, /path\.resolve\(String\(lease\.worktree\)\) === path\.resolve\(cfg\.worktree\)/);
  assert.match(reconciliation, /resolvedPidAlive && commandMatches && worktreeMatches && heartbeatFresh/);
  assert.match(reconciliation, /decision = "LIVE_LEASE_PRESERVED"/);
  assert.match(reconciliation, /decision = "PROVEN_STALE_RECLAIM"/);
  assert.match(reconciliation, /decision = "INSUFFICIENT_EVIDENCE_PRESERVE"/);

  // Regression guard: never regress to preserving a lease solely because its PID exists.
  assert.doesNotMatch(watcher, /if \(alive\(Number\(lease\.pid\)\)\) return lease/);
});
