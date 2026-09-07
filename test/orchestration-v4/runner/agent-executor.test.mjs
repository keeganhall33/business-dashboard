import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  AGENT_MUTATION_MODES,
  buildAgentInvocation,
  buildProductionAgentEnv,
  cleanupEphemeralAgentState,
  createEphemeralAgentState,
  parseAgentCapabilities,
  productionAgentConfig,
  resolveAgentModel,
  resolveAgentMutationMode,
  V4_AGENT_MODEL,
  V4_OLLAMA_BASE_URL,
} from '../../../scripts/orchestration-v4/runner/agent-executor.mjs';

const help = `Usage: openclaw agent exec <prompt>\n  --config <path>\n  --state-dir <path>\n  --model <id>\n  --isolated\n  --code-mode <mode>\n  --local-model-lean\n  --cwd <path>\n  --json\n  --timeout <seconds>`;

test('adapter defaults to tool-capable local Ollama model and task-scoped config without forcing code mode', () => {
  const capabilities = parseAgentCapabilities(help);
  const invocation = buildAgentInvocation({
    capabilities,
    prompt: 'do work',
    workspacePath: path.resolve('/tmp/v4-workspace'),
    configPath: path.resolve('/tmp/v4-config.json'),
    stateDir: path.resolve('/tmp/v4-state'),
    timeoutSeconds: 90,
    openclaw: '/opt/homebrew/bin/openclaw',
  });
  assert.equal(invocation.model, 'ollama/qwen3.5:9b');
  assert.equal(V4_AGENT_MODEL, 'ollama/qwen3.5:9b');
  assert.equal(invocation.args.includes('--isolated'), false);
  const configIndex = invocation.args.indexOf('--config');
  assert.notEqual(configIndex, -1);
  assert.equal(invocation.args[configIndex + 1], '/tmp/v4-config.json');
  assert.ok(invocation.args.includes('--state-dir'));
  assert.ok(invocation.args.includes('/tmp/v4-state'));
  assert.ok(invocation.args.includes('--cwd'));
  assert.ok(invocation.args.includes('/tmp/v4-workspace'));
  assert.ok(invocation.args.includes('--local-model-lean'));
  assert.equal(invocation.args.includes('--code-mode'), false);
});

test('agent model can be overridden without changing code', () => {
  assert.equal(resolveAgentModel({ V4_AGENT_MODEL: 'ollama/custom-coder:latest' }), 'ollama/custom-coder:latest');
  const invocation = buildAgentInvocation({
    capabilities: parseAgentCapabilities(help),
    prompt: 'do work',
    workspacePath: path.resolve('/tmp/v4-workspace'),
    configPath: path.resolve('/tmp/v4-config.json'),
    stateDir: path.resolve('/tmp/v4-state'),
    model: 'ollama/custom-coder:latest',
  });
  assert.equal(invocation.model, 'ollama/custom-coder:latest');
  assert.equal(invocation.args[invocation.args.indexOf('--model') + 1], 'ollama/custom-coder:latest');
});

test('production config pins the native Ollama API and never the OpenAI-compatible /v1 endpoint', () => {
  const config = productionAgentConfig();
  assert.equal(V4_OLLAMA_BASE_URL, 'http://127.0.0.1:11434');
  assert.equal(config.models.providers.ollama.baseUrl, V4_OLLAMA_BASE_URL);
  assert.equal(config.models.providers.ollama.api, 'ollama');
  assert.equal(config.models.providers.ollama.apiKey, 'OLLAMA_API_KEY');
  assert.equal(config.models.providers.ollama.baseUrl.includes('/v1'), false);
  assert.equal(config.models.providers.ollama.models[0].id, 'qwen3.5:9b');
});

test('production config allows the dedicated V4 Ollama model to stop after tool use', () => {
  const config = productionAgentConfig();
  assert.equal(config.agents.defaults.models['ollama/qwen3.5:9b'].params.extra_body.tool_choice, 'auto');
});

test('ordinary production config keeps apply_patch enabled and shell exec workspace-scoped', () => {
  const config = productionAgentConfig();
  assert.deepEqual(config.memory, { search: { enabled: false } });
  assert.equal(config.tools.profile, 'coding');
  assert.equal(Object.hasOwn(config.tools, 'deny'), false);
  assert.deepEqual(config.tools.codeMode, { enabled: false });
  assert.deepEqual(config.tools.fs, { workspaceOnly: true });
  assert.equal(config.tools.exec.mode, 'full');
  assert.deepEqual(config.tools.exec.applyPatch, { enabled: true, workspaceOnly: true });
});

test('SHELL_ONLY production config mechanically disables apply_patch without disabling shell exec', () => {
  const config = productionAgentConfig({ mutationMode: AGENT_MUTATION_MODES.SHELL_ONLY });
  assert.equal(config.tools.exec.mode, 'full');
  assert.deepEqual(config.tools.fs, { workspaceOnly: true });
  assert.deepEqual(config.tools.exec.applyPatch, { enabled: false, workspaceOnly: true });
});

