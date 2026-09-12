import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDeliveryHealth, selectDeliveryReadyTasks } from '../../scripts/orchestration-v4/delivery-policy.mjs';
import { runRequiredQualityGates } from '../../scripts/orchestration-v4/quality-gates.mjs';

function task(id, overrides = {}) {
  const contract = {
    deliveryMode: 'VERTICAL_SLICE',
    sliceId: 'slice-a',
    sliceStage: 'IMPLEMENTATION',
    priority: 'P1',
    dependsOn: '',
    qualityGates: 'DIFF_CHECK,TYPECHECK,TEST',
    outcome: 'A real outcome',
    ...overrides.contract,
  };
  return {
    task_id: id,
    issue_number: Number(id.replace(/\D/g, '')) || 1,
    stream: 'CORE_INTELLIGENCE',
    state: 'READY',
    created_at: '2026-09-12T00:00:00.000Z',
    contract_json: JSON.stringify(contract),
    ...overrides,
    contract_json: JSON.stringify(contract),
  };
}

test('delivery selection prioritizes outcomes, honors dependencies, and caps active slices', () => {
  const tasks = [
    task('done-1', { state: 'COMPLETE', contract: { sliceId: 'slice-a', sliceStage: 'CONTRACT' } }),
    task('a-2', { contract: { sliceId: 'slice-a', dependsOn: 'done-1', priority: 'P1' } }),
    task('b-1', { contract: { sliceId: 'slice-b', priority: 'P0' } }),
    task('c-1', { contract: { sliceId: 'slice-c', priority: 'P1' } }),
    task('d-1', { contract: { sliceId: 'slice-d', priority: 'P2' } }),
    task('blocked-1', { contract: { sliceId: 'slice-a', dependsOn: 'missing-task', priority: 'P0' } }),
  ];
  const result = selectDeliveryReadyTasks(tasks, { maxActiveSlices: 3, maxExecutableTasks: 5 });
  assert.deepEqual(result.selected.map((row) => row.task_id), ['b-1', 'c-1', 'a-2']);
  assert.equal(result.deferred.find((row) => row.taskId === 'blocked-1')?.reason, 'DEPENDENCY_NOT_COMPLETE');
  assert.equal(result.deferred.find((row) => row.taskId === 'd-1')?.reason, 'SLICE_WIP_LIMIT');
});

test('delivery health counts only production-verified slices as operational', () => {
  const health = buildDeliveryHealth([
    task('impl-1', { state: 'COMPLETE', contract: { sliceId: 'followup', sliceStage: 'IMPLEMENTATION' } }),
    task('verify-1', { state: 'READY', contract: { sliceId: 'followup', sliceStage: 'PRODUCTION_VERIFICATION' } }),
    task('verify-2', { state: 'COMPLETE', contract: { sliceId: 'brief', sliceStage: 'PRODUCTION_VERIFICATION' } }),
  ], '2026-09-12T12:00:00.000Z');
  assert.equal(health.activeSlices, 1);
  assert.equal(health.operationalSlices, 1);
  assert.equal(health.slices.find((slice) => slice.sliceId === 'followup')?.operational, false);
});

test('quality gates are machine-run and fail closed on the first failure', () => {
  const calls = [];
  const result = runRequiredQualityGates({
    workspacePath: '/tmp/workspace',
    contract: { deliveryMode: 'VERTICAL_SLICE', qualityGates: 'DIFF_CHECK,TYPECHECK,TEST' },
    run(command, args) {
      calls.push([command, args]);
      return { status: command === 'npx' ? 1 : 0, stdout: '', stderr: command === 'npx' ? 'type error' : '' };
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'V4_QUALITY_GATE_FAILED:TYPECHECK');
  assert.equal(calls.length, 2);
});
