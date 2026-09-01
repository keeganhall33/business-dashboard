import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("V3 observed git wrapper blocks and auto-heals catastrophic tracked deletions", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/execution-evidence.mjs", "utf8");
  assert.match(source, /worktree_deletions/);
  assert.match(source, /staged_deletions/);
  assert.match(source, /total_deletions/);
  assert.match(source, /GUARD_MASS_TRACKED_DELETION autoheal/);
  assert.match(source, /reset --hard HEAD/);
  assert.match(source, /clean -fd/);
  assert.match(source, /exit 96/);
  assert.match(source, /\[ \"\$1\" = \"commit\" \]/);
  assert.match(source, /diff --cached --name-only --diff-filter=D/);
  assert.match(source, /exit 97/);
  assert.match(source, /\[ \"\$1\" = \"push\" \]/);
  assert.match(source, /origin\/main\.\.\.HEAD/);
  assert.match(source, /deletions_vs_origin_main/);
  assert.match(source, /exit 98/);
  assert.match(source, /massDeletionGuardTriggered/);
  assert.match(source, /massDeletionAutoHealed/);
});

test("V3 worker preflight repairs an abandoned disposable lane before refusing work", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/preflight.mjs", "utf8");
  const integrity = fs.readFileSync("scripts/orchestration-v3/worktree-integrity.mjs", "utf8");
  assert.match(source, /recoverIdleWorker/);
  assert.match(integrity, /CATASTROPHIC_WORKTREE_CORRUPTION/);
  assert.match(integrity, /AMBIGUOUS_WORKTREE_CORRUPTION/);
  assert.match(integrity, /AUTO_RESET_ALLOWED/);
  assert.match(integrity, /HUMAN_ACTION_REQUIRED/);
  assert.match(integrity, /reset", "--hard", "HEAD"/);
  assert.match(integrity, /clean", "-fd"/);
  assert.match(integrity, /REFUSE_NON_DISPOSABLE_WORKTREE/);
  assert.match(source, /WORKTREE_AUTO_RECOVERED/);
  assert.match(source, /const recovery = recoverIdleWorker\(workerId\)/);
});

test("V3 lifecycle checks run before launch and after model process exit", () => {
  const watcher = fs.readFileSync("scripts/orchestration-v3/watcher.mjs", "utf8");
  const worker = fs.readFileSync("scripts/orchestration-v3/worker.mjs", "utf8");
  assert.match(watcher, /recoverIdleWorker\(workerId\)/);
  assert.match(watcher, /WORKER_LANE_QUARANTINED/);
  assert.match(worker, /postModelIntegrity = recoverIdleWorker\(workerId\)/);
  assert.match(worker, /POST_MODEL_WORKTREE_INTEGRITY_FAILED/);
});
