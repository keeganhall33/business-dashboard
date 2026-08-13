import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("issue template and watcher parity: new tasks are labeled agent-orchestration + orch:ready", () => {
  const template = fs.readFileSync(".github/ISSUE_TEMPLATE/agent-orchestration-task.yml", "utf8");
  assert.match(template, /labels:\s*\n(?:\s*-\s*.+\n)+/);
  assert.ok(template.includes("- agent-orchestration"));
  assert.ok(template.includes("- orch:ready"));

  const watcher = fs.readFileSync("scripts/orchestration-watch.mjs", "utf8");
  assert.ok(watcher.includes("\"--label\", \"agent-orchestration\""));
  assert.ok(watcher.includes("\"--label\", \"orch:ready\""));
});

test("watcher self-heals valid tasks missing orch:* state", () => {
  const watcher = fs.readFileSync("scripts/orchestration-watch.mjs", "utf8");
  // Ensure the self-heal search excludes all known orch state labels.
  assert.ok(watcher.includes('label:"agent-orchestration"'));
  assert.ok(watcher.includes('-label:"orch:ready"'));
  assert.ok(watcher.includes('-label:"orch:running"'));
  assert.ok(watcher.includes('-label:"orch:awaiting_review"'));
  assert.ok(watcher.includes('-label:"orch:awaiting_human_approval"'));
  // Ensure heal action adds orch:ready.
  assert.ok(watcher.includes("--add-label\", \"orch:ready\""));
});
