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

function changedPaths(cwd) {
  const output = git(cwd, 'ls-files', '-m', '-d', '-o', '--exclude-standard', '-z');
  if (!output) return [];
  return output
    .split('\0')
    .filter(Boolean)
    .sort()
    .slice(0, MAX_CHANGED_PATHS);
}

function contentIdentity(cwd, filePath) {
  const hash = git(cwd, 'hash-object', '--', filePath);
  return hash || 'DELETED';
}

function workspaceSnapshot(cwd) {
  const head = git(cwd, 'rev-parse', 'HEAD');
  const paths = changedPaths(cwd);
  const parts = [head];

  for (const filePath of paths) {
    parts.push(filePath, contentIdentity(cwd, filePath));
  }

  const fingerprint = crypto
    .createHash('sha256')
    .update(parts.join('\0'))
    .digest('hex');

  return {
    fingerprint,
    head,
    changedFileCount: paths.length,
    changedPathsTruncated: paths.length === MAX_CHANGED_PATHS,
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
