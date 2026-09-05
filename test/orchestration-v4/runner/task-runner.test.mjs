import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createSlotRegistry } from '../../../scripts/orchestration-v4/slot-scheduler.mjs';
import { openV4StateStore, insertReadyTask, getTask, listCorrectionAttempts } from '../../../scripts/orchestration-v4/state-store/sqlite-store.mjs';
import { runReadyBatch } from '../../../scripts/orchestration-v4/runner/task-runner.mjs';

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

function makeRepo(root) {
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo, { recursive: true });
  git(repo, 'init');
  git(repo, 'config', 'user.email', 'v4@example.test');
  git(repo, 'config', 'user.name', 'V4 Test');
  fs.writeFileSync(path.join(repo, 'README.md'), 'v4\n');
  git(repo, 'add', 'README.md');
  git(repo, 'commit', '-m', 'base');
  return { repo, sha: git(repo, 'rev-parse', 'HEAD') };
}

async function fakeExecute({ cwd, onEvent }) {
  await new Promise((resolve) => setTimeout(resolve, 10));
  fs.writeFileSync(path.join(cwd, 'task-output.txt'), path.basename(cwd));
  onEvent({ kind: 'WORKTREE_MUTATION', observedAt: new Date().toISOString() });
  if (cwd.includes('discovery-task')) return { status: 'BLOCKED', reason: 'FIXTURE_BLOCKED' };
  return { status: 'COMPLETE', reason: null };
}

test('three lanes isolate task workspaces, release slots, and backfill immediately', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-runner-'));
  const workspaceRoot = path.join(root, 'workspaces');
  const { repo, sha } = makeRepo(root);
  const db = openV4StateStore(path.join(root, 'state', 'v4.sqlite'));

  insertReadyTask(db, { taskId: 'core-task', issueNumber: 1001, stream: 'CORE_INTELLIGENCE', baseSha: sha });
  insertReadyTask(db, { taskId: 'discovery-task', issueNumber: 1002, stream: 'DISCOVERY_INTELLIGENCE', baseSha: sha });
  insertReadyTask(db, { taskId: 'ux-task', issueNumber: 1003, stream: 'INTELLIGENCE_UX', baseSha: sha });
  insertReadyTask(db, { taskId: 'core-backfill', issueNumber: 1004, stream: 'CORE_INTELLIGENCE', baseSha: sha });

  const registry = createSlotRegistry();
  const commands = Object.fromEntries(['core-task', 'discovery-task', 'ux-task', 'core-backfill'].map((taskId) => [taskId, { command: 'fixture' }]));

  const first = await runReadyBatch({ db, registry, repoRoot: repo, workspaceRoot, commandsByTaskId: commands, timeoutMs: 5000, stallMs: 1000, execute: fakeExecute });
  assert.equal(first.length, 3);
  assert.equal(getTask(db, 'core-task').state, 'COMPLETE');
  assert.equal(getTask(db, 'discovery-task').state, 'BLOCKED');
  assert.equal(getTask(db, 'ux-task').state, 'COMPLETE');
  assert.equal(getTask(db, 'core-backfill').state, 'READY');

  for (const taskId of ['core-task', 'discovery-task', 'ux-task']) {
    const task = getTask(db, taskId);
    assert.equal(task.slot_id, null);
    assert.equal(task.semantic_progress_seq, 1);
    assert.equal(fs.existsSync(task.workspace_path), false);
  }

  const second = await runReadyBatch({ db, registry, repoRoot: repo, workspaceRoot, commandsByTaskId: commands, timeoutMs: 5000, stallMs: 1000, execute: fakeExecute });
  assert.equal(second.length, 1);
  const backfill = getTask(db, 'core-backfill');
  assert.equal(backfill.state, 'COMPLETE');
  assert.equal(backfill.slot_id, null);
  assert.equal(fs.existsSync(backfill.workspace_path), false);

  const worktreeList = git(repo, 'worktree', 'list', '--porcelain');
  assert.equal(worktreeList.includes(workspaceRoot), false);
  db.close();
  fs.rmSync(root, { recursive: true, force: true });
});

test('integration tasks are never executed by the product/QA runner', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-runner-integration-'));
  const { repo, sha } = makeRepo(root);
  const db = openV4StateStore(path.join(root, 'state.sqlite'));
  insertReadyTask(db, { taskId: 'integration-task', issueNumber: 2001, stream: 'INTEGRATION_RELEASE', baseSha: sha });

  const result = await runReadyBatch({
    db,
    registry: createSlotRegistry(),
    repoRoot: repo,
    workspaceRoot: path.join(root, 'workspaces'),
    commandsByTaskId: { 'integration-task': { command: 'fixture' } },
    timeoutMs: 5000,
    stallMs: 1000,
    execute: fakeExecute,
  });

  assert.equal(result.length, 0);
  assert.equal(getTask(db, 'integration-task').state, 'READY');
  db.close();
  fs.rmSync(root, { recursive: true, force: true });
});

