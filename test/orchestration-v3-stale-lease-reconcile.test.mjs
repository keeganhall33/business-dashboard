import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("V3 leases require live PID and never treat transient GitHub unknown as stopped", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/watcher.mjs", "utf8");
  assert.match(source, /function issueIsRunning\(issueNumber\)/);
  assert.match(source, /typeof label === "string" \? label : label\.name/);
  assert.match(source, /=== ORCHESTRATION_V3\.queue\.running/);
  assert.match(source, /const pidAlive = alive\(Number\(lease\.pid\)\)/);
  assert.match(source, /const issueRunning = issueIsRunning\(Number\(lease\.issueNumber\)\)/);
  assert.match(source, /if \(pidAlive && issueRunning !== false\) return lease/);
  assert.match(source, /if \(issueRunning === null\) return lease/);
  assert.match(source, /ISSUE_RUNNING_STATE_UNKNOWN/);
  assert.match(source, /STALE_LEASE_RECLAIMED/);
  assert.doesNotMatch(source, /if \(alive\(Number\(lease\.pid\)\)\) return lease/);
});
