import { getTaskContract } from './state-store/sqlite-store.mjs';

export const DELIVERY_MODES = Object.freeze(['VERTICAL_SLICE', 'PLATFORM_PRIMITIVE', 'DEFECT', 'LEGACY']);
export const SLICE_STAGES = Object.freeze(['DISCOVERY', 'CONTRACT', 'IMPLEMENTATION', 'INTEGRATION', 'PRODUCTION_VERIFICATION']);
export const QUALITY_GATES = Object.freeze(['DIFF_CHECK', 'TYPECHECK', 'TEST', 'LINT', 'BUILD']);
const ACTIVE_STATES = new Set(['CLAIMED', 'RUNNING', 'VALIDATING', 'PR_OPENED']);
const PRIORITY = Object.freeze({ P0: 0, P1: 1, P2: 2, P3: 3 });
const MODE = Object.freeze({ DEFECT: 0, VERTICAL_SLICE: 1, PLATFORM_PRIMITIVE: 2, LEGACY: 3 });

function csv(value = '') {
  return String(value).split(',').map((item) => item.trim()).filter((item) => item && item.toUpperCase() !== 'NONE');
}

export function deliveryMetadata(contract = {}) {
  const mode = String(contract.deliveryMode || 'LEGACY').toUpperCase();
  return Object.freeze({
    mode: DELIVERY_MODES.includes(mode) ? mode : 'LEGACY',
    sliceId: contract.sliceId || null,
    stage: contract.sliceStage || null,
    priority: contract.priority || 'P3',
    dependsOn: Array.isArray(contract.dependsOn) ? contract.dependsOn : csv(contract.dependsOn),
    qualityGates: Array.isArray(contract.qualityGates) ? contract.qualityGates : csv(contract.qualityGates),
    outcome: contract.outcome || null,
    userFlow: contract.userFlow || null,
    definitionOfDone: contract.definitionOfDone || null,
    productionEvidence: contract.productionEvidence || null,
  });
}

export function validateDeliveryFields(fields = {}) {
  const mode = String(fields.delivery_mode || '').toUpperCase();
  if (!mode) return [];
  const errors = [];
  if (!DELIVERY_MODES.includes(mode) || mode === 'LEGACY') errors.push('DELIVERY_MODE_INVALID');
  if (!fields.priority || !(fields.priority in PRIORITY)) errors.push('DELIVERY_PRIORITY_INVALID');
  if (mode === 'VERTICAL_SLICE') {
    if (!fields.slice_id) errors.push('SLICE_ID_REQUIRED');
    if (!SLICE_STAGES.includes(fields.slice_stage)) errors.push('SLICE_STAGE_INVALID');
    if (!fields.outcome) errors.push('SLICE_OUTCOME_REQUIRED');
    if (!fields.user_flow) errors.push('SLICE_USER_FLOW_REQUIRED');
    if (!fields.definition_of_done) errors.push('DEFINITION_OF_DONE_REQUIRED');
    const gates = csv(fields.quality_gates);
    for (const gate of gates) if (!QUALITY_GATES.includes(gate)) errors.push(`QUALITY_GATE_UNKNOWN:${gate}`);
    for (const required of ['DIFF_CHECK', 'TYPECHECK', 'TEST']) {
      if (!gates.includes(required)) errors.push(`QUALITY_GATE_${required}_REQUIRED`);
    }
    if (fields.slice_stage === 'INTEGRATION' && !gates.includes('BUILD')) errors.push('QUALITY_GATE_BUILD_REQUIRED');
    if (fields.slice_stage === 'PRODUCTION_VERIFICATION' && (!fields.production_evidence || fields.production_evidence === 'NOT_THIS_STAGE')) errors.push('PRODUCTION_EVIDENCE_REQUIRED');
  }
  if (mode === 'PLATFORM_PRIMITIVE') {
    if (!fields.slice_id) errors.push('PLATFORM_PRIMITIVE_SLICE_REQUIRED');
    if (!fields.outcome) errors.push('PLATFORM_PRIMITIVE_OUTCOME_REQUIRED');
    if (!fields.definition_of_done) errors.push('DEFINITION_OF_DONE_REQUIRED');
  }
  return errors;
}

function isDependencyComplete(taskById, dependencyId) {
  return taskById.get(dependencyId)?.state === 'COMPLETE';
}

