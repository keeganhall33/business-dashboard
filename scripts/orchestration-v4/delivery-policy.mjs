import { getTaskContract } from './state-store/sqlite-store.mjs';

export const DELIVERY_MODES = Object.freeze(['VERTICAL_SLICE', 'PLATFORM_PRIMITIVE', 'DEFECT', 'LEGACY']);
export const SLICE_STAGES = Object.freeze(['DISCOVERY', 'CONTRACT', 'IMPLEMENTATION', 'INTEGRATION', 'PRODUCTION_VERIFICATION']);
export const QUALITY_GATES = Object.freeze(['DIFF_CHECK', 'TYPECHECK', 'TEST', 'LINT', 'BUILD']);
export const RELEASE_TARGETS = Object.freeze(['V1', 'V1.1', 'V1.5', 'V2', 'CONTINUOUS']);
export const LAUNCH_POLICIES = Object.freeze(['IMMEDIATE_AFTER_VERIFICATION', 'BUNDLED_ONLY']);
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
    featureName: contract.featureName || contract.outcome || null,
    releaseTarget: contract.releaseTarget || null,
    launchPolicy: contract.launchPolicy || null,
    bundleReason: contract.bundleReason || null,
    rollbackCondition: contract.rollbackCondition || null,
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
    if (!fields.feature_name) errors.push('FEATURE_NAME_REQUIRED');
    if (!RELEASE_TARGETS.includes(fields.release_target)) errors.push('RELEASE_TARGET_INVALID');
    if (!LAUNCH_POLICIES.includes(fields.launch_policy)) errors.push('LAUNCH_POLICY_INVALID');
    if (!fields.rollback_condition) errors.push('ROLLBACK_CONDITION_REQUIRED');
    if (fields.launch_policy === 'BUNDLED_ONLY' && (!fields.bundle_reason || fields.bundle_reason === 'NOT_BUNDLED')) errors.push('BUNDLE_REASON_REQUIRED');
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

