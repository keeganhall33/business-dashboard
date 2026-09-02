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
  'For every file read, shell command, mutation, and validation, resolve paths under this exact root.',
  'This run uses normal direct coding tools, not OpenClaw Code Mode. The exec tool runs shell commands.',
  'Use exec for pwd, git status, ls, find, directory inspection, tests, and every other shell command.',
  'Use read only for a specific file path that you already know exists. Never use read on a directory, on pwd, or as a substitute for ls/find.',
  'When a requested target file does not exist yet, create it immediately with shell exec. A safe pattern is: mkdir -p "$(dirname ABSOLUTE_TARGET)" && cat > "ABSOLUTE_TARGET" <<\'EOF\' ... EOF.',
  'For edits to existing files, use apply_patch when convenient or use shell exec with a deterministic script. Do not search for a separate write tool.',
  'After any tool failure, inspect the failure and switch strategy. Do not repeat the same invalid read, code-mode, or path pattern.',
  'Native write and edit tools are intentionally disabled for production coding agents.',
  'Perform file mutations only with apply_patch or shell exec, rooted at V4_RUNTIME_WORKSPACE_ROOT.',
  'When using exec for a mutation, use the exact absolute target path under V4_RUNTIME_WORKSPACE_ROOT or first verify pwd equals V4_RUNTIME_WORKSPACE_ROOT.',
  'After mutating, verify the target with read or exec and confirm git status shows the intended owned-path change before declaring completion.',
  'For IMPLEMENTATION_MUTATION_REQUIRED tasks, do not finish successfully until the workspace contains an intended mutation in an owned path, unless a genuine blocker prevents the task.',
  'Do not write into the OpenClaw state directory, temporary agent directory, home directory, memory directory, or any other workspace.',
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
