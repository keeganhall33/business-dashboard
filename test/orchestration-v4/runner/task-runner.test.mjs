import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createSlotRegistry } from '../../../scripts/orchestration-v4/slot-scheduler.mjs';
import { openV4StateStore, insertReadyTask, getTask } from '../../../scripts/orchestration-v4/state-store/sqlite-store.mjs';
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
