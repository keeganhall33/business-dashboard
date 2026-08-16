import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("V3 real worker uses Mac-proven embedded local OpenClaw invocation", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/worker.mjs", "utf8");
  assert.match(source, /"agent", "--local"/);
  assert.match(source, /"--session-key", `agent:\$\{workerId\}:issue-\$\{issue\}`/);
  assert.match(source, /"--message", prompt/);
  assert.match(source, /"--model", ORCHESTRATION_V3\.model\.id/);
  assert.match(source, /"--json"/);
  assert.match(source, /"--timeout", "900"/);
  assert.doesNotMatch(source, /"agent", "exec"/);
  assert.doesNotMatch(source, /--isolated|--auth-env-only|--code-mode|--local-model-lean/);
});

test("V3 worker gives Qwen absolute observed command wrappers", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/worker.mjs", "utf8");
  assert.match(source, /Object\.fromEntries\(\["git", "pnpm", "npm", "npx"\]/);
  assert.match(source, /MANDATORY FIRST TOOL ACTION/);
  assert.match(source, /observed\.git/);
  assert.match(source, /For every git command use this exact executable/);
  assert.match(source, /For every pnpm command use/);
  assert.match(source, /Before PASS, inspect the actual changes/);
  assert.match(source, /perform a real git mutation/);
});

test("V3 worker requires machine provider/model/fallback and observed stages", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/worker.mjs", "utf8");
  assert.match(source, /parseMachineEnvelope/);
  assert.match(source, /providerOk/);
  assert.match(source, /modelOk/);
  assert.match(source, /fallbackOk/);
  assert.match(source, /repoPreflightObserved/);
  assert.match(source, /testExecutionObserved/);
  assert.match(source, /gitDiffObserved/);
  assert.match(source, /gitDiffCheckObserved/);
  assert.match(source, /gitMutationCommandObserved/);
  assert.match(source, /realMutationObserved/);
});

test("V3 worker isolates OpenClaw state from protected worktree while retaining gh/git host auth", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/worker.mjs", "utf8");
  assert.match(source, /OPENCLAW_WORKSPACE_MUST_NOT_EQUAL_GIT_WORKTREE/);
  assert.match(source, /buildIsolatedEnvironment/);
  assert.match(source, /tempHome/);
  assert.match(source, /stateDir/);
  assert.match(source, /configPath/);
  assert.match(source, /GH_CONFIG_DIR/);
  assert.match(source, /GIT_CONFIG_GLOBAL/);
});

test("V3 worker fails closed instead of accepting model narration", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/worker.mjs", "utf8");
  assert.match(source, /Machine evidence rejected an unproven model PASS/);
  assert.match(source, /MISSING_OBSERVED_REPO_PREFLIGHT/);
  assert.match(source, /NO_REAL_GIT_OR_PR_STATE_MUTATION/);
  assert.match(source, /ESCALATED_TO_CLOUD: false/);
});

test("V3 protected git worktrees remain pre-seeded", () => {
  const marker = fs.readFileSync("AGENTS.md", "utf8");
  assert.ok(marker.length > 0 && marker.length < 4000);
  assert.match(marker, /intentionally pre-seeded/i);
  assert.match(marker, /Ollama `qwen3\.5:9b`/i);
  assert.match(marker, /cloud fallback disabled/i);
  assert.match(marker, /machine-truth/i);
});
