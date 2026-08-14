import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const watcher = fs.readFileSync("scripts/orchestration-watch.mjs", "utf8");
const launcher = fs.readFileSync("scripts/launch-orchestration-nl-detached.mjs", "utf8");
const runner = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");

test("detached launcher transfers worker lock ownership to the child pid", () => {
  assert.match(launcher, /pid:\s*child\.pid/);
  assert.match(launcher, /ownerType:\s*["']worker["']/);
  assert.match(launcher, /fs\.writeFileSync\(\s*lockPath/);
});

test("watcher reclaims legacy watcher-owned and dead-pid locks", () => {
  assert.match(watcher, /watcherOwnedLegacyLock\s*=\s*existingPid\s*===\s*process\.pid/);
  assert.match(watcher, /deadOwner\s*=\s*!isProcessAlive\(existingPid\)/);
  assert.match(watcher, /if\s*\(!watcherOwnedLegacyLock\s*&&\s*!deadOwner\)\s*return false/);
  assert.match(watcher, /fs\.unlinkSync\(lockPath\)/);
});

test("watcher releases only its own matching launch reservation", () => {
  assert.match(watcher, /if\s*\(lock\.pid\s*!==\s*process\.pid\)\s*return/);
  assert.match(watcher, /Number\(lock\.issueNumber\)\s*!==\s*Number\(issueNumber\)/);
  assert.match(watcher, /releaseWatcherReservation\(lockPath, issueNumber\)/);
});

test("worker process retains self-owned lock cleanup", () => {
  assert.match(runner, /if\s*\(pid\s*===\s*process\.pid\)\s*fs\.unlinkSync\(lockPath\)/);
});
