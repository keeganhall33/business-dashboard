import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  getGithubSyncMarker,
  claimTask,
  insertReadyTask,
  listTasksPendingGithubSync,
  markGithubTaskStateSynced,
  openV4StateStore,
  transitionTask,
} from '../../../scripts/orchestration-v4/state-store/sqlite-store.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-github-sync-marker-'));
  const db = openV4StateStore(path.join(root, 'state.sqlite'));
  return {
    root,
    db,
    close() {
      db.close();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

test('legacy terminal marker becomes pending once for evidence backfill', () => {
  const f = fixture();
  try {
    insertReadyTask(f.db, {
      taskId: 'legacy-terminal',
      issueNumber: 1540,
      stream: 'AGENT_ORCHESTRATION',
      baseSha: 'a'.repeat(40),
    });
    transitionTask(f.db, {
      taskId: 'legacy-terminal',
      expectedState: 'READY',
      toState: 'BLOCKED',
      patch: { terminalReason: 'REPLAN_REQUIRED' },
    });
    f.db.prepare('INSERT INTO github_sync_markers(task_id,last_state,synced_at) VALUES(?,?,?)')
      .run('legacy-terminal', 'BLOCKED', '2026-09-13T22:06:00.834Z');

    assert.deepEqual(listTasksPendingGithubSync(f.db).map((task) => task.task_id), ['legacy-terminal']);
    markGithubTaskStateSynced(f.db, { taskId: 'legacy-terminal', state: 'BLOCKED' });
    assert.equal(getGithubSyncMarker(f.db, 'legacy-terminal').last_state, 'BLOCKED');
    assert.equal(getGithubSyncMarker(f.db, 'legacy-terminal').sync_version, 'TERMINAL_EVIDENCE_V1');
    assert.deepEqual(listTasksPendingGithubSync(f.db), []);
  } finally {
    f.close();
  }
});

test('versioned marker becomes pending again only when terminal state changes', () => {
  const f = fixture();
  try {
    insertReadyTask(f.db, {
      taskId: 'state-change',
      issueNumber: 1597,
      stream: 'AGENT_ORCHESTRATION',
      baseSha: 'b'.repeat(40),
    });
    claimTask(f.db, { taskId: 'state-change', slotId: 'local-a' });
    transitionTask(f.db, { taskId: 'state-change', expectedState: 'CLAIMED', toState: 'RUNNING' });
    transitionTask(f.db, { taskId: 'state-change', expectedState: 'RUNNING', toState: 'FAILED' });
    markGithubTaskStateSynced(f.db, { taskId: 'state-change', state: 'FAILED' });
    assert.deepEqual(listTasksPendingGithubSync(f.db), []);
  } finally {
    f.close();
  }
});
