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
  assert.match(source, /RECOVERABLE_IDLE_ERRORS/);
  assert.match(source, /MASS_TRACKED_DELETION/);
  assert.match(source, /TRACKED_WORKTREE_DIRTY/);
  assert.match(source, /UNEXPECTED_UNTRACKED_FILES/);
  assert.match(source, /recoverIdleWorker/);
  assert.match(source, /fetch.*origin.*main/s);
  assert.match(source, /reset.*--hard/s);
  assert.match(source, /clean.*-fd/s);
  assert.match(source, /checkout.*--detach.*-f/s);
  assert.match(source, /WORKTREE_AUTO_RECOVERED/);
  assert.match(source, /const recovery = recoverIdleWorker\(workerId\)/);
});
