import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../scripts/orchestration-v3/watcher-host.mjs", import.meta.url), "utf8");

test("watcher host shuts down only lease-identified orchestration workers", () => {
  assert.match(source, /scripts\/orchestration-v3\/worker\.mjs/);
  assert.match(source, /--worker \$\{row\.workerId\}/);
  assert.match(source, /--issue \$\{row\.issueNumber\}/);
  assert.match(source, /process\.kill\(row\.pid, "SIGTERM"\)/);
  assert.match(source, /process\.kill\(row\.pid, "SIGKILL"\)/);
  assert.match(source, /WATCHER_CHILD_TERM_SENT/);
  assert.match(source, /WATCHER_CHILD_KILL_ESCALATED/);
});

test("watcher host reconciles orphan workers before launching a new watcher", () => {
  const reconcileIndex = source.indexOf("reconcileStartupOrphans();");
  const spawnIndex = source.indexOf("const watcher = spawnWatcher();");
  assert.ok(reconcileIndex >= 0, "startup orphan reconciliation must exist");
  assert.ok(spawnIndex > reconcileIndex, "orphan reconciliation must happen before watcher spawn");
  assert.match(source, /WATCHER_ORPHAN_WORKERS_DETECTED/);
});

test("shutdown does not reset, clean, or rewrite worker worktrees", () => {
  const shutdownSlice = source.slice(source.indexOf("function stopOwnedWorkers"), source.indexOf("function reconcileStartupOrphans"));
  assert.doesNotMatch(shutdownSlice, /reset --hard|clean -fd|git\s+reset|git\s+clean/);
});
