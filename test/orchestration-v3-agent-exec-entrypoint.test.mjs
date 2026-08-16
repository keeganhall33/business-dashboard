import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("V3 local coding path uses isolated OpenClaw agent exec with forced code tools", () => {
  const source = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
  const localExec = source.match(/\?\s*\["agent",\s*"exec"[\s\S]*?\]\s*:\s*\["agent"/i)?.[0] ?? "";
  assert.match(localExec, /\["agent",\s*"exec",\s*effectiveMessage/);
  assert.match(localExec, /"--isolated"/);
  assert.match(localExec, /"--auth-env-only"/);
  assert.match(localExec, /"--code-mode",\s*"code"/);
  assert.match(localExec, /"--local-model-lean"/);
  assert.match(localExec, /"--model",\s*ORCH_LOCAL_MODEL/);
  assert.match(localExec, /"--cwd",\s*ORCH_AGENT_WORKSPACE/);
  assert.doesNotMatch(localExec, /"--fallback"/);
  assert.doesNotMatch(localExec, /openai\//i);
  assert.match(source, /OLLAMA_API_KEY:\s*process\.env\.OLLAMA_API_KEY \|\| "ollama-local"/);
  assert.match(source, /OPENCLAW_FALLBACK_MODELS:\s*""/);
  assert.doesNotMatch(source, /\["agent",\s*"--local",\s*"--agent"/);
});

test("V3 agent exec prompt carries the protected repo-root execution contract", () => {
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
