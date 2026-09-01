import test from 'node:test';
import assert from 'node:assert/strict';

import { createSlotRegistry, candidateSlots, chooseAvailableSlot, claimSlot, releaseSlot } from '../../scripts/orchestration-v4/slot-scheduler.mjs';

test('slots express capacity and routing only', () => {
  const registry = createSlotRegistry();
  assert.deepEqual(candidateSlots(registry, 'CORE_INTELLIGENCE'), ['local-a', 'local-b']);
  assert.deepEqual(candidateSlots(registry, 'DISCOVERY_INTELLIGENCE'), ['local-b']);
  assert.deepEqual(candidateSlots(registry, 'INTELLIGENCE_UX'), ['local-c']);
  assert.deepEqual(candidateSlots(registry, 'AGENT_ORCHESTRATION'), ['local-d']);
  assert.deepEqual(candidateSlots(registry, 'INTEGRATION_RELEASE'), ['local-e']);
  assert.deepEqual(candidateSlots(registry, 'QA_EVALUATION'), ['local-f']);

  for (const slot of registry.values()) {
    assert.equal('worktree' in slot, false);
    assert.equal('branch' in slot, false);
    assert.equal('head' in slot, false);
  }
});

test('overflow uses compatible idle capacity only when its primary stream is not ready', () => {
  const registry = createSlotRegistry();
  const occupied = new Set(['local-a']);
  const overflow = chooseAvailableSlot(registry, { stream: 'CORE_INTELLIGENCE', occupied, readyStreams: new Set(['CORE_INTELLIGENCE']) });
  assert.equal(overflow?.workerId, 'local-b');

  const protectedDiscovery = chooseAvailableSlot(registry, { stream: 'CORE_INTELLIGENCE', occupied, readyStreams: new Set(['CORE_INTELLIGENCE', 'DISCOVERY_INTELLIGENCE']) });
  assert.equal(protectedDiscovery, null);

  const primaryDiscovery = chooseAvailableSlot(registry, { stream: 'DISCOVERY_INTELLIGENCE', occupied: new Set(), readyStreams: new Set(['DISCOVERY_INTELLIGENCE']) });
  assert.equal(primaryDiscovery?.workerId, 'local-b');
});

test('claim and release are task-scoped and fail closed on cross-task release', () => {
  let registry = createSlotRegistry();
  registry = claimSlot(registry, {
    workerId: 'local-a',
    taskId: 'task-one',
    issueNumber: 101,
    stream: 'CORE_INTELLIGENCE',
  });
  assert.deepEqual(candidateSlots(registry, 'CORE_INTELLIGENCE'), ['local-b']);
  assert.throws(() => releaseSlot(registry, { workerId: 'local-a', taskId: 'task-two' }), /V4_SLOT_OWNERSHIP_MISMATCH/);
  registry = releaseSlot(registry, { workerId: 'local-a', taskId: 'task-one' });
  assert.deepEqual(candidateSlots(registry, 'CORE_INTELLIGENCE'), ['local-a', 'local-b']);
});

test('wrong-stream claims are rejected before execution', () => {
  const registry = createSlotRegistry();
  assert.throws(() => claimSlot(registry, {
    workerId: 'local-f',
    taskId: 'bad-route',
    issueNumber: 102,
    stream: 'CORE_INTELLIGENCE',
  }), /V4_SLOT_STREAM_MISMATCH/);
});
