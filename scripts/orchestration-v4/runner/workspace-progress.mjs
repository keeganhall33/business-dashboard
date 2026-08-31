import { execFileSync } from 'node:child_process';

function git(cwd, ...args) {
  try {
    return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: 5000 }).trim();
  } catch {
    return '';
  }
}

export function createWorkspaceProgressObserver(cwd) {
  let previous = null;
  return function observeWorkspaceProgress(observedAt = new Date().toISOString()) {
    const head = git(cwd, 'rev-parse', 'HEAD');
    const status = git(cwd, 'status', '--porcelain=v1', '--untracked-files=all');
    const fingerprint = `${head}\n${status}`;
    if (previous === null) {
      previous = fingerprint;
      return null;
    }
    if (fingerprint === previous) return null;
    previous = fingerprint;
    return { kind: 'WORKTREE_MUTATION', data: fingerprint.slice(0, 4000), observedAt };
  };
}
