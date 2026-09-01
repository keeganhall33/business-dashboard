import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { runIntegrationTask } from '../../../scripts/orchestration-v4/production/integration-executor.mjs';
import { getTask, insertReadyTask, openV4StateStore } from '../../../scripts/orchestration-v4/state-store/sqlite-store.mjs';

function git(cwd, ...args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(String(result.stderr || result.stdout || '').trim());
  return String(result.stdout || '').trim();
}

function writeExecutable(file, content) {
  fs.writeFileSync(file, content, { mode: 0o755 });
  fs.chmodSync(file, 0o755);
}

function makeIntegrationFixture({ conflict = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-int-exec-'));
  const remote = path.join(root, 'remote.git');
  const repo = path.join(root, 'repo');
  fs.mkdirSync(remote);
  fs.mkdirSync(repo);
  git(remote, 'init', '--bare');
  git(repo, 'init');
  git(repo, 'config', 'user.email', 'v4@test.invalid');
  git(repo, 'config', 'user.name', 'V4 Test');
  git(repo, 'branch', '-M', 'main');
  git(repo, 'remote', 'add', 'origin', remote);

  fs.writeFileSync(path.join(repo, 'shared.txt'), 'base\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'base');
  const baseSha = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'push', '-u', 'origin', 'main');

  git(repo, 'checkout', '-b', 'pr-branch', baseSha);
  fs.writeFileSync(path.join(repo, 'shared.txt'), conflict ? 'pr\n' : 'base\n');
  fs.writeFileSync(path.join(repo, 'pr-only.txt'), 'pr\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'pr change');
  const prHead = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'push', '-u', 'origin', 'pr-branch');

  git(repo, 'checkout', 'main');
  fs.writeFileSync(path.join(repo, 'shared.txt'), 'main\n');
  fs.writeFileSync(path.join(repo, 'main-only.txt'), 'main\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'main change');
  const mainSha = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'push', 'origin', 'main');

  const fakeGh = path.join(root, 'fake-gh');
  writeExecutable(fakeGh, `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({number:77,headRefName:'pr-branch',headRefOid:'${prHead}',headRepositoryOwner:{login:'keeganhall33'},headRepository:{name:'business-dashboard'}}));\n`);

  const db = openV4StateStore(path.join(root, 'state.sqlite'));
  insertReadyTask(db, {
    taskId: conflict ? 'integration-conflict' : 'integration-clean',
    issueNumber: conflict ? 9001 : 9002,
    stream: 'INTEGRATION_RELEASE',
    baseSha: mainSha,
    contract: {
      title: 'Reconcile PR #77',
      body: 'Target PR #77 and preserve the PR behavior while integrating current main.',
      fileOwnership: 'shared.txt,pr-only.txt,main-only.txt',
      taskMutability: 'IMPLEMENTATION_MUTATION_REQUIRED',
    },
  });

  return { root, remote, repo, db, fakeGh, baseSha, prHead, mainSha, taskId: conflict ? 'integration-conflict' : 'integration-clean' };
}

function cleanup(fixture) {
  try { fixture.db.close(); } catch {}
  fs.rmSync(fixture.root, { recursive: true, force: true });
}

test('integration conflict invokes resolver, commits merge, pushes original PR branch, and cleans successful workspace', async () => {
  const fixture = makeIntegrationFixture({ conflict: true });
  try {
    let resolverCalls = 0;
    const result = await runIntegrationTask({
      db: fixture.db,
      repoRoot: fixture.repo,
      repoFullName: 'keeganhall33/business-dashboard',
      workspaceRoot: path.join(fixture.root, 'workspaces'),
      taskId: fixture.taskId,
      canonicalMainSha: fixture.mainSha,
      resolverCommand: 'fake-resolver',
      gh: fixture.fakeGh,
      timeoutMs: 60_000,
      stallMs: 30_000,
      executeResolver: async ({ cwd }) => {
        resolverCalls += 1;
        fs.writeFileSync(path.join(cwd, 'shared.txt'), 'resolved\n');
        git(cwd, 'add', 'shared.txt');
        return { status: 'COMPLETE', code: 0, reason: null };
      },
    });

    assert.equal(resolverCalls, 1);
    assert.equal(result.state, 'COMPLETE');
    const stored = getTask(fixture.db, fixture.taskId);
    const payload = JSON.parse(stored.result_json);
    assert.equal(payload.reconciliation, 'RESOLVED');
    assert.equal(payload.pushed, true);
    assert.equal(payload.duplicatePrCreated, false);
    assert.equal(payload.workspacePreserved, false);
    assert.match(payload.headSha, /^[0-9a-f]{40}$/);
    assert.notEqual(payload.headSha, fixture.prHead);
    assert.equal(fs.existsSync(stored.workspace_path), false);

    git(fixture.repo, 'fetch', 'origin', 'pr-branch');
    assert.equal(git(fixture.repo, 'rev-parse', 'FETCH_HEAD'), payload.headSha);
    const ancestor = spawnSync('git', ['-C', fixture.repo, 'merge-base', '--is-ancestor', fixture.mainSha, payload.headSha]);
    assert.equal(ancestor.status, 0);
  } finally {
    cleanup(fixture);
  }
});

test('clean integration commits and pushes canonical main without invoking resolver', async () => {
  const fixture = makeIntegrationFixture({ conflict: false });
  try {
    let resolverCalls = 0;
    const result = await runIntegrationTask({
      db: fixture.db,
      repoRoot: fixture.repo,
      repoFullName: 'keeganhall33/business-dashboard',
      workspaceRoot: path.join(fixture.root, 'workspaces'),
      taskId: fixture.taskId,
      canonicalMainSha: fixture.mainSha,
      resolverCommand: 'fake-resolver',
      gh: fixture.fakeGh,
      timeoutMs: 60_000,
      stallMs: 30_000,
      executeResolver: async () => {
        resolverCalls += 1;
        return { status: 'COMPLETE', code: 0, reason: null };
      },
    });

    assert.equal(resolverCalls, 0);
    assert.equal(result.state, 'COMPLETE');
    const payload = JSON.parse(getTask(fixture.db, fixture.taskId).result_json);
    assert.equal(payload.reconciliation, 'CLEAN');
    assert.equal(payload.pushed, true);
    git(fixture.repo, 'fetch', 'origin', 'pr-branch');
    assert.equal(git(fixture.repo, 'rev-parse', 'FETCH_HEAD'), payload.headSha);
    const ancestor = spawnSync('git', ['-C', fixture.repo, 'merge-base', '--is-ancestor', fixture.mainSha, payload.headSha]);
    assert.equal(ancestor.status, 0);
  } finally {
    cleanup(fixture);
  }
});

test('failed conflict resolution preserves workspace and does not move the PR branch', async () => {
  const fixture = makeIntegrationFixture({ conflict: true });
  try {
    const result = await runIntegrationTask({
      db: fixture.db,
      repoRoot: fixture.repo,
      repoFullName: 'keeganhall33/business-dashboard',
      workspaceRoot: path.join(fixture.root, 'workspaces'),
      taskId: fixture.taskId,
      canonicalMainSha: fixture.mainSha,
      resolverCommand: 'fake-resolver',
      gh: fixture.fakeGh,
      timeoutMs: 60_000,
      stallMs: 30_000,
      executeResolver: async () => ({ status: 'BLOCKED', code: null, reason: 'NEEDS_CONTEXT' }),
    });

    assert.equal(result.state, 'BLOCKED');
    const stored = getTask(fixture.db, fixture.taskId);
    const payload = JSON.parse(stored.result_json);
    assert.equal(payload.reconciliation, 'CONFLICT');
    assert.equal(payload.workspacePreserved, true);
    assert.equal(fs.existsSync(stored.workspace_path), true);
    assert.equal(git(fixture.remote, 'rev-parse', 'refs/heads/pr-branch'), fixture.prHead);
  } finally {
    cleanup(fixture);
  }
});
