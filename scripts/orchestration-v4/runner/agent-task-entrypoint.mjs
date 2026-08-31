import { spawn } from 'node:child_process';
import path from 'node:path';
import { buildAgentInvocation, buildProductionAgentEnv, probeAgentCapabilities } from './agent-executor.mjs';

const [prompt, configPath, stateDir, timeoutSeconds = '900', openclaw = '/opt/homebrew/bin/openclaw'] = process.argv.slice(2);
if (!prompt || !configPath || !stateDir) throw new Error('V4_AGENT_ENTRYPOINT_ARGS_REQUIRED');

const workspacePath = process.cwd();
if (!path.isAbsolute(workspacePath)) throw new Error('V4_AGENT_ENTRYPOINT_CWD_REQUIRED');
const runtimePrompt = [
  `V4_RUNTIME_WORKSPACE_ROOT: ${workspacePath}`,
  'This absolute directory is the only authoritative workspace for this task.',
  'For every file read, write, edit, shell command, and validation, resolve paths under this exact root.',
  'For mutations, use absolute target paths rooted at V4_RUNTIME_WORKSPACE_ROOT rather than relying on an implicit current directory.',
  'Do not write into the OpenClaw state directory, temporary agent directory, home directory, or any other workspace.',
  '',
  prompt,
].join('\n');
const capabilities = probeAgentCapabilities(openclaw);
const invocation = buildAgentInvocation({ capabilities, prompt: runtimePrompt, workspacePath, configPath, stateDir, timeoutSeconds: Number(timeoutSeconds), openclaw });

const childEnv = buildProductionAgentEnv(process.env, workspacePath);
const child = spawn(invocation.command, invocation.args, { cwd: workspacePath, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout?.on('data', (chunk) => process.stdout.write(chunk));
child.stderr?.on('data', (chunk) => process.stderr.write(chunk));
child.on('error', (error) => { throw error; });
child.on('exit', (code, signal) => {
  if (code === 0 && !signal) {
    process.stdout.write(`\nV4_EVENT ${JSON.stringify({ kind: 'MODEL_RESULT', data: 'OPENCLAW_EXIT_0' })}\n`);
  }
  if (signal) process.kill(process.pid, signal);
  process.exitCode = code ?? 1;
});