test('finalizer failure preserves successful execution evidence and full finalization diagnostics', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-runner-finalizer-'));
  const { repo, sha } = makeRepo(root);
  const db = openV4StateStore(path.join(root, 'state.sqlite'));
  insertReadyTask(db, { taskId: 'finalizer-task', issueNumber: 2002, stream: 'CORE_INTELLIGENCE', baseSha: sha });

  const settled = await runReadyBatch({
    db,
    registry: createSlotRegistry(),
    repoRoot: repo,
    workspaceRoot: path.join(root, 'workspaces'),
    commandsByTaskId: { 'finalizer-task': { command: 'fixture' } },
    timeoutMs: 5000,
    stallMs: 1000,
    execute: async ({ cwd, onEvent }) => {
      fs.writeFileSync(path.join(cwd, 'task-output.txt'), 'done\n');
      onEvent({ kind: 'WORKTREE_MUTATION', observedAt: new Date().toISOString() });
      return { status: 'COMPLETE', code: 0, stdoutTail: 'model said done', stderrTail: '' };
    },
    finalizeSuccess: async () => ({ ok: false, reason: 'FINALIZER_FIXTURE_FAILURE', diagnostics: { workspacePath: '/tmp/workspace', status: '' } }),
  });

  assert.equal(settled.length, 1);
  assert.equal(settled[0].status, 'rejected');
  const task = getTask(db, 'finalizer-task');
  assert.equal(task.state, 'FAILED');
  assert.equal(task.terminal_reason, 'FINALIZER_FIXTURE_FAILURE');
  const result = JSON.parse(task.result_json);
  assert.equal(result.error, 'FINALIZER_FIXTURE_FAILURE');
  assert.equal(result.execution.status, 'COMPLETE');
  assert.equal(result.execution.code, 0);
  assert.equal(result.execution.stdoutTail, 'model said done');
  assert.deepEqual(result.finalization, { ok: false, reason: 'FINALIZER_FIXTURE_FAILURE', diagnostics: { workspacePath: '/tmp/workspace', status: '' } });
  db.close();
  fs.rmSync(root, { recursive: true, force: true });
});

test('failed unit is corrected in place while its successful sibling is preserved', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-runner-correction-'));
  const { repo, sha } = makeRepo(root);
  const db = openV4StateStore(path.join(root, 'state.sqlite'));
  const contract = { title: 'Correct unit', body: 'body', fileOwnership: 'owned.mjs', taskMutability: 'IMPLEMENTATION_MUTATION_REQUIRED' };
  insertReadyTask(db, { taskId: 'correct-me', issueNumber: 3001, stream: 'CORE_INTELLIGENCE', baseSha: sha, contract });
  insertReadyTask(db, { taskId: 'good-sibling', issueNumber: 3002, stream: 'INTELLIGENCE_UX', baseSha: sha, contract });
  const calls = new Map();
  const execute = async ({ cwd, args, onEvent }) => {
    const id = path.basename(cwd);
    calls.set(id, (calls.get(id) ?? 0) + 1);
    fs.writeFileSync(path.join(cwd, 'task-output.txt'), 'done\n');
    onEvent({ kind: 'WORKTREE_MUTATION', observedAt: new Date().toISOString() });
    if (id.includes('correct-me') && calls.get(id) === 1) return { status: 'FAILED', reason: 'TEST_RED', stderrTail: 'expected green' };
    return { status: 'COMPLETE' };
  };
  const commands = {
    'correct-me': { command: 'fixture', args: ['original'], buildCorrectionAttempt: ({ packet }) => ({ command: 'fixture', args: [packet.reason] }) },
    'good-sibling': { command: 'fixture', args: ['original'] },
  };
  const settled = await runReadyBatch({ db, registry: createSlotRegistry(), repoRoot: repo, workspaceRoot: path.join(root, 'workspaces'), commandsByTaskId: commands, execute, timeoutMs: 5000, stallMs: 1000 });
  assert.equal(settled.length, 2);
  assert.equal(getTask(db, 'correct-me').state, 'COMPLETE');
  assert.equal(getTask(db, 'good-sibling').state, 'COMPLETE');
  assert.equal(listCorrectionAttempts(db, 'correct-me').length, 1);
  const siblingCalls = [...calls.entries()].find(([id]) => id.includes('good-sibling'))[1];
  assert.equal(siblingCalls, 1);
  db.close();
  fs.rmSync(root, { recursive: true, force: true });
});

test('third failed correction stops the loop and requests replanning', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-runner-replan-'));
  const { repo, sha } = makeRepo(root);
  const db = openV4StateStore(path.join(root, 'state.sqlite'));
  const contract = { title: 'Replan unit', body: 'body', fileOwnership: 'owned.mjs', taskMutability: 'IMPLEMENTATION_MUTATION_REQUIRED' };
  insertReadyTask(db, { taskId: 'replan-me', issueNumber: 3003, stream: 'CORE_INTELLIGENCE', baseSha: sha, contract });
  let calls = 0;
  await runReadyBatch({
    db, registry: createSlotRegistry(), repoRoot: repo, workspaceRoot: path.join(root, 'workspaces'),
    commandsByTaskId: { 'replan-me': { command: 'fixture', buildCorrectionAttempt: () => ({ command: 'fixture', args: [] }) } },
    execute: async () => { calls += 1; return { status: 'FAILED', reason: 'STILL_RED', stderrTail: 'same failure' }; },
    timeoutMs: 5000, stallMs: 1000,
  });
  assert.equal(calls, 3);
  assert.equal(getTask(db, 'replan-me').state, 'BLOCKED');
  assert.equal(getTask(db, 'replan-me').terminal_reason, 'REPLAN_REQUIRED');
  assert.equal(listCorrectionAttempts(db, 'replan-me').length, 3);
  db.close();
  fs.rmSync(root, { recursive: true, force: true });
});
