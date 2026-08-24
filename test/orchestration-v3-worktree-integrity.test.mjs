import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { ORCHESTRATION_V3 } from "../scripts/orchestration-v3/config.mjs";
import {
  classifyWorktreeIntegrity,
  recoverCorruptedWorktree,
  INTEGRITY_CLASSIFICATION
} from "../scripts/orchestration-v3/worktree-integrity.mjs";

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", timeout: 30_000 }).trim();
}

function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "orch-v3-integrity-"));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test User"]);
  for (let i = 0; i < 60; i += 1) {
    fs.writeFileSync(path.join(root, `file-${String(i).padStart(2, "0")}.txt`), `base ${i}\n`);
  }
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "base"]);
  git(root, ["checkout", "-b", "issue-738"]);
  fs.writeFileSync(path.join(root, "committed-work.txt"), "valuable committed work\n");
  git(root, ["add", "committed-work.txt"]);
  git(root, ["commit", "-m", "valuable committed work"]);
  return root;
}

function statusLines(root) {
  const status = git(root, ["status", "--porcelain=v1"]);
  return status ? status.split("\n") : [];
}

test("classifies near-total tracked deletions as catastrophic disposable worktree corruption", () => {
  const lines = Array.from({ length: 55 }, (_, i) => ` D file-${String(i).padStart(2, "0")}.txt`);
  const result = classifyWorktreeIntegrity(lines, { totalTrackedFiles: 61 });
  assert.equal(result.classification, INTEGRITY_CLASSIFICATION.CATASTROPHIC_WORKTREE_CORRUPTION);
  assert.equal(result.recoveryPolicy, "AUTO_RESET_ALLOWED");
  assert.equal(result.trackedDeletionCount, 55);
  assert.ok(result.deletionRatio > 0.8);
});

test("auto-recovery preserves branch HEAD and returns clean status for local-e/local-f failure shape", () => {
  const root = makeRepo();
  const beforeHead = git(root, ["rev-parse", "HEAD"]);
  for (let i = 0; i < 55; i += 1) {
    fs.rmSync(path.join(root, `file-${String(i).padStart(2, "0")}.txt`));
  }
  assert.equal(classifyWorktreeIntegrity(statusLines(root), { totalTrackedFiles: 61 }).classification, INTEGRITY_CLASSIFICATION.CATASTROPHIC_WORKTREE_CORRUPTION);

  const recovery = recoverCorruptedWorktree({
    workerId: "local-e",
    cwd: root,
    disposableWorktrees: { "local-e": root },
    reason: "TEST_LOCAL_E_SHAPE"
  });
  assert.equal(recovery.recovered, true);
  assert.equal(git(root, ["rev-parse", "HEAD"]), beforeHead);
  assert.equal(git(root, ["rev-parse", "--abbrev-ref", "HEAD"]), "issue-738");
  assert.equal(git(root, ["status", "--porcelain=v1"]), "");
});

test("ambiguous mass deletion with legitimate uncommitted edits refuses reset", () => {
  const root = makeRepo();
  const beforeHead = git(root, ["rev-parse", "HEAD"]);
  for (let i = 0; i < 55; i += 1) {
    fs.rmSync(path.join(root, `file-${String(i).padStart(2, "0")}.txt`));
  }
  fs.writeFileSync(path.join(root, "committed-work.txt"), "valuable committed work plus uncommitted edit\n");

  const recovery = recoverCorruptedWorktree({
    workerId: "local-f",
    cwd: root,
    disposableWorktrees: { "local-f": root },
    reason: "TEST_LOCAL_F_AMBIGUOUS"
  });
  assert.equal(recovery.recovered, false);
  assert.equal(recovery.result, "HUMAN_ACTION_REQUIRED");
  assert.equal(git(root, ["rev-parse", "HEAD"]), beforeHead);
  assert.match(fs.readFileSync(path.join(root, "committed-work.txt"), "utf8"), /uncommitted edit/);
});

test("all six configured workers receive parity coverage from canonical config", () => {
  assert.deepEqual(Object.keys(ORCHESTRATION_V3.workers), ["local-a", "local-b", "local-c", "local-d", "local-e", "local-f"]);
  assert.equal(ORCHESTRATION_V3.capacity.totalWorkers, 6);
  assert.deepEqual(ORCHESTRATION_V3.capacity.integrationReleaseWorkers, ["local-e"]);
  assert.deepEqual(ORCHESTRATION_V3.capacity.qaEvaluationWorkers, ["local-f"]);
});
