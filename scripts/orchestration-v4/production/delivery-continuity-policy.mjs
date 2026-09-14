const ACTIONS = new Set([
  'CLAIM_READY_TASK',
  'TERMINATE_STALLED_WORKER',
  'REPLAN_TERMINAL_TASK',
  'REFILL_VACATED_SLOT',
  'REFRESH_CLEAN_IDLE_RUNTIME',
  'REPORT_BACKLOG_STARVATION',
  'WAIT_FOR_ACTIVE_PROGRESS',
  'NO_ACTION',
]);

const ACTIVE_STATES = new Set(['CLAIMED', 'RUNNING', 'VALIDATING', 'PR_OPENED']);
const TERMINAL_STATES = new Set(['BLOCKED', 'FAILED', 'TIMED_OUT']);
const PRIORITY = Object.freeze({ P0: 0, P1: 1, P2: 2, P3: 3 });

function time(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function boundedInteger(value, fallback, minimum = 0) {
  return Number.isSafeInteger(value) && value >= minimum ? value : fallback;
}

function requiredBoundedInteger(value, code, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(code);
  }
  return value;
}

function strings(value) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()))].sort()
    : [];
}

function ownership(task) {
  return strings(Array.isArray(task.fileOwnership)
    ? task.fileOwnership
    : String(task.fileOwnership || '').split(','));
}

