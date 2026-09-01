import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ORCHESTRATION_V3 } from "./config.mjs";
import { hydrateDependencies } from "./hydrate-dependencies.mjs";

export const INTEGRITY_CLASSIFICATION = Object.freeze({
  CLEAN: "CLEAN",
  TRACKED_WORKTREE_DIRTY: "TRACKED_WORKTREE_DIRTY",
  UNEXPECTED_UNTRACKED_FILES: "UNEXPECTED_UNTRACKED_FILES",
  CATASTROPHIC_WORKTREE_CORRUPTION: "CATASTROPHIC_WORKTREE_CORRUPTION",
  AMBIGUOUS_WORKTREE_CORRUPTION: "AMBIGUOUS_WORKTREE_CORRUPTION",
  WORKTREE_MISSING: "WORKTREE_MISSING",
  WORKTREE_ROOT_MISMATCH: "WORKTREE_ROOT_MISMATCH",
  GIT_PREFLIGHT_FAILED: "GIT_PREFLIGHT_FAILED"
});

const ALLOWED_OPENCLAW_UNTRACKED = new Set([
  "AGENTS.md",
  "HEARTBEAT.md",
  "IDENTITY.md",
  "SOUL.md",
  "TOOLS.md",
  "USER.md",
  "openclaw-workspace-state.json"
]);

export const CATASTROPHIC_DELETION_MIN_COUNT = 25;
export const CATASTROPHIC_DELETION_MIN_RATIO = 0.35;

function run(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", timeout: 30_000 }).trim();
}

function porcelainPath(line) {
  return String(line).slice(3).trim().replace(/^"|"$/g, "");
}

function statusCode(line) {
  return { index: line[0] ?? " ", worktree: line[1] ?? " " };
}

function isTracked(line) {
  return !String(line).startsWith("?? ");
}

function isDeletion(line) {
  const code = statusCode(line);
  return code.index === "D" || code.worktree === "D";
}

function isModification(line) {
  const code = statusCode(line);
  return code.index === "M" || code.worktree === "M" || code.index === "A" || code.worktree === "A" || code.index === "R" || code.worktree === "R" || code.index === "C" || code.worktree === "C";
}

export function configuredDisposableWorkerIds() {
  return Object.keys(ORCHESTRATION_V3.workers);
}

export function isConfiguredDisposableWorktree(workerId, cwd) {
  const cfg = ORCHESTRATION_V3.workers[workerId];
  return Boolean(cfg) && path.resolve(cfg.worktree) === path.resolve(cwd);
}

