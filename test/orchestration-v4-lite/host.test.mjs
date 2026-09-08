import test from 'node:test';
import assert from 'node:assert/strict';
import { createSlotRegistry } from '../../scripts/orchestration-v4/slot-scheduler.mjs';
import { createLiteController, ownershipOverlaps, recoverLiteStartupTasks, withDeadline } from '../../scripts/orchestration-v4-lite/host.mjs';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function task(id, stream, owned = `${id}.mjs`) {
  return { task_id: id, issue_number: Number(id.replace(/\D/g, '')) || 1, stream, contract_json: JSON.stringify({ fileOwnership: owned }) };
}

function harness({ ready = [], launch = null, intake = async () => {}, sync = async () => {} } = {}) {
  const running = new Map();
  const launched = [];
  const controller = createLiteController({
    registry: createSlotRegistry(), intake, syncTerminal: sync,
    listReady: () => ready.filter((candidate) => !running.has(candidate.task_id)),
    listActive: () => [],
    getCurrentTask: (taskId) => ({ task_id: taskId, semantic_progress_seq: 0 }),
    launchTask: ({ task: candidate, slotId }) => {
      launched.push({ taskId: candidate.task_id, slotId });
      running.set(candidate.task_id, slotId);
      return launch ? launch(candidate, slotId) : new Promise(() => {});
    },
    failLaunch: (candidate) => running.delete(candidate.task_id),
    operationTimeoutMs: 50,
  });
  return { controller, launched, running };
}

test('a long task never blocks a control tick', async () => {
  const { controller } = harness({ ready: [task('t1', 'CORE_INTELLIGENCE')] });
  const snapshot = await controller.tick();
  assert.equal(snapshot.ticks, 1);
  assert.equal(snapshot.activeCount, 1);
});

test('one tick independently fills all six fixed slots with compatible useful work', async () => {
  const ready = [task('t1','CORE_INTELLIGENCE'),task('t2','DISCOVERY_INTELLIGENCE'),task('t3','INTELLIGENCE_UX'),task('t4','ORCHESTRATION_SYSTEMS'),task('t5','INTEGRATION_RELEASE'),task('t6','QA_EVALUATION'),task('t7','QA_EVALUATION')];
  const { controller, launched } = harness({ ready });
  const snapshot = await controller.tick();
  assert.deepEqual(launched.map((entry) => entry.slotId).sort(), ['local-a','local-b','local-c','local-d','local-e','local-f']);
  assert.equal(snapshot.activeCount, 6);
  assert.equal(launched.some((entry) => entry.taskId === 't7'), false);
});

test('concurrent tick calls share one intake and launch decision', async () => {
  let intakeCalls = 0;
  const gate = deferred();
  const { controller, launched } = harness({ ready: [task('t1','CORE_INTELLIGENCE')], intake: async () => { intakeCalls += 1; await gate.promise; } });
  const first = controller.tick();
  const second = controller.tick();
  assert.equal(first, second);
  gate.resolve();
  await first;
  assert.equal(intakeCalls, 1);
  assert.equal(launched.length, 1);
});

test('a settled task frees only its slot and the next tick refills it', async () => {
  const first = deferred();
  const ready = [task('t1','QA_EVALUATION'), task('t2','QA_EVALUATION')];
  let launches = 0;
  const { controller, running, launched } = harness({ ready, launch: (candidate) => {
    launches += 1;
    if (launches === 1) return first.promise.finally(() => running.delete(candidate.task_id));
    return new Promise(() => {});
  } });
  await controller.tick();
  first.resolve();
  await first.promise;
  await new Promise((resolve) => setImmediate(resolve));
  await controller.tick();
  assert.equal(launched.length, 2);
  assert.equal(launched[0].slotId, launched[1].slotId);
});

test('ownership overlap blocks simultaneous writes', () => {
  assert.equal(ownershipOverlaps(['app/api'], ['app/api/route.ts']), true);
  assert.equal(ownershipOverlaps(['app/home/page.tsx'], ['lib/seo.ts']), false);
});

test('intake and synchronization deadlines fail closed without blocking launches', async () => {
  const never = () => new Promise(() => {});
  const { controller } = harness({ ready: [task('t1','CORE_INTELLIGENCE')], intake: never, sync: never });
  const snapshot = await controller.tick();
  assert.match(snapshot.lastError, /V4_LITE_INTAKE_TIMEOUT/);
  assert.match(snapshot.lastError, /V4_LITE_SYNC_TIMEOUT/);
  assert.equal(snapshot.activeCount, 1);
});

test('startup recovery rejects every inherited task without trusting its pid', () => {
  const failed = [];
  const recovered = recoverLiteStartupTasks({ listActive: () => [{ task_id:'old-a',child_pid:123 },{ task_id:'old-b',child_pid:456 }], failTask: (candidate, reason) => failed.push([candidate.task_id, reason]) });
  assert.deepEqual(recovered, ['old-a','old-b']);
  assert.deepEqual(failed, [['old-a','V4_LITE_STALE_TASK_AT_STARTUP'],['old-b','V4_LITE_STALE_TASK_AT_STARTUP']]);
});

test('worker rejection is observed and releases occupancy', async () => {
  const failure = deferred();
  const { controller } = harness({ ready: [task('t1','CORE_INTELLIGENCE')], launch: () => failure.promise });
  await controller.tick();
  failure.reject(new Error('worker failed'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.snapshot().activeCount, 0);
  assert.equal(controller.snapshot().lastError, 'worker failed');
});

test('deadline helper rejects invalid timeout configuration', async () => {
  await assert.rejects(() => withDeadline(async () => {}, 0, 'TEST'), /V4_LITE_OPERATION_TIMEOUT_INVALID/);
});
