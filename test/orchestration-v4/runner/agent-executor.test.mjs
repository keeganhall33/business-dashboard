import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildAgentInvocation, buildProductionAgentEnv, cleanupEphemeralAgentState, createEphemeralAgentState, parseAgentCapabilities, productionAgentConfig, resolveAgentModel, V4_AGENT_MODEL, V4_OLLAMA_BASE_URL } from '../../../scripts/orchestration-v4/runner/agent-executor.mjs';

const help = `Usage: openclaw agent exec <prompt>\n  --config <path>\n  --state-dir <path>\n  --model <id>\n  --isolated\n  --code-mode <mode>\n  --local-model-lean\n  --cwd <path>\n  --json\n  --timeout <seconds>`;

test('adapter defaults to coding-tuned local Ollama model and task-scoped config in forced code mode', () => {
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
  assert.equal(invocation.model, 'ollama/qwen2.5-coder:14b');
  assert.equal(V4_AGENT_MODEL, 'ollama/qwen2.5-coder:14b');
  assert.equal(invocation.args.includes('--isolated'), false);
  const configIndex = invocation.args.indexOf('--config');
  assert.notEqual(configIndex, -1);
  assert.equal(invocation.args[configIndex + 1], '/tmp/v4-config.json');
  assert.ok(invocation.args.includes('--state-dir'));
  assert.ok(invocation.args.includes('/tmp/v4-state'));
  assert.ok(invocation.args.includes('--cwd'));
  assert.ok(invocation.args.includes('/tmp/v4-workspace'));
  assert.ok(invocation.args.includes('--local-model-lean'));
  const codeModeIndex = invocation.args.indexOf('--code-mode');
  assert.notEqual(codeModeIndex, -1);
  assert.equal(invocation.args[codeModeIndex + 1], 'code');
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
  assert.equal(config.models.providers.ollama.models[0].id, 'qwen2.5-coder:14b');
});

test('production config forces structured tool calls for the dedicated V4 Ollama model', () => {
  const config = productionAgentConfig();
  assert.equal(config.agents.defaults.models['ollama/qwen2.5-coder:14b'].params.extra_body.tool_choice, 'required');
});

test('production config disables semantic memory and native write/edit while preserving cwd-bound mutation tools', () => {
  const config = productionAgentConfig();
  assert.deepEqual(config.memory, { search: { enabled: false } });
  assert.equal(config.tools.profile, 'coding');
  assert.deepEqual(config.tools.deny, ['write', 'edit']);
  assert.deepEqual(config.tools.exec.applyPatch, { enabled: true, workspaceOnly: true });
  assert.equal(config.tools.deny.includes('exec'), false);
  assert.equal(config.tools.deny.includes('apply_patch'), false);
  assert.equal(config.tools.deny.includes('read'), false);
});

test('task-scoped config writes the production tool policy', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-agent-state-test-'));
  const state = createEphemeralAgentState({ taskId: 'task-memory-off', root });
  try {
    assert.ok(path.isAbsolute(state.stateDir));
    assert.ok(path.isAbsolute(state.configPath));
    assert.equal(path.dirname(state.configPath), state.stateDir);
    const config = JSON.parse(fs.readFileSync(state.configPath, 'utf8'));
    assert.deepEqual(config, productionAgentConfig());
  } finally {
    cleanupEphemeralAgentState(state);
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