test('explicit apply-patch capability flag is validated', () => {
  assert.equal(productionAgentConfig({ applyPatchEnabled: false }).tools.exec.applyPatch.enabled, false);
  assert.throws(
    () => productionAgentConfig({ applyPatchEnabled: 'false' }),
    /V4_AGENT_APPLY_PATCH_CAPABILITY_INVALID/,
  );
  assert.throws(
    () => productionAgentConfig({
      mutationMode: AGENT_MUTATION_MODES.SHELL_ONLY,
      applyPatchEnabled: true,
    }),
    /V4_AGENT_SHELL_ONLY_APPLY_PATCH_FORBIDDEN/,
  );
});

test('unsupported mutation mode fails closed before any agent state is created', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-agent-invalid-mode-'));
  try {
    assert.throws(() => resolveAgentMutationMode('PATCH_ANYWAY'), /V4_AGENT_MUTATION_MODE_INVALID/);
    assert.throws(
      () => createEphemeralAgentState({
        taskId: 'invalid-mode',
        root,
        mutationMode: 'PATCH_ANYWAY',
      }),
      /V4_AGENT_MUTATION_MODE_INVALID/,
    );
    assert.deepEqual(fs.readdirSync(root), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('task-scoped config writes the production tool policy', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-agent-state-test-'));
  const state = createEphemeralAgentState({ taskId: 'task-memory-off', root });
  try {
    assert.ok(path.isAbsolute(state.stateDir));
    assert.ok(path.isAbsolute(state.configPath));
    assert.equal(path.dirname(state.configPath), state.stateDir);
    assert.equal(state.mutationMode, AGENT_MUTATION_MODES.DEFAULT);
    const config = JSON.parse(fs.readFileSync(state.configPath, 'utf8'));
    assert.deepEqual(config, productionAgentConfig());
  } finally {
    cleanupEphemeralAgentState(state);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('task-scoped SHELL_ONLY state writes apply_patch disabled', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-agent-shell-only-'));
  const state = createEphemeralAgentState({
    taskId: 'shell-only',
    root,
    mutationMode: AGENT_MUTATION_MODES.SHELL_ONLY,
  });
  try {
    const config = JSON.parse(fs.readFileSync(state.configPath, 'utf8'));
    assert.equal(state.mutationMode, AGENT_MUTATION_MODES.SHELL_ONLY);
    assert.equal(config.tools.exec.applyPatch.enabled, false);
    assert.equal(config.tools.exec.mode, 'full');
  } finally {
    cleanupEphemeralAgentState(state);
    assert.equal(fs.existsSync(state.stateDir), false);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('adapter fails closed when pinned config flag is unavailable', () => {
  assert.throws(() => buildAgentInvocation({
    capabilities: parseAgentCapabilities(help.replace('  --config <path>\n', '')),
    prompt: 'do work',
    workspacePath: path.resolve('/tmp/v4-workspace'),
    configPath: path.resolve('/tmp/v4-config.json'),
    stateDir: path.resolve('/tmp/v4-state'),
  }), /V4_AGENT_REQUIRED_FLAGS_MISSING/);
});

test('adapter does not add code mode even when the installed CLI advertises it', () => {
  const invocation = buildAgentInvocation({
    capabilities: parseAgentCapabilities(help),
    prompt: 'do work',
    workspacePath: path.resolve('/tmp/v4-workspace'),
    configPath: path.resolve('/tmp/v4-config.json'),
    stateDir: path.resolve('/tmp/v4-state'),
  });
  assert.equal(invocation.args.includes('--code-mode'), false);
});

test('adapter remains compatible when code mode flag is unavailable', () => {
  const capabilities = parseAgentCapabilities(help.replace('  --code-mode <mode>\n', ''));
  const invocation = buildAgentInvocation({
    capabilities,
    prompt: 'do work',
    workspacePath: path.resolve('/tmp/v4-workspace'),
    configPath: path.resolve('/tmp/v4-config.json'),
    stateDir: path.resolve('/tmp/v4-state'),
  });
  assert.equal(invocation.args.includes('--code-mode'), false);
});

test('production agent env disables fallback, supplies local Ollama auth, and pins workspace', () => {
  const workspacePath = path.resolve('/tmp/v4-workspace');
  const env = buildProductionAgentEnv({ PATH: '/bin' }, workspacePath);
  assert.equal(env.OPENCLAW_FALLBACK_MODELS, '');
  assert.equal(env.OPENCLAW_WORKSPACE_DIR, workspacePath);
  assert.equal(env.OLLAMA_API_KEY, 'ollama-local');
  assert.equal(env.PATH, '/bin');
});

test('production agent env preserves an explicitly supplied Ollama API key', () => {
  const workspacePath = path.resolve('/tmp/v4-workspace');
  const env = buildProductionAgentEnv({ OLLAMA_API_KEY: 'explicit-local-key', OPENCLAW_FALLBACK_MODELS: 'cloud/model', OPENCLAW_WORKSPACE_DIR: '/wrong/workspace' }, workspacePath);
  assert.equal(env.OLLAMA_API_KEY, 'explicit-local-key');
  assert.equal(env.OPENCLAW_FALLBACK_MODELS, '');
  assert.equal(env.OPENCLAW_WORKSPACE_DIR, workspacePath);
});

test('production agent env fails closed without an absolute workspace', () => {
  assert.throws(() => buildProductionAgentEnv({}, 'relative/workspace'), /V4_AGENT_WORKSPACE_ENV_REQUIRED/);
});
