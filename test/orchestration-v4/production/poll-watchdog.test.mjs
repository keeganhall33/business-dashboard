import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceClaimStarvationWatchdog,
  buildLivenessTelemetry,
  progressAt,
  verifyTaskProcessIdentity,
} from '../../../scripts/orchestration-v4/production/poll-watchdog.mjs';

test('process identity rejects orphan, reused pid, and process-group mismatch', () => {
  const task = { task_id: 'task-1712', child_pid: 42, process_group_id: 77 };
  const observed = (overrides = {}) => ({ exists: true, pid: 42, ppid: 100, processGroupId: 77, hostAncestors: [100], command: 'node agent-task-entrypoint.mjs task-1712', ...overrides });
  assert.equal(verifyTaskProcessIdentity(task, { hostPid: 100, inspect: () => observed({ ppid: 1, hostAncestors: [] }) }).reason, 'WORKER_REPARENTED_TO_INIT');
  assert.equal(verifyTaskProcessIdentity(task, { hostPid: 100, inspect: () => observed({ processGroupId: 78 }) }).reason, 'PROCESS_GROUP_MISMATCH');
  assert.equal(verifyTaskProcessIdentity(task, { hostPid: 100, inspect: () => observed({ command: 'node agent-task-entrypoint.mjs different-task' }) }).reason, 'EXPECTED_TASK_ID_NOT_PRESENT');
  assert.equal(verifyTaskProcessIdentity(task, { hostPid: 100, inspect: () => observed() }).trusted, true);
});

test('phase advancement counts as progress when semantic evidence is absent', () => {
  assert.equal(progressAt({ semantic_progress_at: null, updated_at: '2026-09-15T01:00:00Z' }), '2026-09-15T01:00:00Z');
  assert.equal(progressAt({ semantic_progress_at: '2026-09-15T01:01:00Z', updated_at: '2026-09-15T01:02:00Z' }), '2026-09-15T01:01:00Z');
});

test('claim starvation surfaces after two normal cycles and clears after claimability changes', () => {
  const telemetry = buildLivenessTelemetry({
    tasks: [{ state: 'READY' }],
    continuity: { eligibleReadyCount: 1, utilization: { allowedSlots: 3 } },
    daemonPhase: 'POLLING',
  });
  const first = advanceClaimStarvationWatchdog(null, telemetry);
  const second = advanceClaimStarvationWatchdog(first, telemetry);
  assert.equal(first.fault, false);
  assert.equal(second.fault, true);
  assert.equal(second.reason, 'V4_CLAIMABLE_READY_STARVATION');
  const cleared = advanceClaimStarvationWatchdog(second, { ...telemetry, claimableReady: 0 });
  assert.deepEqual(cleared, { consecutiveCycles: 0, fault: false, reason: null });
});
