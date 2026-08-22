import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ORCHESTRATION_V3 } from "./config.mjs";

const ALLOWED_OPENCLAW_UNTRACKED = new Set([
  "AGENTS.md",
  "HEARTBEAT.md",
  "IDENTITY.md",
  "SOUL.md",
  "TOOLS.md",
  "USER.md",
  "openclaw-workspace-state.json"
]);

const RECOVERABLE_IDLE_ERRORS = new Set([
  "MASS_TRACKED_DELETION",
  "TRACKED_WORKTREE_DIRTY",
  "UNEXPECTED_UNTRACKED_FILES"
]);

function run(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", timeout: 30_000 }).trim();
}

export function inspectGitRoot(cwd) {
  const result = {
    cwd,
    exists: fs.existsSync(cwd),
    gitRoot: null,
    head: null,
    branch: null,
    status: [],
    trackedChangeCount: 0,
    trackedDeletionCount: 0,
    unexpectedUntracked: [],
    healthy: false,
    errors: []
  };
  if (!result.exists) {
    result.errors.push("WORKTREE_MISSING");
    return result;
  }
  try {
    result.gitRoot = run(cwd, ["rev-parse", "--show-toplevel"]);
    result.head = run(cwd, ["rev-parse", "HEAD"]);
    result.branch = run(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
    const status = run(cwd, ["status", "--porcelain=v1"]);
    result.status = status ? status.split("\n") : [];
    result.trackedChangeCount = result.status.filter((line) => !line.startsWith("?? ")).length;
    result.trackedDeletionCount = result.status.filter((line) => /^\s?D\s|^D\s/.test(line)).length;
    result.unexpectedUntracked = result.status
      .filter((line) => line.startsWith("?? "))
      .map((line) => line.slice(3))
      .filter((rel) => !ALLOWED_OPENCLAW_UNTRACKED.has(path.normalize(rel)));

    if (result.gitRoot !== cwd) result.errors.push("WORKTREE_ROOT_MISMATCH");
    if (result.trackedDeletionCount >= 25) result.errors.push("MASS_TRACKED_DELETION");
    else if (result.trackedChangeCount > 0) result.errors.push("TRACKED_WORKTREE_DIRTY");
    if (result.unexpectedUntracked.length > 0) result.errors.push("UNEXPECTED_UNTRACKED_FILES");
    result.healthy = result.errors.length === 0;
  } catch (err) {
    result.errors.push(`GIT_PREFLIGHT_FAILED:${err instanceof Error ? err.message : String(err)}`);
  }
  return result;
}

export function recoverIdleWorker(workerId) {
  const cfg = ORCHESTRATION_V3.workers[workerId];
  if (!cfg) throw new Error(`UNKNOWN_WORKER:${workerId}`);

  const before = inspectGitRoot(cfg.worktree);
  if (before.healthy) return { workerId, recovered: false, recoverable: true, before, after: before };

  const recoverable = before.errors.length > 0 && before.errors.every((error) => RECOVERABLE_IDLE_ERRORS.has(error));
  if (!recoverable) return { workerId, recovered: false, recoverable: false, before, after: before };

  try {
    try { run(cfg.worktree, ["fetch", "origin", "main"]); } catch {}
    run(cfg.worktree, ["reset", "--hard", ORCHESTRATION_V3.runtime.canonicalRef]);
    run(cfg.worktree, ["clean", "-fd"]);
    run(cfg.worktree, ["checkout", "--detach", "-f", ORCHESTRATION_V3.runtime.canonicalRef]);
  } catch (err) {
    const after = inspectGitRoot(cfg.worktree);
    return {
      workerId,
      recovered: false,
      recoverable: true,
      before,
      after,
      error: err instanceof Error ? err.message : String(err)
    };
  }

  const after = inspectGitRoot(cfg.worktree);
  return { workerId, recovered: after.healthy, recoverable: true, before, after };
}

export function inspectAllWorkers() {
  return Object.fromEntries(
    Object.entries(ORCHESTRATION_V3.workers).map(([workerId, cfg]) => [workerId, inspectGitRoot(cfg.worktree)])
  );
}

export function requireHealthyWorker(workerId) {
  const cfg = ORCHESTRATION_V3.workers[workerId];
  if (!cfg) throw new Error(`UNKNOWN_WORKER:${workerId}`);
  const inspection = inspectGitRoot(cfg.worktree);
  if (!inspection.healthy) {
    throw new Error(`WORKTREE_PREFLIGHT_FAILED:${workerId}:${inspection.errors.join(",")}`);
  }
  return inspection;
}
