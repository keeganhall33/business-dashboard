import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function runGit(repoRoot, args, spawn = spawnSync) {
  const result = spawn('git', ['-C', repoRoot, ...args], { encoding: 'utf8' });
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim();
    throw new Error(`V4_GIT_FAILED:${args.join(' ')}:${detail}`);
  }
  return String(result.stdout || '').trim();
}

export function resolveCanonicalBaseSha(repoRoot, canonicalRef = 'refs/remotes/origin/main', spawn = spawnSync) {
  const sha = runGit(repoRoot, ['rev-parse', '--verify', `${canonicalRef}^{commit}`], spawn);
  if (!/^[0-9a-f]{40}$/i.test(sha)) throw new Error('V4_CANONICAL_BASE_NOT_FULL_SHA');
  return sha;
}

export function createDisposableWorkspace({ repoRoot, context, spawn = spawnSync }) {
  if (!fs.existsSync(repoRoot)) throw new Error('V4_REPO_ROOT_MISSING');
  if (fs.existsSync(context.workspacePath)) throw new Error(`V4_WORKSPACE_ALREADY_EXISTS:${context.workspacePath}`);

  fs.mkdirSync(path.dirname(context.workspacePath), { recursive: true });
  runGit(repoRoot, ['cat-file', '-e', `${context.baseSha}^{commit}`], spawn);
  runGit(repoRoot, ['worktree', 'add', '--detach', context.workspacePath, context.baseSha], spawn);

  const actualHead = runGit(context.workspacePath, ['rev-parse', 'HEAD'], spawn);
  if (actualHead !== context.baseSha) {
    try { cleanupDisposableWorkspace({ repoRoot, context, spawn }); } catch {}
    throw new Error(`V4_WORKSPACE_BASE_MISMATCH:${actualHead}:${context.baseSha}`);
  }

  return Object.freeze({ ...context, workspaceReady: true, workspaceHead: actualHead });
}

export function cleanupDisposableWorkspace({ repoRoot, context, spawn = spawnSync }) {
  if (!context?.workspacePath) throw new Error('V4_WORKSPACE_PATH_REQUIRED');

  if (fs.existsSync(context.workspacePath)) {
    runGit(repoRoot, ['worktree', 'remove', '--force', context.workspacePath], spawn);
  }
  runGit(repoRoot, ['worktree', 'prune'], spawn);
  return Object.freeze({ workspacePath: context.workspacePath, cleaned: true });
}

export function taskBranchName(issueNumber, taskId) {
  const safeTask = String(taskId).replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 72);
  return `v4/issue-${issueNumber}-${safeTask}`;
}