function pathsConflict(left, right) {
  const normalize = (value) => value.replace(/\/\*\*?$/, '').replace(/\/$/, '');
  return left.some((a) => right.some((b) => {
    const x = normalize(a);
    const y = normalize(b);
    return x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`);
  }));
}

function stableTaskOrder(left, right) {
  return (PRIORITY[left.priority] ?? PRIORITY.P3) - (PRIORITY[right.priority] ?? PRIORITY.P3)
    || (time(left.readyAt) ?? 0) - (time(right.readyAt) ?? 0)
    || String(left.taskId).localeCompare(String(right.taskId));
}

function action(type, details = {}) {
  if (!ACTIONS.has(type)) throw new Error(`V4_CONTINUITY_ACTION_NOT_ALLOWED:${type}`);
  return Object.freeze({ type, ...details });
}

function normalizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('V4_CONTINUITY_SNAPSHOT_INVALID');
  }
  const now = time(snapshot.now);
  if (now === null) throw new Error('V4_CONTINUITY_NOW_INVALID');
  const tasks = Array.isArray(snapshot.tasks) ? snapshot.tasks : [];
  const slots = Array.isArray(snapshot.slots) ? snapshot.slots : [];
  if (tasks.length > 1_000 || slots.length > 100) throw new Error('V4_CONTINUITY_SNAPSHOT_UNBOUNDED');
  const taskIds = new Set();
  for (const task of tasks) {
    if (!task?.taskId || taskIds.has(task.taskId)) throw new Error('V4_CONTINUITY_TASK_INVALID');
    if (ACTIVE_STATES.has(task.state)) {
      if (task.semanticProgressAt !== undefined && time(task.semanticProgressAt) === null) {
        throw new Error('V4_CONTINUITY_ACTIVE_PROGRESS_INVALID');
      }
      if (task.startedAt !== undefined && time(task.startedAt) === null) {
        throw new Error('V4_CONTINUITY_ACTIVE_PROGRESS_INVALID');
      }
      if (time(task.semanticProgressAt) === null && time(task.startedAt) === null) {
        throw new Error('V4_CONTINUITY_ACTIVE_PROGRESS_REQUIRED');
      }
      if (task.deadlineAt !== undefined && time(task.deadlineAt) === null) {
        throw new Error('V4_CONTINUITY_ACTIVE_DEADLINE_INVALID');
      }
    }
    taskIds.add(task.taskId);
  }
  const slotIds = new Set();
  for (const slot of slots) {
    if (!slot?.slotId || slotIds.has(slot.slotId)) throw new Error('V4_CONTINUITY_SLOT_INVALID');
    slotIds.add(slot.slotId);
  }
  if (!snapshot.limits || typeof snapshot.limits !== 'object' || Array.isArray(snapshot.limits)) {
    throw new Error('V4_CONTINUITY_LIMITS_REQUIRED');
  }
  return {
    now,
    tasks,
    slots,
    limits: {
      global: requiredBoundedInteger(snapshot.limits.global, 'V4_CONTINUITY_GLOBAL_LIMIT_INVALID'),
      perSlice: requiredBoundedInteger(snapshot.limits.perSlice, 'V4_CONTINUITY_SLICE_LIMIT_INVALID'),
      perStream: requiredBoundedInteger(snapshot.limits.perStream, 'V4_CONTINUITY_STREAM_LIMIT_INVALID'),
      executable: requiredBoundedInteger(snapshot.limits.executable, 'V4_CONTINUITY_EXECUTABLE_LIMIT_INVALID'),
    },
    semanticProgressWindowMs: requiredBoundedInteger(snapshot.semanticProgressWindowMs, 'V4_CONTINUITY_PROGRESS_WINDOW_INVALID', 1),
    runtime: snapshot.runtime || {},
    completedTaskIds: new Set(strings(snapshot.completedTaskIds)),
    terminalTransition: snapshot.terminalTransition || null,
  };
}

function compatibleSlot(slot, task) {
  return !slot.taskId && strings(slot.streams).includes(task.stream);
}

function requiredBaseAvailable(task, runtime) {
  if (!task.requiredBase) return true;
  return task.requiredBase === runtime.head || strings(runtime.ancestorHeads).includes(task.requiredBase);
}

function eligible(task, context, selected, slot) {
  if (task.state !== 'READY' || task.humanApprovalRequired === true || task.retryForbidden === true) return false;
  if (!compatibleSlot(slot, task) || !requiredBaseAvailable(task, context.runtime)) return false;
  if (strings(task.dependencies).some((id) => !context.completedTaskIds.has(id))) return false;
  const active = context.tasks.filter((candidate) => ACTIVE_STATES.has(candidate.state));
  const peers = [...active, ...selected];
  if (peers.some((candidate) => pathsConflict(ownership(task), ownership(candidate)))) return false;
  return true;
}

function limitAllows(task, selected, context) {
  const active = context.tasks.filter((candidate) => ACTIVE_STATES.has(candidate.state));
  const all = [...active, ...selected];
  if (all.length >= context.limits.global || selected.length >= context.limits.executable) return false;
  if (task.sliceId && all.filter((candidate) => candidate.sliceId === task.sliceId).length >= context.limits.perSlice) return false;
  if (all.filter((candidate) => candidate.stream === task.stream).length >= context.limits.perStream) return false;
  return true;
}

function stallReason(task, context) {
  const deadline = time(task.deadlineAt);
  if (deadline !== null && context.now >= deadline) return 'HARD_DEADLINE';
  const progressAt = time(task.semanticProgressAt) ?? time(task.startedAt);
  if (progressAt !== null && context.now - progressAt >= context.semanticProgressWindowMs) return 'SEMANTIC_PROGRESS_STALL';
  if (task.childProcessAlive === false) return 'DEAD_WORKER';
  return null;
}

export function decideDeliveryContinuity(snapshot) {
  const context = normalizeSnapshot(snapshot);
  const actions = [];
  const active = context.tasks.filter((task) => ACTIVE_STATES.has(task.state));
  const ready = context.tasks.filter((task) => task.state === 'READY').sort(stableTaskOrder);
  const terminal = context.tasks.filter((task) => TERMINAL_STATES.has(task.state));

  for (const task of active.sort((a, b) => String(a.taskId).localeCompare(String(b.taskId)))) {
    const reason = stallReason(task, context);
    if (!reason) continue;
    actions.push(action('TERMINATE_STALLED_WORKER', { taskId: task.taskId, slotId: task.slotId, reason }));
    const attempt = boundedInteger(task.attempt, 1, 1);
    const maxAttempts = boundedInteger(task.maxAttempts, 1, 1);
    const corrections = boundedInteger(task.correctionCount, 0);
    const maxCorrections = boundedInteger(task.maxCorrections, 0);
    if (reason === 'HARD_DEADLINE' || attempt >= maxAttempts || corrections >= maxCorrections) {
      actions.push(action('REPLAN_TERMINAL_TASK', { taskId: task.taskId, reason }));
    }
  }

  for (const task of terminal.sort((a, b) => String(a.taskId).localeCompare(String(b.taskId)))) {
    if (task.successorTaskId || task.retryForbidden || boundedInteger(task.attempt, 1, 1) >= boundedInteger(task.maxAttempts, 1, 1)) continue;
    actions.push(action('REPLAN_TERMINAL_TASK', { taskId: task.taskId, reason: task.terminalReason || task.state }));
  }

  const runtimeUpdateAvailable = typeof context.runtime.head === 'string'
    && context.runtime.head.length > 0
    && typeof context.runtime.latestHead === 'string'
    && context.runtime.latestHead.length > 0
    && context.runtime.head !== context.runtime.latestHead;
  const snapshotOwnsExecution = active.length > 0 || context.slots.some((slot) => Boolean(slot.taskId));
  if (runtimeUpdateAvailable && !snapshotOwnsExecution && context.runtime.clean === true && context.runtime.idle === true) {
    actions.push(action('REFRESH_CLEAN_IDLE_RUNTIME', { fromHead: context.runtime.head || null, toHead: context.runtime.latestHead || null }));
  }

  const selected = [];
  const freeSlots = context.slots.filter((slot) => !slot.taskId).sort((a, b) => String(a.slotId).localeCompare(String(b.slotId)));
  for (const task of ready) {
    if (!limitAllows(task, selected, context)) continue;
    const slot = freeSlots.find((candidate) => !selected.some((entry) => entry.slotId === candidate.slotId)
      && eligible(task, context, selected.map((entry) => entry.task), candidate));
    if (!slot) continue;
    selected.push({ task, slotId: slot.slotId });
    const refill = context.terminalTransition && context.terminalTransition.slotId === slot.slotId;
    actions.push(action(refill ? 'REFILL_VACATED_SLOT' : 'CLAIM_READY_TASK', {
      taskId: task.taskId,
      slotId: slot.slotId,
      stream: task.stream,
    }));
  }

  if (actions.length === 0) {
    if (active.length > 0) return Object.freeze({ contractVersion: 'DeliveryContinuityDecisionV1', actions: Object.freeze([action('WAIT_FOR_ACTIVE_PROGRESS')]) });
    const reason = ready.length === 0 ? 'NO_READY_TASKS' : 'NO_ELIGIBLE_TASKS';
    return Object.freeze({ contractVersion: 'DeliveryContinuityDecisionV1', actions: Object.freeze([action('REPORT_BACKLOG_STARVATION', { reason })]) });
  }

  return Object.freeze({ contractVersion: 'DeliveryContinuityDecisionV1', actions: Object.freeze(actions) });
}

export { ACTIONS as DELIVERY_CONTINUITY_ACTIONS };
