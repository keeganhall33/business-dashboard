import assert from "node:assert/strict";
import test from "node:test";
import { inspectLease } from "../scripts/orchestration-v3/lease-reconciliation.mjs";
import { ORCHESTRATION_V3 } from "../scripts/orchestration-v3/config.mjs";

function leaseFor(workerId, overrides = {}) {
  const now = "2026-08-29T19:00:00.000Z";
  return {
    sessionId: "test-session",
    workerId,
    issueNumber: 999,
    pid: 424242,
    startedAt: now,
    heartbeatAt: now,
    lastProgressAt: now,
    progressSequence: 1,
    progressPhase: "CHILD_REAPED",
    worktree: ORCHESTRATION_V3.workers[workerId].worktree,
    ...overrides
  };
}

test("proven-dead worker PID is reclaimable immediately even with a fresh heartbeat", () => {
  const workerId = "local-e";
  const inspection = inspectLease(workerId, {
    now: new Date("2026-08-29T19:00:20.000Z"),
    lease: leaseFor(workerId),
    pidAlive: false,
    processCommandText: null
  });

  assert.equal(inspection.heartbeat_fresh, true);
  assert.equal(inspection.progress_fresh, true);
  assert.equal(inspection.worktree_matches, true);
  assert.equal(inspection.pid_alive, false);
  assert.deepEqual(inspection.evidence.includes("PID_NOT_ALIVE"), true);
  assert.equal(inspection.reconciliation_decision, "PROVEN_STALE_RECLAIM");
});

test("dead PID does not bypass worker-worktree identity safety", () => {
  const workerId = "local-f";
  const inspection = inspectLease(workerId, {
    now: new Date("2026-08-29T19:00:20.000Z"),
    lease: leaseFor(workerId, { worktree: "/tmp/not-the-local-f-worktree" }),
    pidAlive: false,
    processCommandText: null
  });

  assert.equal(inspection.pid_alive, false);
  assert.equal(inspection.worktree_matches, false);
  assert.equal(inspection.reconciliation_decision, "INSUFFICIENT_EVIDENCE_PRESERVE");
});

test("live correctly-owned worker is never evicted from progress age alone", () => {
  const workerId = "local-e";
  const inspection = inspectLease(workerId, {
    now: new Date("2026-08-29T19:05:00.000Z"),
    lease: leaseFor(workerId, {
      heartbeatAt: "2026-08-29T19:04:50.000Z",
      lastProgressAt: "2026-08-29T18:50:00.000Z"
    }),
    pidAlive: true,
    processCommandText: "node scripts/orchestration-v3/worker.mjs --issue 999 --worker local-e"
  });

  assert.equal(inspection.heartbeat_fresh, true);
  assert.equal(inspection.progress_fresh, false);
  assert.equal(inspection.command_matches_lease, true);
  assert.equal(inspection.reconciliation_decision, "LIVE_LEASE_PRESERVED");
});