function timestamp(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function latestTask(tasks) {
  return [...tasks].sort((left, right) =>
    (timestamp(right.updated_at) ?? timestamp(right.created_at) ?? 0) - (timestamp(left.updated_at) ?? timestamp(left.created_at) ?? 0)
    || right.issue_number - left.issue_number
    || right.task_id.localeCompare(left.task_id))[0] ?? null;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function isDependencyComplete(taskById, dependencyId) {
  return taskById.get(dependencyId)?.state === 'COMPLETE';
}

function hasVerifiedProductionEvidence(task) {
  if (task?.state !== 'COMPLETE') return false;
  try {
    const result = JSON.parse(task.result_json || '{}');
    const proof = result?.productionVerification;
    return proof?.verified === true
      && proof.taskId === task.task_id
      && proof.issueNumber === task.issue_number
      && proof.contractVersion === 'PRODUCTION_VERIFICATION_V1';
  } catch {
    return false;
  }
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

export function buildDeliveryHealth(tasks, generatedAt = new Date().toISOString(), correctionAttempts = []) {
  const correctionsByTask = new Map();
  for (const correction of correctionAttempts) {
    const rows = correctionsByTask.get(correction.task_id) || [];
    rows.push(correction);
    correctionsByTask.set(correction.task_id, rows);
  }
  const slices = new Map();
  for (const task of tasks) {
    const metadata = deliveryMetadata(getTaskContract(task));
    if (!metadata.sliceId) continue;
    const current = slices.get(metadata.sliceId) || { sliceId: metadata.sliceId, outcome: metadata.outcome, tasks: [] };
    const corrections = correctionsByTask.get(task.task_id) || [];
    const latestCorrection = corrections.at(-1) || null;
    const unresolvedStall = ACTIVE_STATES.has(task.state)
      && latestCorrection?.reason === 'SEMANTIC_PROGRESS_STALL'
      && (timestamp(task.semantic_progress_at) ?? 0) <= (timestamp(latestCorrection.created_at) ?? 0);
    current.tasks.push({
      taskId: task.task_id,
      issueNumber: task.issue_number,
      stage: metadata.stage,
      state: task.state,
      semanticProgressSeq: task.semantic_progress_seq ?? 0,
      lastSemanticProgressAt: task.semantic_progress_at ?? null,
      correctionAttempts: corrections.length,
      lastCorrectionReason: latestCorrection?.reason ?? null,
      lastCorrectionAt: latestCorrection?.created_at ?? null,
      recoveryState: unresolvedStall ? 'STALLED_RETRYING' : null,
    });
    if (!current.outcome && metadata.outcome) current.outcome = metadata.outcome;
    slices.set(metadata.sliceId, current);
  }
  const rows = [...slices.values()].map((slice) => {
    const sourceTasks = tasks.filter((task) => deliveryMetadata(getTaskContract(task)).sliceId === slice.sliceId);
    const metadata = deliveryMetadata(getTaskContract(latestTask(sourceTasks)));
    const stageStates = Object.fromEntries(SLICE_STAGES.map((stage) => {
      const stageTask = latestTask(sourceTasks.filter((task) => deliveryMetadata(getTaskContract(task)).stage === stage));
      return [stage, stageTask?.state ?? null];
    }));
    const latestVerification = latestTask(sourceTasks.filter((task) => deliveryMetadata(getTaskContract(task)).stage === 'PRODUCTION_VERIFICATION'));
    const verificationComplete = latestVerification?.state === 'COMPLETE';
    const verified = hasVerifiedProductionEvidence(latestVerification);
    const evidenceMissing = verificationComplete && !verified;
    const launchPolicy = metadata.launchPolicy || 'UNSPECIFIED';
    const operational = verified && launchPolicy === 'IMMEDIATE_AFTER_VERIFICATION';
    const blockedTasks = Object.values(stageStates).filter((state) => ['BLOCKED', 'FAILED', 'TIMED_OUT'].includes(state)).length;
    const hasActiveWork = slice.tasks.some((task) => task.state === 'READY' || ACTIVE_STATES.has(task.state));
    const stalledTasks = slice.tasks.filter((task) => task.recoveryState === 'STALLED_RETRYING').length;
    const correctionAttempts = slice.tasks.reduce((sum, task) => sum + task.correctionAttempts, 0);
    const latestBlockedTask = latestTask(sourceTasks.filter((task) => ['BLOCKED', 'FAILED', 'TIMED_OUT'].includes(task.state)));
    const startedAtMs = Math.min(...sourceTasks.map((task) => timestamp(task.created_at)).filter((value) => value !== null));
    const availableAtMs = operational ? (timestamp(latestVerification.updated_at) ?? timestamp(latestVerification.created_at)) : null;
    const cycleTimeHours = availableAtMs !== null && Number.isFinite(startedAtMs)
      ? Math.round(((availableAtMs - startedAtMs) / 3_600_000) * 100) / 100
      : null;
    const launchState = operational ? 'AVAILABLE'
      : verified && launchPolicy === 'BUNDLED_ONLY' ? 'VERIFIED_HELD'
        : evidenceMissing ? 'EVIDENCE_MISSING'
        : stalledTasks > 0 ? 'RECOVERING'
        : latestVerification && (latestVerification.state === 'READY' || ACTIVE_STATES.has(latestVerification.state)) ? 'VERIFYING'
          : stageStates.INTEGRATION === 'COMPLETE' ? 'AWAITING_PRODUCTION_VERIFICATION'
            : blockedTasks > 0 ? 'BLOCKED'
              : hasActiveWork ? 'BUILDING' : 'PLANNED';
    return {
      ...slice,
      featureName: metadata.featureName || slice.outcome || slice.sliceId,
      releaseTarget: metadata.releaseTarget || 'UNASSIGNED',
      launchPolicy,
      rollbackCondition: metadata.rollbackCondition,
      stages: stageStates,
      verified,
      operational,
      launchState,
      availableAt: availableAtMs === null ? null : new Date(availableAtMs).toISOString(),
      cycleTimeHours,
      blockedTasks,
      stalledTasks,
      correctionAttempts,
      blockerReason: evidenceMissing ? 'PRODUCTION_EVIDENCE_NOT_VERIFIED' : latestBlockedTask?.terminal_reason ?? null,
      status: operational ? 'OPERATIONAL' : evidenceMissing || blockedTasks > 0 ? 'BLOCKED' : stalledTasks > 0 ? 'RECOVERING' : hasActiveWork ? 'ACTIVE' : 'PLANNED',
    };
  }).sort((a, b) => a.sliceId.localeCompare(b.sliceId));
  const releases = [...new Set(rows.map((row) => row.releaseTarget))].sort().map((releaseTarget) => {
    const features = rows.filter((row) => row.releaseTarget === releaseTarget);
    return {
      releaseTarget,
      totalFeatures: features.length,
      availableFeatures: features.filter((feature) => feature.launchState === 'AVAILABLE').length,
      heldFeatures: features.filter((feature) => feature.launchState === 'VERIFIED_HELD').length,
      blockedFeatures: features.filter((feature) => feature.launchState === 'BLOCKED').length,
      certificationReady: features.length > 0 && features.every((feature) => feature.launchState === 'AVAILABLE'),
    };
  });
  const completedCycles = rows.map((row) => row.cycleTimeHours).filter((value) => value !== null);
  const generatedAtMs = timestamp(generatedAt) ?? Date.now();
  return Object.freeze({
    contractVersion: 'delivery_health_v1',
    generatedAt,
    activeSlices: rows.filter((slice) => slice.status === 'ACTIVE' || slice.status === 'RECOVERING').length,
    operationalSlices: rows.filter((slice) => slice.operational).length,
    blockedSlices: rows.filter((slice) => slice.status === 'BLOCKED').length,
    stalledSlices: rows.filter((slice) => slice.stalledTasks > 0).length,
    availableFeatures: rows.filter((slice) => slice.launchState === 'AVAILABLE').length,
    verifiedHeldFeatures: rows.filter((slice) => slice.launchState === 'VERIFIED_HELD').length,
    throughputLast7Days: rows.filter((slice) => slice.availableAt && generatedAtMs - timestamp(slice.availableAt) <= 7 * 86_400_000).length,
    medianCycleTimeHours: median(completedCycles),
    releases,
    slices: rows,
  });
}
