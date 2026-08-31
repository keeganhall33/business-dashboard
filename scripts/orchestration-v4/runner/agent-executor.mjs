import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const MODEL = 'ollama/qwen3.5:9b';

function hasFlag(helpText, flag) {
  const escaped = flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[\\s,])${escaped}(?=[\\s=<]|$)`, 'm').test(String(helpText ?? ''));
}

export function parseAgentCapabilities(helpText) {
  const text = String(helpText ?? '');
  return {
    execSubcommand: /Usage:\s+openclaw\s+agent\s+exec\b/i.test(text),
    config: hasFlag(text, '--config'),
    stateDir: hasFlag(text, '--state-dir'),
    model: hasFlag(text, '--model'),
    isolated: hasFlag(text, '--isolated'),
    codeMode: hasFlag(text, '--code-mode'),
    localModelLean: hasFlag(text, '--local-model-lean'),
    cwd: hasFlag(text, '--cwd'),
    json: hasFlag(text, '--json'),
    timeout: hasFlag(text, '--timeout'),
  };
}

export function probeAgentCapabilities(openclaw = '/opt/homebrew/bin/openclaw', spawn = spawnSync) {
  const result = spawn(openclaw, ['agent', 'exec', '--help'], { encoding: 'utf8', timeout: 10_000, maxBuffer: 2 * 1024 * 1024 });
  if (result.error) throw result.error;
  return parseAgentCapabilities(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
}

export function buildAgentInvocation({ capabilities, prompt, workspacePath, configPath, stateDir, timeoutSeconds = 900, openclaw = '/opt/homebrew/bin/openclaw' }) {
  if (!capabilities?.execSubcommand) throw new Error('V4_AGENT_EXEC_SUBCOMMAND_REQUIRED');
  if (!capabilities?.stateDir || !capabilities?.model) throw new Error('V4_AGENT_REQUIRED_FLAGS_MISSING');
  if (!capabilities?.isolated && !capabilities?.config) throw new Error('V4_AGENT_CONFIG_OR_ISOLATED_REQUIRED');
  if (!workspacePath || !path.isAbsolute(workspacePath)) throw new Error('V4_AGENT_WORKSPACE_REQUIRED');
  if (!configPath || !path.isAbsolute(configPath)) throw new Error('V4_AGENT_CONFIG_REQUIRED');
  if (!stateDir || !path.isAbsolute(stateDir)) throw new Error('V4_AGENT_STATE_DIR_REQUIRED');
  if (!prompt) throw new Error('V4_AGENT_PROMPT_REQUIRED');

  const args = ['agent', 'exec', String(prompt)];
  if (capabilities.isolated) args.push('--isolated');
  else args.push('--config', configPath);
  args.push('--state-dir', stateDir, '--model', MODEL);
  if (capabilities.codeMode) args.push('--code-mode', 'direct');
  if (capabilities.localModelLean) args.push('--local-model-lean');
  if (capabilities.cwd) args.push('--cwd', workspacePath);
  if (capabilities.json) args.push('--json');
  if (capabilities.timeout) args.push('--timeout', String(timeoutSeconds));
  return Object.freeze({ command: openclaw, args, model: MODEL });
}

export function buildProductionAgentEnv(parentEnv = process.env, workspacePath) {
  if (!workspacePath || !path.isAbsolute(workspacePath)) throw new Error('V4_AGENT_WORKSPACE_ENV_REQUIRED');
  return Object.freeze({
    ...parentEnv,
    OPENCLAW_FALLBACK_MODELS: '',
    OPENCLAW_WORKSPACE_DIR: workspacePath,
    OLLAMA_API_KEY: parentEnv.OLLAMA_API_KEY || 'ollama-local',
  });
}

export function createEphemeralAgentState({ taskId, root = path.join(os.tmpdir(), 'jeeves-orchestration-v4-agent') }) {
  if (!taskId) throw new Error('V4_AGENT_TASK_ID_REQUIRED');
  fs.mkdirSync(root, { recursive: true });
  const safe = String(taskId).replace(/[^A-Za-z0-9._-]/g, '-');
  const stateDir = fs.mkdtempSync(path.join(root, `${safe}-`));
  return Object.freeze({ stateDir });
}

export function cleanupEphemeralAgentState(state) {
  if (state?.stateDir) fs.rmSync(state.stateDir, { recursive: true, force: true });
}

export { MODEL as V4_AGENT_MODEL };
