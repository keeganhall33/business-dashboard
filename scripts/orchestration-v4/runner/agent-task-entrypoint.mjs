import { spawn } from 'node:child_process';
import path from 'node:path';
import { buildAgentInvocation, probeAgentCapabilities } from './agent-executor.mjs';

const [prompt, configPath, stateDir, timeoutSeconds = '900', openclaw = '/opt/homebrew/bin/openclaw'] = process.argv.slice(2);
if (!prompt || !configPath || !stateDir) throw new Error('V4_AGENT_ENTRYPOINT_ARGS_REQUIRED');

const workspacePath = process.cwd();
if (!path.isAbsolute(workspacePath)) throw new Error('V4_AGENT_ENTRYPOINT_CWD_REQUIRED');
const capabilities = probeAgentCapabilities(openclaw);
const invocation = buildAgentInvocation({ capabilities, prompt, workspacePath, configPath, stateDir, timeoutSeconds: Number(timeoutSeconds), openclaw });

const childEnv = { ...process.env, OPENCLAW_FALLBACK_MODELS: '' };
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
