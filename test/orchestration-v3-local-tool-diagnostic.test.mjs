import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import {
  buildExecInvocation,
  buildIsolatedEnvironment,
  classifyDiagnostic,
  isMainModule,
  parseAgentMeta,
  parseExecCapabilities
} from "../scripts/orchestration-v3/diagnose-local-tool.mjs";

test("standalone diagnostic pins Ollama qwen3.5 and isolates through controlled temp paths", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/diagnose-local-tool.mjs", "utf8");
  assert.match(source, /const MODEL = "ollama\/qwen3\.5:9b"/);
  assert.match(source, /OPENCLAW_HOME/);
  assert.match(source, /OPENCLAW_STATE_DIR/);
  assert.match(source, /OPENCLAW_CONFIG_PATH/);
  assert.match(source, /OPENCLAW_WORKSPACE_DIR/);
  assert.match(source, /OPENCLAW_FALLBACK_MODELS: ""/);
  assert.match(source, /OPENCLAW_LOAD_SHELL_ENV: "0"/);
  assert.match(source, /git status --short --branch/);
  assert.match(source, /createObservedExecutionHarness/);
  assert.match(source, /MISSING_OBSERVED_GIT_EXECUTION/);
  assert.match(source, /LEGACY_AGENT_LOCAL_MESSAGE/);
  assert.doesNotMatch(source, /watcher\.mjs|worker\.mjs|editLabels|postComment|api\.github\.com|\bissue\s+(?:edit|comment)\b/);
});

test("diagnostic detects modern agent exec and 2026.7.1 legacy agent flag surfaces", () => {
  const modern = parseExecCapabilities(`
    Usage: openclaw agent exec [options] <prompt>
    --isolated
    --auth-env-only
    --model <provider/model>
    --code-mode <mode>
    --local-model-lean
    --cwd <dir>
    --json
    --timeout <seconds>
  `);
  assert.deepEqual(modern, {
    execSubcommand: true,
    local: false,
    message: false,
    isolated: true,
    authEnvOnly: true,
    model: true,
    codeMode: true,
    localModelLean: true,
    cwd: true,
    json: true,
    timeout: true
  });

  const legacy = parseExecCapabilities(`
    Usage: openclaw agent [options]
    --local
    -m, --message <text>
    --model <id>
    --json
    --timeout <seconds>
  `);
  assert.equal(legacy.execSubcommand, false);
  assert.equal(legacy.local, true);
  assert.equal(legacy.message, true);
  assert.equal(legacy.isolated, false);
  assert.equal(legacy.authEnvOnly, false);
  assert.equal(legacy.model, true);
  assert.equal(legacy.codeMode, false);
});

test("2026.7.1-style CLI uses embedded local message path instead of agent exec", () => {
  const capabilities = parseExecCapabilities(`
    Usage: openclaw agent [options]
    --local
    -m, --message <text>
    --model <id>
    --json
    --timeout <seconds>
  `);
  const invocation = buildExecInvocation({
    capabilities,
    prompt: "diagnostic",
    controlWorkspace: "/tmp/workspace",
    timeoutSeconds: 120
  });
  assert.equal(invocation.supported, true);
  assert.equal(invocation.mode, "LEGACY_AGENT_LOCAL_MESSAGE");
  assert.equal(invocation.toolMode, "direct");
  assert.equal(invocation.promptIndex, 3);
  assert.deepEqual(invocation.args, [
    "agent", "--local", "--message", "diagnostic",
    "--model", "ollama/qwen3.5:9b",
    "--json", "--timeout", "120"
  ]);
  assert.equal(invocation.args.includes("exec"), false);
  assert.equal(invocation.args.includes("--isolated"), false);
  assert.equal(invocation.args.includes("--auth-env-only"), false);
});

