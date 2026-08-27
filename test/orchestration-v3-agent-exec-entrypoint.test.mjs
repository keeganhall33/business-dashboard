import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  parseWorkerExecCapabilities,
  buildWorkerExecInvocation,
  codeModeShellInstruction
} from "../scripts/orchestration-v3/worker-exec-invocation.mjs";

test("V3 real worker uses capability-aware invocation instead of hard-coding a CLI shape", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/worker.mjs", "utf8");
  assert.match(source, /probeWorkerExecCapabilities/);
  assert.match(source, /buildWorkerExecInvocation/);
  assert.match(source, /codeModeShellInstruction/);
  assert.match(source, /invocation\.args/);
  assert.doesNotMatch(source, /"agent", "--local"/);
});

test("worker exec helper uses direct agent exec and preserves isolated control workspace", () => {
  const help = `Usage: openclaw agent exec <prompt>\nOptions:\n  --isolated\n  --auth-env-only\n  --model <id>\n  --code-mode <mode>\n  --local-model-lean\n  --cwd <dir>\n  --json\n  --timeout <seconds>`;
  const capabilities = parseWorkerExecCapabilities(help);
  const invocation = buildWorkerExecInvocation({ capabilities, prompt: "do work", controlWorkspace: "/tmp/control", timeoutSeconds: 900 });
  assert.equal(invocation.supported, true);
  assert.equal(invocation.mode, "AGENT_EXEC_DIRECT");
  assert.equal(invocation.codeMode, false);
  assert.deepEqual(invocation.args.slice(0, 3), ["agent", "exec", "do work"]);
  assert.ok(invocation.args.includes("--isolated"));
  assert.ok(invocation.args.includes("--auth-env-only"));
  assert.ok(invocation.args.includes("--local-model-lean"));
  assert.ok(invocation.args.includes("--cwd"));
  assert.ok(invocation.args.includes("/tmp/control"));
  assert.ok(invocation.args.includes("ollama/qwen3.5:9b"));
  assert.equal(invocation.args.includes("--code-mode"), false);
});

test("V3 worker uses installed legacy local-message path when agent exec is unavailable", () => {
  const help = `Usage: openclaw agent [options]\nOptions:\n  --local\n  --session-key <key>\n  --message <text>\n  --model <id>\n  --json\n  --timeout <seconds>`;
  const capabilities = parseWorkerExecCapabilities(help);
  const first = buildWorkerExecInvocation({ capabilities, prompt: "issue 413", controlWorkspace: "/tmp/local-a", timeoutSeconds: 900 });
  const second = buildWorkerExecInvocation({ capabilities, prompt: "issue 414", controlWorkspace: "/tmp/local-b", timeoutSeconds: 900 });
  assert.equal(first.supported, true);
  assert.equal(first.mode, "LEGACY_AGENT_LOCAL_MESSAGE");
  assert.deepEqual(first.args.slice(0, 2), ["agent", "--local"]);
  assert.ok(first.args.includes("--session-key"));
  assert.ok(first.args.includes("--message"));
  assert.ok(first.args.includes("--model"));
  assert.ok(first.args.includes("ollama/qwen3.5:9b"));
  assert.match(first.sessionKey, /^agent:main:jeeves-v3-[a-f0-9]{24}$/);
  assert.notEqual(first.sessionKey, second.sessionKey);
});

test("V3 worker still fails closed when neither supported local path exists", () => {
  const invocation = buildWorkerExecInvocation({ capabilities: parseWorkerExecCapabilities("Usage: openclaw agent\n  --model <id>"), prompt: "x", controlWorkspace: "/tmp/control" });
  assert.equal(invocation.supported, false);
  assert.equal(invocation.reason, "OPENCLAW_CLI_MISSING_LOCAL_MESSAGE_PATH");
});

test("Code Mode shell bridge uses nested core exec with exact workdir", () => {
  const js = codeModeShellInstruction("git status --short --branch", "/repo/root");
  assert.match(js, /tools\.callValue\("openclaw:core:exec"/);
  assert.match(js, /git status --short --branch/);
  assert.match(js, /\/repo\/root/);
});

test("V3 worker gives Qwen absolute observed command wrappers", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/worker.mjs", "utf8");
  assert.match(source, /Object\.fromEntries\(\["git", "pnpm", "npm", "npx"\]/);
  assert.match(source, /MANDATORY FIRST TOOL ACTION/);
  assert.match(source, /observed\.git/);
  assert.match(source, /For every git command use this exact executable/);
  assert.match(source, /For every pnpm command use/);
  assert.match(source, /actually execute and inspect/);
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
