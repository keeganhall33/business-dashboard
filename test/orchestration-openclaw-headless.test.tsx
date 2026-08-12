import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const adapter = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
const watcher = fs.readFileSync("scripts/orchestration-watch.mjs", "utf8");
const bootstrap = fs.readFileSync("scripts/run-orchestration-issue-agent.mjs", "utf8");
const launcher = fs.readFileSync("scripts/launch-orchestration-nl-detached.mjs", "utf8");

test("NL adapter uses isolated headless agent exec instead of live main session", () => {
  assert.match(adapter, /"agent",\s*\n\s*"exec"/);
  assert.doesNotMatch(adapter, /"--agent",\s*\n\s*agent/);
  assert.match(adapter, /"--message-file"/);
  assert.match(adapter, /"--cwd", process\.cwd\(\)/);
  assert.match(adapter, /SESSION_CONTEXT: "ISOLATED_HEADLESS"/);
});

test("watcher launches NL tasks detached and leaves result transition to adapter", () => {
  assert.match(watcher, /launch-orchestration-nl-detached\.mjs/);
  assert.doesNotMatch(watcher, /orchestration-run-issue-openclaw\.mjs --repo/);
  assert.match(launcher, /detached: true/);
  assert.match(launcher, /orchestration-run-issue-openclaw\.mjs/);
});

test("legacy detached bootstrap no longer attaches to live main session", () => {
  assert.match(bootstrap, /"agent",\s*\n\s*"exec"/);
  assert.doesNotMatch(bootstrap, /"--agent", "main"/);
  assert.match(bootstrap, /"--message-file"/);
});

test("agent timeout has cleanup margin outside OpenClaw deadline", () => {
  assert.match(adapter, /timeout: \(timeoutSeconds \+ 60\) \* 1000/);
  assert.match(bootstrap, /timeout: 960000/);
});
