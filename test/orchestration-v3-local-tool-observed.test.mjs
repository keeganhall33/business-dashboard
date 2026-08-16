import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  buildObservedPrompt,
  classifyObservedDiagnostic,
  parseMachineEnvelope
} from "../scripts/orchestration-v3/diagnose-local-tool-observed.mjs";

test("observed diagnostic requires the absolute harness git wrapper", () => {
  const prompt = buildObservedPrompt({ observedGit: "/tmp/evidence/bin/git", repoRoot: "/repo" });
  assert.match(prompt, /Run this exact command: \/tmp\/evidence\/bin\/git status --short --branch/);
  assert.match(prompt, /Do not substitute another git executable/);
});

test("observed diagnostic keeps Ollama-only and machine-journal invariants", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/diagnose-local-tool-observed.mjs", "utf8");
  assert.match(source, /const MODEL = "ollama\/qwen3\.5:9b"/);
  assert.match(source, /OPENCLAW_FALLBACK_MODELS: ""/);
  assert.match(source, /createObservedExecutionHarness/);
  assert.match(source, /path\.join\(harness\.shimRoot, "git"\)/);
  assert.match(source, /LEGACY_AGENT_LOCAL_ABSOLUTE_OBSERVED_WRAPPER/);
  assert.doesNotMatch(source, /watcher\.mjs|worker\.mjs|editLabels|postComment|api\.github\.com|\bissue\s+(?:edit|comment)\b/);
});

test("machine envelope extracts provider model fallback and tool summary", () => {
  const stdout = JSON.stringify({
    meta: { agentMeta: { provider: "ollama", model: "qwen3.5:9b" } },
    executionTrace: { fallbackUsed: false },
    toolSummary: { calls: 1, failures: 0 }
  });
  assert.deepEqual(parseMachineEnvelope(stdout), {
    provider: "ollama",
    model: "qwen3.5:9b",
    fallbackUsed: false,
    toolCalls: 1,
    toolFailures: 0,
    parseError: null
  });
});

test("PASS requires process success, observed git, Ollama qwen, and fallback false", () => {
  const processResult = { status: 0, error: null };
  const evidence = { successfulCommands: ["git status --short --branch"] };
  const machine = { provider: "ollama", model: "qwen3.5:9b", fallbackUsed: false };
  assert.deepEqual(classifyObservedDiagnostic({ processResult, evidence, machine }), {
    status: "PASS",
    reason: "OBSERVED_LOCAL_TOOL_EXECUTION"
  });
  assert.equal(classifyObservedDiagnostic({ processResult, evidence: { successfulCommands: [] }, machine }).reason, "MISSING_OBSERVED_GIT_EXECUTION");
  assert.equal(classifyObservedDiagnostic({ processResult, evidence, machine: { ...machine, provider: "openai" } }).reason, "PROVIDER_MISMATCH");
  assert.equal(classifyObservedDiagnostic({ processResult, evidence, machine: { ...machine, model: "mistral:latest" } }).reason, "MODEL_MISMATCH");
  assert.equal(classifyObservedDiagnostic({ processResult, evidence, machine: { ...machine, fallbackUsed: null } }).reason, "FALLBACK_NOT_PROVEN_FALSE");
});
