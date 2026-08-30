import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  assertPushTarget,
  cleanupIntegrationWorkspace,
  prepareIntegrationWorkspace,
  reconcileAgainstCanonicalMain,
  validateIntegrationTarget,
} from '../../../scripts/orchestration-v4/integration/reconciler.mjs';

function git(cwd, ...args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return String(result.stdout || '').trim();
}

function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-int-'));
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  git(repo, 'init');
  git(repo, 'config', 'user.email', 'v4@test.invalid');
  git(repo, 'config', 'user.name', 'V4 Test');
  fs.writeFileSync(path.join(repo, 'base.txt'), 'base\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'base');
  return { root, repo };
}

test('integration workspace starts from exact PR head and ignores persistent local-e state', () => {
  const { root, repo } = makeRepo();
  const headSha = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'branch', 'issue-861-worker');

  const target = {
    issueNumber: 960,
    prNumber: 705,
    headSha,
    headBranch: 'issue-677-decision-room-conversation-revision-ux',
    headRepoFullName: 'keeganhall33/business-dashboard',
    canonicalRepoFullName: 'keeganhall33/business-dashboard',
  };

  try {
    const context = prepareIntegrationWorkspace({ repoRoot: repo, workspaceRoot: path.join(root, 'ws'), timeoutMs: 60000, target });
    assert.equal(context.workspaceHead, headSha);
    assert.equal(context.workerId, 'local-e');
    assert.notEqual(context.workspacePath, repo);
    assert.equal(assertPushTarget({ context, remoteRepoFullName: target.canonicalRepoFullName, branchName: target.headBranch }), true);
    cleanupIntegrationWorkspace({ repoRoot: repo, context });
    assert.equal(fs.existsSync(context.workspacePath), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('cross-repo targets and wrong push branches fail closed', () => {
  const good = {
    issueNumber: 960,
    prNumber: 705,
    headSha: 'a'.repeat(40),
    headBranch: 'target-pr-branch',
    headRepoFullName: 'keeganhall33/business-dashboard',
    canonicalRepoFullName: 'keeganhall33/business-dashboard',
  };
  assert.throws(() => validateIntegrationTarget({ ...good, headRepoFullName: 'other/repo' }), /CROSS_REPO_FORBIDDEN/);
  const fakeContext = { target: good };
  assert.throws(() => assertPushTarget({ context: fakeContext, remoteRepoFullName: good.canonicalRepoFullName, branchName: 'synthetic-worker-branch' }), /PUSH_BRANCH_MISMATCH/);
});

test('reconcile reports conflicts instead of mutating unrelated state', () => {
  const { root, repo } = makeRepo();
  const base = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'checkout', '-b', 'pr-head');
  fs.writeFileSync(path.join(repo, 'base.txt'), 'pr\n');
  git(repo, 'commit', '-am', 'pr');
  const prHead = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'checkout', '-b', 'main-side', base);
  fs.writeFileSync(path.join(repo, 'base.txt'), 'main\n');
  git(repo, 'commit', '-am', 'main');
  const mainSha = git(repo, 'rev-parse', 'HEAD');

  try {
    const context = prepareIntegrationWorkspace({
      repoRoot: repo,
      workspaceRoot: path.join(root, 'ws'),
      timeoutMs: 60000,
      target: {
        issueNumber: 960,
        prNumber: 705,
        headSha: prHead,
        headBranch: 'pr-head',
        headRepoFullName: 'keeganhall33/business-dashboard',
        canonicalRepoFullName: 'keeganhall33/business-dashboard',
      },
    });
    const result = reconcileAgainstCanonicalMain({ repoRoot: repo, context, canonicalMainSha: mainSha });
    assert.equal(result.ok, false);
    assert.equal(result.conflict, true);
    assert.match(result.mergeBase, /^[0-9a-f]{40}$/);
    cleanupIntegrationWorkspace({ repoRoot: repo, context });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
