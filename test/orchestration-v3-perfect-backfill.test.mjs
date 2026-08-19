import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("V3 backfill wakes immediately on worker exit and coalesces through one watcher loop", () => {
  const watcher = fs.readFileSync("scripts/orchestration-v3/watcher.mjs", "utf8");
  assert.match(watcher, /arg\("--interval", "20"\)/);
  assert.match(watcher, /child\.on\("exit"/);
  assert.match(watcher, /requestWake\("WORKER_EXIT"/);
  assert.match(watcher, /waitForWakeOrTimeout/);
  assert.match(watcher, /wakePending/);
  assert.match(watcher, /wakeResolver/);
  assert.doesNotMatch(watcher, /setTimeout\(resolve, intervalSeconds \* 1000\)/);
});

test("V3 backfill keeps background Ollama proof behind product priority", () => {
  const watcher = fs.readFileSync("scripts/orchestration-v3/watcher.mjs", "utf8");
  assert.match(watcher, /BACKGROUND_OLLAMA_PROOF_ISSUE = 337/);
  assert.match(watcher, /PRIORITY_RANK/);
  assert.match(watcher, /priorityRank\(left\.body, left\.number\)/);
});

test("V3 canonical activation uses a 20 second safety poll", () => {
  const activation = fs.readFileSync("scripts/orchestration-v3/activate-host.mjs", "utf8");
  assert.match(activation, /<string>--interval<\/string><string>20<\/string>/);
  assert.match(activation, /safetyPollSeconds: 20/);
  assert.doesNotMatch(activation, /<string>--interval<\/string><string>60<\/string>/);
});
