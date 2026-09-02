import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { collectZeroMutationDiagnostics } from '../../../scripts/orchestration-v4/production/publisher.mjs';

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

test('collectZeroMutationDiagnostics captures exact workspace, git state, ownership and bounded recent files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-publisher-diag-'));
  try {
    const canonicalRoot = fs.realpathSync(root);
    git(root, 'init');
    git(root, 'config', 'user.name', 'Test');
    git(root, 'config', 'user.email', 'test@example.invalid');
    fs.writeFileSync(path.join(root, 'tracked.txt'), 'tracked\n');
    git(root, 'add', 'tracked.txt');
    git(root, 'commit', '-m', 'base');

    fs.mkdirSync(path.join(root, 'tmp'), { recursive: true });
    fs.writeFileSync(path.join(root, 'tmp', 'v4-smoke-fixture.txt'), 'ORCHESTRATION_V4_LIVE_SMOKE_PASS\n');

    const diagnostics = collectZeroMutationDiagnostics({
      workspacePath: root,
      fileOwnership: 'tmp/v4-smoke-fixture.txt, missing.txt',
    });

    assert.equal(diagnostics.workspacePath, canonicalRoot);
    assert.equal(diagnostics.gitTopLevel, canonicalRoot);
    assert.match(diagnostics.headSha, /^[0-9a-f]{40}$/);
    assert.match(diagnostics.gitStatusPorcelain, /tmp\/v4-smoke-fixture\.txt/);
    assert.deepEqual(diagnostics.ownedPaths.map((entry) => [entry.path, entry.exists]), [
      ['tmp/v4-smoke-fixture.txt', true],
      ['missing.txt', false],
    ]);
    assert.ok(diagnostics.recentWorkspaceFiles.length <= 30);
    assert.ok(diagnostics.recentWorkspaceFiles.some((entry) => entry.path === 'tmp/v4-smoke-fixture.txt'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
