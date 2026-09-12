import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDeliveryHealth, selectDeliveryReadyTasks, validateDeliveryFields } from '../../scripts/orchestration-v4/delivery-policy.mjs';
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
    featureName: 'Useful feature',
    releaseTarget: 'V1',
    launchPolicy: 'IMMEDIATE_AFTER_VERIFICATION',
    rollbackCondition: 'Rollback on production verification failure.',
    ...overrides.contract,
  };
  const issueNumber = overrides.issue_number || Number(id.replace(/\D/g, '')) || 1;
  const state = overrides.state || 'READY';
  const resultJson = Object.hasOwn(overrides, 'result_json')
    ? overrides.result_json
    : state === 'COMPLETE' && contract.sliceStage === 'PRODUCTION_VERIFICATION'
      ? JSON.stringify({
        productionVerification: {
          verified: true,
          contractVersion: 'PRODUCTION_VERIFICATION_V1',
          taskId: id,
          issueNumber,
        },
      })
      : null;
  return {
    task_id: id,
    issue_number: issueNumber,
    stream: 'CORE_INTELLIGENCE',
    state,
    created_at: '2026-09-12T00:00:00.000Z',
    updated_at: '2026-09-12T00:00:00.000Z',
    contract_json: JSON.stringify(contract),
    ...overrides,
    result_json: resultJson,
    contract_json: JSON.stringify(contract),
  };
}

test('completed production verification without machine evidence fails closed', () => {
  const report = buildDeliveryHealth([
    task('verify-44', {
      state: 'COMPLETE',
      result_json: JSON.stringify({ execution: { status: 'COMPLETE', code: 0 } }),
      contract: { sliceId: 'email-proof', sliceStage: 'PRODUCTION_VERIFICATION' },
    }),
  ]);
  assert.equal(report.operationalSlices, 0);
  assert.equal(report.availableFeatures, 0);
  assert.equal(report.blockedSlices, 1);
  assert.equal(report.slices[0].launchState, 'EVIDENCE_MISSING');
  assert.equal(report.slices[0].blockerReason, 'PRODUCTION_EVIDENCE_NOT_VERIFIED');
});

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
  assert.equal(health.availableFeatures, 1);
  assert.equal(health.releases.find((release) => release.releaseTarget === 'V1')?.availableFeatures, 1);
  assert.equal(health.slices.find((slice) => slice.sliceId === 'followup')?.operational, false);
});

test('verified features launch independently without waiting for their release bundle', () => {
  const health = buildDeliveryHealth([
    task('verify-10', {
      state: 'COMPLETE',
      created_at: '2026-09-10T00:00:00.000Z',
      updated_at: '2026-09-11T00:00:00.000Z',
      contract: { sliceId: 'crm-links', sliceStage: 'PRODUCTION_VERIFICATION', featureName: 'CRM links', releaseTarget: 'V1' },
    }),
    task('build-11', { contract: { sliceId: 'strategy', featureName: 'Strategy', releaseTarget: 'V1' } }),
  ], '2026-09-12T00:00:00.000Z');
  assert.equal(health.slices.find((slice) => slice.sliceId === 'crm-links')?.launchState, 'AVAILABLE');
  assert.equal(health.slices.find((slice) => slice.sliceId === 'strategy')?.launchState, 'BUILDING');
  assert.equal(health.releases[0].certificationReady, false);
  assert.equal(health.medianCycleTimeHours, 24);
  assert.equal(health.throughputLast7Days, 1);
});

test('bundling requires an explicit exception and holds a verified feature', () => {
  const health = buildDeliveryHealth([
    task('verify-20', {
      state: 'COMPLETE',
      contract: { sliceId: 'atomic-change', sliceStage: 'PRODUCTION_VERIFICATION', launchPolicy: 'BUNDLED_ONLY', bundleReason: 'Requires an atomic schema cutover.' },
    }),
  ]);
  assert.equal(health.availableFeatures, 0);
  assert.equal(health.verifiedHeldFeatures, 1);
  assert.equal(health.slices[0].launchState, 'VERIFIED_HELD');
});

test('latest production verification supersedes an older failed attempt', () => {
  const health = buildDeliveryHealth([
    task('verify-30', { state: 'FAILED', updated_at: '2026-09-11T00:00:00.000Z', contract: { sliceId: 'retry', sliceStage: 'PRODUCTION_VERIFICATION' } }),
    task('verify-31', { state: 'COMPLETE', updated_at: '2026-09-12T00:00:00.000Z', contract: { sliceId: 'retry', sliceStage: 'PRODUCTION_VERIFICATION' } }),
  ]);
  assert.equal(health.slices[0].launchState, 'AVAILABLE');
});

test('delivery health exposes unresolved semantic stalls and retry diagnostics', () => {
  const health = buildDeliveryHealth([
    task('verify-40', {
      state: 'RUNNING',
      semantic_progress_seq: 2,
      semantic_progress_at: '2026-09-12T18:04:43.000Z',
      contract: { sliceId: 'email', sliceStage: 'PRODUCTION_VERIFICATION' },
    }),
  ], '2026-09-12T18:44:00.000Z', [{
    task_id: 'verify-40',
    attempt: 2,
    reason: 'SEMANTIC_PROGRESS_STALL',
    created_at: '2026-09-12T18:34:43.000Z',
  }]);

  assert.equal(health.stalledSlices, 1);
  assert.equal(health.activeSlices, 1);
  assert.equal(health.slices[0].launchState, 'RECOVERING');
  assert.equal(health.slices[0].status, 'RECOVERING');
  assert.equal(health.slices[0].correctionAttempts, 1);
  assert.equal(health.slices[0].tasks[0].recoveryState, 'STALLED_RETRYING');
});

test('delivery health exposes terminal blocker reasons', () => {
  const health = buildDeliveryHealth([
    task('verify-41', {
      state: 'BLOCKED',
      terminal_reason: 'REPLAN_REQUIRED',
      contract: { sliceId: 'email', sliceStage: 'PRODUCTION_VERIFICATION' },
    }),
  ]);
  assert.equal(health.blockedSlices, 1);
  assert.equal(health.slices[0].blockerReason, 'REPLAN_REQUIRED');
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

test('rolling launch contracts default to independent release and fail closed when incomplete', () => {
  const base = {
    delivery_mode: 'VERTICAL_SLICE', priority: 'P1', slice_id: 'strategy', slice_stage: 'IMPLEMENTATION',
    outcome: 'Strategy is usable.', user_flow: 'evidence -> decision', definition_of_done: 'Production verified.',
    quality_gates: 'DIFF_CHECK,TYPECHECK,TEST', feature_name: 'Strategy workspace', release_target: 'V1',
    launch_policy: 'IMMEDIATE_AFTER_VERIFICATION', rollback_condition: 'Rollback when production verification fails.',
  };
  assert.deepEqual(validateDeliveryFields(base), []);
  assert.ok(validateDeliveryFields({ ...base, feature_name: '' }).includes('FEATURE_NAME_REQUIRED'));
  assert.ok(validateDeliveryFields({ ...base, release_target: 'SOMEDAY' }).includes('RELEASE_TARGET_INVALID'));
  assert.ok(validateDeliveryFields({ ...base, launch_policy: 'BUNDLED_ONLY', bundle_reason: 'NOT_BUNDLED' }).includes('BUNDLE_REASON_REQUIRED'));
});
