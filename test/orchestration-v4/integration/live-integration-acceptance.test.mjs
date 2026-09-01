import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { runLiveIntegrationAcceptance } from '../../../scripts/orchestration-v4/integration/live-integration-acceptance.mjs';

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

test('referenced PR head reconciles in disposable local-e workspace without duplicate PR state', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-live-integration-test-'));
  git(repo, 'init');
  git(repo, 'config', 'user.email', 'v4@test.invalid');
  git(repo, 'config', 'user.name', 'V4 Test');
  fs.writeFileSync(path.join(repo, 'base.txt'), 'base\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'base');
  const base = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'checkout', '-b', 'target-pr');
  fs.writeFileSync(path.join(repo, 'pr.txt'), 'change\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'pr change');
  const head = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'checkout', '--detach', base);

  try {
    const report = runLiveIntegrationAcceptance({
      repoRoot: repo,
      issueNumber: 971,
      prNumber: 970,
      headSha: head,
      headBranch: 'target-pr',
      canonicalMainSha: base,
      repoFullName: 'keeganhall33/business-dashboard',
    });
    assert.equal(report.ok, true);
    assert.equal(report.workspaceHead, head);
    assert.equal(report.reconciliation, 'CLEAN');
    assert.equal(report.pushTargetValidated, true);
    assert.equal(report.duplicatePrCreated, false);
    assert.equal(git(repo, 'worktree', 'list', '--porcelain').includes('jeeves-orchestration-v4-live-integration'), false);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
