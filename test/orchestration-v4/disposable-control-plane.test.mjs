import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { V4_STATES, assertTransition, transition } from '../../scripts/orchestration-v4/state-machine.mjs';
import { createExecutionContext } from '../../scripts/orchestration-v4/execution-context.mjs';
import { createDisposableWorkspace, cleanupDisposableWorkspace } from '../../scripts/orchestration-v4/disposable-workspace.mjs';
import { applyProgress } from '../../scripts/orchestration-v4/progress.mjs';

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

function tempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-v4-test-'));
  git(root, 'init');
  git(root, 'config', 'user.email', 'orchestration-v4@test.invalid');
  git(root, 'config', 'user.name', 'Orchestration V4 Test');
  fs.writeFileSync(path.join(root, 'README.md'), 'base\n');
  git(root, 'add', 'README.md');
  git(root, 'commit', '-m', 'base');
  return root;
}

test('state machine fails closed and terminal states are immutable', () => {
  assert.equal(assertTransition(V4_STATES.READY, V4_STATES.CLAIMED), true);
  assert.throws(() => assertTransition(V4_STATES.READY, V4_STATES.COMPLETE), /V4_INVALID_TRANSITION/);
  assert.throws(() => assertTransition(V4_STATES.COMPLETE, V4_STATES.READY), /V4_TERMINAL_STATE_IMMUTABLE/);

  const claimed = transition({ state: V4_STATES.READY }, V4_STATES.CLAIMED, { updatedAt: '2026-08-30T00:00:00.000Z' });
  assert.equal(claimed.state, V4_STATES.CLAIMED);
});

test('three tasks share one immutable base SHA without sharing worktree state', () => {
  const repoRoot = tempRepo();
  const workspaceRoot = path.join(path.dirname(repoRoot), `${path.basename(repoRoot)}-workspaces`);
  const baseSha = git(repoRoot, 'rev-parse', 'HEAD');

  git(repoRoot, 'branch', 'stale-worker-branch', baseSha);
  fs.writeFileSync(path.join(repoRoot, 'README.md'), 'new main\n');
  git(repoRoot, 'add', 'README.md');
  git(repoRoot, 'commit', '-m', 'new main');
  const canonicalSha = git(repoRoot, 'rev-parse', 'HEAD');

  const contexts = ['local-a', 'local-b', 'local-c'].map((workerId, index) => createExecutionContext({
    taskId: `task-${index + 1}`,
    issueNumber: 100 + index,
    workerId,
    baseSha: canonicalSha,
    workspaceRoot,
    now: new Date('2026-08-30T00:00:00.000Z'),
    timeoutMs: 60_000,
  }));

  const workspaces = contexts.map((context) => createDisposableWorkspace({ repoRoot, context }));
  try {
    assert.equal(new Set(workspaces.map((w) => w.workspacePath)).size, 3);
    assert.deepEqual(new Set(workspaces.map((w) => w.workspaceHead)), new Set([canonicalSha]));

    fs.writeFileSync(path.join(workspaces[0].workspacePath, 'task-a.txt'), 'only a\n');
    assert.equal(fs.existsSync(path.join(workspaces[1].workspacePath, 'task-a.txt')), false);
    assert.equal(fs.existsSync(path.join(workspaces[2].workspacePath, 'task-a.txt')), false);

    assert.notEqual(baseSha, canonicalSha);
    assert.equal(git(repoRoot, 'rev-parse', 'stale-worker-branch'), baseSha);
    assert.equal(workspaces[0].workspaceHead, canonicalSha);
  } finally {
    for (const context of contexts) cleanupDisposableWorkspace({ repoRoot, context });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('cleanup is task-scoped and idempotent', () => {
  const repoRoot = tempRepo();
  const workspaceRoot = path.join(path.dirname(repoRoot), `${path.basename(repoRoot)}-workspaces`);
  const baseSha = git(repoRoot, 'rev-parse', 'HEAD');
  const one = createExecutionContext({ taskId: 'one', issueNumber: 1, workerId: 'local-a', baseSha, workspaceRoot, timeoutMs: 1000 });
  const two = createExecutionContext({ taskId: 'two', issueNumber: 2, workerId: 'local-b', baseSha, workspaceRoot, timeoutMs: 1000 });

  createDisposableWorkspace({ repoRoot, context: one });
  createDisposableWorkspace({ repoRoot, context: two });
  cleanupDisposableWorkspace({ repoRoot, context: one });
  cleanupDisposableWorkspace({ repoRoot, context: one });
  assert.equal(fs.existsSync(one.workspacePath), false);
  assert.equal(fs.existsSync(two.workspacePath), true);

  cleanupDisposableWorkspace({ repoRoot, context: two });
  fs.rmSync(workspaceRoot, { recursive: true, force: true });
  fs.rmSync(repoRoot, { recursive: true, force: true });
});

test('read-only telemetry cannot advance semantic progress', () => {
  const start = { semanticProgressSequence: 0, lastSemanticProgressAt: null };
  const telemetry = applyProgress(start, { kind: 'GIT_READ_STATUS' }, '2026-08-30T00:00:01.000Z');
  assert.equal(telemetry.semanticProgressSequence, 0);
  assert.equal(telemetry.lastSemanticProgressAt, null);

  const mutation = applyProgress(telemetry, { kind: 'WORKTREE_MUTATION' }, '2026-08-30T00:00:02.000Z');
  assert.equal(mutation.semanticProgressSequence, 1);
  assert.equal(mutation.lastSemanticProgressAt, '2026-08-30T00:00:02.000Z');
});
