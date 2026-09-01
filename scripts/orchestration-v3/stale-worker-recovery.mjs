import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { ORCHESTRATION_V3 } from "./config.mjs";
import { readLease } from "./lease-reconciliation.mjs";
import { inspectWorktreeIntegrity, emitWorktreeIntegrityEvent } from "./worktree-integrity.mjs";

function git(cwd, args, timeout = 30_000) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout,
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"]
  });
  return {
    ok: !result.error && result.status === 0,
    status: result.status,
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
    error: result.error?.message ?? null
  };
}

function safeSegment(value) {
  return String(value ?? "unknown").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "unknown";
}

function gitDir(cwd) {
  try {
    const value = execFileSync("git", ["rev-parse", "--git-dir"], { cwd, encoding: "utf8", timeout: 10_000 }).trim();
    return path.resolve(cwd, value);
  } catch {
    return null;
  }
}

function operationState(cwd) {
  const dir = gitDir(cwd);
  const verify = (name) => {
    const result = git(cwd, ["rev-parse", "--verify", name], 10_000);
    return result.ok ? result.stdout.trim() : null;
  };
  return {
    gitDir: dir,
    rebaseHead: verify("REBASE_HEAD"),
    mergeHead: verify("MERGE_HEAD"),
    cherryPickHead: verify("CHERRY_PICK_HEAD"),
    revertHead: verify("REVERT_HEAD"),
    rebaseMerge: Boolean(dir && fs.existsSync(path.join(dir, "rebase-merge"))),
    rebaseApply: Boolean(dir && fs.existsSync(path.join(dir, "rebase-apply")))
  };
}

function hasOperation(operation) {
  return Boolean(
    operation.rebaseHead || operation.mergeHead || operation.cherryPickHead || operation.revertHead ||
    operation.rebaseMerge || operation.rebaseApply
  );
}

function writeResult(file, result) {
  fs.writeFileSync(file, result.stdout || result.stderr || result.error || "", "utf8");
}

function preserveState(workerId, cwd, lease, inspection, operation, now = new Date()) {
  const session = safeSegment(lease?.sessionId);
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const dir = path.join(ORCHESTRATION_V3.runtime.stateRoot, "quarantine", workerId, `${stamp}-${session}`);
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(path.join(dir, "metadata.json"), JSON.stringify({
    event: "STALE_WORKER_STATE_PRESERVED",
    generated_at: now.toISOString(),
    workerId,
    issueNumber: Number(lease?.issueNumber) || null,
    sessionId: lease?.sessionId ?? null,
    pid: Number(lease?.pid) || null,
    cwd,
    head: inspection.head,
    branch: inspection.branch,
    classification: inspection.classification,
    quarantineReasons: inspection.quarantineReasons,
    operation
  }, null, 2) + "\n", "utf8");

  fs.writeFileSync(path.join(dir, "status.txt"), inspection.statusLines.join("\n") + (inspection.statusLines.length ? "\n" : ""), "utf8");
  writeResult(path.join(dir, "unstaged.patch"), git(cwd, ["diff", "--binary"]));
  writeResult(path.join(dir, "staged.patch"), git(cwd, ["diff", "--cached", "--binary"]));
  writeResult(path.join(dir, "unmerged-index.txt"), git(cwd, ["ls-files", "-u"]));
  writeResult(path.join(dir, "untracked.txt"), git(cwd, ["ls-files", "--others", "--exclude-standard"]));

  let safetyRef = null;
  if (inspection.head) {
    const base = `safety/stale-${safeSegment(workerId)}-${stamp}-${session}`;
    let candidate = base;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const created = git(cwd, ["branch", candidate, inspection.head]);
      if (created.ok) {
        safetyRef = candidate;
        break;
      }
      candidate = `${base}-${attempt + 1}`;
    }
  }

  fs.writeFileSync(path.join(dir, "preservation.json"), JSON.stringify({ safetyRef }, null, 2) + "\n", "utf8");
  emitWorktreeIntegrityEvent("STALE_WORKER_STATE_PRESERVED", {
    workerId,
    issueNumber: Number(lease?.issueNumber) || null,
    sessionId: lease?.sessionId ?? null,
    quarantinePath: dir,
    safetyRef,
    operation: hasOperation(operation)
  });
  return { dir, safetyRef };
}

