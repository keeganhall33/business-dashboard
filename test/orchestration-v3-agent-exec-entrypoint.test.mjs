import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("V3 local coding path uses isolated OpenClaw agent exec with the direct shell tool surface", () => {
  const source = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
  const localExec = source.match(/\?\s*\["agent",\s*"exec"[\s\S]*?\]\s*:\s*\["agent"/i)?.[0] ?? "";
  assert.match(localExec, /\["agent",\s*"exec",\s*effectiveMessage/);
  assert.match(localExec, /"--isolated"/);
  assert.match(localExec, /"--auth-env-only"/);
  assert.match(localExec, /"--code-mode",\s*"direct"/);
  assert.match(localExec, /"--local-model-lean"/);
  assert.match(localExec, /"--model",\s*ORCH_LOCAL_MODEL/);
  assert.match(localExec, /"--cwd",\s*ORCH_AGENT_WORKSPACE/);
  assert.doesNotMatch(localExec, /"--fallback"/);
  assert.doesNotMatch(localExec, /openai\//i);
  assert.match(source, /OLLAMA_API_KEY:\s*process\.env\.OLLAMA_API_KEY \|\| "ollama-local"/);
  assert.match(source, /OPENCLAW_FALLBACK_MODELS:\s*""/);
  assert.doesNotMatch(source, /\["agent",\s*"--local",\s*"--agent"/);
});

test("V3 direct-tool prompt carries the protected repo-root execution contract", () => {
  const source = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
  assert.match(source, /ORCH_WORKTREE_ROOT/);
  assert.match(source, /MANDATORY FIRST TOOL ACTION/);
  assert.match(source, /git rev-parse --show-toplevel/);
  assert.match(source, /git status --short --branch/);
  assert.match(source, /git remote -v/);
  assert.match(source, /Every repository command must explicitly target that protected repository root/);
});

test("V3 adapter accepts agent exec top-level JSON metadata for Ollama evidence", () => {
  const source = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
  assert.match(source, /envelope\?\.result\?\.agentMeta \?\? envelope \?\? null/);
  assert.match(source, /providerUsed === "ollama"/);
  assert.match(source, /toolSummary/);
  assert.match(source, /codeModeEngaged/);
});

test("V3 worker isolates OpenClaw workspace and mutable state from the protected git worktree", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/worker.mjs", "utf8");
  assert.match(source, /const openclawStateDir = path\.join\(agentWorkspace, "\.openclaw-state"\)/);
  assert.match(source, /fs\.mkdirSync\(openclawStateDir, \{ recursive: true \}\)/);
  assert.match(source, /OPENCLAW_WORKSPACE_DIR:\s*runtimeContract\.agentWorkspace/);
  assert.match(source, /OPENCLAW_STATE_DIR:\s*runtimeContract\.openclawStateDir/);
  assert.match(source, /OPENCLAW_STATE_MUST_NOT_EQUAL_GIT_WORKTREE/);
  assert.match(source, /OPENCLAW_WORKSPACE_MUST_NOT_EQUAL_GIT_WORKTREE/);
});

test("V3 requires a model-observed repo-preflight handshake before implementation", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/worker.mjs", "utf8");
  assert.match(source, /EXECUTION_HANDSHAKE_V1/);
  assert.match(source, /observedExecutionJournalLineCount/);
  assert.match(source, /readObservedExecutionEvidence\(executionHarness\.journalPath, \{ startLine: handshakeStartLine \}\)/);
  assert.match(source, /git rev-parse --show-toplevel/);
  assert.match(source, /git status --short --branch/);
  assert.match(source, /git remote -v/);
  assert.match(source, /if \(!handshakeEvidence\.repoPreflightObserved\)/);
  assert.match(source, /EXECUTION_HANDSHAKE_MISSING_OBSERVED_REPO_PREFLIGHT/);
  assert.match(source, /"--model", ORCHESTRATION_V3\.model\.id/);
  assert.match(source, /"--code-mode", "direct"/);
  assert.doesNotMatch(source, /openai\//i);
});

test("V3 handshake evidence is journal-range scoped while final PASS still uses the full journal", () => {
  const evidence = fs.readFileSync("scripts/orchestration-v3/execution-evidence.mjs", "utf8");
  const worker = fs.readFileSync("scripts/orchestration-v3/worker.mjs", "utf8");
  assert.match(evidence, /observedExecutionJournalLineCount/);
  assert.match(evidence, /slice\(Math\.max\(0, Number\(startLine\) \|\| 0\)\)/);
  assert.match(worker, /const handshakeEvidence = readObservedExecutionEvidence\(executionHarness\.journalPath, \{ startLine: handshakeStartLine \}\)/);
  assert.match(worker, /const executionEvidence = readObservedExecutionEvidence\(executionHarness\.journalPath\)/);
  assert.match(worker, /requires observed successful git diff --check/);
  assert.match(worker, /no successful git mutation command was observed/);
  assert.match(worker, /git HEAD and open PR heads did not change/);
});

test("V3 local runner does not recursively build a strict retry prompt", () => {
  const source = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
  const runner = source.match(/function runOpenclawWithPrompt\([\s\S]*?\n  }\n\n  try \{/i)?.[0] ?? "";
  assert.match(runner, /const effectiveMessage = String\(messageWithGuard \?\? ""\)/);
  assert.doesNotMatch(runner, /buildStrictJsonRetryPrompt\(/);

  const wrapper = fs.readFileSync("scripts/orchestration-auto-continue-wrapper.mjs", "utf8");
  assert.match(wrapper, /promptText,\s*\n\s*strictRetryPrompt,/);
  assert.doesNotMatch(wrapper, /normalizeV3LocalPromptForSingleRetry/);
});

test("V3 protected git worktrees are pre-seeded so OpenClaw never needs BOOTSTRAP.md", () => {
  const marker = fs.readFileSync("AGENTS.md", "utf8");
  assert.ok(marker.length > 0 && marker.length < 4000, "root AGENTS.md must stay compact");
  assert.match(marker, /intentionally pre-seeded/i);
  assert.match(marker, /Do not run onboarding or create\/delete `BOOTSTRAP\.md`/i);
  assert.match(marker, /Ollama `qwen3\.5:9b`/i);
  assert.match(marker, /cloud fallback disabled/i);
  assert.match(marker, /machine-truth/i);
  assert.match(marker, /observed repo preflight\/tool\/test\/diff\/mutation evidence/i);
});
