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

async function complete({ cwd, onEvent }) {
  fs.writeFileSync(path.join(cwd, 'done.txt'), 'done\n');
  onEvent({ kind: 'WORKTREE_MUTATION', observedAt: new Date().toISOString() });
  await new Promise((resolve) => setTimeout(resolve, 5));
  return { status: 'COMPLETE', reason: null };
}

test('two Core tasks use local-a plus Discovery-compatible overflow when Discovery has no ready work', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-elastic-core-'));
  const { repo, sha } = makeRepo(root);
  const db = openV4StateStore(path.join(root, 'state.sqlite'));
  insertReadyTask(db, { taskId: 'core-one', issueNumber: 3001, stream: 'CORE_INTELLIGENCE', baseSha: sha });
  insertReadyTask(db, { taskId: 'core-two', issueNumber: 3002, stream: 'CORE_INTELLIGENCE', baseSha: sha });

  const settled = await runReadyBatch({
    db,
    registry: createSlotRegistry(),
    repoRoot: repo,
    workspaceRoot: path.join(root, 'workspaces'),
    commandsByTaskId: {
      'core-one': { command: 'fixture' },
      'core-two': { command: 'fixture' },
    },
    timeoutMs: 5000,
    stallMs: 1000,
    execute: complete,
  });

  assert.equal(settled.length, 2);
  assert.equal(getTask(db, 'core-one').state, 'COMPLETE');
  assert.equal(getTask(db, 'core-two').state, 'COMPLETE');
  db.close();
  fs.rmSync(root, { recursive: true, force: true });
});

test('ready Discovery work protects local-b from Core overflow', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-elastic-protect-'));
  const { repo, sha } = makeRepo(root);
  const db = openV4StateStore(path.join(root, 'state.sqlite'));
  insertReadyTask(db, { taskId: 'core-one', issueNumber: 3101, stream: 'CORE_INTELLIGENCE', baseSha: sha });
  insertReadyTask(db, { taskId: 'core-two', issueNumber: 3102, stream: 'CORE_INTELLIGENCE', baseSha: sha });
  insertReadyTask(db, { taskId: 'discovery', issueNumber: 3103, stream: 'DISCOVERY_INTELLIGENCE', baseSha: sha });

  const settled = await runReadyBatch({
    db,
    registry: createSlotRegistry(),
    repoRoot: repo,
    workspaceRoot: path.join(root, 'workspaces'),
    commandsByTaskId: {
      'core-one': { command: 'fixture' },
      'core-two': { command: 'fixture' },
      discovery: { command: 'fixture' },
    },
    timeoutMs: 5000,
    stallMs: 1000,
    execute: complete,
  });

  assert.equal(settled.length, 2);
  assert.equal(getTask(db, 'core-one').state, 'COMPLETE');
  assert.equal(getTask(db, 'core-two').state, 'READY');
  assert.equal(getTask(db, 'discovery').state, 'COMPLETE');
  db.close();
  fs.rmSync(root, { recursive: true, force: true });
});
