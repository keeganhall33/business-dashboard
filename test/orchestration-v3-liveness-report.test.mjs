import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("V3 liveness report proves watcher and worker runtime evidence without mutation", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/liveness-report.mjs", "utf8");
  assert.match(source, /launchctl", \["list", label\]/);
  assert.match(source, /workerLeaseSnapshot\(workerId\)/);
  assert.match(source, /ORCHESTRATION_V3\.runtime\.stateRoot/);
  assert.match(source, /process\.kill\(pid, 0\)/);
  assert.match(source, /ps", \["-p", String\(pid\), "-o", "command="\]/);
  assert.match(source, /running_claims_without_live_lease/);
  assert.match(source, /latestHeartbeatSnapshot/);
  assert.match(source, /watcher-heartbeats\.ndjson/);
  assert.match(source, /ready_backfill_candidates/);
  assert.match(source, /ready_unmapped_issue_numbers/);
  assert.match(source, /workerCandidatesForStream/);
  assert.match(source, /live_worker_count/);
  assert.match(source, /ORCHESTRATION_V3\.queue\.running, "--json"/);
  assert.match(source, /ORCHESTRATION_V3\.queue\.ready, "--json"/);
  assert.doesNotMatch(source, /issue", "edit"/);
  assert.doesNotMatch(source, /--add-label/);
  assert.doesNotMatch(source, /--remove-label/);
  assert.doesNotMatch(source, /spawn\(/);
});
