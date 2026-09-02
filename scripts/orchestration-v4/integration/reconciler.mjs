import { spawnSync } from 'node:child_process';
import { createExecutionContext } from '../execution-context.mjs';
import { createDisposableWorkspace, cleanupDisposableWorkspace } from '../disposable-workspace.mjs';

const SHA = /^[0-9a-f]{40}$/i;
const BRANCH = /^[A-Za-z0-9._/-]+$/;

function runGit(repoRoot, args, spawn = spawnSync) {
  const result = spawn('git', ['-C', repoRoot, ...args], { encoding: 'utf8' });
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim();
    throw new Error(`V4_INTEGRATION_GIT_FAILED:${args.join(' ')}:${detail}`);
  }
  return String(result.stdout || '').trim();
}

function commitExists(repoRoot, sha, spawn = spawnSync) {
  const result = spawn('git', ['-C', repoRoot, 'cat-file', '-e', `${sha}^{commit}`], { encoding: 'utf8' });
  return result.status === 0;
}

export function validateIntegrationTarget({ issueNumber, prNumber, headSha, headBranch, headRepoFullName, canonicalRepoFullName }) {
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) throw new Error('V4_INTEGRATION_INVALID_ISSUE');
  if (!Number.isInteger(prNumber) || prNumber <= 0) throw new Error('V4_INTEGRATION_INVALID_PR');
  if (!SHA.test(String(headSha || ''))) throw new Error('V4_INTEGRATION_INVALID_HEAD_SHA');
  if (!BRANCH.test(String(headBranch || ''))) throw new Error('V4_INTEGRATION_INVALID_HEAD_BRANCH');
  if (!canonicalRepoFullName || headRepoFullName !== canonicalRepoFullName) throw new Error('V4_INTEGRATION_CROSS_REPO_FORBIDDEN');
  return Object.freeze({ issueNumber, prNumber, headSha, headBranch, headRepoFullName, canonicalRepoFullName });
}

export function prepareIntegrationWorkspace({
  repoRoot,
  workspaceRoot,
  workerId = 'local-e',
  timeoutMs,
  target,
  spawn = spawnSync,
}) {
  const validated = validateIntegrationTarget(target);
  if (!commitExists(repoRoot, validated.headSha, spawn)) {
    runGit(repoRoot, ['fetch', '--no-tags', 'origin', validated.headBranch], spawn);
    const fetchedHead = runGit(repoRoot, ['rev-parse', 'FETCH_HEAD'], spawn);
    if (fetchedHead !== validated.headSha) throw new Error('V4_INTEGRATION_FETCHED_HEAD_MISMATCH');
  }
  runGit(repoRoot, ['cat-file', '-e', `${validated.headSha}^{commit}`], spawn);

  const context = createExecutionContext({
    taskId: `integration-pr-${validated.prNumber}`,
    issueNumber: validated.issueNumber,
    workerId,
    baseSha: validated.headSha,
    workspaceRoot,
    timeoutMs,
  });

  const ready = createDisposableWorkspace({ repoRoot, context, spawn });
  return Object.freeze({ ...ready, target: validated });
}

export function reconcileAgainstCanonicalMain({ repoRoot, context, canonicalMainSha, spawn = spawnSync }) {
  if (!SHA.test(String(canonicalMainSha || ''))) throw new Error('V4_INTEGRATION_INVALID_CANONICAL_SHA');
  runGit(repoRoot, ['cat-file', '-e', `${canonicalMainSha}^{commit}`], spawn);
  const base = runGit(context.workspacePath, ['merge-base', 'HEAD', canonicalMainSha], spawn);
  if (!SHA.test(base)) throw new Error('V4_INTEGRATION_MERGE_BASE_UNRESOLVED');

  const merge = spawn('git', ['-C', context.workspacePath, 'merge', '--no-commit', '--no-ff', canonicalMainSha], { encoding: 'utf8' });
  const output = `${merge.stdout || ''}\n${merge.stderr || ''}`.trim();
  if (merge.status !== 0) {
    return Object.freeze({ ok: false, conflict: true, mergeBase: base, output });
  }
  return Object.freeze({ ok: true, conflict: false, mergeBase: base, output });
}

export function assertPushTarget({ context, remoteRepoFullName, branchName }) {
  if (remoteRepoFullName !== context.target.canonicalRepoFullName) throw new Error('V4_INTEGRATION_PUSH_REPO_MISMATCH');
  if (branchName !== context.target.headBranch) throw new Error('V4_INTEGRATION_PUSH_BRANCH_MISMATCH');
  return true;
}

export function cleanupIntegrationWorkspace({ repoRoot, context, spawn = spawnSync }) {
  return cleanupDisposableWorkspace({ repoRoot, context, spawn });
}