test("modern CLI keeps agent exec path and only passes supported flags", () => {
  const capabilities = parseExecCapabilities(`
    Usage: openclaw agent exec [options] <prompt>
    --model <provider/model>
    --code-mode <mode>
    --cwd <dir>
    --json
    --timeout <seconds>
  `);
  const invocation = buildExecInvocation({
    capabilities,
    prompt: "diagnostic",
    controlWorkspace: "/tmp/workspace",
    timeoutSeconds: 120
  });
  assert.equal(invocation.supported, true);
  assert.equal(invocation.mode, "AGENT_EXEC");
  assert.equal(invocation.toolMode, "code");
  assert.equal(invocation.args.includes("--isolated"), false);
  assert.equal(invocation.args.includes("--auth-env-only"), false);
  assert.deepEqual(invocation.args.slice(0, 5), ["agent", "exec", "diagnostic", "--model", "ollama/qwen3.5:9b"]);
});

test("diagnostic environment removes ambient OpenClaw and cloud credentials", () => {
  const env = buildIsolatedEnvironment({
    baseEnv: {
      PATH: "/usr/bin",
      HOME: "/Users/example",
      OPENCLAW_PROFILE: "default",
      OPENAI_API_KEY: "cloud-secret",
      ANTHROPIC_API_KEY: "cloud-secret-2",
      OLLAMA_API_KEY: "local-key",
      OLLAMA_HOST: "http://127.0.0.1:11434"
    },
    tempHome: "/tmp/home",
    stateDir: "/tmp/state",
    configPath: "/tmp/openclaw.json",
    controlWorkspace: "/tmp/workspace",
    harnessEnv: { ORCH_EXECUTION_JOURNAL: "/tmp/journal", PATH: "/tmp/shims:/usr/bin" }
  });
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.ANTHROPIC_API_KEY, undefined);
  assert.equal(env.OPENCLAW_PROFILE, undefined);
  assert.equal(env.HOME, "/tmp/home");
  assert.equal(env.OPENCLAW_HOME, "/tmp/home");
  assert.equal(env.OPENCLAW_STATE_DIR, "/tmp/state");
  assert.equal(env.OPENCLAW_CONFIG_PATH, "/tmp/openclaw.json");
  assert.equal(env.OPENCLAW_WORKSPACE_DIR, "/tmp/workspace");
  assert.equal(env.OLLAMA_API_KEY, "local-key");
  assert.equal(env.OLLAMA_HOST, "http://127.0.0.1:11434");
  assert.equal(env.PATH, "/tmp/shims:/usr/bin");
});

test("diagnostic only passes with observed git execution and explicit compatible model metadata", () => {
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
  assert.equal(classifyDiagnostic({ processResult: { status: 0, error: null }, evidence, agentMeta: { provider: null, model: null } }).reason, "MISSING_PROVIDER_MODEL_EVIDENCE");
  assert.equal(classifyDiagnostic({ processResult: { status: 0, error: null }, evidence, agentMeta: { provider: "openai", model: "gpt-5" } }).reason, "PROVIDER_MISMATCH");
  assert.equal(classifyDiagnostic({ processResult: { status: 0, error: null }, evidence, agentMeta: { provider: "ollama", model: "mistral:latest" } }).reason, "MODEL_MISMATCH");
  assert.equal(classifyDiagnostic({ processResult: { status: null, error: { code: "ETIMEDOUT", message: "spawnSync openclaw ETIMEDOUT" } }, evidence: { successfulCommands: [] }, agentMeta: {} }).reason, "OPENCLAW_PROCESS_TIMEOUT");
});

test("diagnostic extracts provider/model from OpenClaw JSON envelope", () => {
  const parsed = parseAgentMeta(JSON.stringify({ meta: { agentMeta: { provider: "ollama", model: "qwen3.5:9b" } } }));
  assert.deepEqual(parsed, { provider: "ollama", model: "qwen3.5:9b", parseError: null });
});

test("diagnostic main-module detection tolerates symlink and path aliases", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "v3-diagnostic-main-"));
  const real = path.join(temp, "diagnose-local-tool.mjs");
  const alias = path.join(temp, "alias.mjs");
  fs.writeFileSync(real, "// fixture\n", "utf8");
  fs.symlinkSync(real, alias);
  assert.equal(isMainModule(pathToFileURL(real).href, alias), true);
});
