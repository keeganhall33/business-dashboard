import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { syncPendingGithubTasks, runProductionPoll } from '../../../scripts/orchestration-v4/production/daemon.mjs';
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

// Verify timeout default values and invariant from source code
const DAEMON_SOURCE = fs.readFileSync(
  new URL('../../../scripts/orchestration-v4/production/daemon.mjs', import.meta.url),
  'utf8'
);

// Extract default timeout values
const TIMEOUT_MS_MATCH = DAEMON_SOURCE.match(/timeoutMs = (\d+) \* 60_000,/);
const AGENT_TIMEOUT_MS_MATCH = DAEMON_SOURCE.match(/agentTimeoutMs = (\d+) \* 60_000,/);
const STALL_MS_MATCH = DAEMON_SOURCE.match(/stallMs = (\d+) \* 60_000,/);

test('runProductionPoll uses updated default timeouts: 100-min outer, 90-min agent, 30-min stall', async () => {
  const TIMEOUT_MINUTES = Object.freeze({
    DEFAULT_TIMEOUT_MS: parseInt(TIMEOUT_MS_MATCH?.[1] || '0', 10),
    DEFAULT_AGENT_TIMEOUT_MS: parseInt(AGENT_TIMEOUT_MS_MATCH?.[1] || '0', 10),
    DEFAULT_STALL_MS: parseInt(STALL_MS_MATCH?.[1] || '0', 10),
  });

  assert.equal(TIMEOUT_MINUTES.DEFAULT_TIMEOUT_MS, 100, 'outer timeout default should be 100 minutes');
  assert.equal(TIMEOUT_MINUTES.DEFAULT_AGENT_TIMEOUT_MS, 90, 'agent timeout default should be 90 minutes');
  assert.equal(TIMEOUT_MINUTES.DEFAULT_STALL_MS, 30, 'stall timeout default should be 30 minutes');
});

test('timeout invariant: stallMs < agentTimeoutMs < timeoutMs', async () => {
  const TIMEOUT_MINUTES = Object.freeze({
    DEFAULT_TIMEOUT_MS: parseInt(TIMEOUT_MS_MATCH?.[1] || '0', 10),
    DEFAULT_AGENT_TIMEOUT_MS: parseInt(AGENT_TIMEOUT_MS_MATCH?.[1] || '0', 10),
    DEFAULT_STALL_MS: parseInt(STALL_MS_MATCH?.[1] || '0', 10),
  });

  assert.ok(TIMEOUT_MINUTES.DEFAULT_STALL_MS < TIMEOUT_MINUTES.DEFAULT_AGENT_TIMEOUT_MS, 'stallMs should be less than agentTimeoutMs');
  assert.ok(TIMEOUT_MINUTES.DEFAULT_AGENT_TIMEOUT_MS < TIMEOUT_MINUTES.DEFAULT_TIMEOUT_MS, 'agentTimeoutMs should be less than timeoutMs');
});
