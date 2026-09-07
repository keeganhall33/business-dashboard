import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildCorrectionAgentAttempt,
  cleanupProductionAgentStates,
  createTaskAgentState,
  mutationModeForTask,
  runProductionPoll,
  syncPendingGithubTasks,
} from '../../../scripts/orchestration-v4/production/daemon.mjs';
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

function executionTask(body = 'No governed mutation directive.') {
  return {
    task_id: 'capability-task',
    issue_number: 1270,
    stream: 'ORCHESTRATION_SYSTEMS',
    contract_json: JSON.stringify({
      title: 'Capability task',
      body,
      fileOwnership: 'owned.mjs',
      taskMutability: 'IMPLEMENTATION_MUTATION_REQUIRED',
    }),
  };
}

function correctionPacket(reason) {
  return {
    unitId: 'capability-task',
    verdict: 'RED',
    reason,
    evidence: 'test evidence',
    scope: 'owned.mjs',
    attempt: 1,
    maxAttempts: 3,
    action: 'RETRY_UNIT',
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

test('ordinary task starts with apply_patch enabled', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-daemon-default-mode-'));
  const state = createTaskAgentState(executionTask(), { root });
  try {
    const config = JSON.parse(fs.readFileSync(state.configPath, 'utf8'));
    assert.equal(mutationModeForTask(executionTask()), 'DEFAULT');
    assert.equal(config.tools.exec.applyPatch.enabled, true);
    assert.equal(config.tools.exec.mode, 'full');
    assert.deepEqual(config.tools.fs, { workspaceOnly: true });
  } finally {
    cleanupProductionAgentStates([state]);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('exact SHELL_ONLY task directive disables apply_patch on the first attempt', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-daemon-shell-mode-'));
  const task = executionTask('**mutation_mode:** SHELL_ONLY');
  const state = createTaskAgentState(task, { root });
  try {
    const config = JSON.parse(fs.readFileSync(state.configPath, 'utf8'));
    assert.equal(mutationModeForTask(task), 'SHELL_ONLY');
    assert.equal(config.tools.exec.applyPatch.enabled, false);
    assert.equal(config.tools.exec.mode, 'full');
  } finally {
    cleanupProductionAgentStates([state]);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('unsupported task mutation mode fails closed without creating ephemeral state', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-daemon-invalid-mode-'));
  try {
    assert.throws(
      () => createTaskAgentState(executionTask('**mutation_mode:** PATCH_ANYWAY'), { root }),
      /V4_AGENT_MUTATION_MODE_INVALID/,
    );
    assert.deepEqual(fs.readdirSync(root), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('APPLY_PATCH_FORMAT_ERROR correction switches to a distinct shell-only config', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-daemon-correction-shell-'));
  const primary = createTaskAgentState(executionTask(), { root });
  const ephemeralStates = [primary];
  try {
    const args = [
      '/entrypoint.mjs',
      'base prompt',
      primary.configPath,
      primary.stateDir,
      '900',
      '/openclaw',
    ];
    const attempt = buildCorrectionAgentAttempt({
      packet: correctionPacket('APPLY_PATCH_FORMAT_ERROR'),
      command: process.execPath,
      args,
      taskId: 'capability-task',
      ephemeralStates,
      stateRoot: root,
    });

    assert.equal(ephemeralStates.length, 2);
    const correction = ephemeralStates[1];
    assert.notEqual(correction.configPath, primary.configPath);
    assert.notEqual(correction.stateDir, primary.stateDir);
    assert.equal(attempt.args[2], correction.configPath);
    assert.equal(attempt.args[3], correction.stateDir);
    assert.equal(attempt.args[4], '900');
    assert.equal(attempt.args[5], '/openclaw');

    const primaryConfig = JSON.parse(fs.readFileSync(primary.configPath, 'utf8'));
    const correctionConfig = JSON.parse(fs.readFileSync(correction.configPath, 'utf8'));
    assert.equal(primaryConfig.tools.exec.applyPatch.enabled, true);
    assert.equal(correctionConfig.tools.exec.applyPatch.enabled, false);
    assert.equal(correctionConfig.tools.exec.mode, 'full');
    assert.match(attempt.args[1], /MUTATION_MODE: SHELL_ONLY/);
  } finally {
    const stateDirs = ephemeralStates.map((state) => state.stateDir);
    cleanupProductionAgentStates(ephemeralStates);
    for (const stateDir of stateDirs) assert.equal(fs.existsSync(stateDir), false);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('unrelated correction retains primary default capability and config identity', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-daemon-correction-default-'));
  const primary = createTaskAgentState(executionTask(), { root });
  const ephemeralStates = [primary];
  try {
    const args = [
      '/entrypoint.mjs',
      'base prompt',
      primary.configPath,
      primary.stateDir,
      '900',
      '/openclaw',
    ];
    const attempt = buildCorrectionAgentAttempt({
      packet: correctionPacket('EXIT_2'),
      command: process.execPath,
      args,
      taskId: 'capability-task',
      ephemeralStates,
      stateRoot: root,
    });

    assert.equal(ephemeralStates.length, 1);
    assert.equal(attempt.args[2], primary.configPath);
    assert.equal(attempt.args[3], primary.stateDir);
    const config = JSON.parse(fs.readFileSync(attempt.args[2], 'utf8'));
    assert.equal(config.tools.exec.applyPatch.enabled, true);
    assert.doesNotMatch(attempt.args[1], /MUTATION_MODE: SHELL_ONLY/);
  } finally {
    cleanupProductionAgentStates(ephemeralStates);
    assert.equal(fs.existsSync(primary.stateDir), false);
    fs.rmSync(root, { recursive: true, force: true });
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
