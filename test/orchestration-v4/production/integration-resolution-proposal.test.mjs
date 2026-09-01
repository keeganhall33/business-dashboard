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

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-proposal-'));
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
  const base = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'push', '-u', 'origin', 'main');

  git(repo, 'checkout', '-b', 'pr-branch', base);
  fs.writeFileSync(path.join(repo, 'shared.txt'), 'pr\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'pr');
  const prHead = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'push', '-u', 'origin', 'pr-branch');

  git(repo, 'checkout', 'main');
  fs.writeFileSync(path.join(repo, 'shared.txt'), 'main\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'main');
  const mainSha = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'push', 'origin', 'main');

  const fakeGh = path.join(root, 'fake-gh');
  fs.writeFileSync(fakeGh, `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({number:77,headRefName:'pr-branch',headRefOid:'${prHead}',headRepositoryOwner:{login:'keeganhall33'},headRepository:{name:'business-dashboard'}}));\n`, { mode: 0o755 });
  fs.chmodSync(fakeGh, 0o755);

  const db = openV4StateStore(path.join(root, 'state.sqlite'));
  insertReadyTask(db, {
    taskId: 'proposal-task',
    issueNumber: 9100,
    stream: 'INTEGRATION_RELEASE',
    baseSha: mainSha,
    contract: {
      title: 'Reconcile PR #77',
      body: 'Target PR #77 and preserve both compatible intentions.',
      fileOwnership: 'shared.txt',
      taskMutability: 'IMPLEMENTATION_MUTATION_REQUIRED',
    },
  });
  return { root, remote, repo, db, fakeGh, prHead, mainSha };
}

function cleanup(f) {
  try { f.db.close(); } catch {}
  fs.rmSync(f.root, { recursive: true, force: true });
}

test('deterministic proposal is applied, staged, committed, and pushed without resolver filesystem mutation', async () => {
  const f = fixture();
  try {
    const result = await runIntegrationTask({
      db: f.db,
      repoRoot: f.repo,
      repoFullName: 'keeganhall33/business-dashboard',
      workspaceRoot: path.join(f.root, 'workspaces'),
      taskId: 'proposal-task',
      canonicalMainSha: f.mainSha,
      resolverCommand: 'proposal-resolver',
      gh: f.fakeGh,
      timeoutMs: 60_000,
      stallMs: 30_000,
      executeResolver: async () => ({
        status: 'COMPLETE',
        code: 0,
        reason: null,
        stdoutTail: `V4_RESOLUTION ${JSON.stringify({ files: [{ path: 'shared.txt', content: 'resolved\n' }] })}\n`,
      }),
    });
    assert.equal(result.state, 'COMPLETE');
    const stored = getTask(f.db, 'proposal-task');
    const payload = JSON.parse(stored.result_json);
    assert.equal(payload.pushed, true);
    assert.equal(payload.duplicatePrCreated, false);
    assert.equal(payload.workspacePreserved, false);
    git(f.repo, 'fetch', 'origin', 'pr-branch');
    const remoteHead = git(f.repo, 'rev-parse', 'FETCH_HEAD');
    assert.equal(remoteHead, payload.headSha);
    assert.notEqual(remoteHead, f.prHead);
    assert.equal(git(f.repo, 'show', `${remoteHead}:shared.txt`), 'resolved');
    assert.equal(spawnSync('git', ['-C', f.repo, 'merge-base', '--is-ancestor', f.mainSha, remoteHead]).status, 0);
  } finally { cleanup(f); }
});

test('proposal cannot write a path that is not currently conflicted', async () => {
  const f = fixture();
  try {
    await assert.rejects(() => runIntegrationTask({
      db: f.db,
      repoRoot: f.repo,
      repoFullName: 'keeganhall33/business-dashboard',
      workspaceRoot: path.join(f.root, 'workspaces'),
      taskId: 'proposal-task',
      canonicalMainSha: f.mainSha,
      resolverCommand: 'proposal-resolver',
      gh: f.fakeGh,
      timeoutMs: 60_000,
      stallMs: 30_000,
      executeResolver: async () => ({
        status: 'COMPLETE',
        code: 0,
        reason: null,
        stdoutTail: `V4_RESOLUTION ${JSON.stringify({ files: [{ path: 'other.txt', content: 'bad\n' }] })}\n`,
      }),
    }), /V4_INTEGRATION_RESOLUTION_PROPOSAL_PATH_NOT_CONFLICTED/);
    const stored = getTask(f.db, 'proposal-task');
    assert.equal(stored.state, 'FAILED');
    assert.equal(git(f.remote, 'rev-parse', 'refs/heads/pr-branch'), f.prHead);
    assert.equal(fs.existsSync(stored.workspace_path), true);
  } finally { cleanup(f); }
});