export function selectDeliveryReadyTasks(tasks, { maxActiveSlices = 3, maxExecutableTasks = 5 } = {}) {
  const taskById = new Map(tasks.map((task) => [task.task_id, task]));
  const active = tasks.filter((task) => ACTIVE_STATES.has(task.state));
  const activeSliceIds = new Set(active.map((task) => deliveryMetadata(getTaskContract(task)).sliceId).filter(Boolean));
  const selected = [];
  const deferred = [];
  const admittedSlices = new Set(activeSliceIds);
  const runningPerSlice = new Map();
  for (const task of active) {
    const sliceId = deliveryMetadata(getTaskContract(task)).sliceId;
    if (sliceId) runningPerSlice.set(sliceId, (runningPerSlice.get(sliceId) || 0) + 1);
  }

  const ready = tasks.filter((task) => task.state === 'READY' && task.stream !== 'INTEGRATION_RELEASE').sort((left, right) => {
    const a = deliveryMetadata(getTaskContract(left));
    const b = deliveryMetadata(getTaskContract(right));
    return (PRIORITY[a.priority] ?? 3) - (PRIORITY[b.priority] ?? 3)
      || (MODE[a.mode] ?? 3) - (MODE[b.mode] ?? 3)
      || SLICE_STAGES.indexOf(a.stage) - SLICE_STAGES.indexOf(b.stage)
      || left.created_at.localeCompare(right.created_at)
      || left.issue_number - right.issue_number
      || left.task_id.localeCompare(right.task_id);
  });

  for (const task of ready) {
    const metadata = deliveryMetadata(getTaskContract(task));
    const unmet = metadata.dependsOn.filter((id) => !isDependencyComplete(taskById, id));
    if (unmet.length) {
      deferred.push({ taskId: task.task_id, reason: 'DEPENDENCY_NOT_COMPLETE', dependencies: unmet });
      continue;
    }
    if (metadata.sliceId && !admittedSlices.has(metadata.sliceId) && admittedSlices.size >= maxActiveSlices) {
      deferred.push({ taskId: task.task_id, reason: 'SLICE_WIP_LIMIT' });
      continue;
    }
    if (metadata.sliceId && (runningPerSlice.get(metadata.sliceId) || 0) >= 3) {
      deferred.push({ taskId: task.task_id, reason: 'SLICE_TASK_WIP_LIMIT' });
      continue;
    }
    if (selected.length >= maxExecutableTasks) {
      deferred.push({ taskId: task.task_id, reason: 'EXECUTABLE_WIP_LIMIT' });
      continue;
    }
    selected.push(task);
    if (metadata.sliceId) {
      admittedSlices.add(metadata.sliceId);
      runningPerSlice.set(metadata.sliceId, (runningPerSlice.get(metadata.sliceId) || 0) + 1);
    }
  }
  return Object.freeze({ selected, deferred, activeSliceIds: [...admittedSlices].sort() });
}

export function buildDeliveryHealth(tasks, generatedAt = new Date().toISOString()) {
  const slices = new Map();
  for (const task of tasks) {
    const metadata = deliveryMetadata(getTaskContract(task));
    if (!metadata.sliceId) continue;
    const current = slices.get(metadata.sliceId) || { sliceId: metadata.sliceId, outcome: metadata.outcome, tasks: [] };
    current.tasks.push({ taskId: task.task_id, issueNumber: task.issue_number, stage: metadata.stage, state: task.state });
    if (!current.outcome && metadata.outcome) current.outcome = metadata.outcome;
    slices.set(metadata.sliceId, current);
  }
  const rows = [...slices.values()].map((slice) => {
    const stageStates = Object.fromEntries(SLICE_STAGES.map((stage) => {
      const states = slice.tasks.filter((task) => task.stage === stage).map((task) => task.state);
      const aggregate = states.length === 0 ? null
        : states.every((state) => state === 'COMPLETE') ? 'COMPLETE'
          : states.find((state) => ['FAILED', 'TIMED_OUT', 'BLOCKED'].includes(state))
            || states.find((state) => ACTIVE_STATES.has(state))
            || states.find((state) => state === 'READY')
            || states[0];
      return [stage, aggregate];
    }));
    const verificationTasks = slice.tasks.filter((task) => task.stage === 'PRODUCTION_VERIFICATION');
    const operational = verificationTasks.length > 0 && verificationTasks.every((task) => task.state === 'COMPLETE');
    const blockedTasks = slice.tasks.filter((task) => ['BLOCKED', 'FAILED', 'TIMED_OUT'].includes(task.state)).length;
    const hasActiveWork = slice.tasks.some((task) => task.state === 'READY' || ACTIVE_STATES.has(task.state));
    return {
      ...slice,
      stages: stageStates,
      operational,
      blockedTasks,
      status: operational ? 'OPERATIONAL' : blockedTasks > 0 ? 'BLOCKED' : hasActiveWork ? 'ACTIVE' : 'STALLED',
    };
  }).sort((a, b) => a.sliceId.localeCompare(b.sliceId));
  return Object.freeze({
    contractVersion: 'delivery_health_v1',
    generatedAt,
    activeSlices: rows.filter((slice) => slice.status === 'ACTIVE').length,
    operationalSlices: rows.filter((slice) => slice.operational).length,
    blockedSlices: rows.filter((slice) => slice.blockedTasks > 0 && !slice.operational).length,
    stalledSlices: rows.filter((slice) => slice.status === 'STALLED').length,
    slices: rows,
  });
}
