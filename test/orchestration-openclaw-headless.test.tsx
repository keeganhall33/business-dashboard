import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const adapter = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
const watcher = fs.readFileSync("scripts/orchestration-watch.mjs", "utf8");
const bootstrap = fs.readFileSync("scripts/run-orchestration-issue-agent.mjs", "utf8");
const launcher = fs.readFileSync("scripts/launch-orchestration-nl-detached.mjs", "utf8");

test("NL adapter uses isolated headless agent exec instead of live main session", () => {
  // Verified contract: use OpenClaw CLI `agent` (not deprecated `agent exec`).
  assert.match(adapter, /"agent"/);
  assert.match(adapter, /"--agent"/);
  // Ensure the adapter passes a message argument (prompt text).
  assert.match(adapter, /"--message"/);
  assert.doesNotMatch(adapter, /"agent",\s*\n\s*"exec"/);
  assert.doesNotMatch(adapter, /"--message-file"/);
  assert.doesNotMatch(adapter, /"--cwd"/);
});

test("watcher launches NL tasks detached and leaves result transition to adapter", () => {
  assert.match(watcher, /launch-orchestration-nl-detached\.mjs/);
  assert.doesNotMatch(watcher, /orchestration-run-issue-openclaw\.mjs --repo/);
  assert.match(launcher, /detached: true/);
  assert.match(launcher, /orchestration-run-issue-openclaw\.mjs/);
});

test("legacy detached bootstrap uses installed isolated agent exec message contract", () => {
  assert.match(bootstrap, /"agent",\s*\n\s*"exec"/);
  assert.doesNotMatch(bootstrap, /"--agent", "main"/);
  assert.match(bootstrap, /"--message", prompt/);
  assert.doesNotMatch(bootstrap, /"--message-file"/);
  assert.doesNotMatch(bootstrap, /"--cwd"/);
  assert.match(bootstrap, /cwd: process\.cwd\(\)/);
});

test("agent timeout has cleanup margin outside OpenClaw deadline", () => {
  assert.match(adapter, /timeout: \(timeoutSeconds \+ 60\) \* 1000/);
  assert.match(bootstrap, /timeout: 960000/);
});