export function classifyWorktreeIntegrity(statusLines, { totalTrackedFiles = 0 } = {}) {
  const status = Array.isArray(statusLines) ? statusLines : [];
  const tracked = status.filter(isTracked);
  const trackedDeletions = tracked.filter(isDeletion).map(porcelainPath).filter(Boolean);
  const trackedNonDeletionChanges = tracked.filter((line) => !isDeletion(line) && isModification(line)).map(porcelainPath).filter(Boolean);
  const unexpectedUntracked = status
    .filter((line) => line.startsWith("?? "))
    .map((line) => line.slice(3).trim())
    .filter((rel) => !ALLOWED_OPENCLAW_UNTRACKED.has(path.normalize(rel)));
  const trackedFileCount = Math.max(Number(totalTrackedFiles) || 0, tracked.length);
  const deletionRatio = trackedFileCount > 0 ? trackedDeletions.length / trackedFileCount : 0;
  const massDeletion = trackedDeletions.length >= CATASTROPHIC_DELETION_MIN_COUNT && deletionRatio >= CATASTROPHIC_DELETION_MIN_RATIO;
  const exclusiveMassDeletion = massDeletion && trackedNonDeletionChanges.length === 0;
  const ambiguousMassDeletion = massDeletion && trackedNonDeletionChanges.length > 0;

  let classification = INTEGRITY_CLASSIFICATION.CLEAN;
  let recoveryPolicy = "NONE";
  const quarantineReasons = [];
  if (exclusiveMassDeletion) {
    classification = INTEGRITY_CLASSIFICATION.CATASTROPHIC_WORKTREE_CORRUPTION;
    recoveryPolicy = "AUTO_RESET_ALLOWED";
    quarantineReasons.push("EXCLUSIVE_MASS_TRACKED_DELETION");
  } else if (ambiguousMassDeletion) {
    classification = INTEGRITY_CLASSIFICATION.AMBIGUOUS_WORKTREE_CORRUPTION;
    recoveryPolicy = "HUMAN_ACTION_REQUIRED";
    quarantineReasons.push("MASS_DELETION_WITH_UNCOMMITTED_NON_DELETION_CHANGES");
  } else if (tracked.length > 0) {
    classification = INTEGRITY_CLASSIFICATION.TRACKED_WORKTREE_DIRTY;
    recoveryPolicy = "HUMAN_ACTION_REQUIRED";
    quarantineReasons.push("TRACKED_UNCOMMITTED_WORK");
  } else if (unexpectedUntracked.length > 0) {
    classification = INTEGRITY_CLASSIFICATION.UNEXPECTED_UNTRACKED_FILES;
    recoveryPolicy = "HUMAN_ACTION_REQUIRED";
    quarantineReasons.push("UNEXPECTED_UNTRACKED_FILES");
  }

  return {
    classification,
    recoveryPolicy,
    statusLines: status,
    trackedChangeCount: tracked.length,
    trackedDeletionCount: trackedDeletions.length,
    trackedDeletions,
    trackedNonDeletionChangeCount: trackedNonDeletionChanges.length,
    trackedNonDeletionChanges,
    untrackedCount: status.filter((line) => line.startsWith("?? ")).length,
    unexpectedUntracked,
    totalTrackedFiles: trackedFileCount,
    deletionRatio,
    committedWorkPreserved: true,
    quarantineReasons
  };
}

