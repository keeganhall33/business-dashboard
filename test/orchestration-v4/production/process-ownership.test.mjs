import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyProcessOwnership,
  PROCESS_OWNERSHIP_CLASSIFICATIONS,
} from '../../../scripts/orchestration-v4/production/process-ownership.mjs';

const expected = Object.freeze({
  pid: 200,
  hostPid: 100,
  processGroupId: 200,
  entrypoint: '/runner/agent-task-entrypoint.mjs',
  taskId: 'v4-task-123',
});

function observed(overrides = {}) {
  return {
    exists: true,
    pid: 200,
    ppid: 100,
    processGroupId: 200,
    hostAncestors: [100],
    command: 'node /runner/agent-task-entrypoint.mjs v4-task-123',
    ...overrides,
  };
}

function assertDenied(value, classification) {
  assert.equal(value.classification, classification);
  assert.equal(value.verified, false);
  assert.equal(value.maySignal, false);
  assert.equal(value.mayAdopt, false);
}

test('verifies the expected current direct child', () => {
  const value = classifyProcessOwnership({ expected, observed: observed() });
  assert.equal(value.classification, PROCESS_OWNERSHIP_CLASSIFICATIONS.VERIFIED_CURRENT_CHILD);
  assert.equal(value.reason, 'PROCESS_IDENTITY_VERIFIED');
  assert.equal(value.verified, true);
  assert.equal(value.maySignal, true);
  assert.equal(value.mayAdopt, true);
});

test('verifies an owned descendant in the expected process group', () => {
  const value = classifyProcessOwnership({
    expected,
    observed: observed({ ppid: 150, hostAncestors: [150, 100] }),
  });
  assert.equal(value.classification, PROCESS_OWNERSHIP_CLASSIFICATIONS.VERIFIED_CURRENT_CHILD);
  assert.equal(value.verified, true);
});

test('rejects a live PPID-1 orphan', () => {
  assertDenied(
    classifyProcessOwnership({ expected, observed: observed({ ppid: 1, hostAncestors: [] }) }),
    PROCESS_OWNERSHIP_CLASSIFICATIONS.PPID1_ORPHAN,
  );
});

test('classifies a missing process', () => {
  assertDenied(
    classifyProcessOwnership({ expected, observed: { exists: false } }),
    PROCESS_OWNERSHIP_CLASSIFICATIONS.PROCESS_MISSING,
  );
});

test('rejects PID reuse', () => {
  assertDenied(
    classifyProcessOwnership({ expected, observed: observed({ pid: 201 }) }),
    PROCESS_OWNERSHIP_CLASSIFICATIONS.PID_REUSED,
  );
});

test('rejects an entrypoint mismatch', () => {
  assertDenied(
    classifyProcessOwnership({
      expected,
      observed: observed({ command: 'node /tmp/not-v4.mjs v4-task-123' }),
    }),
    PROCESS_OWNERSHIP_CLASSIFICATIONS.ENTRYPOINT_MISMATCH,
  );
});

test('rejects a task identity mismatch', () => {
  assertDenied(
    classifyProcessOwnership({
      expected,
      observed: observed({ command: 'node /runner/agent-task-entrypoint.mjs another-task' }),
    }),
    PROCESS_OWNERSHIP_CLASSIFICATIONS.TASK_ID_MISMATCH,
  );
});

test('rejects a process outside the current host tree', () => {
  assertDenied(
    classifyProcessOwnership({ expected, observed: observed({ ppid: 150, hostAncestors: [150, 99] }) }),
    PROCESS_OWNERSHIP_CLASSIFICATIONS.HOST_TREE_MISMATCH,
  );
});

test('rejects a mismatched process group', () => {
  assertDenied(
    classifyProcessOwnership({ expected, observed: observed({ processGroupId: 999 }) }),
    PROCESS_OWNERSHIP_CLASSIFICATIONS.HOST_TREE_MISMATCH,
  );
});

test('fails closed for incomplete or unknown facts', () => {
  assertDenied(
    classifyProcessOwnership(),
    PROCESS_OWNERSHIP_CLASSIFICATIONS.UNKNOWN,
  );
  assertDenied(
    classifyProcessOwnership({ expected, observed: observed({ command: null }) }),
    PROCESS_OWNERSHIP_CLASSIFICATIONS.UNKNOWN,
  );
});

test('only a verified process can be signaled or adopted', () => {
  const cases = [
    observed({ ppid: 1, hostAncestors: [] }),
    observed({ pid: 201 }),
    observed({ command: 'node /tmp/not-v4.mjs v4-task-123' }),
    observed({ command: 'node /runner/agent-task-entrypoint.mjs another-task' }),
    observed({ ppid: 150, hostAncestors: [99] }),
    { exists: false },
  ];
  for (const facts of cases) {
    const value = classifyProcessOwnership({ expected, observed: facts });
    assert.equal(value.maySignal, false);
    assert.equal(value.mayAdopt, false);
  }
});
