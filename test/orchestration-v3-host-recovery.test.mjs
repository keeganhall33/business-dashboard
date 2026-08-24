import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runBoundedHostRecovery } from "../scripts/orchestration-v3/host-recovery.mjs";

function report({ watcherLoaded = true, watcherAlive = true, activeWorkers = ["local-e", "local-f"], readyUnmapped = [] } = {}) {
  return {
    watcher: {
      loaded: watcherLoaded,
      pid: watcherAlive ? 1234 : null,
      pid_alive: watcherAlive
    },
    heartbeat: { age_seconds: watcherAlive ? 12 : null },
    workers: ["local-a", "local-b", "local-c", "local-d", "local-e", "local-f"].map((workerId) => ({
      worker_id: workerId,
      issue_number: activeWorkers.includes(workerId) ? 700 + workerId.charCodeAt(workerId.length - 1) : null,
      pid: activeWorkers.includes(workerId) ? 1000 + workerId.charCodeAt(workerId.length - 1) : null,
      pid_alive: activeWorkers.includes(workerId)
    })),
    summary: {
      capacity_acceptance_proof: "6/6",
      utilization_label: `${activeWorkers.length}/6 capacity`,
      role_utilization: {
        product: `${activeWorkers.filter((workerId) => ["local-a", "local-b", "local-c", "local-d"].includes(workerId)).length}/4`,
        integration_release: `${activeWorkers.includes("local-e") ? 1 : 0}/1`,
        qa_evaluation: `${activeWorkers.includes("local-f") ? 1 : 0}/1`
      },
      ready_backfill_candidates: [],
      ready_unmapped_issue_numbers: readyUnmapped
    }
  };
}

function depsWithReports(reports, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v3-host-recovery-test-"));
  let index = 0;
  return {
    dir,
    deps: {
      nowIso: () => "2026-08-23T12:00:00.000Z",
      auditPath: (operation) => path.join(dir, `${operation}.json`),
      liveness: () => reports[Math.min(index++, reports.length - 1)],
      inspectGitRoot: () => ({ healthy: true, errors: [] }),
      bestEffort: (exe, args) => ({ ok: true, exe, args, stdout: "", stderr: "" }),
      ...extra
    }
  };
}

test("bounded host recovery reloads unloaded watcher and preserves active local-e/local-f workers", () => {
  const before = report({ watcherLoaded: false, watcherAlive: false, activeWorkers: ["local-e", "local-f"] });
  const after = report({ watcherLoaded: true, watcherAlive: true, activeWorkers: ["local-e", "local-f"] });
  const { dir, deps } = depsWithReports([before, after, after]);
  const result = runBoundedHostRecovery({
    operation: "restart-watcher",
    reason: "watcher unloaded while integration and QA workers are active",
    allowNonDarwinForTest: true
  }, deps);

  assert.equal(result.status, "RECOVERED");
  assert.equal(result.result, "WATCHER_RECOVERED");
  assert.deepEqual(result.before_state.active_workers, ["local-e", "local-f"]);
  assert.deepEqual(result.after_state.active_workers, ["local-e", "local-f"]);
  assert.equal(result.safety.active_workers_preserved.ok, true);
  assert.equal(result.safety.no_general_command_execution, true);
  assert.ok(result.actions.some((action) => action.action === "launchctl_kickstart_v3_watcher"));
  assert.ok(fs.existsSync(path.join(dir, "restart-watcher.json")));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("bounded host recovery fails closed if watcher reload would lose an active worker", () => {
  const before = report({ watcherLoaded: false, watcherAlive: false, activeWorkers: ["local-e", "local-f"] });
  const after = report({ watcherLoaded: true, watcherAlive: true, activeWorkers: ["local-f"] });
  const { dir, deps } = depsWithReports([before, after, after]);
  const result = runBoundedHostRecovery({ operation: "restart-watcher", allowNonDarwinForTest: true }, deps);

  assert.equal(result.status, "HUMAN_ACTION_REQUIRED");
  assert.match(result.result, /ACTIVE_WORKER_PRESERVATION_FAILED:local-e/);
  assert.equal(result.safety.active_workers_preserved.ok, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("bounded host recovery refuses active worker repair and only repairs explicitly targeted idle lanes", () => {
  const current = report({ activeWorkers: ["local-e", "local-f"] });
  const active = depsWithReports([current, current], {
    recoverIdleWorker: () => {
      throw new Error("must not repair active worker");
    }
  });
  const activeResult = runBoundedHostRecovery({ operation: "repair-idle-worker", workerId: "local-e" }, active.deps);
  assert.equal(activeResult.status, "HUMAN_ACTION_REQUIRED");
  assert.equal(activeResult.result, "ACTIVE_WORKER_NOT_REPAIRABLE");
  fs.rmSync(active.dir, { recursive: true, force: true });

  const idle = depsWithReports([current, current], {
    recoverIdleWorker: (workerId) => ({
      workerId,
      recovered: true,
      recoverable: true,
      before: { errors: ["TRACKED_WORKTREE_DIRTY"] },
      after: { healthy: true, errors: [] }
    })
  });
  const idleResult = runBoundedHostRecovery({ operation: "repair-idle-worker", workerId: "local-a" }, idle.deps);
  assert.equal(idleResult.status, "RECOVERED");
  assert.equal(idleResult.result, "IDLE_WORKER_RECOVERED");
  assert.equal(idleResult.actions[0].worker_id, "local-a");
  fs.rmSync(idle.dir, { recursive: true, force: true });
});

test("bounded host recovery recovers only clearly stale integration locks", () => {
  const current = report();
  const live = depsWithReports([current, current], {
    inspectIntegrationLock: () => ({ exists: true, stale: false, pidAlive: true, ageMs: 1000, lock: { pid: 42 } }),
    recoverStaleIntegrationLock: () => {
      throw new Error("live lock must not be removed");
    }
  });
  const liveResult = runBoundedHostRecovery({ operation: "recover-stale-integration-lock" }, live.deps);
  assert.equal(liveResult.status, "HUMAN_ACTION_REQUIRED");
  assert.equal(liveResult.result, "INTEGRATION_LOCK_LIVE");
  fs.rmSync(live.dir, { recursive: true, force: true });

  const stale = depsWithReports([current, current], {
    inspectIntegrationLock: () => ({ exists: true, stale: true, pidAlive: false, ageMs: 1_800_000, lock: { pid: 42 } }),
    recoverStaleIntegrationLock: () => ({
      recovered: true,
      inspection: { exists: true, stale: true, pidAlive: false, ageMs: 1_800_000, lock: { pid: 42 } }
    })
  });
  const staleResult = runBoundedHostRecovery({ operation: "recover-stale-integration-lock" }, stale.deps);
  assert.equal(staleResult.status, "RECOVERED");
  assert.equal(staleResult.result, "STALE_INTEGRATION_LOCK_RECOVERED");
  fs.rmSync(stale.dir, { recursive: true, force: true });
});

test("bounded host recovery exposes predefined operations instead of general command execution", () => {
  const current = report();
  const { dir, deps } = depsWithReports([current]);
  const result = runBoundedHostRecovery({ operation: "rm -rf /" }, deps);

  assert.equal(result.status, "HUMAN_ACTION_REQUIRED");
  assert.equal(result.result, "INVALID_OPERATION");
  assert.deepEqual(result.allowed_operations, ["recover-stale-integration-lock", "repair-idle-worker", "restart-watcher", "status"]);
  assert.equal(fs.existsSync(path.join(dir, "rm -rf /.json")), false);
  fs.rmSync(dir, { recursive: true, force: true });
});
