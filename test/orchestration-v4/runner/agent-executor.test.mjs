import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { buildAgentInvocation, parseAgentCapabilities, V4_AGENT_MODEL } from '../../../scripts/orchestration-v4/runner/agent-executor.mjs';

const help = `Usage: openclaw agent exec <prompt>\n  --config <path>\n  --state-dir <path>\n  --model <id>\n  --local-model-lean\n  --cwd <path>\n  --json\n  --timeout <seconds>`;

test('adapter requires direct exec and pins local Ollama model', () => {
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
  assert.ok(invocation.args.includes('--cwd'));
  assert.ok(invocation.args.includes('/tmp/v4-workspace'));
  assert.ok(invocation.args.includes('--local-model-lean'));
  assert.equal(invocation.args.includes('--isolated'), false);
});

test('adapter fails closed when required flags are missing', () => {
  assert.throws(() => buildAgentInvocation({
    capabilities: parseAgentCapabilities('Usage: openclaw agent exec <prompt> --model <id>'),
    prompt: 'x', workspacePath: '/tmp/w', configPath: '/tmp/c', stateDir: '/tmp/s'
  }), /V4_AGENT_REQUIRED_FLAGS_MISSING/);
});
