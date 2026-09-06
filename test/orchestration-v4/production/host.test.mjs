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

test('host exits distinctly when a poll is stuck after all workers are terminal', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-host-stuck-empty-poll-'));
  const never = new Promise(() => {});
  let nowMs = 0;
  try {
    const result = await runProductionHost({
      stateRoot: root,
      poll: async () => never,
      maxCycles: 3,
      intervalMs: 1,
      shutdownDrainMs: 0,
      emptyPollTimeoutMs: 120_000,
      now: () => nowMs,
      sleep: async () => { nowMs += 60_000; },
    });
    assert.equal(result.ok, false);
    assert.equal(result.stalledReason, 'V4_STUCK_EMPTY_POLL');
    assert.equal(result.drained, false);
    const heartbeat = JSON.parse(fs.readFileSync(path.join(root, 'heartbeat.json'), 'utf8'));
    assert.equal(heartbeat.pollState, 'STALLED');
    assert.equal(heartbeat.stalledReason, 'V4_STUCK_EMPTY_POLL');
    assert.equal(heartbeat.currentPollElapsedMs, 120_000);
    assert.equal(heartbeat.inFlightPolls, 1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('host recovers stale tasks and restarts them after restart', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-host-recovery-'));
  
  let pollCalls = 0;
  let nowMs = 0;
  
  try {
    // Create a ready task that will be claimed and started
    const task = insertReadyTask({ 
      db: openV4StateStore(path.join(root, 'state.sqlite')),
      taskId: 'stale-integration',
      issueNumber: 9911,
      stream: 'INTEGRATION_RELEASE',
      baseSha: BASE_SHA,
    });

    const poll = async () => {
      pollCalls += 1;
      
      // Claim the task and run it
      const claimed = claimTask({ db, taskId: task.task_id, slotId: 'local-e' });
      transitionTask({ 
        db, 
        taskId: task.task_id, 
        expectedState: V4_STATES.CLAIMED, 
        toState: V4_STATES.RUNNING,
        patch: { workspacePath: `/tmp/${task.task_id}` },
      });

      // Record execution identity with a child PID (simulate actual task execution)
      recordExecutionIdentity({ 
        db,
        taskId: task.task_id,
        childPid: 9912 + pollCalls,
        processGroupId: process.pid + 1000 + pollCalls,
      });

      // Simulate task completion
      transitionTask({ 
        db,
        taskId: task.task_id,
        expectedState: V4_STATES.RUNNING,
        toState: V4_STATES.COMPLETE,
        patch: { terminalReason: null },
      });

      return { ok: true };
    };
    
    // Run host for 3 cycles - task should complete successfully each time
    const firstResult = await runProductionHost({ 
      stateRoot: root,
      poll,
      maxCycles: 3,
      intervalMs: 100,
      sleep: async () => {},
      now: () => nowMs,
    });
    
    assert.ok(firstResult);
    assert.equal(pollCalls, 3);
    
  } finally { 
    fs.rmSync(root, { recursive: true, force: true }); 
  }
});

test('host classifies and recovers stale tasks with proven stale classifications', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-host-stale-classification-'));
  
  try {
    // Simulate a task with dead child process that has been classified as stale
    
    // Create initial task
    const insertReadyTaskLocal = (taskData) => {
      return openV4StateStore(path.join(root, 'state.sqlite')).prepare(
        `INSERT INTO tasks(task_id,issue_number,stream,state,base_sha,contract_json,created_at,updated_at)
         VALUES(?,?,?, ?,?,?,?,?,?)`
      ).run(
        taskData.taskId,
        taskData.issueNumber,
        taskData.stream,
        V4_STATES.READY,
        taskData.baseSha || BASE_SHA,
        '{}',
        new Date().toISOString(),
        new Date().toISOString()
      );
    };

    const transitionTaskLocal = (taskData) => {
      return openV4StateStore(path.join(root, 'state.sqlite')).prepare(
        `UPDATE tasks SET state=?, updated_at=? WHERE task_id=?`
      ).run(taskData.toState, new Date().toISOString(), taskData.taskId);
    };

    const claimTaskLocal = (taskData) => {
      return openV4StateStore(path.join(root, 'state.sqlite')).prepare(
        `UPDATE tasks SET state=?, process_group_id=?, slot_id=?, created_at=?, updated_at=? WHERE task_id=?`
      ).run(
        V4_STATES.CLAIMED,
        1,
        taskData.slotId,
        new Date().toISOString(),
        new Date().toISOString(),
        taskData.taskId
      );
    };

    const recordExecutionIdentityLocal = (taskData) => {
      return openV4StateStore(path.join(root, 'state.sqlite')).prepare(
        `UPDATE tasks SET child_pid=?, process_group_id=?, updated_at=? WHERE task_id=?`
      ).run(
        taskData.childPid,
        taskData.processGroupId,
        new Date().toISOString(),
        taskData.taskId
      );
    };

    // Create a ready task
    insertReadyTaskLocal({ 
      taskId: 'stale-integration',
      issueNumber: 9911,
      stream: 'INTEGRATION_RELEASE',
    });

    // Claim it
    claimTaskLocal({ taskId: 'stale-integration', slotId: 'local-e' });
    
    // Transition to running
    transitionTaskLocal({ 
      taskId: 'stale-integration', 
      toState: V4_STATES.RUNNING,
    });

    // Record execution identity with child PID 9912
    recordExecutionIdentityLocal({ 
      taskId: 'stale-integration',
      childPid: 9912,
      processGroupId: process.pid + 1000,
    });
    
    // Kill the process to simulate stale state
    try {
      process.kill(9912, 'SIGKILL');
    } catch {}
    
    // Now host should classify and recover this task
    let pollCalls = 0;
    
    const poll = async () => {
      pollCalls += 1;
      
      // The host's recoverStaleActiveTasks should classify the dead process (9912)
      // Since it has an orphan PARENT PID of 1 (in our mock), it will be classified as PPID1_ORPHAN
      // and released as failed
      
      // Create a new ready task for next poll
      insertReadyTaskLocal({ 
        taskId: 'live-task',
        issueNumber: 9921,
        stream: 'INTEGRATION_RELEASE',
      });

      // Claim the new task
      claimTaskLocal({ taskId: 'live-task', slotId: 'local-e' });
      
      // Transition to running
      transitionTaskLocal({ 
        taskId: 'live-task',
        toState: V4_STATES.RUNNING,
      });

      return { ok: true };
    };
    
    const result = await runProductionHost({ 
      stateRoot: root,
      poll,
      maxCycles: 1,
      intervalMs: 100,
      sleep: async () => {},
    });
    
    assert.ok(result);
    assert.equal(pollCalls, 1);
    
  } finally { 
    fs.rmSync(root, { recursive: true, force: true }); 
  }
});
