import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { insertReadyTask } from '../../../scripts/orchestration-v4/state-store/sqlite-store.mjs';
import { defaultOpenClawConfigPath, runLiveProductionSmoke } from '../../../scripts/orchestration-v4/production/live-production-smoke.mjs';

test('default OpenClaw config path uses openclaw.json and honors OPENCLAW_CONFIG_PATH', () => {
  const previous = process.env.OPENCLAW_CONFIG_PATH;
  try {
    delete process.env.OPENCLAW_CONFIG_PATH;
    assert.equal(defaultOpenClawConfigPath(), path.join(os.homedir(), '.openclaw', 'openclaw.json'));
    process.env.OPENCLAW_CONFIG_PATH = '/tmp/custom-openclaw.json';
    assert.equal(defaultOpenClawConfigPath(), '/tmp/custom-openclaw.json');
  } finally {
    if (previous === undefined) delete process.env.OPENCLAW_CONFIG_PATH;
    else process.env.OPENCLAW_CONFIG_PATH = previous;
  }
});

test('live production smoke validates one complete published fixture task without touching V3', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-smoke-test-'));
  try {
    const baseSha = 'a'.repeat(40);
    const report = await runLiveProductionSmoke({
      repoRoot: root,
      issueNumber: 1234,
      configPath: path.join(root, 'config.json'),
      tempRoot: path.join(root, 'smoke'),
      loadIssue: async () => ({ number: 1234, title: 'Smoke fixture', body: 'fixture body', labels: [{ name: 'agent-orchestration' }, { name: 'orch:ready' }], state: 'OPEN' }),
      poll: async ({ db }) => {
        insertReadyTask(db, { taskId: 'smoke-1234', issueNumber: 1234, stream: 'CORE_INTELLIGENCE', baseSha, contract: { title: 'Smoke fixture', body: 'fixture body', taskMutability: 'IMPLEMENTATION_MUTATION_REQUIRED', fileOwnership: 'tmp/v4-smoke.txt' } });
        db.prepare("UPDATE tasks SET state='COMPLETE', semantic_progress_seq=2, result_json=? WHERE task_id=?").run(JSON.stringify({ publicationRequired: true, prNumber: 4321, prUrl: 'https://example.invalid/pr/4321', headSha: 'b'.repeat(40), branch: 'v4/issue-1234-smoke-1234' }), 'smoke-1234');
        return { baseSha, githubSync: [{ ok: true, label: 'orch:complete' }] };
      },
      inspectPr: async () => ({ number: 4321, state: 'OPEN', url: 'https://example.invalid/pr/4321', headRefName: 'v4/issue-1234-smoke-1234', headRefOid: 'b'.repeat(40), baseRefName: 'main' }),
    });
    assert.equal(report.ok, true);
    assert.equal(report.issueNumber, 1234);
    assert.equal(report.state, 'COMPLETE');
    assert.equal(report.prNumber, 4321);
    assert.equal(report.semanticProgressSeq, 2);
    assert.equal(report.slotsReleased, true);
    assert.equal(report.cleanupOk, true);
    assert.equal(report.githubTerminalSync, true);
    assert.equal(report.v3MutationPerformed, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('live production smoke fails closed when fixture terminal sync is missing', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-smoke-sync-test-'));
  try {
    await assert.rejects(() => runLiveProductionSmoke({
      repoRoot: root,
      issueNumber: 1235,
      configPath: path.join(root, 'config.json'),
      tempRoot: path.join(root, 'smoke'),
      loadIssue: async () => ({ number: 1235, labels: [{ name: 'agent-orchestration' }, { name: 'orch:ready' }] }),
      poll: async ({ db }) => {
        insertReadyTask(db, { taskId: 'smoke-1235', issueNumber: 1235, stream: 'CORE_INTELLIGENCE', baseSha: 'c'.repeat(40) });
        db.prepare("UPDATE tasks SET state='COMPLETE', result_json=? WHERE task_id=?").run(JSON.stringify({ publicationRequired: true, prNumber: 4322 }), 'smoke-1235');
        return { baseSha: 'c'.repeat(40), githubSync: [{ ok: false, error: 'sync failed' }] };
      },
      inspectPr: async () => ({ number: 4322, baseRefName: 'main' }),
    }), /V4_SMOKE_GITHUB_TERMINAL_SYNC_FAILED/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
