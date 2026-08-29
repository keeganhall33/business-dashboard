import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const entrySource = fs.readFileSync(new URL("../scripts/orchestration-v3/watcher-host.mjs", import.meta.url), "utf8");
const source = fs.readFileSync(new URL("../scripts/orchestration-v3/watcher-host-runtime.mjs", import.meta.url), "utf8");

test("watcher host entrypoint routes through the owned-tree shutdown runtime", () => {
  assert.match(entrySource, /watcher-host-runtime\.mjs/);
});

test("watcher host shuts down only lease-identified orchestration worker trees", () => {
  assert.match(source, /scripts\/orchestration-v3\/worker\.mjs/);
  assert.match(source, /--worker \$\{row\.workerId\}/);
  assert.match(source, /--issue \$\{row\.issueNumber\}/);
  assert.match(source, /descendantsOf\(row\.pid/);
  assert.match(source, /safeSignalGroup\(pgid, "SIGTERM"\)/);
  assert.match(source, /safeSignalPid\(entry\.pid, "SIGTERM"\)/);
  assert.match(source, /safeSignalPid\(row\.pid, "SIGTERM"\)/);
  assert.match(source, /safeSignalPid\(pid, "SIGKILL"\)/);
  assert.match(source, /WATCHER_OWNED_TREE_IDENTIFIED/);
  assert.match(source, /WATCHER_OWNED_TREE_SHUTDOWN_COMPLETE/);
});

test("watcher host reconciles orphan workers before launching a new watcher", () => {
  const reconcileIndex = source.indexOf("reconcileStartupOrphans();");
  const spawnIndex = source.indexOf("const watcher = spawnWatcher();");
  assert.ok(reconcileIndex >= 0, "startup orphan reconciliation must exist");
  assert.ok(spawnIndex > reconcileIndex, "orphan reconciliation must happen before watcher spawn");
  assert.match(source, /WATCHER_ORPHAN_WORKERS_DETECTED/);
});

test("shutdown does not reset, clean, or rewrite worker worktrees", () => {
  const shutdownSlice = source.slice(source.indexOf("function stopOwnedWorker"), source.indexOf("function reconcileStartupOrphans"));
  assert.doesNotMatch(shutdownSlice, /reset --hard|clean -fd|git\s+reset|git\s+clean/);
});

test("shutdown records final survivor count for machine verification", () => {
  assert.match(source, /survivorCount: finalSurvivors\.length/);
  assert.match(source, /survivors: finalSurvivors/);
});
