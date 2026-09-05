import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { V4_STATES } from '../../../scripts/orchestration-v4/state-machine.mjs';
import {
  claimTask,
  addTaskDependency,
  blockTasksWithFailedDependencies,
  getTask,
  getTaskContract,
  insertReadyTask,
  listCorrectionAttempts,
  listLearningConstraints,
  listRunnableTasks,
  recordCorrectionAttempt,
  saveLearningConstraint,
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
  return { root, dbPath, db, close() { this.db.close(); fs.rmSync(root, { recursive: true, force: true }); } };
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

test('validated task contract survives SQLite close and reopen', () => {
  const f = fixture();
  try {
    const contract = { taskId: 'persist', issueNumber: 33, stream: 'CORE_INTELLIGENCE', title: 'Persist me', body: 'Acceptance body', taskMutability: 'IMPLEMENTATION_MUTATION_REQUIRED', fileOwnership: 'src/**' };
    insertReadyTask(f.db, { taskId: 'persist', issueNumber: 33, stream: 'CORE_INTELLIGENCE', baseSha: 'd'.repeat(40), contract });
    f.db.close();
    f.db = openV4StateStore(f.dbPath);
    assert.deepEqual(getTaskContract(getTask(f.db, 'persist')), contract);
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

test('dependency edges hold successors while independent siblings remain runnable', () => {
  const f = fixture();
  try {
    for (const [taskId, issueNumber] of [['upstream', 40], ['successor', 41], ['sibling', 42]]) {
      insertReadyTask(f.db, { taskId, issueNumber, stream: 'CORE_INTELLIGENCE', baseSha: 'e'.repeat(40) });
    }
    addTaskDependency(f.db, { taskId: 'successor', dependsOnTaskId: 'upstream', artifact: 'verified-output' });
    assert.deepEqual(listRunnableTasks(f.db).map((task) => task.task_id).sort(), ['sibling', 'upstream']);
    claimTask(f.db, { taskId: 'upstream', slotId: 'local-a' });
    transitionTask(f.db, { taskId: 'upstream', expectedState: 'CLAIMED', toState: 'RUNNING' });
    transitionTask(f.db, { taskId: 'upstream', expectedState: 'RUNNING', toState: 'VALIDATING' });
    transitionTask(f.db, { taskId: 'upstream', expectedState: 'VALIDATING', toState: 'COMPLETE' });
    assert.deepEqual(listRunnableTasks(f.db).map((task) => task.task_id).sort(), ['sibling', 'successor']);
    assert.throws(() => addTaskDependency(f.db, { taskId: 'upstream', dependsOnTaskId: 'successor', artifact: 'cycle' }), /CYCLE/);
  } finally { f.close(); }
});

test('failed upstream blocks only its dependent task', () => {
  const f = fixture();
  try {
    for (const [taskId, issueNumber] of [['bad', 43], ['dependent', 44], ['independent', 45]]) {
      insertReadyTask(f.db, { taskId, issueNumber, stream: 'CORE_INTELLIGENCE', baseSha: 'e'.repeat(40) });
    }
    addTaskDependency(f.db, { taskId: 'dependent', dependsOnTaskId: 'bad', artifact: 'result' });
    transitionTask(f.db, { taskId: 'bad', expectedState: 'READY', toState: 'BLOCKED', patch: { terminalReason: 'fixture' } });
    assert.deepEqual(blockTasksWithFailedDependencies(f.db), ['dependent']);
    assert.equal(getTask(f.db, 'dependent').terminal_reason, 'UPSTREAM_DEPENDENCY_FAILED');
    assert.deepEqual(listRunnableTasks(f.db).map((task) => task.task_id), ['independent']);
  } finally { f.close(); }
});

test('correction evidence and governed learning constraints persist', () => {
  const f = fixture();
  try {
    insertReadyTask(f.db, { taskId: 'learn', issueNumber: 50, stream: 'CORE_INTELLIGENCE', baseSha: 'f'.repeat(40) });
    recordCorrectionAttempt(f.db, { taskId: 'learn', packet: { attempt: 1, verdict: 'RED', reason: 'bad', evidence: 'line 4', scope: 'one.mjs', action: 'RETRY_UNIT' } });
    assert.equal(listCorrectionAttempts(f.db, 'learn')[0].scope, 'one.mjs');
    saveLearningConstraint(f.db, { constraint: { id: 'rule-1', status: 'CANDIDATE', rule: 'Keep scope' } });
    assert.equal(listLearningConstraints(f.db, { status: 'CANDIDATE' })[0].constraint.rule, 'Keep scope');
  } finally { f.close(); }
});
