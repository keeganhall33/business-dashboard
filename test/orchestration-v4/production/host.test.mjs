import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runProductionHost } from '../../../scripts/orchestration-v4/production/host.mjs';
import { claimTask, getTask, insertReadyTask, openV4StateStore, recordExecutionIdentity, transitionTask } from '../../../scripts/orchestration-v4/state-store/sqlite-store.mjs';
import { V4_STATES } from '../../../scripts/orchestration-v4/state-machine.mjs';

const BASE_SHA = 'a'.repeat(40);

test('host loops, writes heartbeat, releases lock, and restarts', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-host-'));
  let calls = 0;
  const poll = async () => { calls += 1; };
  const yieldSleep = async () => { await new Promise((resolve) => setImmediate(resolve)); };
  try {
    const first = await runProductionHost({ stateRoot: root, poll, maxCycles: 2, intervalMs: 1, sleep: yieldSleep });
    assert.equal(first.ok, true);
    assert.equal(first.cycles, 2);
    assert.equal(calls, 2);
    assert.equal(fs.existsSync(path.join(root, 'host.lock')), false);
    const heartbeat = JSON.parse(fs.readFileSync(path.join(root, 'heartbeat.json'), 'utf8'));
    assert.equal(heartbeat.cycles, 2);
    assert.equal(heartbeat.inFlightPolls <= 1, true);
    assert.equal(heartbeat.recoveredStaleTasks, 0);
    const second = await runProductionHost({ stateRoot: root, poll, maxCycles: 1, intervalMs: 1, sleep: yieldSleep });
    assert.equal(second.cycles, 1);
    assert.equal(calls, 3);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('host keeps production polls single-flight while a prior poll is unresolved', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-host-single-flight-'));
  let calls = 0;
  const never = new Promise(() => {});
  try {
    const result = await runProductionHost({
      stateRoot: root,
      poll: async () => { calls += 1; return never; },
      maxCycles: 4,
      intervalMs: 1,
      shutdownDrainMs: 0,
      sleep: async () => {},
    });
    assert.equal(result.ok, true);
    assert.equal(calls, 1);
    assert.equal(result.skippedPolls, 3);
    assert.equal(result.drained, false);
    const heartbeat = JSON.parse(fs.readFileSync(path.join(root, 'heartbeat.json'), 'utf8'));
    assert.equal(heartbeat.inFlightPolls, 1);
    assert.equal(heartbeat.skippedPolls, 3);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('host startup fails stale running task with dead child and releases its slot before polling', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-host-stale-task-'));
  const dbPath = path.join(root, 'state.sqlite');
  const db = openV4StateStore(dbPath);
  try {
    insertReadyTask(db, { taskId: 'stale-integration', issueNumber: 9911, stream: 'INTEGRATION_RELEASE', baseSha: BASE_SHA });
    claimTask(db, { taskId: 'stale-integration', slotId: 'local-e' });
    transitionTask(db, { taskId: 'stale-integration', expectedState: V4_STATES.CLAIMED, toState: V4_STATES.RUNNING, patch: { workspacePath: path.join(root, 'preserved-workspace') } });
    recordExecutionIdentity(db, { taskId: 'stale-integration', childPid: 99999999, processGroupId: 99999999 });
    insertReadyTask(db, { taskId: 'next-integration', issueNumber: 9912, stream: 'INTEGRATION_RELEASE', baseSha: BASE_SHA });
  } finally {
    db.close();
  }

  let observed = null;
  try {
    const result = await runProductionHost({
      stateRoot: root,
      maxCycles: 1,
      poll: async ({ db: hostDb }) => {
        observed = {
          stale: getTask(hostDb, 'stale-integration'),
          next: getTask(hostDb, 'next-integration'),
        };
      },
    });
    assert.deepEqual(result.recoveredStaleTasks, ['stale-integration']);
    assert.equal(observed.stale.state, V4_STATES.FAILED);
    assert.equal(observed.stale.slot_id, null);
    assert.equal(observed.stale.child_pid, null);
    assert.equal(observed.stale.process_group_id, null);
    assert.equal(observed.stale.terminal_reason, 'V4_STALE_PROCESS_AFTER_HOST_RESTART');
    assert.equal(observed.stale.workspace_path, path.join(root, 'preserved-workspace'));
    assert.equal(JSON.parse(observed.stale.result_json).workspacePreserved, true);
    assert.equal(observed.next.state, V4_STATES.READY);
    const heartbeat = JSON.parse(fs.readFileSync(path.join(root, 'heartbeat.json'), 'utf8'));
    assert.equal(heartbeat.recoveredStaleTasks, 1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('host startup preserves active task when recorded child is still live', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-host-live-task-'));
  const db = openV4StateStore(path.join(root, 'state.sqlite'));
  try {
    insertReadyTask(db, { taskId: 'live-task', issueNumber: 9921, stream: 'INTEGRATION_RELEASE', baseSha: BASE_SHA });
    claimTask(db, { taskId: 'live-task', slotId: 'local-e' });
    transitionTask(db, { taskId: 'live-task', expectedState: V4_STATES.CLAIMED, toState: V4_STATES.RUNNING });
    recordExecutionIdentity(db, { taskId: 'live-task', childPid: process.pid, processGroupId: process.pid });
  } finally {
    db.close();
  }

  let observed = null;
  try {
    const result = await runProductionHost({
      stateRoot: root,
      maxCycles: 1,
      poll: async ({ db: hostDb }) => { observed = getTask(hostDb, 'live-task'); },
    });
    assert.deepEqual(result.recoveredStaleTasks, []);
    assert.equal(observed.state, V4_STATES.RUNNING);
    assert.equal(observed.slot_id, 'local-e');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('host fails closed when lock belongs to a live pid', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-host-live-lock-'));
  fs.writeFileSync(path.join(root, 'host.lock'), `${process.pid}\n`);
  try {
    await assert.rejects(() => runProductionHost({ stateRoot: root, poll: async () => {}, maxCycles: 1 }), /V4_HOST_ALREADY_RUNNING/);
    assert.equal(fs.readFileSync(path.join(root, 'host.lock'), 'utf8').trim(), String(process.pid));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('host reclaims a stale dead-pid lock and starts normally', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-host-stale-lock-'));
  fs.writeFileSync(path.join(root, 'host.lock'), '99999999\n');
  let calls = 0;
  try {
    const result = await runProductionHost({ stateRoot: root, poll: async () => { calls += 1; }, maxCycles: 1 });
    assert.equal(result.ok, true);
    assert.equal(calls, 1);
    assert.equal(fs.existsSync(path.join(root, 'host.lock')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('host reclaims an invalid stale lock', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-host-invalid-lock-'));
  fs.writeFileSync(path.join(root, 'host.lock'), 'not-a-pid\n');
  try {
    const result = await runProductionHost({ stateRoot: root, poll: async () => {}, maxCycles: 1 });
    assert.equal(result.ok, true);
    assert.equal(fs.existsSync(path.join(root, 'host.lock')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('host does not wait forever for an orphaned in-flight poll during shutdown', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-host-drain-'));
  const never = new Promise(() => {});
  try {
    const result = await runProductionHost({
      stateRoot: root,
      poll: async () => never,
      maxCycles: 1,
      shutdownDrainMs: 0,
      sleep: async () => {},
    });
    assert.equal(result.ok, true);
    assert.equal(result.drained, false);
    assert.equal(fs.existsSync(path.join(root, 'host.lock')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