export function inspectWorktreeIntegrity(cwd) {
  const result = {
    cwd,
    exists: fs.existsSync(cwd),
    gitRoot: null,
    head: null,
    branch: null,
    status: [],
    healthy: false,
    errors: []
  };
  if (!result.exists) {
    result.errors.push(INTEGRITY_CLASSIFICATION.WORKTREE_MISSING);
    return { ...result, ...classifyWorktreeIntegrity([]), classification: INTEGRITY_CLASSIFICATION.WORKTREE_MISSING };
  }
  try {
    result.gitRoot = run(cwd, ["rev-parse", "--show-toplevel"]);
    result.head = run(cwd, ["rev-parse", "HEAD"]);
    result.branch = run(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
    const status = run(cwd, ["status", "--porcelain=v1"]);
    const totalTrackedFiles = Number(run(cwd, ["ls-files"]).split("\n").filter(Boolean).length);
    result.status = status ? status.split("\n") : [];
    const integrity = classifyWorktreeIntegrity(result.status, { totalTrackedFiles });
    if (fs.realpathSync(result.gitRoot) !== fs.realpathSync(cwd)) result.errors.push(INTEGRITY_CLASSIFICATION.WORKTREE_ROOT_MISMATCH);
    if (integrity.classification !== INTEGRITY_CLASSIFICATION.CLEAN) result.errors.push(integrity.classification);
    result.healthy = result.errors.length === 0;
    return { ...result, ...integrity };
  } catch (err) {
    result.errors.push(`${INTEGRITY_CLASSIFICATION.GIT_PREFLIGHT_FAILED}:${err instanceof Error ? err.message : String(err)}`);
    return { ...result, ...classifyWorktreeIntegrity([]), classification: INTEGRITY_CLASSIFICATION.GIT_PREFLIGHT_FAILED };
  }
}

export function emitWorktreeIntegrityEvent(event, payload) {
  console.error(JSON.stringify({ event, generated_at: new Date().toISOString(), ...payload }));
}

export function recoverDisposableWorktree(workerId, { reason = "UNSPECIFIED" } = {}) {
  const cfg = ORCHESTRATION_V3.workers[workerId];
  if (!cfg) throw new Error(`UNKNOWN_WORKER:${workerId}`);
  return recoverCorruptedWorktree({
    workerId,
    cwd: cfg.worktree,
    disposableWorktrees: Object.fromEntries(Object.entries(ORCHESTRATION_V3.workers).map(([id, workerCfg]) => [id, workerCfg.worktree])),
    reason
  });
}

export function recoverCorruptedWorktree({ workerId, cwd, disposableWorktrees, reason = "UNSPECIFIED" }) {
  if (path.resolve(disposableWorktrees?.[workerId] ?? "") !== path.resolve(cwd)) {
    throw new Error(`REFUSE_NON_DISPOSABLE_WORKTREE:${workerId}`);
  }

  const before = inspectWorktreeIntegrity(cwd);
  if (before.healthy) return { workerId, recovered: false, recoverable: true, before, after: before, quarantine: false };

  emitWorktreeIntegrityEvent("WORKTREE_CORRUPTION_DETECTED", {
    workerId,
    reason,
    classification: before.classification,
    deletionCount: before.trackedDeletionCount,
    deletionRatio: before.deletionRatio,
    trackedChangeCount: before.trackedChangeCount,
    branch: before.branch,
    head: before.head,
    committedWorkPreserved: before.committedWorkPreserved
  });

  if (before.classification !== INTEGRITY_CLASSIFICATION.CATASTROPHIC_WORKTREE_CORRUPTION || before.recoveryPolicy !== "AUTO_RESET_ALLOWED") {
    emitWorktreeIntegrityEvent("WORKTREE_QUARANTINED", {
      workerId,
      reason,
      classification: before.classification,
      quarantineReasons: before.quarantineReasons,
      recoveryAttempted: false,
      result: "HUMAN_ACTION_REQUIRED"
    });
    return { workerId, recovered: false, recoverable: false, before, after: before, quarantine: true, result: "HUMAN_ACTION_REQUIRED" };
  }

  let recoveryError = null;
  try {
    run(cwd, ["reset", "--hard", "HEAD"]);
    run(cwd, ["clean", "-fd"]);
  } catch (err) {
    recoveryError = err instanceof Error ? err.message : String(err);
  }

  const after = inspectWorktreeIntegrity(cwd);
  if (fs.existsSync(path.join(cwd, "package-lock.json"))) {
    emitWorktreeIntegrityEvent("DEPENDENCY_HYDRATION_AFTER_RECOVERY", {
      workerId,
      cwd,
      method: "npm ci",
      note: "lockfile-exact hydration"
    });

    try {
      const hydration = hydrateDependencies(cwd);
      emitWorktreeIntegrityEvent("DEPENDENCY_HYDRATION_COMPLETE", {
        workerId,
        ...hydration
      });
    } catch (hydrErr) {
      emitWorktreeIntegrityEvent("DEPENDENCY_HYDRATION_FAILED", {
        workerId,
        error: hydrErr instanceof Error ? hydrErr.message : String(hydrErr)
      });
      throw hydrErr;
    }
  } else {
    emitWorktreeIntegrityEvent("DEPENDENCY_HYDRATION_SKIPPED", {
      workerId,
      cwd,
      reason: "PACKAGE_LOCK_MISSING"
    });
  }
  const recovered = !recoveryError && after.healthy && after.head === before.head;
  emitWorktreeIntegrityEvent("WORKTREE_RECOVERY_RESULT", {
    workerId,
    reason,
    recoveryAttempted: true,
    recoveryResult: recovered ? "RECOVERED" : "FAILED",
    deletionCount: before.trackedDeletionCount,
    deletionRatio: before.deletionRatio,
    branch: before.branch,
    head: before.head,
    afterHead: after.head,
    committedWorkPreserved: after.head === before.head,
    quarantineResult: recovered ? "CLEARED" : "QUARANTINED",
    error: recoveryError
  });
  return { workerId, recovered, recoverable: true, before, after, quarantine: !recovered, error: recoveryError };
}
