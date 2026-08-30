import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { runSixSlotSoak } from '../../../scripts/orchestration-v4/cutover/six-slot-soak.mjs';

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

test('six-slot two-wave soak proves reuse, isolation, and cleanup', async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-six-slot-test-'));
  git(repo, 'init');
  git(repo, 'config', 'user.email', 'v4@test.invalid');
  git(repo, 'config', 'user.name', 'V4 Test');
  fs.writeFileSync(path.join(repo, 'README.md'), 'v4\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'base');

  try {
    const report = await runSixSlotSoak({ repoRoot: repo });
    assert.equal(report.ok, true);
    assert.equal(report.waves, 2);
    assert.equal(report.throughput, 12);
    assert.equal(report.completeCount, 11);
    assert.equal(report.blockedCount, 1);
    assert.deepEqual(report.slotReuse, {
      'local-a': 2,
      'local-b': 2,
      'local-c': 2,
      'local-d': 2,
      'local-e': 2,
      'local-f': 2,
    });
    assert.equal(report.states['wave1-discovery'], 'BLOCKED');
    assert.equal(report.states['wave2-discovery'], 'COMPLETE');
    assert.equal(report.states['wave1-integration'], 'COMPLETE');
    assert.equal(report.states['wave2-integration'], 'COMPLETE');
    assert.equal(report.slotsReleased, true);
    assert.equal(report.semanticProgressOk, true);
    assert.equal(report.cleanupOk, true);
    assert.equal(report.noSoakWorktreesRemain, true);
    assert.equal(report.persistentWorkerGitStateCreated, false);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
