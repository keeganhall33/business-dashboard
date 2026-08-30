import { spawn } from 'node:child_process';
import path from 'node:path';
import { buildAgentInvocation, probeAgentCapabilities } from './agent-executor.mjs';

const [prompt, configPath, stateDir, timeoutSeconds = '900', openclaw = '/opt/homebrew/bin/openclaw'] = process.argv.slice(2);
if (!prompt || !configPath || !stateDir) throw new Error('V4_AGENT_ENTRYPOINT_ARGS_REQUIRED');

const workspacePath = process.cwd();
if (!path.isAbsolute(workspacePath)) throw new Error('V4_AGENT_ENTRYPOINT_CWD_REQUIRED');
const capabilities = probeAgentCapabilities(openclaw);
const invocation = buildAgentInvocation({
  capabilities,
  prompt,
  workspacePath,
  configPath,
  stateDir,
  timeoutSeconds: Number(timeoutSeconds),
  openclaw,
});

const child = spawn(invocation.command, invocation.args, { cwd: workspacePath, env: process.env, stdio: 'inherit' });
child.on('error', (error) => { throw error; });
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exitCode = code ?? 1;
});
