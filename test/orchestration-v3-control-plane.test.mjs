import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { ORCHESTRATION_V3, workerForStream } from "../scripts/orchestration-v3/config.mjs";

test("V3 uses one fixed four-worker map", () => {
  assert.deepEqual(Object.keys(ORCHESTRATION_V3.workers), ["local-a", "local-b", "local-c", "local-d"]);
  assert.equal(workerForStream("CORE_INTELLIGENCE"), "local-a");
  assert.equal(workerForStream("DISCOVERY_INTELLIGENCE"), "local-b");
  assert.equal(workerForStream("INTELLIGENCE_UX"), "local-c");
  assert.equal(workerForStream("PRODUCTION_VALUE"), "local-c");
  assert.equal(workerForStream("AGENT_ORCHESTRATION"), "local-d");
  assert.equal(workerForStream("ORCHESTRATION_SYSTEMS"), "local-d");
  assert.equal(workerForStream("UNKNOWN"), null);
});

test("V3 acceptance runtime is Ollama-only Qwen 3.5", () => {
  assert.equal(ORCHESTRATION_V3.model.provider, "ollama");
  assert.equal(ORCHESTRATION_V3.model.id, "ollama/qwen3.5:9b");
  assert.equal(ORCHESTRATION_V3.model.cloudFallbackAllowed, false);
});

test("V3 runtime is isolated from the development checkout", () => {
  assert.match(ORCHESTRATION_V3.runtime.root, /\.openclaw\/runtime-v3\/business-dashboard$/);
});

test("V3 watcher has no historical task resurrection path", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/watcher.mjs", "utf8");
  assert.doesNotMatch(source, /selfHealMissingReady|listHealCandidates/);
  assert.match(source, /queue\.ready/);
});

test("V3 worker refuses synthetic review state for no-human tasks", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/worker.mjs", "utf8");
  assert.match(source, /V3 never creates a fake review gate/);
  assert.match(source, /queue\.blocked/);
});
