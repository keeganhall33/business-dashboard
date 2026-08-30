import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createExecutionContext } from './execution-context.mjs';
import { createDisposableWorkspace, cleanupDisposableWorkspace, resolveCanonicalBaseSha } from './disposable-workspace.mjs';

const DEFAULT_LANES = [
  { taskId: 'v4-live-core', issueNumber: 95901, workerId: 'local-a', stream: 'CORE_INTELLIGENCE' },
  { taskId: 'v4-live-discovery', issueNumber: 95902, workerId: 'local-b', stream: 'DISCOVERY_INTELLIGENCE' },
  { taskId: 'v4-live-ux', issueNumber: 95903, workerId: 'local-c', stream: 'INTELLIGENCE_UX' },
];

function runGit(repoRoot, args, spawn = spawnSync) {
  const result = spawn('git', ['-C', repoRoot, ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(String(result.stderr || result.stdout || '').trim() || `git ${args.join(' ')} failed`);
  return String(result.stdout || '').trim();
}

export function runLiveThreeLaneAcceptance({
  repoRoot,
  workspaceRoot = path.join(os.tmpdir(), 'jeeves-orchestration-v4-live'),
  canonicalRef = 'refs/remotes/origin/main',
  timeoutMs = 5 * 60 * 1000,
  lanes = DEFAULT_LANES,
  spawn = spawnSync,
} = {}) {
  if (!repoRoot || !path.isAbsolute(repoRoot)) throw new Error('V4_ACCEPTANCE_REPO_ROOT_REQUIRED');
  if (!Array.isArray(lanes) || lanes.length !== 3) throw new Error('V4_ACCEPTANCE_REQUIRES_THREE_LANES');

  const baseSha = resolveCanonicalBaseSha(repoRoot, canonicalRef, spawn);
  fs.mkdirSync(workspaceRoot, { recursive: true });
  const results = [];

  try {
    for (const lane of lanes) {
      const context = createExecutionContext({
        taskId: lane.taskId,
        issueNumber: lane.issueNumber,
        workerId: lane.workerId,
        baseSha,
        workspaceRoot,
        timeoutMs,
      });
      const ready = createDisposableWorkspace({ repoRoot, context, spawn });
      const markerPath = path.join(ready.workspacePath, `.v4-live-${lane.workerId}.json`);
      fs.writeFileSync(markerPath, `${JSON.stringify({ stream: lane.stream, workerId: lane.workerId, baseSha }, null, 2)}\n`);
      const actualHead = runGit(ready.workspacePath, ['rev-parse', 'HEAD'], spawn);
      results.push({ lane, context: ready, markerPath, actualHead });
    }

    const paths = new Set(results.map((r) => r.context.workspacePath));
    const heads = new Set(results.map((r) => r.actualHead));
    const markerIsolation = results.every((result) => results.every((other) => {
      const own = fs.existsSync(result.markerPath);
      const foreign = result === other ? false : fs.existsSync(path.join(result.context.workspacePath, `.v4-live-${other.lane.workerId}.json`));
      return own && !foreign;
    }));

    if (paths.size !== 3) throw new Error('V4_ACCEPTANCE_WORKSPACES_NOT_DISTINCT');
    if (heads.size !== 1 || !heads.has(baseSha)) throw new Error('V4_ACCEPTANCE_BASE_SHA_DIVERGED');
    if (!markerIsolation) throw new Error('V4_ACCEPTANCE_WORKSPACE_ISOLATION_FAILED');

    return {
      ok: true,
      baseSha,
      lanes: results.map((r) => ({
        stream: r.lane.stream,
        workerId: r.lane.workerId,
        workspacePath: r.context.workspacePath,
        workspaceHead: r.actualHead,
      })),
    };
  } finally {
    for (const result of results.reverse()) {
      cleanupDisposableWorkspace({ repoRoot, context: result.context, spawn });
    }
    if (fs.existsSync(workspaceRoot) && fs.readdirSync(workspaceRoot).length === 0) fs.rmdirSync(workspaceRoot);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repoRoot = path.resolve(process.argv[2] || process.cwd());
  const report = runLiveThreeLaneAcceptance({ repoRoot });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
