import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';

const MAX_CHANGED_PATHS = 512;

function git(cwd, ...args) {
  try {
    return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: 5000 }).trim();
  } catch {
    return '';
  }
}

function nulPaths(output) {
  return output ? output.split('\0').filter(Boolean) : [];
}

function changedPaths(cwd) {
  const worktree = nulPaths(git(cwd, 'ls-files', '-m', '-d', '-o', '--exclude-standard', '-z'));
  const staged = nulPaths(git(cwd, 'diff', '--cached', '--name-only', '-z'));
  const all = [...new Set([...worktree, ...staged])].sort();

  return {
    paths: all.slice(0, MAX_CHANGED_PATHS),
    truncated: all.length > MAX_CHANGED_PATHS,
  };
}

function contentIdentity(cwd, filePath) {
  const hash = git(cwd, 'hash-object', '--', filePath);
  return hash || 'DELETED';
}

function workspaceSnapshot(cwd) {
  const head = git(cwd, 'rev-parse', 'HEAD');
  const changed = changedPaths(cwd);
  const parts = [head];

  for (const filePath of changed.paths) {
    parts.push(filePath, contentIdentity(cwd, filePath));
  }
  if (changed.truncated) parts.push('CHANGED_PATHS_TRUNCATED');

  const fingerprint = crypto
    .createHash('sha256')
    .update(parts.join('\0'))
    .digest('hex');

  return {
    fingerprint,
    head,
    changedFileCount: changed.paths.length,
    changedPathsTruncated: changed.truncated,
  };
}

export function createWorkspaceProgressObserver(cwd) {
  let previous = workspaceSnapshot(cwd).fingerprint;

  return function observeWorkspaceProgress(observedAt = new Date().toISOString()) {
    const snapshot = workspaceSnapshot(cwd);
    if (snapshot.fingerprint === previous) return null;
    previous = snapshot.fingerprint;

    return {
      kind: 'WORKTREE_MUTATION',
      data: JSON.stringify(snapshot),
      observedAt,
    };
  };
}
