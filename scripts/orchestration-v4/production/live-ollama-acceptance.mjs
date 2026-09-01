import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createExecutionContext } from '../execution-context.mjs';
import { createDisposableWorkspace, cleanupDisposableWorkspace } from '../disposable-workspace.mjs';
import { buildAgentInvocation, cleanupEphemeralAgentState, createEphemeralAgentState, probeAgentCapabilities, V4_AGENT_MODEL } from '../runner/agent-executor.mjs';

function runChild(command, args, options) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('exit', (code, signal) => resolve({ code, signal, stdout, stderr, durationMs: Date.now() - startedAt }));
  });
}

function summarizeStdout(stdout) {
  const lines = String(stdout).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const jsonLines = [];
  const keys = new Set();
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      jsonLines.push(parsed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const key of Object.keys(parsed)) keys.add(key);
      }
    } catch {}
  }
  return {
    lineCount: lines.length,
    jsonLineCount: jsonLines.length,
    topLevelKeys: [...keys].sort(),
    sampleLines: lines.slice(0, 8).map((line) => line.slice(0, 500)),
  };
}

export async function runLiveOllamaAcceptance({ repoRoot, baseSha, openclaw = '/opt/homebrew/bin/openclaw', timeoutSeconds = 120 } = {}) {
  if (!repoRoot || !path.isAbsolute(repoRoot)) throw new Error('V4_LIVE_OLLAMA_REPO_ROOT_REQUIRED');
  if (!/^[0-9a-f]{40}$/i.test(String(baseSha || ''))) throw new Error('V4_LIVE_OLLAMA_BASE_SHA_REQUIRED');

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jeeves-v4-live-ollama-'));
  const workspaceRoot = path.join(tempRoot, 'workspaces');
  const configPath = path.join(tempRoot, 'openclaw.json');
  fs.writeFileSync(configPath, '{}\n', 'utf8');
  const agentState = createEphemeralAgentState({ taskId: 'v4-live-ollama', root: path.join(tempRoot, 'agent-state') });
  const context = createExecutionContext({
    taskId: 'v4-live-ollama', issueNumber: 977, workerId: 'local-f', baseSha,
    workspaceRoot, timeoutMs: timeoutSeconds * 1000,
  });
  let workspace = null;
  try {
    workspace = createDisposableWorkspace({ repoRoot, context });
    const capabilities = probeAgentCapabilities(openclaw);
    const prompt = [
      'V4_LIVE_OLLAMA_ACCEPTANCE_V1.',
      'Do not use any tools. Do not read or modify repository files. Do not access the network.',
      'Return only this exact JSON object: {"STATUS":"PASS","SUMMARY":"Local Ollama adapter acceptance complete"}'
    ].join('\n');
    const invocation = buildAgentInvocation({ capabilities, prompt, workspacePath: workspace.workspacePath, configPath, stateDir: agentState.stateDir, timeoutSeconds, openclaw });
    const run = await runChild(invocation.command, invocation.args, { cwd: workspace.workspacePath, env: { ...process.env, OPENCLAW_FALLBACK_MODELS: '', OLLAMA_API_KEY: process.env.OLLAMA_API_KEY || 'ollama-local' } });
    const stdout = summarizeStdout(run.stdout);
    return {
      ok: run.code === 0 && invocation.model === V4_AGENT_MODEL,
      baseSha,
      model: invocation.model,
      exitCode: run.code,
      signal: run.signal,
      durationMs: run.durationMs,
      stdout,
      stderrSample: String(run.stderr).slice(0, 1000),
      workspaceHead: fs.existsSync(workspace.workspacePath) ? null : null,
      githubMutationPerformed: false,
    };
  } finally {
    if (workspace) cleanupDisposableWorkspace({ repoRoot, context });
    cleanupEphemeralAgentState(agentState);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repoRoot = path.resolve(process.argv[2] || process.cwd());
  const baseSha = process.argv[3] || process.env.JEEVES_V4_BASE_SHA;
  const report = await runLiveOllamaAcceptance({ repoRoot, baseSha });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}
