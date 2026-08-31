import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { insertReadyTask } from '../../../scripts/orchestration-v4/state-store/sqlite-store.mjs';
import { runLiveProductionSmoke } from '../../../scripts/orchestration-v4/production/live-production-smoke.mjs';
import { syncTerminalTaskToGitHub } from '../../../scripts/orchestration-v4/production/github-sync.mjs';

test('failed smoke surfaces persisted bounded child evidence', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-smoke-evidence-'));
  try {
    await assert.rejects(() => runLiveProductionSmoke({
      repoRoot: root,
      issueNumber: 2001,
      configPath: path.join(root, 'config.json'),
      tempRoot: path.join(root, 'smoke'),
      loadIssue: async () => ({ number: 2001, labels: [{ name: 'agent-orchestration' }, { name: 'orch:ready' }] }),
      poll: async ({ db }) => {
        insertReadyTask(db, { taskId: 'smoke-2001', issueNumber: 2001, stream: 'CORE_INTELLIGENCE', baseSha: 'a'.repeat(40) });
        db.prepare("UPDATE tasks SET state='FAILED',terminal_reason='EXIT_1',result_json=? WHERE task_id=?")
          .run(JSON.stringify({ execution: { status: 'FAILED', code: 1, reason: 'EXIT_1', stdoutTail: 'hello-out', stderrTail: 'real failure detail' } }), 'smoke-2001');
        return { baseSha: 'a'.repeat(40), githubSync: [{ ok: true, label: 'orch:failed' }] };
      },
    }), /real failure detail/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('terminal sync removes ready and running and verifies one terminal state', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-gh-sync-'));
  const statePath = path.join(root, 'state.json');
  const ghPath = path.join(root, 'fake-gh.mjs');
  fs.writeFileSync(statePath, JSON.stringify({ labels: ['agent-orchestration','orch:ready','orch:running'] }));
  fs.writeFileSync(ghPath, `#!/usr/bin/env node\nimport fs from 'node:fs';\nconst p=process.env.V4_FAKE_GH_STATE; const a=process.argv.slice(2); let s=JSON.parse(fs.readFileSync(p,'utf8'));\nif(a[0]==='issue'&&a[1]==='view'){process.stdout.write(JSON.stringify({labels:s.labels.map(name=>({name})),state:'OPEN'}));process.exit(0);}\nif(a[0]==='label'&&a[1]==='create') process.exit(0);\nif(a[0]==='issue'&&a[1]==='edit'){const ri=a.indexOf('--remove-label'); if(ri>=0)s.labels=s.labels.filter(x=>x!==a[ri+1]); const ai=a.indexOf('--add-label'); if(ai>=0&&!s.labels.includes(a[ai+1]))s.labels.push(a[ai+1]); fs.writeFileSync(p,JSON.stringify(s)); process.exit(0);}\nprocess.exit(2);\n`);
  fs.chmodSync(ghPath, 0o755);
  const prior = process.env.V4_FAKE_GH_STATE;
  process.env.V4_FAKE_GH_STATE = statePath;
  try {
    const result = syncTerminalTaskToGitHub({ task: { issue_number: 2002, state: 'FAILED' }, repoFullName: 'owner/repo', gh: ghPath });
    assert.equal(result.ok, true);
    const final = JSON.parse(fs.readFileSync(statePath, 'utf8')).labels;
    assert.deepEqual(final.sort(), ['agent-orchestration','orch:failed'].sort());
  } finally {
    if (prior === undefined) delete process.env.V4_FAKE_GH_STATE; else process.env.V4_FAKE_GH_STATE = prior;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
