import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  LEASE_TTL_CONTRACT,
  inspectLease,
  reconcileLeaseState
} from "../scripts/orchestration-v3/lease-reconciliation.mjs";

const now = new Date("2026-08-25T12:00:00.000Z");
const fresh = "2026-08-25T11:59:30.000Z";
const stale = "2026-08-25T11:40:00.000Z";

function lease(overrides = {}) {
  return {
    sessionId: "session-1",
    workerId: "local-d",
    issueNumber: 773,
    pid: 12345,
    startedAt: "2026-08-25T10:00:00.000Z",
    heartbeatAt: fresh,
    worktree: "/Users/keeganhall/.openclaw/worktrees/local-d",
    logPath: "/tmp/worker.log",
    ...overrides
  };
}

test("lease TTL contract defines heartbeat freshness without allowing age-only eviction", () => {
  assert.equal(LEASE_TTL_CONTRACT.heartbeatFreshMs, 120000);
  assert.equal(LEASE_TTL_CONTRACT.workerHeartbeatIntervalMs, 30000);
  assert.equal(LEASE_TTL_CONTRACT.leaseTtlMs, 14400000);

  const oldButLive = inspectLease("local-d", {
    now,
    lease: lease({ startedAt: "2026-08-25T00:00:00.000Z", heartbeatAt: fresh }),
    pidAlive: true,
    processCommandText: "node scripts/orchestration-v3/worker.mjs --issue 773 --worker local-d"
  });

  assert.equal(oldButLive.lease_within_ttl, false);
  assert.equal(oldButLive.heartbeat_fresh, true);
  assert.equal(oldButLive.reconciliation_decision, "LIVE_LEASE_PRESERVED");
});

test("orphaned PID with stale heartbeat is proven stale and reclaimable", () => {
  const orphaned = inspectLease("local-d", {
    now,
    lease: lease({ heartbeatAt: stale }),
    pidAlive: false,
    processCommandText: null
  });

  assert.equal(orphaned.reconciliation_decision, "PROVEN_STALE_RECLAIM");
  assert.deepEqual(orphaned.evidence, ["PID_NOT_ALIVE", "HEARTBEAT_STALE"]);
});

test("stale heartbeat alone preserves the lease until process evidence proves failure", () => {
  const staleHeartbeat = inspectLease("local-d", {
    now,
    lease: lease({ heartbeatAt: stale }),
    pidAlive: true,
    processCommandText: "node scripts/orchestration-v3/worker.mjs --issue 773 --worker local-d"
  });

  assert.equal(staleHeartbeat.reconciliation_decision, "INSUFFICIENT_EVIDENCE_PRESERVE");
  assert.deepEqual(staleHeartbeat.evidence, ["HEARTBEAT_STALE"]);
});

test("PID reuse or command mismatch with stale heartbeat is proven stale", () => {
  const reusedPid = inspectLease("local-d", {
    now,
    lease: lease({ heartbeatAt: stale }),
    pidAlive: true,
    processCommandText: "node unrelated-process.js"
  });

  assert.equal(reusedPid.reconciliation_decision, "PROVEN_STALE_RECLAIM");
  assert.deepEqual(reusedPid.evidence, ["PID_COMMAND_MISMATCH", "HEARTBEAT_STALE"]);
});

test("worktree identity mismatch with stale heartbeat is proven stale", () => {
  const mismatch = inspectLease("local-d", {
    now,
    lease: lease({ heartbeatAt: stale, worktree: "/tmp/not-local-d" }),
    pidAlive: true,
    processCommandText: "node scripts/orchestration-v3/worker.mjs --issue 773 --worker local-d"
  });

  assert.equal(mismatch.reconciliation_decision, "PROVEN_STALE_RECLAIM");
  assert.ok(mismatch.evidence.includes("WORKTREE_IDENTITY_MISMATCH"));
});

test("legacy live lease without worktree identity is preserved when heartbeat and process match", () => {
  const legacyLive = inspectLease("local-d", {
    now,
    lease: lease({ worktree: undefined }),
    pidAlive: true,
    processCommandText: "node scripts/orchestration-v3/worker.mjs --issue 773 --worker local-d"
  });

  assert.equal(legacyLive.worktree_matches, true);
  assert.equal(legacyLive.reconciliation_decision, "LIVE_LEASE_PRESERVED");
  assert.deepEqual(legacyLive.evidence, []);
});

test("reconcile clears only proven stale local lease state with auditable evidence", () => {
  const unlinked = [];
  const result = reconcileLeaseState("local-d", {
    now,
    inspect: () => inspectLease("local-d", {
      now,
      lease: lease({ heartbeatAt: stale }),
      pidAlive: false,
      processCommandText: null
    }),
    unlink: (filePath) => unlinked.push(filePath),
    filePath: "/tmp/local-d.json",
    recoverIdleWorker: () => ({ after: { healthy: true } })
  });

  assert.equal(result.reclaimed, true);
  assert.equal(result.inspection.reconciliation_decision, "PROVEN_STALE_RECLAIM");
  assert.deepEqual(unlinked, ["/tmp/local-d.json"]);
});

test("watcher reconciles stale leases before ready selection so the freed lane can backfill", () => {
  const watcher = fs.readFileSync("scripts/orchestration-v3/watcher.mjs", "utf8");
  assert.match(watcher, /reconcileRunningClaims\(\);[\s\S]*const claimedWorkersThisPass = new Set\(\);[\s\S]*const ready = readyIssues\(\)/);
  assert.match(watcher, /workerCandidates\.find\(\(candidateWorkerId\) => !claimedWorkersThisPass\.has\(candidateWorkerId\) && !reconcileLease\(candidateWorkerId\)\)/);
  assert.match(watcher, /STALE_LEASE_RECLAIMED[\s\S]*reconciliationDecision/);
});

test("doctor exposes lease age, heartbeat age, process/worktree evidence, and reconciliation decision", () => {
  const doctor = fs.readFileSync("scripts/orchestration-v3/doctor.mjs", "utf8");
  const liveness = fs.readFileSync("scripts/orchestration-v3/liveness-report.mjs", "utf8");
  for (const field of ["WORKER_LEASE_RECONCILIATION", "lease_age_seconds", "heartbeat_age_seconds", "pid_alive", "worktree_matches", "reconciliation_decision"]) {
    assert.match(doctor, new RegExp(field));
  }
  for (const field of ["lease_age_seconds", "heartbeat_age_seconds", "pid_alive", "worktree_identity", "reconciliation_decision"]) {
    assert.match(liveness, new RegExp(field));
  }
});
