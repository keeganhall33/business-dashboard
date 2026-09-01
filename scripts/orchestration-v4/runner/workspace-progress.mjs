import { execFileSync } from 'node:child_process';

function git(cwd, ...args) {
  try {
    return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: 5000 }).trim();
  } catch {
    return '';
  }
}

function workspaceFingerprint(cwd) {
  const head = git(cwd, 'rev-parse', 'HEAD');
  const status = git(cwd, 'status', '--porcelain=v1', '--untracked-files=all');
  return `${head}\n${status}`;
}

export function createWorkspaceProgressObserver(cwd) {
  let previous = workspaceFingerprint(cwd);
  return function observeWorkspaceProgress(observedAt = new Date().toISOString()) {
    const fingerprint = workspaceFingerprint(cwd);
    if (fingerprint === previous) return null;
    previous = fingerprint;
    return { kind: 'WORKTREE_MUTATION', data: fingerprint.slice(0, 4000), observedAt };
  };
}
