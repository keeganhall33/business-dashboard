import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { runLiveThreeLaneAcceptance } from '../../scripts/orchestration-v4/live-three-lane-acceptance.mjs';

function git(cwd, ...args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return String(result.stdout || '').trim();
}

test('three lanes use isolated disposable workspaces from the same exact SHA and clean up', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-live-test-'));
  const repo = path.join(root, 'repo');
  const workspaces = path.join(root, 'workspaces');
  fs.mkdirSync(repo);
  git(repo, 'init');
  git(repo, 'config', 'user.email', 'v4@test.invalid');
  git(repo, 'config', 'user.name', 'V4 Test');
  fs.writeFileSync(path.join(repo, 'README.md'), 'base\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'base');
  const baseSha = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'update-ref', 'refs/remotes/origin/main', baseSha);

  try {
    const report = runLiveThreeLaneAcceptance({ repoRoot: repo, workspaceRoot: workspaces });
    assert.equal(report.ok, true);
    assert.equal(report.baseSha, baseSha);
    assert.equal(report.lanes.length, 3);
    assert.deepEqual(new Set(report.lanes.map((lane) => lane.workerId)), new Set(['local-a', 'local-b', 'local-c']));
    assert.deepEqual(new Set(report.lanes.map((lane) => lane.workspaceHead)), new Set([baseSha]));
    assert.equal(fs.existsSync(workspaces), false);
    assert.equal(git(repo, 'worktree', 'list', '--porcelain').includes('jeeves-orchestration-v4-live'), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('persistent worker branch names and heads do not participate in V4 acceptance', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-live-stale-'));
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  git(repo, 'init');
  git(repo, 'config', 'user.email', 'v4@test.invalid');
  git(repo, 'config', 'user.name', 'V4 Test');
  fs.writeFileSync(path.join(repo, 'base.txt'), 'one\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'old');
  git(repo, 'branch', 'issue-935-worker');
  fs.writeFileSync(path.join(repo, 'base.txt'), 'two\n');
  git(repo, 'commit', '-am', 'current');
  const current = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'update-ref', 'refs/remotes/origin/main', current);

  try {
    const report = runLiveThreeLaneAcceptance({ repoRoot: repo, workspaceRoot: path.join(root, 'ws') });
    assert.equal(report.baseSha, current);
    assert.ok(report.lanes.every((lane) => lane.workspaceHead === current));
    assert.equal(git(repo, 'rev-parse', 'issue-935-worker') === current, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
