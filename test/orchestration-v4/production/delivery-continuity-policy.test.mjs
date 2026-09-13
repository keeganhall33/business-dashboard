import assert from 'node:assert/strict';
import test from 'node:test';
import { decideDeliveryContinuity } from '../../../scripts/orchestration-v4/production/delivery-continuity-policy.mjs';

const now = '2026-09-13T05:00:00.000Z';

function ready(taskId, overrides = {}) {
  return {
    taskId,
    state: 'READY',
    stream: 'CORE_INTELLIGENCE',
    sliceId: `slice-${taskId}`,
    priority: 'P1',
    readyAt: '2026-09-13T04:00:00.000Z',
    fileOwnership: [`src/${taskId}.mjs`],
    dependencies: [],
    ...overrides,
  };
}

function snapshot(overrides = {}) {
  return {
    now,
    semanticProgressWindowMs: 15 * 60_000,
    tasks: [],
    completedTaskIds: [],
    slots: [
      { slotId: 'local-a', streams: ['CORE_INTELLIGENCE'] },
      { slotId: 'local-c', streams: ['INTELLIGENCE_UX'] },
      { slotId: 'local-d', streams: ['AGENT_ORCHESTRATION'] },
    ],
    limits: { global: 3, perSlice: 3, perStream: 1, executable: 3 },
    runtime: { head: 'head-a', latestHead: 'head-a', ancestorHeads: ['base-a'], clean: true, idle: true },
    ...overrides,
  };
}

test('fills every safe compatible free slot without exceeding limits', () => {
  const decision = decideDeliveryContinuity(snapshot({ tasks: [
    ready('core'),
    ready('ux', { stream: 'INTELLIGENCE_UX' }),
    ready('orch', { stream: 'AGENT_ORCHESTRATION' }),
  ] }));
  assert.deepEqual(decision.actions.map((entry) => [entry.type, entry.taskId, entry.slotId]), [
    ['CLAIM_READY_TASK', 'core', 'local-a'],
    ['CLAIM_READY_TASK', 'orch', 'local-d'],
    ['CLAIM_READY_TASK', 'ux', 'local-c'],
  ]);
});

test('dependency and ownership conflicts fail closed while unrelated work proceeds', () => {
  const decision = decideDeliveryContinuity(snapshot({
    completedTaskIds: ['done'],
    tasks: [
      { ...ready('active'), state: 'RUNNING', slotId: 'local-a', childProcessAlive: true, semanticProgressAt: now },
      ready('conflict', { stream: 'INTELLIGENCE_UX', fileOwnership: ['src/active.mjs'] }),
      ready('blocked', { stream: 'AGENT_ORCHESTRATION', dependencies: ['missing'] }),
      ready('safe', { stream: 'INTELLIGENCE_UX', priority: 'P0', dependencies: ['done'] }),
    ],
    slots: [
      { slotId: 'local-a', streams: ['CORE_INTELLIGENCE'], taskId: 'active' },
      { slotId: 'local-c', streams: ['INTELLIGENCE_UX'] },
      { slotId: 'local-d', streams: ['AGENT_ORCHESTRATION'] },
    ],
  }));
  assert.deepEqual(decision.actions.map((entry) => entry.taskId), ['safe']);
});

test('priority and stable tie-breaking do not depend on input order', () => {
  const tasks = [ready('later', { readyAt: '2026-09-13T04:30:00.000Z' }), ready('b'), ready('a'), ready('p0', { priority: 'P0' })];
  const input = snapshot({ tasks, limits: { global: 1, perSlice: 1, perStream: 1, executable: 1 } });
  const reverse = snapshot({ ...input, tasks: [...tasks].reverse() });
  assert.equal(decideDeliveryContinuity(input).actions[0].taskId, 'p0');
  assert.deepEqual(decideDeliveryContinuity(input), decideDeliveryContinuity(reverse));
});

test('fresh semantic progress wins over PID age and waits safely', () => {
  const decision = decideDeliveryContinuity(snapshot({ tasks: [{
    ...ready('working'), state: 'RUNNING', slotId: 'local-a', childProcessAlive: true,
    startedAt: '2026-09-13T01:00:00.000Z', semanticProgressAt: '2026-09-13T04:55:00.000Z',
  }] }));
  assert.deepEqual(decision.actions, [{ type: 'WAIT_FOR_ACTIVE_PROGRESS' }]);
});

