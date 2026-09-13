import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DETERMINISTIC_VERIFIERS,
  buildIonosPreviewInvocation,
  deterministicVerificationCommandForTask,
  runDeterministicVerification,
} from '../../../scripts/orchestration-v4/production/deterministic-verification-executor.mjs';

function task(contract = {}) {
  const taskId = contract.taskId ?? 'ionos-live-verification';
  const issueNumber = contract.issueNumber ?? 1508;
  return {
    task_id: taskId,
    issue_number: issueNumber,
    contract_json: JSON.stringify({
      taskId,
      issueNumber,
      taskMutability: 'VALIDATION_EVIDENCE_ONLY',
      sliceStage: 'PRODUCTION_VERIFICATION',
      deterministicVerifier: DETERMINISTIC_VERIFIERS.IONOS_HISTORICAL_PREVIEW_V1,
      ...contract,
    }),
  };
}

test('ordinary tasks remain on the existing agent route', () => {
  assert.equal(deterministicVerificationCommandForTask(task({ deterministicVerifier: null })), null);
});

test('eligible task receives only the fixed deterministic wrapper and admitted identity', () => {
  const spec = deterministicVerificationCommandForTask(task());
  assert.equal(spec.command, process.execPath);
  assert.equal(spec.args.length, 4);
  assert.match(spec.args[0], /deterministic-verification-executor\.mjs$/);
  assert.deepEqual(spec.args.slice(1), [
    DETERMINISTIC_VERIFIERS.IONOS_HISTORICAL_PREVIEW_V1,
    'ionos-live-verification',
    '1508',
  ]);
  assert.equal(spec.buildCorrectionAttempt, undefined);
});

test('unknown verifier, wrong stage, and mismatched identity fail closed', () => {
  assert.throws(() => deterministicVerificationCommandForTask(task({ deterministicVerifier: 'ARBITRARY' })), /V4_DETERMINISTIC_VERIFIER_NOT_ALLOWLISTED/);
  assert.throws(() => deterministicVerificationCommandForTask(task({ sliceStage: 'IMPLEMENTATION' })), /V4_DETERMINISTIC_VERIFIER_TASK_INELIGIBLE/);
  const mismatched = task();
  mismatched.issue_number = 1509;
  assert.throws(() => deterministicVerificationCommandForTask(mismatched), /V4_DETERMINISTIC_CONTRACT_IDENTITY_MISMATCH/);
});

test('IONOS invocation is fixed, task-bound, and checks only required environment presence', () => {
  const workspacePath = '/tmp/v4-workspace';
  const invocation = buildIonosPreviewInvocation({
    taskId: 'ionos-live-verification',
    issueNumber: 1508,
    workspacePath,
    env: {
      IONOS_MAILBOX_CONFIG_JSON: 'present',
      IONOS_HISTORICAL_PREVIEW_JSON: 'present',
      SAFE_UNRELATED_VALUE: 'retained',
      V4_PRODUCTION_TASK_ID: 'untrusted',
      V4_PRODUCTION_ISSUE_NUMBER: '999',
    },
  });
  assert.equal(invocation.command, process.execPath);
  assert.equal(invocation.args.length, 2);
  assert.match(invocation.args[0], /tsx.*cli/i);
  assert.equal(invocation.args[1], '/tmp/v4-workspace/scripts/run-ionos-historical-intelligence-preview-v1.ts');
  assert.equal(invocation.cwd, workspacePath);
  assert.equal(invocation.env.V4_PRODUCTION_TASK_ID, 'ionos-live-verification');
  assert.equal(invocation.env.V4_PRODUCTION_ISSUE_NUMBER, '1508');
  assert.equal(invocation.env.OPENCLAW_WORKSPACE_DIR, workspacePath);
  assert.equal(invocation.env.SAFE_UNRELATED_VALUE, 'retained');
});

test('missing inherited configuration and timeout overrides fail before execution', async () => {
  assert.throws(() => buildIonosPreviewInvocation({
    taskId: 'ionos-live-verification',
    issueNumber: 1508,
    workspacePath: '/tmp/v4-workspace',
    env: { IONOS_MAILBOX_CONFIG_JSON: 'present' },
  }), /V4_DETERMINISTIC_REQUIRED_ENV_MISSING:IONOS_HISTORICAL_PREVIEW_JSON/);
  await assert.rejects(runDeterministicVerification({
    verifier: DETERMINISTIC_VERIFIERS.IONOS_HISTORICAL_PREVIEW_V1,
    taskId: 'ionos-live-verification',
    issueNumber: 1508,
    workspacePath: '/tmp/v4-workspace',
    env: {
      IONOS_MAILBOX_CONFIG_JSON: 'present',
      IONOS_HISTORICAL_PREVIEW_JSON: 'present',
    },
    timeoutMs: 1,
    spawnProcess: () => { throw new Error('MUST_NOT_EXECUTE'); },
  }), /V4_DETERMINISTIC_TIMEOUT_OVERRIDE_FORBIDDEN/);
});
