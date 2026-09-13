import test from 'node:test';
import assert from 'node:assert/strict';

import { createSlotRegistry, candidateSlots, chooseAvailableSlot, claimSlot, releaseSlot } from '../../scripts/orchestration-v4/slot-scheduler.mjs';

test('slots express primary capacity and safe product fallback routing', () => {
  const registry = createSlotRegistry();
  assert.deepEqual(candidateSlots(registry, 'CORE_INTELLIGENCE'), ['local-a', 'local-b', 'local-e', 'local-f']);
  assert.deepEqual(candidateSlots(registry, 'DISCOVERY_INTELLIGENCE'), ['local-b', 'local-e', 'local-f']);
  assert.deepEqual(candidateSlots(registry, 'INTELLIGENCE_UX'), ['local-c', 'local-e', 'local-f']);
  assert.deepEqual(candidateSlots(registry, 'PRODUCTION_VALUE'), ['local-c', 'local-e', 'local-f']);
  assert.deepEqual(candidateSlots(registry, 'HIGHEST_VALUE_SPECIALIST'), ['local-d', 'local-e', 'local-f']);
  assert.deepEqual(candidateSlots(registry, 'AGENT_ORCHESTRATION'), ['local-d']);
  assert.deepEqual(candidateSlots(registry, 'ORCHESTRATION_SYSTEMS'), ['local-d']);
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

  const protectedDiscovery = chooseAvailableSlot(registry, { stream: 'CORE_INTELLIGENCE', occupied, readyStreams: new Set(['CORE_INTELLIGENCE', 'DISCOVERY_INTELLIGENCE', 'INTEGRATION_RELEASE', 'QA_EVALUATION']) });
  assert.equal(protectedDiscovery, null);

  const primaryDiscovery = chooseAvailableSlot(registry, { stream: 'DISCOVERY_INTELLIGENCE', occupied: new Set(), readyStreams: new Set(['DISCOVERY_INTELLIGENCE']) });
  assert.equal(primaryDiscovery?.workerId, 'local-b');
});

test('local-e preserves integration priority but backfills useful work when integration is absent', () => {
  const registry = createSlotRegistry();

  const integration = chooseAvailableSlot(registry, {
    stream: 'INTEGRATION_RELEASE',
    occupied: new Set(),
    readyStreams: new Set(['INTEGRATION_RELEASE', 'INTELLIGENCE_UX']),
  });
  assert.equal(integration?.workerId, 'local-e');

  const protectedLocalE = chooseAvailableSlot(registry, {
    stream: 'INTELLIGENCE_UX',
    occupied: new Set(['local-c']),
    readyStreams: new Set(['INTELLIGENCE_UX', 'INTEGRATION_RELEASE', 'QA_EVALUATION']),
  });
  assert.equal(protectedLocalE, null);

  const productiveFallback = chooseAvailableSlot(registry, {
    stream: 'INTELLIGENCE_UX',
    occupied: new Set(['local-c']),
    readyStreams: new Set(['INTELLIGENCE_UX']),
  });
  assert.equal(productiveFallback?.workerId, 'local-e');

  const specialistFallback = chooseAvailableSlot(registry, {
    stream: 'HIGHEST_VALUE_SPECIALIST',
    occupied: new Set(['local-d']),
    readyStreams: new Set(['HIGHEST_VALUE_SPECIALIST']),
  });
  assert.equal(specialistFallback?.workerId, 'local-e');
});

test('local-f protects QA first and backfills product work only when QA is absent', () => {
  const registry = createSlotRegistry();
  const occupied = new Set(['local-a', 'local-b', 'local-e']);

  const protectedForQa = chooseAvailableSlot(registry, {
    stream: 'CORE_INTELLIGENCE',
    occupied,
    readyStreams: new Set(['CORE_INTELLIGENCE', 'QA_EVALUATION']),
  });
  assert.equal(protectedForQa, null);

  const productFallback = chooseAvailableSlot(registry, {
    stream: 'CORE_INTELLIGENCE',
    occupied,
    readyStreams: new Set(['CORE_INTELLIGENCE']),
  });
  assert.equal(productFallback?.workerId, 'local-f');

  const qaPrimary = chooseAvailableSlot(registry, {
    stream: 'QA_EVALUATION',
    occupied: new Set(),
    readyStreams: new Set(['QA_EVALUATION', 'CORE_INTELLIGENCE']),
  });
  assert.equal(qaPrimary?.workerId, 'local-f');
});

test('claim and release are task-scoped and fail closed on cross-task release', () => {
  let registry = createSlotRegistry();
  registry = claimSlot(registry, {
    workerId: 'local-a',
    taskId: 'task-one',
    issueNumber: 101,
    stream: 'CORE_INTELLIGENCE',
  });
  assert.deepEqual(candidateSlots(registry, 'CORE_INTELLIGENCE'), ['local-b', 'local-e', 'local-f']);
  assert.throws(() => releaseSlot(registry, { workerId: 'local-a', taskId: 'task-two' }), /V4_SLOT_OWNERSHIP_MISMATCH/);
  registry = releaseSlot(registry, { workerId: 'local-a', taskId: 'task-one' });
  assert.deepEqual(candidateSlots(registry, 'CORE_INTELLIGENCE'), ['local-a', 'local-b', 'local-e', 'local-f']);
});

test('orchestration and integration claims remain forbidden on local-f', () => {
  const registry = createSlotRegistry();
  assert.throws(() => claimSlot(registry, {
    workerId: 'local-f',
    taskId: 'bad-orchestration-route',
    issueNumber: 102,
    stream: 'AGENT_ORCHESTRATION',
  }), /V4_SLOT_STREAM_MISMATCH/);
  assert.throws(() => claimSlot(registry, {
    workerId: 'local-f',
    taskId: 'bad-integration-route',
    issueNumber: 103,
    stream: 'INTEGRATION_RELEASE',
  }), /V4_SLOT_STREAM_MISMATCH/);
  assert.throws(() => claimSlot(registry, {
    workerId: 'local-e',
    taskId: 'bad-qa-route',
    issueNumber: 104,
    stream: 'QA_EVALUATION',
  }), /V4_SLOT_STREAM_MISMATCH/);
});