test('live semantic stall terminates and replans only after ceilings are exhausted', () => {
  const decision = decideDeliveryContinuity(snapshot({ tasks: [{
    ...ready('stalled'), state: 'RUNNING', slotId: 'local-a', childProcessAlive: true,
    semanticProgressAt: '2026-09-13T04:00:00.000Z', attempt: 1, maxAttempts: 1,
    correctionCount: 1, maxCorrections: 1,
  }] }));
  assert.deepEqual(decision.actions.map((entry) => [entry.type, entry.reason]), [
    ['TERMINATE_STALLED_WORKER', 'SEMANTIC_PROGRESS_STALL'],
    ['REPLAN_TERMINAL_TASK', 'SEMANTIC_PROGRESS_STALL'],
  ]);
});

test('hard deadline always wins and cannot be extended by fresh progress', () => {
  const decision = decideDeliveryContinuity(snapshot({ tasks: [{
    ...ready('deadline'), state: 'RUNNING', slotId: 'local-a', childProcessAlive: true,
    semanticProgressAt: '2026-09-13T04:59:59.000Z', deadlineAt: '2026-09-13T04:59:00.000Z',
    attempt: 1, maxAttempts: 5, correctionCount: 0, maxCorrections: 5,
  }] }));
  assert.deepEqual(decision.actions.map((entry) => entry.reason), ['HARD_DEADLINE', 'HARD_DEADLINE']);
});

test('terminal transition refills the vacated compatible slot immediately', () => {
  const decision = decideDeliveryContinuity(snapshot({
    tasks: [ready('next')],
    terminalTransition: { taskId: 'previous', slotId: 'local-a', at: now },
  }));
  assert.deepEqual(decision.actions[0], { type: 'REFILL_VACATED_SLOT', taskId: 'next', slotId: 'local-a', stream: 'CORE_INTELLIGENCE' });
});

test('runtime refresh occurs only when clean and idle', () => {
  const task = ready('new-base', { requiredBase: 'head-b' });
  const clean = decideDeliveryContinuity(snapshot({ tasks: [task], runtime: { head: 'head-a', latestHead: 'head-b', clean: true, idle: true } }));
  const dirty = decideDeliveryContinuity(snapshot({ tasks: [task], runtime: { head: 'head-a', latestHead: 'head-b', clean: false, idle: true } }));
  assert.equal(clean.actions[0].type, 'REFRESH_CLEAN_IDLE_RUNTIME');
  assert.equal(dirty.actions[0].type, 'REPORT_BACKLOG_STARVATION');
});

test('terminal work never retries beyond max attempts and does not suppress successors', () => {
  const decision = decideDeliveryContinuity(snapshot({ tasks: [
    { ...ready('old'), state: 'FAILED', attempt: 1, maxAttempts: 1, successorTaskId: 'successor' },
    ready('successor'),
  ] }));
  assert.deepEqual(decision.actions.map((entry) => entry.taskId), ['successor']);
});

test('empty and ineligible backlogs report starvation exactly once', () => {
  const empty = decideDeliveryContinuity(snapshot());
  const blocked = decideDeliveryContinuity(snapshot({ tasks: [ready('blocked', { dependencies: ['missing'] })] }));
  assert.deepEqual(empty.actions, [{ type: 'REPORT_BACKLOG_STARVATION', reason: 'NO_READY_TASKS' }]);
  assert.deepEqual(blocked.actions, [{ type: 'REPORT_BACKLOG_STARVATION', reason: 'NO_ELIGIBLE_TASKS' }]);
});

test('identical snapshots are idempotent and malformed or unbounded input fails closed', () => {
  const input = snapshot({ tasks: [ready('same')] });
  assert.deepEqual(decideDeliveryContinuity(input), decideDeliveryContinuity(input));
  assert.throws(() => decideDeliveryContinuity(null), /SNAPSHOT_INVALID/);
  assert.throws(() => decideDeliveryContinuity(snapshot({ tasks: Array.from({ length: 1_001 }, (_, index) => ready(`t-${index}`)) })), /SNAPSHOT_UNBOUNDED/);
});
