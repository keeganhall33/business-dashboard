import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("V3 leases require both live PID and GitHub running state", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/watcher.mjs", "utf8");
  assert.match(source, /function issueIsRunning\(issueNumber\)/);
  assert.match(source, /label\.name === ORCHESTRATION_V3\.queue\.running/);
  assert.match(source, /const pidAlive = alive\(Number\(lease\.pid\)\)/);
  assert.match(source, /const issueRunning = issueIsRunning\(Number\(lease\.issueNumber\)\)/);
  assert.match(source, /if \(pidAlive && issueRunning\) return lease/);
  assert.match(source, /STALE_LEASE_RECLAIMED/);
  assert.doesNotMatch(source, /if \(alive\(Number\(lease\.pid\)\)\) return lease/);
});
