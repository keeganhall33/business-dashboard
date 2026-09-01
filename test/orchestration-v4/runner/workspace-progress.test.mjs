import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createWorkspaceProgressObserver } from '../../../scripts/orchestration-v4/runner/workspace-progress.mjs';

function git(cwd, ...args) { return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim(); }

test('workspace observer snapshots baseline eagerly and reports only real repository changes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-workspace-progress-'));
  try {
    git(root, 'init');
    git(root, 'config', 'user.email', 'v4@example.test');
    git(root, 'config', 'user.name', 'V4 Test');
    fs.writeFileSync(path.join(root, 'base.txt'), 'base\n');
    git(root, 'add', 'base.txt');
    git(root, 'commit', '-m', 'base');
    const observe = createWorkspaceProgressObserver(root);
    fs.writeFileSync(path.join(root, 'change.txt'), 'changed\n');
    const event = observe('2026-08-30T00:00:00.000Z');
    assert.equal(event.kind, 'WORKTREE_MUTATION');
    assert.match(event.data, /change\.txt/);
    assert.equal(observe(), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
