import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { buildAgentInvocation, buildProductionAgentEnv, parseAgentCapabilities, V4_AGENT_MODEL } from '../../../scripts/orchestration-v4/runner/agent-executor.mjs';

const help = `Usage: openclaw agent exec <prompt>\n  --config <path>\n  --state-dir <path>\n  --model <id>\n  --isolated\n  --code-mode <mode>\n  --local-model-lean\n  --cwd <path>\n  --json\n  --timeout <seconds>`;

test('adapter pins local Ollama model and uses isolated direct tool mode without config', () => {
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
  assert.ok(invocation.args.includes('--isolated'));
  assert.equal(invocation.args.includes('--config'), false);
  assert.ok(invocation.args.includes('--state-dir'));
  assert.ok(invocation.args.includes('/tmp/v4-state'));
  assert.ok(invocation.args.includes('--cwd'));
  assert.ok(invocation.args.includes('/tmp/v4-workspace'));
  assert.ok(invocation.args.includes('--local-model-lean'));
  const codeModeIndex = invocation.args.indexOf('--code-mode');
  assert.notEqual(codeModeIndex, -1);
  assert.equal(invocation.args[codeModeIndex + 1], 'direct');
});

test('adapter falls back to pinned config when isolated flag is unavailable', () => {
  const capabilities = parseAgentCapabilities(help.replace('  --isolated\n', ''));
  const invocation = buildAgentInvocation({
    capabilities,
    prompt: 'do work',
    workspacePath: path.resolve('/tmp/v4-workspace'),
    configPath: path.resolve('/tmp/v4-config.json'),
    stateDir: path.resolve('/tmp/v4-state'),
  });
  assert.equal(invocation.args.includes('--isolated'), false);
  const configIndex = invocation.args.indexOf('--config');
  assert.notEqual(configIndex, -1);
  assert.equal(invocation.args[configIndex + 1], '/tmp/v4-config.json');
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

test('adapter fails closed when neither config nor isolated execution is available', () => {
  assert.throws(() => buildAgentInvocation({
    capabilities: parseAgentCapabilities('Usage: openclaw agent exec <prompt> --state-dir <path> --model <id>'),
    prompt: 'x', workspacePath: '/tmp/w', configPath: '/tmp/c', stateDir: '/tmp/s'
  }), /V4_AGENT_CONFIG_OR_ISOLATED_REQUIRED/);
});
