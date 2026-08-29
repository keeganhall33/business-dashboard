import { execFileSync } from "node:child_process";
import { ORCHESTRATION_V3 } from "./config.mjs";
import {
  inspectWorktreeIntegrity,
  recoverDisposableWorktree,
  emitWorktreeIntegrityEvent
} from "./worktree-integrity.mjs";

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", timeout: 30_000 }).trim();
}

function issueFromArgv(argv = process.argv) {
  const index = argv.indexOf("--issue");
  if (index < 0 || index + 1 >= argv.length) return null;
  const value = Number(argv[index + 1]);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function branchMatchesIssue(branch, issueNumber) {
  const normalized = String(branch ?? "").trim();
  if (!Number.isInteger(Number(issueNumber)) || Number(issueNumber) <= 0) return false;
  return normalized === `issue-${issueNumber}` || normalized.startsWith(`issue-${issueNumber}-`);
}

function remoteContainsHead(cwd, head) {
  if (!head) return false;
  try {
    const branches = git(cwd, ["branch", "-r", "--contains", head]);
    return branches.split("\n").map((line) => line.trim()).some((line) => line.startsWith("origin/"));
  } catch {
    return false;
  }
}

function issueRemoteBranches(cwd, issueNumber) {
  try {
    return git(cwd, ["for-each-ref", "--format=%(refname:short)", `refs/remotes/origin/issue-${issueNumber}*`])
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((name) => branchMatchesIssue(name.replace(/^origin\//, ""), issueNumber))
      .sort();
  } catch {
    return [];
  }
}

export function prepareCleanWorktreeForIssue({ cwd, issueNumber, canonicalRef = "refs/remotes/origin/main" }) {
  if (!Number.isInteger(Number(issueNumber)) || Number(issueNumber) <= 0) {
    throw new Error(`INVALID_ISSUE_NUMBER:${issueNumber}`);
  }

  const before = inspectWorktreeIntegrity(cwd);
  if (!before.healthy) {
    throw new Error(`WORKTREE_NOT_CLEAN_FOR_CLAIM:${before.errors.join(",")}`);
  }

  git(cwd, ["fetch", "origin", "--prune"]);
  const canonicalHead = git(cwd, ["rev-parse", canonicalRef]);
  const currentHead = git(cwd, ["rev-parse", "HEAD"]);
  const currentBranch = git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);

  if (branchMatchesIssue(currentBranch, issueNumber)) {
    emitWorktreeIntegrityEvent("WORKER_ISSUE_BRANCH_CONFIRMED", {
      issueNumber,
      cwd,
      branch: currentBranch,
      head: currentHead,
      canonicalRef,
      canonicalHead
    });
    return { prepared: false, issueNumber, branch: currentBranch, head: currentHead, canonicalHead };
  }

  const uniqueCommits = Number(git(cwd, ["rev-list", "--count", `${canonicalRef}..HEAD`]) || "0");
  const headPreservedRemotely = remoteContainsHead(cwd, currentHead);
  if (uniqueCommits > 0 && !headPreservedRemotely) {
    emitWorktreeIntegrityEvent("WORKER_STALE_BRANCH_QUARANTINED", {
      issueNumber,
      cwd,
      branch: currentBranch,
      head: currentHead,
      canonicalRef,
      canonicalHead,
      uniqueCommits,
      reason: "UNPRESERVED_COMMITTED_WORK"
    });
    throw new Error(`STALE_BRANCH_HAS_UNPRESERVED_COMMITS:${currentBranch}:${uniqueCommits}`);
  }

  const remoteBranches = issueRemoteBranches(cwd, issueNumber);
  let targetBranch;
  if (remoteBranches.length > 1) {
    throw new Error(`AMBIGUOUS_REMOTE_ISSUE_BRANCHES:${issueNumber}:${remoteBranches.join(",")}`);
  }

  if (remoteBranches.length === 1) {
    const remote = remoteBranches[0];
    targetBranch = remote.replace(/^origin\//, "");
    git(cwd, ["switch", "--force-create", targetBranch, "--track", remote]);
  } else {
    targetBranch = `issue-${issueNumber}-worker`;
    git(cwd, ["switch", "--force-create", targetBranch, canonicalRef]);
  }

  const after = inspectWorktreeIntegrity(cwd);
  if (!after.healthy) {
    throw new Error(`WORKTREE_UNHEALTHY_AFTER_ISSUE_PREP:${after.errors.join(",")}`);
  }
  if (!branchMatchesIssue(after.branch, issueNumber)) {
    throw new Error(`CLAIM_BRANCH_IDENTITY_MISMATCH:${issueNumber}:${after.branch}`);
  }

  emitWorktreeIntegrityEvent("WORKER_ISSUE_BRANCH_PREPARED", {
    issueNumber,
    cwd,
    previousBranch: currentBranch,
    previousHead: currentHead,
    branch: after.branch,
    head: after.head,
    canonicalRef,
    canonicalHead,
    reusedRemoteBranch: remoteBranches.length === 1,
    previousHeadPreservedRemotely: headPreservedRemotely
  });

  return {
    prepared: true,
    issueNumber,
    previousBranch: currentBranch,
    previousHead: currentHead,
    branch: after.branch,
    head: after.head,
    canonicalHead,
    reusedRemoteBranch: remoteBranches.length === 1
  };
}

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

  const issueNumber = issueFromArgv();
  if (issueNumber) {
    prepareCleanWorktreeForIssue({ cwd: cfg.worktree, issueNumber, canonicalRef: ORCHESTRATION_V3.runtime.canonicalRef });
    inspection = inspectGitRoot(cfg.worktree);
    if (!branchMatchesIssue(inspection.branch, issueNumber)) {
      throw new Error(`CLAIM_BRANCH_IDENTITY_MISMATCH:${issueNumber}:${inspection.branch}`);
    }
  }

  return inspection;
}
