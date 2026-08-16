import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { classifyDiagnostic, parseAgentMeta } from "../scripts/orchestration-v3/diagnose-local-tool.mjs";

test("standalone diagnostic is pinned to isolated Ollama qwen3.5 and compact Code Mode", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/diagnose-local-tool.mjs", "utf8");
  assert.match(source, /const MODEL = "ollama\/qwen3\.5:9b"/);
  assert.match(source, /"--isolated", "--auth-env-only"/);
  assert.match(source, /"--model", MODEL/);
  assert.match(source, /"--code-mode", "code"/);
  assert.doesNotMatch(source, /"--code-mode", "direct"/);
  assert.match(source, /"--local-model-lean"/);
  assert.match(source, /OPENCLAW_FALLBACK_MODELS: ""/);
  assert.match(source, /openclaw:core:exec/);
  assert.match(source, /tools\.callValue/);
  assert.match(source, /Never place raw shell directly in the outer Code Mode exec tool/);
  assert.match(source, /git status --short --branch/);
  assert.match(source, /createObservedExecutionHarness/);
  assert.match(source, /MISSING_OBSERVED_GIT_EXECUTION/);
  assert.doesNotMatch(source, /gh\s|watcher\.mjs|worker\.mjs|editLabels|postComment|api\.github\.com/);
});

test("diagnostic only passes with observed git execution and compatible local model metadata", () => {
  const evidence = { successfulCommands: ["git status --short --branch"] };
  const pass = classifyDiagnostic({ processResult: { status: 0, error: null }, evidence, agentMeta: { provider: "ollama", model: "qwen3.5:9b" } });
  assert.deepEqual(pass, {
    status: "PASS",
    reason: "OBSERVED_LOCAL_TOOL_EXECUTION",
    observedGit: true,
    providerCompatible: true,
    modelCompatible: true
  });

  assert.equal(classifyDiagnostic({ processResult: { status: 0, error: null }, evidence: { successfulCommands: [] }, agentMeta: { provider: "ollama", model: "qwen3.5:9b" } }).reason, "MISSING_OBSERVED_GIT_EXECUTION");
  assert.equal(classifyDiagnostic({ processResult: { status: 0, error: null }, evidence, agentMeta: { provider: "openai", model: "gpt-5" } }).reason, "PROVIDER_MISMATCH");
  assert.equal(classifyDiagnostic({ processResult: { status: 0, error: null }, evidence, agentMeta: { provider: "ollama", model: "mistral:latest" } }).reason, "MODEL_MISMATCH");
  assert.equal(classifyDiagnostic({ processResult: { status: null, error: { code: "ETIMEDOUT", message: "spawnSync openclaw ETIMEDOUT" } }, evidence: { successfulCommands: [] }, agentMeta: {} }).reason, "OPENCLAW_PROCESS_TIMEOUT");
});

test("diagnostic extracts provider/model from OpenClaw JSON envelope", () => {
  const parsed = parseAgentMeta(JSON.stringify({ meta: { agentMeta: { provider: "ollama", model: "qwen3.5:9b" } } }));
  assert.deepEqual(parsed, { provider: "ollama", model: "qwen3.5:9b", parseError: null });
});
