import { ORCHESTRATION_V3 } from "./config.mjs";
import {
  inspectWorktreeIntegrity,
  recoverDisposableWorktree,
  emitWorktreeIntegrityEvent
} from "./worktree-integrity.mjs";

export function inspectGitRoot(cwd) {
  return inspectWorktreeIntegrity(cwd);
}

export function recoverIdleWorker(workerId) {
  return recoverDisposableWorktree(workerId, { reason: "IDLE_WORKER_RECOVERY" });
}

export function inspectAllWorkers() {
  return Object.fromEntries(
    Object.entries(ORCHESTRATION_V3.workers).map(([workerId, cfg]) => [workerId, inspectGitRoot(cfg.worktree)])
  );
}

export function requireHealthyWorker(workerId) {
  const cfg = ORCHESTRATION_V3.workers[workerId];
  if (!cfg) throw new Error(`UNKNOWN_WORKER:${workerId}`);

  let inspection = inspectGitRoot(cfg.worktree);
  if (!inspection.healthy) {
    const recovery = recoverIdleWorker(workerId);
    inspection = recovery.after;
    if (recovery.recovered) {
      emitWorktreeIntegrityEvent("WORKTREE_AUTO_RECOVERED", {
        workerId,
        previousErrors: recovery.before.errors,
        trackedChangeCount: recovery.before.trackedChangeCount,
        trackedDeletionCount: recovery.before.trackedDeletionCount,
        branch: recovery.before.branch,
        head: recovery.before.head,
        recoveryResult: "RECOVERED"
      });
    }
  }

  if (!inspection.healthy) {
    throw new Error(`WORKTREE_PREFLIGHT_FAILED:${workerId}:${inspection.errors.join(",")}`);
  }
  return inspection;
}
