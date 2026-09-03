import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { syncPendingGithubTasks } from '../../../scripts/orchestration-v4/production/daemon.mjs';
import {
  claimTask,
  getGithubSyncMarker,
  insertReadyTask,
  openV4StateStore,
  transitionTask,
} from '../../../scripts/orchestration-v4/state-store/sqlite-store.mjs';
import { V4_STATES } from '../../../scripts/orchestration-v4/state-machine.mjs';

function terminalFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-github-sync-'));
  const db = openV4StateStore(path.join(root, 'state.sqlite'));
  insertReadyTask(db, {
    taskId: 'terminal-only',
    issueNumber: 1138,
    stream: 'AGENT_ORCHESTRATION',
    baseSha: 'a'.repeat(40),
  });
  claimTask(db, { taskId: 'terminal-only', slotId: 'local-d' });
  transitionTask(db, {
    taskId: 'terminal-only',
    expectedState: V4_STATES.CLAIMED,
    toState: V4_STATES.FAILED,
    patch: { terminalReason: 'TEST_FAILURE' },
  });
  return {
    db,
    close() {
      db.close();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

test('unsynced terminal task is selected when no READY rows exist and unchanged state is not resynced', async () => {
  const fixture = terminalFixture();
  const calls = [];
  try {
    const first = await syncPendingGithubTasks({
      db: fixture.db,
      repoFullName: 'owner/repo',
      sync: async ({ task }) => {
        calls.push(task.task_id);
        return { ok: true, skipped: false };
      },
    });
    assert.equal(first.length, 1);
    assert.deepEqual(calls, ['terminal-only']);
    assert.equal(getGithubSyncMarker(fixture.db, 'terminal-only').last_state, V4_STATES.FAILED);

    const second = await syncPendingGithubTasks({
      db: fixture.db,
      repoFullName: 'owner/repo',
      sync: async () => {
        throw new Error('UNCHANGED_TASK_MUST_NOT_SYNC');
      },
    });
    assert.deepEqual(second, []);
  } finally {
    fixture.close();
  }
});

test('failed bounded synchronization remains pending and a later poll can succeed', async () => {
  const fixture = terminalFixture();
  try {
    const failed = await syncPendingGithubTasks({
      db: fixture.db,
      repoFullName: 'owner/repo',
      sync: async () => { throw new Error('V4_GITHUB_COMMAND_TIMED_OUT'); },
    });
    assert.equal(failed[0].ok, false);
    assert.equal(getGithubSyncMarker(fixture.db, 'terminal-only'), null);

    const recovered = await syncPendingGithubTasks({
      db: fixture.db,
      repoFullName: 'owner/repo',
      sync: async () => ({ ok: true, skipped: false }),
    });
    assert.equal(recovered[0].ok, true);
    assert.equal(getGithubSyncMarker(fixture.db, 'terminal-only').last_state, V4_STATES.FAILED);
  } finally {
    fixture.close();
  }
});