function abortInterruptedOperation(cwd, operation) {
  if (operation.rebaseHead || operation.rebaseMerge || operation.rebaseApply) return { kind: "REBASE", ...git(cwd, ["rebase", "--abort"]) };
  if (operation.mergeHead) return { kind: "MERGE", ...git(cwd, ["merge", "--abort"]) };
  if (operation.cherryPickHead) return { kind: "CHERRY_PICK", ...git(cwd, ["cherry-pick", "--abort"]) };
  if (operation.revertHead) return { kind: "REVERT", ...git(cwd, ["revert", "--abort"]) };
  return { kind: null, ok: true, status: 0, stdout: "", stderr: "", error: null };
}

function stashDirtyState(workerId, cwd, lease) {
  const message = `orchestration-v3/stale-recovery/${safeSegment(workerId)}/${safeSegment(lease?.sessionId)}`;
  const result = git(cwd, ["stash", "push", "--include-untracked", "-m", message], 60_000);
  return { ...result, message };
}

export function recoverStaleWorkerSafely(workerId, { now = new Date() } = {}) {
  const cfg = ORCHESTRATION_V3.workers[workerId];
  if (!cfg) throw new Error(`UNKNOWN_WORKER:${workerId}`);
  const cwd = path.resolve(cfg.worktree);
  const lease = readLease(workerId);
  const before = inspectWorktreeIntegrity(cwd);
  if (before.healthy) {
    return { workerId, recovered: false, recoverable: true, before, after: before, quarantine: false, preservation: null };
  }

  const operation = operationState(cwd);
  const preservation = preserveState(workerId, cwd, lease, before, operation, now);

  emitWorktreeIntegrityEvent("STALE_WORKER_RECOVERY_STARTED", {
    workerId,
    issueNumber: Number(lease?.issueNumber) || null,
    sessionId: lease?.sessionId ?? null,
    classification: before.classification,
    interruptedOperation: hasOperation(operation),
    quarantinePath: preservation.dir
  });

  let abortResult = null;
  if (hasOperation(operation)) {
    abortResult = abortInterruptedOperation(cwd, operation);
    emitWorktreeIntegrityEvent("STALE_WORKER_OPERATION_ABORT_RESULT", {
      workerId,
      kind: abortResult.kind,
      success: abortResult.ok,
      status: abortResult.status
    });
    if (!abortResult.ok) {
      const after = inspectWorktreeIntegrity(cwd);
      return { workerId, recovered: false, recoverable: false, before, after, quarantine: true, preservation, error: `OPERATION_ABORT_FAILED:${abortResult.kind}` };
    }
  }

  let after = inspectWorktreeIntegrity(cwd);
  let stashResult = null;
  if (!after.healthy) {
    stashResult = stashDirtyState(workerId, cwd, lease);
    emitWorktreeIntegrityEvent("STALE_WORKER_STASH_RESULT", {
      workerId,
      success: stashResult.ok,
      status: stashResult.status,
      stashMessage: stashResult.message
    });
    after = inspectWorktreeIntegrity(cwd);
  }

  const recovered = after.healthy;
  emitWorktreeIntegrityEvent("STALE_WORKER_RECOVERY_RESULT", {
    workerId,
    issueNumber: Number(lease?.issueNumber) || null,
    sessionId: lease?.sessionId ?? null,
    recovered,
    quarantinePath: preservation.dir,
    safetyRef: preservation.safetyRef,
    operationAborted: Boolean(abortResult?.kind),
    stashCreated: Boolean(stashResult?.ok),
    afterClassification: after.classification,
    destructiveResetUsed: false,
    destructiveCleanUsed: false
  });

  return {
    workerId,
    recovered,
    recoverable: recovered,
    before,
    after,
    quarantine: !recovered,
    preservation,
    abortResult,
    stashResult,
    error: recovered ? null : "STALE_WORKER_RECOVERY_DID_NOT_RESTORE_CLEAN_STATE"
  };
}
