import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { V4_STATES } from '../../../scripts/orchestration-v4/state-machine.mjs';
import {
  claimTask,
  getTask,
  insertReadyTask,
  listTasks,
  openV4StateStore,
  recordSemanticProgress,
  releaseSlotForTerminalTask,
  transitionTask,
} from '../../../scripts/orchestration-v4/state-store/sqlite-store.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-state-'));
  const dbPath = path.join(root, 'state.sqlite');
  const db = openV4StateStore(dbPath);
  return { root, db, close() { db.close(); fs.rmSync(root, { recursive: true, force: true }); } };
}

test('slot claim is compare-and-set and cannot double claim', () => {
  const f = fixture();
  try {
    insertReadyTask(f.db, { taskId: 'a', issueNumber: 1, stream: 'CORE_INTELLIGENCE', baseSha: 'a'.repeat(40) });
    insertReadyTask(f.db, { taskId: 'b', issueNumber: 2, stream: 'DISCOVERY_INTELLIGENCE', baseSha: 'a'.repeat(40) });
    const claimed = claimTask(f.db, { taskId: 'a', slotId: 'local-a' });
    assert.equal(claimed.state, V4_STATES.CLAIMED);
    assert.throws(() => claimTask(f.db, { taskId: 'b', slotId: 'local-a' }), /SLOT_OCCUPIED/);
    assert.equal(getTask(f.db, 'b').state, V4_STATES.READY);
  } finally { f.close(); }
});

test('durable task state contains no persistent worker git branch/head fields', () => {
  const f = fixture();
  try {
    insertReadyTask(f.db, { taskId: 'x', issueNumber: 3, stream: 'INTELLIGENCE_UX', baseSha: 'b'.repeat(40) });
    const row = getTask(f.db, 'x');
    assert.equal(row.base_sha, 'b'.repeat(40));
    assert.equal(Object.hasOwn(row, 'branch'), false);
    assert.equal(Object.hasOwn(row, 'worker_head'), false);
    assert.equal(Object.hasOwn(row, 'github_label'), false);
  } finally { f.close(); }
});

test('state transitions, semantic progress, terminal durability, and slot release are task scoped', () => {
  const f = fixture();
  try {
    insertReadyTask(f.db, { taskId: 'run', issueNumber: 4, stream: 'CORE_INTELLIGENCE', baseSha: 'c'.repeat(40) });
    insertReadyTask(f.db, { taskId: 'other', issueNumber: 5, stream: 'CORE_INTELLIGENCE', baseSha: 'c'.repeat(40) });
    claimTask(f.db, { taskId: 'run', slotId: 'local-a' });
    transitionTask(f.db, { taskId: 'run', expectedState: V4_STATES.CLAIMED, toState: V4_STATES.RUNNING, patch: { workspacePath: '/tmp/task-run', childPid: 123, processGroupId: 123 } });
    const progressed = recordSemanticProgress(f.db, { taskId: 'run' });
    assert.equal(progressed.semantic_progress_seq, 1);
    transitionTask(f.db, { taskId: 'run', expectedState: V4_STATES.RUNNING, toState: V4_STATES.VALIDATING });
    transitionTask(f.db, { taskId: 'run', expectedState: V4_STATES.VALIDATING, toState: V4_STATES.COMPLETE, patch: { terminalReason: 'VALIDATED' } });
    const released = releaseSlotForTerminalTask(f.db, 'run');
    assert.equal(released.state, V4_STATES.COMPLETE);
    assert.equal(released.slot_id, null);
    assert.equal(released.terminal_reason, 'VALIDATED');
    assert.equal(getTask(f.db, 'other').state, V4_STATES.READY);
    assert.throws(() => transitionTask(f.db, { taskId: 'run', expectedState: V4_STATES.COMPLETE, toState: V4_STATES.RUNNING }), /TERMINAL_STATE_IMMUTABLE/);
    assert.equal(listTasks(f.db).length, 2);
  } finally { f.close(); }
});
