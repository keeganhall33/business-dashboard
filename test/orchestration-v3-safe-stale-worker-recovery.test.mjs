import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const recoverySource = fs.readFileSync(new URL("../scripts/orchestration-v3/stale-worker-recovery.mjs", import.meta.url), "utf8");
const preflightSource = fs.readFileSync(new URL("../scripts/orchestration-v3/preflight.mjs", import.meta.url), "utf8");

test("proven stale leases route through preservation-first recovery", () => {
  assert.match(preflightSource, /reconciliation_decision === "PROVEN_STALE_RECLAIM"/);
  assert.match(preflightSource, /recoverStaleWorkerSafely\(workerId\)/);
  assert.match(recoverySource, /STALE_WORKER_STATE_PRESERVED/);
  assert.match(recoverySource, /unstaged\.patch/);
  assert.match(recoverySource, /staged\.patch/);
  assert.match(recoverySource, /unmerged-index\.txt/);
  assert.match(recoverySource, /safety\/stale-/);
});

test("interrupted Git operations are aborted only after preservation", () => {
  const preserve = recoverySource.indexOf("preserveState(workerId");
  const abort = recoverySource.indexOf("abortInterruptedOperation(cwd");
  assert.ok(preserve >= 0 && abort > preserve);
  assert.match(recoverySource, /\["rebase", "--abort"\]/);
  assert.match(recoverySource, /\["merge", "--abort"\]/);
  assert.match(recoverySource, /\["cherry-pick", "--abort"\]/);
});

test("ordinary dirty stale work is stashed reversibly and never reset or cleaned", () => {
  assert.match(recoverySource, /\["stash", "push", "--include-untracked"/);
  assert.doesNotMatch(recoverySource, /\["reset", "--hard"\]/);
  assert.doesNotMatch(recoverySource, /\["clean", "-fd"\]/);
  assert.match(recoverySource, /destructiveResetUsed: false/);
  assert.match(recoverySource, /destructiveCleanUsed: false/);
});
