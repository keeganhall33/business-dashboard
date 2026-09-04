import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createWorkspaceProgressObserver } from '../../../scripts/orchestration-v4/runner/workspace-progress.mjs';

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

function withRepo(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-workspace-progress-'));
  try {
    git(root, 'init');
    git(root, 'config', 'user.email', 'v4@example.test');
    git(root, 'config', 'user.name', 'V4 Test');
    fs.writeFileSync(path.join(root, 'base.txt'), 'base\n');
    git(root, 'add', 'base.txt');
    git(root, 'commit', '-m', 'base');
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('clean workspace is unchanged until tracked content mutates', () => withRepo((root) => {
  const observe = createWorkspaceProgressObserver(root);
  assert.equal(observe(), null);

  fs.writeFileSync(path.join(root, 'base.txt'), 'first edit\n');
  const first = observe('2026-09-04T00:00:00.000Z');
  assert.equal(first.kind, 'WORKTREE_MUTATION');

  fs.writeFileSync(path.join(root, 'base.txt'), 'second edit\n');
  const second = observe('2026-09-04T00:00:01.000Z');
  assert.equal(second.kind, 'WORKTREE_MUTATION');
  assert.notEqual(second.data, first.data);
  assert.equal(observe(), null);
}));

test('untracked creation and later content edit are separately observable', () => withRepo((root) => {
  const observe = createWorkspaceProgressObserver(root);
  const file = path.join(root, 'new.txt');

  fs.writeFileSync(file, 'one\n');
  const created = observe();
  assert.equal(created.kind, 'WORKTREE_MUTATION');

  fs.writeFileSync(file, 'two\n');
  const edited = observe();
  assert.equal(edited.kind, 'WORKTREE_MUTATION');
  assert.notEqual(edited.data, created.data);
  assert.equal(observe(), null);
}));

test('HEAD changes are observable', () => withRepo((root) => {
  const observe = createWorkspaceProgressObserver(root);
  fs.writeFileSync(path.join(root, 'committed.txt'), 'next\n');
  git(root, 'add', 'committed.txt');
  git(root, 'commit', '-m', 'next');

  const event = observe();
  assert.equal(event.kind, 'WORKTREE_MUTATION');
  assert.equal(JSON.parse(event.data).head, git(root, 'rev-parse', 'HEAD'));
}));

test('event evidence contains hashes and metadata, not source or secrets', () => withRepo((root) => {
  const secret = 'SUPER_SECRET_SENTINEL_1195';
  const observe = createWorkspaceProgressObserver(root);
  fs.writeFileSync(path.join(root, 'base.txt'), `${secret}\nsource body that must not leak\n`);

  const event = observe();
  const data = JSON.parse(event.data);
  assert.match(data.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(data.changedFileCount, 1);
  assert.doesNotMatch(event.data, /SUPER_SECRET_SENTINEL_1195/);
  assert.doesNotMatch(event.data, /source body that must not leak/);
}));
