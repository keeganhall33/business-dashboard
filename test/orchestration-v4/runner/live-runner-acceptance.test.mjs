import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { runLiveRunnerAcceptance } from '../../../scripts/orchestration-v4/runner/live-runner-acceptance.mjs';

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

test('live runner acceptance proves terminal isolation, cleanup, and backfill', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-live-runner-test-'));
  git(root, 'init');
  git(root, 'config', 'user.email', 'v4@test.invalid');
  git(root, 'config', 'user.name', 'V4 Test');
  fs.writeFileSync(path.join(root, 'README.md'), 'v4\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'base');

  try {
    const report = await runLiveRunnerAcceptance({ repoRoot: root });
    assert.equal(report.ok, true);
    assert.equal(report.firstBatchCount, 3);
    assert.equal(report.backfillBatchCount, 1);
    assert.equal(report.states['v4-live-runner-core'], 'COMPLETE');
    assert.equal(report.states['v4-live-runner-discovery'], 'BLOCKED');
    assert.equal(report.states['v4-live-runner-ux'], 'COMPLETE');
    assert.equal(report.states['v4-live-runner-backfill'], 'COMPLETE');
    assert.equal(report.slotsReleased, true);
    assert.equal(report.cleanupOk, true);
    assert.equal(report.semanticProgressOk, true);
    assert.equal(report.noRunnerWorktreesRemain, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
