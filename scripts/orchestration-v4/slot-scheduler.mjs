const DEFAULT_SLOT_STREAMS = Object.freeze({
  'local-a': Object.freeze(['CORE_INTELLIGENCE', 'LEARNING_INTELLIGENCE', 'FINANCIAL_INTELLIGENCE']),
  'local-b': Object.freeze(['DISCOVERY_INTELLIGENCE', 'LEARNING_INTELLIGENCE', 'FINANCIAL_INTELLIGENCE', 'DATA_EVIDENCE_LEARNING']),
  'local-c': Object.freeze(['INTELLIGENCE_UX', 'PRODUCTION_VALUE']),
  'local-d': Object.freeze(['AGENT_ORCHESTRATION', 'ORCHESTRATION_SYSTEMS', 'HIGHEST_VALUE_SPECIALIST']),
  'local-e': Object.freeze(['INTEGRATION_RELEASE']),
  'local-f': Object.freeze(['QA_EVALUATION']),
});

export function createSlotRegistry(slotStreams = DEFAULT_SLOT_STREAMS) {
  return new Map(Object.entries(slotStreams).map(([workerId, streams]) => [workerId, Object.freeze({
    workerId,
    streams: Object.freeze([...streams]),
    taskId: null,
    issueNumber: null,
  })]));
}

export function candidateSlots(registry, stream) {
  return [...registry.values()]
    .filter((slot) => slot.taskId === null && slot.streams.includes(stream))
    .map((slot) => slot.workerId)
    .sort();
}

export function claimSlot(registry, { workerId, taskId, issueNumber, stream }) {
  const current = registry.get(workerId);
  if (!current) throw new Error(`V4_UNKNOWN_SLOT:${workerId}`);
  if (current.taskId !== null) throw new Error(`V4_SLOT_BUSY:${workerId}:${current.taskId}`);
  if (!current.streams.includes(stream)) throw new Error(`V4_SLOT_STREAM_MISMATCH:${workerId}:${stream}`);

  const next = new Map(registry);
  next.set(workerId, Object.freeze({ ...current, taskId, issueNumber }));
  return next;
}

export function releaseSlot(registry, { workerId, taskId }) {
  const current = registry.get(workerId);
  if (!current) throw new Error(`V4_UNKNOWN_SLOT:${workerId}`);
  if (current.taskId === null) return registry;
  if (current.taskId !== taskId) throw new Error(`V4_SLOT_OWNERSHIP_MISMATCH:${workerId}:${current.taskId}:${taskId}`);

  const next = new Map(registry);
  next.set(workerId, Object.freeze({ ...current, taskId: null, issueNumber: null }));
  return next;
}

export { DEFAULT_SLOT_STREAMS };
