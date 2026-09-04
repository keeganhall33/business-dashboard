const CLASSIFICATIONS = Object.freeze({
  VERIFIED_CURRENT_CHILD: 'VERIFIED_CURRENT_CHILD',
  PPID1_ORPHAN: 'PPID1_ORPHAN',
  PID_REUSED: 'PID_REUSED',
  ENTRYPOINT_MISMATCH: 'ENTRYPOINT_MISMATCH',
  TASK_ID_MISMATCH: 'TASK_ID_MISMATCH',
  HOST_TREE_MISMATCH: 'HOST_TREE_MISMATCH',
  PROCESS_MISSING: 'PROCESS_MISSING',
  UNKNOWN: 'UNKNOWN',
});

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function result(classification, reason, verified = false) {
  return Object.freeze({
    classification,
    reason,
    verified,
    maySignal: verified,
    mayAdopt: verified,
  });
}

function hasCommandToken(command, token) {
  return typeof command === 'string'
    && typeof token === 'string'
    && token.length > 0
    && command.includes(token);
}

/**
 * Classify caller-supplied process facts without inspecting or mutating the host.
 *
 * expected: { pid, hostPid, processGroupId, entrypoint, taskId }
 * observed: { exists, pid, ppid, processGroupId, hostAncestors, command }
 */
export function classifyProcessOwnership({ expected, observed } = {}) {
  if (!expected || !observed || typeof observed.exists !== 'boolean') {
    return result(CLASSIFICATIONS.UNKNOWN, 'PROCESS_FACTS_INCOMPLETE');
  }

  if (observed.exists === false) {
    return result(CLASSIFICATIONS.PROCESS_MISSING, 'PROCESS_NOT_FOUND');
  }

  const requiredExpected = [
    expected.pid,
    expected.hostPid,
    expected.processGroupId,
  ];
  const requiredObserved = [
    observed.pid,
    observed.ppid,
    observed.processGroupId,
  ];
  if (
    requiredExpected.some((value) => !positiveInteger(value))
    || requiredObserved.some((value) => !positiveInteger(value))
    || !Array.isArray(observed.hostAncestors)
    || typeof observed.command !== 'string'
    || typeof expected.entrypoint !== 'string'
    || typeof expected.taskId !== 'string'
    || expected.entrypoint.length === 0
    || expected.taskId.length === 0
  ) {
    return result(CLASSIFICATIONS.UNKNOWN, 'PROCESS_FACTS_INCOMPLETE');
  }

  if (observed.pid !== expected.pid) {
    return result(CLASSIFICATIONS.PID_REUSED, 'RECORDED_PID_IDENTITY_CHANGED');
  }

  if (observed.ppid === 1) {
    return result(CLASSIFICATIONS.PPID1_ORPHAN, 'WORKER_REPARENTED_TO_INIT');
  }

  if (!hasCommandToken(observed.command, expected.entrypoint)) {
    return result(CLASSIFICATIONS.ENTRYPOINT_MISMATCH, 'EXPECTED_ENTRYPOINT_NOT_PRESENT');
  }

  if (!hasCommandToken(observed.command, expected.taskId)) {
    return result(CLASSIFICATIONS.TASK_ID_MISMATCH, 'EXPECTED_TASK_ID_NOT_PRESENT');
  }

  const directChild = observed.ppid === expected.hostPid;
  const ownedDescendant = observed.hostAncestors.includes(expected.hostPid)
    && observed.processGroupId === expected.processGroupId;
  if (!directChild && !ownedDescendant) {
    return result(CLASSIFICATIONS.HOST_TREE_MISMATCH, 'PROCESS_NOT_OWNED_BY_CURRENT_HOST');
  }

  if (observed.processGroupId !== expected.processGroupId) {
    return result(CLASSIFICATIONS.HOST_TREE_MISMATCH, 'PROCESS_GROUP_MISMATCH');
  }

  return result(CLASSIFICATIONS.VERIFIED_CURRENT_CHILD, 'PROCESS_IDENTITY_VERIFIED', true);
}

export const PROCESS_OWNERSHIP_CLASSIFICATIONS = CLASSIFICATIONS;
