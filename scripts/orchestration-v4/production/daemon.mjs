import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSlotRegistry } from '../slot-scheduler.mjs';
import { runReadyBatch } from '../runner/task-runner.mjs';
import { signalGroup } from '../runner/bounded-process.mjs';
import { AGENT_MUTATION_MODES, cleanupEphemeralAgentState, createEphemeralAgentState, validateAgentMutationMode } from '../runner/agent-executor.mjs';
import { blockTasksWithFailedDependencies, getTask, getTaskContract, listRunnableTasks, listTaskDependencies, listTasksPendingGithubSync, markGithubTaskStateSynced, recordOrchestrationEvent, releaseSlotForTerminalTask, transitionTask } from '../state-store/sqlite-store.mjs';
import { importReadyIssues, listReadyIssues, refreshCanonicalMain } from './github-intake.mjs';
import { replenishBacklog } from './backlog-replenisher.mjs';
import { publishImplementationResult } from './publisher.mjs';
import { runIntegrationTask } from './integration-executor.mjs';
import { deterministicVerificationCommandForTask } from './deterministic-verification-executor.mjs';
import { ALL_STATE_LABELS, syncTerminalTaskToGitHub } from './github-sync.mjs';
import { CORRECTION_MUTATION_MODES, correctionMutationMode, correctionPrompt } from '../policy/correction-loop.mjs';
import { deliveryMetadata, selectDeliveryReadyTasks } from '../delivery-policy.mjs';
import { decideDeliveryContinuity } from './delivery-continuity-policy.mjs';

const ENTRYPOINT = fileURLToPath(new URL('../runner/agent-task-entrypoint.mjs', import.meta.url));
const INTEGRATION_PROPOSAL_ENTRYPOINT = fileURLToPath(new URL('../runner/integration-resolution-entrypoint.mjs', import.meta.url));
const TERMINAL_STATES = new Set(['COMPLETE','BLOCKED','FAILED','TIMED_OUT']);
const ACTIVE_STATES = new Set(['CLAIMED','RUNNING','VALIDATING','PR_OPENED']);
const CLAIM_ACTIONS = new Set(['CLAIM_READY_TASK','REFILL_VACATED_SLOT']);
const ACTIVE_LABEL = Object.freeze({
  CLAIMED: 'orch:claimed',
  RUNNING: 'orch:running',
  VALIDATING: 'orch:validating',
  PR_OPENED: 'orch:pr-opened',
});
const LIFECYCLE_LABELS = Object.freeze([...new Set([...ALL_STATE_LABELS, ...Object.values(ACTIVE_LABEL)])]);
const MUTATION_MODE_DIRECTIVE = '**mutation_mode:**';
const CONTINUITY_EVENT = 'CONTINUITY_ACTION_V1';
const CONTINUITY_STATE_EVENT = 'CONTINUITY_STATE_V1';
export const PRODUCT_LANE_CAPACITY = 6;

export function continuityStewardEnabled(env = process.env) {
  return env.JEEVES_V4_CONTINUITY_STEWARD !== '0';
}

export function taskMutationMode(task) {
  const body = String(getTaskContract(task)?.body ?? '');
  const directives = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith(MUTATION_MODE_DIRECTIVE));

  if (directives.length === 0) return AGENT_MUTATION_MODES.DEFAULT;
  if (directives.length !== 1) throw new Error('V4_PRODUCTION_MUTATION_MODE_DIRECTIVE_INVALID');

  const match = directives[0].match(/^\*\*mutation_mode:\*\*\s+(DEFAULT|SHELL_ONLY)$/);
  if (!match) throw new Error('V4_PRODUCTION_MUTATION_MODE_DIRECTIVE_INVALID');
  return validateAgentMutationMode(match[1]);
}

export function taskAttemptLimit(task) {
  const value = getTaskContract(task)?.maxAttempts;
  return Number.isInteger(value) && value >= 1 ? value : 3;
}

export function buildTaskExecutionSpec({
  task,
  agentTimeoutMs,
  openclaw,
  createState = createEphemeralAgentState,
  retainState = () => {},
}) {
  const deterministic = deterministicVerificationCommandForTask(task);
  if (deterministic) return deterministic;

  const mode = taskMutationMode(task);
  const state = createState({
    taskId: task.task_id,
    applyPatchEnabled: mode !== AGENT_MUTATION_MODES.SHELL_ONLY,
  });
  retainState(state);
  return {
    command: process.execPath,
    args: [ENTRYPOINT, promptForTask(task), state.configPath, state.stateDir, String(Math.ceil(agentTimeoutMs / 1000)), openclaw],
    buildCorrectionAttempt: ({ packet, command, args }) => buildCorrectionAgentAttempt({
      packet,
      command,
      args,
      retainState,
    }),
    maxCorrectionAttempts: taskAttemptLimit(task),
  };
}

export function buildCorrectionAgentAttempt({ packet, command, args, createState = createEphemeralAgentState, retainState = () => {} }) {
  const prompt = `${args[1]}\n\n${correctionPrompt(packet)}`;
  if (correctionMutationMode(packet) !== CORRECTION_MUTATION_MODES.SHELL_ONLY) {
    return { command, args: [args[0], prompt, ...args.slice(2)] };
  }
  const state = createState({ taskId: `${packet.unitId}-correction-${packet.attempt}`, applyPatchEnabled: false });
  retainState(state);
  return {
    command,
    args: [args[0], prompt, state.configPath, state.stateDir, ...args.slice(4)],
  };
}

export function cleanupProductionAgentStates(states) {
  for (const state of states ?? []) cleanupEphemeralAgentState(state);
}

export function promptForTask(task) {
  const contract = getTaskContract(task);
  if (!contract?.title || !contract?.body || !contract?.fileOwnership || !contract?.taskMutability) {
    throw new Error(`V4_PRODUCTION_CONTRACT_INCOMPLETE:${task.task_id}`);
  }
  return [
    `You are executing Orchestration V4 task ${task.task_id}.`,
    `Issue: #${task.issue_number}`,
    `Stream: ${task.stream}`,
    `Title: ${contract.title}`,
    `Task mutability: ${contract.taskMutability}`,
    `File ownership: ${contract.fileOwnership}`,
    `Contract version: ${contract.contractVersion || 'LEGACY_V1'}`,
    `Business outcome: ${contract.businessOutcome || 'Not separately declared; preserve the authoritative issue goal.'}`,
    `Business reason: ${contract.businessReason || 'Not separately declared.'}`,
    `Success metric: ${contract.successMetric || 'Use the issue acceptance criteria.'}`,
    `Proof required: ${contract.proofRequired || 'Use the issue acceptance criteria and current-run evidence.'}`,
    `Verification owner: ${contract.verificationOwner || 'UNSPECIFIED'}`,
    `Risk lane: ${contract.riskProfile?.lane || 'LEGACY_UNCLASSIFIED'}`,
    `Required gate: ${contract.riskProfile?.requiredGate || 'Use existing deterministic and review gates.'}`,
    `Dependencies: ${JSON.stringify(contract.dependencies ?? [])}`,
    `Delivery mode: ${deliveryMetadata(contract).mode}`,
    `Vertical slice: ${deliveryMetadata(contract).sliceId ?? 'none'}`,
    `Slice stage: ${deliveryMetadata(contract).stage ?? 'none'}`,
    `Feature: ${deliveryMetadata(contract).featureName ?? 'none'}`,
    `Release target: ${deliveryMetadata(contract).releaseTarget ?? 'unassigned'}`,
    `Launch policy: ${deliveryMetadata(contract).launchPolicy ?? 'unspecified'}`,
    '',
    'Authoritative issue body and acceptance criteria:',
    contract.body,
    '',
    'Work only inside the supplied disposable workspace.',
    'Respect file ownership exactly. Do not mutate V3 orchestration files unless the issue explicitly owns them.',
    'Begin with pwd, git status --short, and targeted inspection of the owned paths.',
    'Use read/exec/find for repository discovery. Do not use tool-search to discover repository files.',
    'If an owned file named by the acceptance criteria does not exist yet, create it rather than repeatedly searching for it.',
    'Use local tools and complete the implementation, tests, and validation required by the issue.',
    'Do not optimize for activity or code volume. Prefer the smallest complete change that advances the declared business outcome.',
    'Every completion claim must cite evidence produced or inspected during this run. Never treat your own confidence as verification.',
    'Optimize for the stated user outcome and end-to-end flow, not merely file completion.',
    'A task is coded when its acceptance passes; a slice is operational only after its PRODUCTION_VERIFICATION stage passes.',
    'A production-verified feature with IMMEDIATE_AFTER_VERIFICATION launches independently. Do not hold it for the full version milestone.',
    ...(deliveryMetadata(contract).stage === 'PRODUCTION_VERIFICATION' ? [
      '',
      'Production verification completion is fail-closed and requires a machine-readable evidence artifact.',
      'Only after the live verification and every required safety check pass, write `.openclaw/tmp/production-verification-v1.json` with this exact schema:',
      '{"contractVersion":"PRODUCTION_VERIFICATION_V1","taskId":"TASK_ID","issueNumber":ISSUE_NUMBER,"verdict":"PASS","observedAt":"ISO_8601","liveExecution":true,"repositoryClean":true,"privacySafe":true,"externalMutation":false,"checks":[{"id":"NON_SECRET_CHECK_ID","passed":true}],"telemetry":{"NON_SECRET_METRIC":0}}',
      'Use the current task id and issue number. Include only redacted aggregate telemetry and non-secret check identifiers.',
      'Never write the artifact when the live command was skipped, blocked, failed, partial, timed out, or lacked required proof.',
      'Never include credentials, addresses, subjects, message identifiers, bodies, attachment bytes, secret references, tokens, or raw provider errors.',
    ] : []),
  ].join('\n');
}

export function promptForIntegrationConflict(task) {
  const contract = getTaskContract(task);
  if (!contract?.title || !contract?.body || !contract?.fileOwnership) {
    throw new Error(`V4_INTEGRATION_CONTRACT_INCOMPLETE:${task.task_id}`);
  }
  return [
    `You are proposing the semantic resolution for Orchestration V4 integration task ${task.task_id}.`,
    `Issue: #${task.issue_number}`,
    `Title: ${contract.title}`,
    `File ownership: ${contract.fileOwnership}`,
    '',
    'Authoritative integration request:',
    contract.body,
    '',
    'The supplied file contents contain real Git conflict markers from merging current canonical main into the referenced PR head.',
    'For each conflicted file, produce the complete resolved file contents.',
    'Preserve the PR intent while retaining newer compatible functionality from canonical main.',
    'Do not invent unrelated changes. Resolve only the supplied conflicted files.',
    'V4 itself will write, stage, validate, commit, and push the approved proposal.',
  ].join('\n');
}

export async function runConcurrentProductionQueues({ runExecutableQueue, runIntegrationQueue }) {
  if (typeof runExecutableQueue !== 'function' || typeof runIntegrationQueue !== 'function') {
    throw new Error('V4_PRODUCTION_QUEUE_RUNNERS_REQUIRED');
  }
  const executablePromise = Promise.resolve().then(runExecutableQueue);
  const integrationPromise = Promise.resolve().then(runIntegrationQueue);
  const [settled, integrationSettled] = await Promise.all([executablePromise, integrationPromise]);
  return Object.freeze({ settled, integrationSettled });
}

export async function syncPendingGithubTasks({
  db,
  repoFullName,
  gh = 'gh',
  limit = 1,
  sync = syncTerminalLifecycleTaskToGitHub,
}) {
  const pending = listTasksPendingGithubSync(db, { limit });
  const results = [];
  for (const task of pending) {
    if (!TERMINAL_STATES.has(task.state)) continue;
    try {
      const result = await sync({ task, repoFullName, gh });
      if (result?.ok && !result?.skipped) {
        markGithubTaskStateSynced(db, { taskId: task.task_id, state: task.state });
      }
      results.push(result);
    } catch (error) {
      results.push({ ok: false, issueNumber: task.issue_number, error: String(error?.message || error) });
    }
  }
  return results;
}

function gitOutput(repoRoot, args, exec = execFileSync) {
  return String(exec('git', ['-C', repoRoot, ...args], { encoding: 'utf8', timeout: 30_000 })).trim();
}

export function refreshRuntimeMain({
  repoRoot,
  tasks = [],
  allowAdvance = false,
  expectedFrom = null,
  expectedTo = null,
  fetchMain = refreshCanonicalMain,
  exec = execFileSync,
}) {
  const latestHead = fetchMain(repoRoot);
  let head = gitOutput(repoRoot, ['rev-parse', 'HEAD'], exec);
  const clean = gitOutput(repoRoot, ['status', '--porcelain'], exec) === '';
  const branch = gitOutput(repoRoot, ['branch', '--show-current'], exec);
  const idle = !tasks.some((task) => ACTIVE_STATES.has(task.state));
  if (expectedFrom && head !== expectedFrom) throw new Error('V4_RUNTIME_REFRESH_SNAPSHOT_DRIFT');
  if (expectedTo && latestHead !== expectedTo) throw new Error('V4_RUNTIME_REFRESH_SNAPSHOT_DRIFT');
  let refreshState = head === latestHead ? 'CURRENT' : (allowAdvance ? 'DEFERRED_ACTIVE' : 'OBSERVED_STALE');

  if (allowAdvance && head !== latestHead && idle && !clean) refreshState = 'DEFERRED_DIRTY';
  if (allowAdvance && head !== latestHead && idle && clean && branch !== 'main') refreshState = 'DEFERRED_NOT_MAIN';
  if (allowAdvance && head !== latestHead && idle && clean && branch === 'main') {
    gitOutput(repoRoot, ['merge', '--ff-only', 'refs/remotes/origin/main'], exec);
    head = gitOutput(repoRoot, ['rev-parse', 'HEAD'], exec);
    if (head !== latestHead) throw new Error('V4_RUNTIME_FAST_FORWARD_MISMATCH');
    refreshState = 'ADVANCED';
  }

  const bases = [...new Set(tasks.map((task) => task.base_sha).filter(Boolean))];
  const ancestorHeads = bases.filter((candidate) => {
    if (candidate === latestHead) return true;
    try {
      exec('git', ['-C', repoRoot, 'merge-base', '--is-ancestor', candidate, latestHead], {
        encoding: 'utf8', timeout: 30_000,
      });
      return true;
    } catch {
      return false;
    }
  });

  return Object.freeze({ head, latestHead, ancestorHeads, clean, idle, refreshState });
}

export function reconcileWithdrawnReadyTasks(db, issues, { now = new Date() } = {}) {
  const visible = new Set((issues ?? []).map((issue) => Number(issue.number)).filter(Number.isInteger));
  const withdrawn = db.prepare("SELECT task_id,issue_number FROM tasks WHERE state='READY' ORDER BY task_id").all()
    .filter((task) => !visible.has(task.issue_number));
  for (const task of withdrawn) {
    transitionTask(db, {
      taskId: task.task_id,
      expectedState: 'READY',
      toState: 'BLOCKED',
      patch: { terminalReason: 'GITHUB_READY_WITHDRAWN' },
      now,
    });
    recordOrchestrationEvent(db, {
      taskId: task.task_id,
      type: 'READY_WITHDRAWN',
      payload: { reason: 'GITHUB_READY_WITHDRAWN', issueNumber: task.issue_number },
      now,
    });
  }
  return Object.freeze(withdrawn.map((task) => task.task_id));
}

function isPidLive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error?.code !== 'ESRCH'; }
}

function ownership(contract) {
  return String(contract?.fileOwnership || '').split(',').map((value) => value.trim()).filter(Boolean);
}

export function buildContinuitySnapshot({
  db,
  runtime,
  now = new Date(),
  semanticProgressWindowMs,
  terminalTransition = null,
  registry = createSlotRegistry(),
  reservedSlotIds = [],
  pidIsLive = isPidLive,
}) {
  const tasks = db.prepare('SELECT * FROM tasks ORDER BY created_at,task_id').all();
  const dependencies = db.prepare('SELECT task_id,depends_on_task_id FROM task_dependencies ORDER BY task_id,depends_on_task_id').all();
  const dependencyIds = new Map();
  for (const row of dependencies) {
    const values = dependencyIds.get(row.task_id) || [];
    values.push(row.depends_on_task_id);
    dependencyIds.set(row.task_id, values);
  }
  const correctionCounts = new Map(db.prepare('SELECT task_id,COUNT(*) AS count FROM correction_attempts GROUP BY task_id').all()
    .map((row) => [row.task_id, row.count]));
  const activeBySlot = new Map(tasks.filter((task) => ACTIVE_STATES.has(task.state) && task.slot_id)
    .map((task) => [task.slot_id, task.task_id]));
  for (const slotId of reservedSlotIds) {
    if (!activeBySlot.has(slotId)) activeBySlot.set(slotId, 'INTEGRATION_RESERVED');
  }

  return Object.freeze({
    now: new Date(now).toISOString(),
    semanticProgressWindowMs,
    completedTaskIds: tasks.filter((task) => task.state === 'COMPLETE').map((task) => task.task_id),
    terminalTransition,
    runtime,
    limits: { global: PRODUCT_LANE_CAPACITY, perSlice: 3, perStream: 3, executable: PRODUCT_LANE_CAPACITY },
    slots: [...registry.values()].map((slot) => ({
      slotId: slot.workerId,
      streams: [...slot.streams],
      taskId: activeBySlot.get(slot.workerId) || null,
    })),
    tasks: tasks.map((task) => {
      const contract = getTaskContract(task);
      const metadata = deliveryMetadata(contract);
      return {
        taskId: task.task_id,
        state: task.state === 'READY' && task.stream === 'INTEGRATION_RELEASE' ? 'INTEGRATION_RESERVED' : task.state,
        stream: task.stream,
        slotId: task.slot_id,
        sliceId: metadata.sliceId,
        priority: metadata.priority,
        readyAt: task.created_at,
        fileOwnership: ownership(contract),
        dependencies: dependencyIds.get(task.task_id) || [],
        requiredBase: task.base_sha,
        humanApprovalRequired: contract.humanApprovalRequired === true,
        retryForbidden: Boolean(contract.retryForbidden),
        successorTaskId: contract.successorTaskId || null,
        childProcessAlive: ACTIVE_STATES.has(task.state) ? pidIsLive(Number(task.child_pid)) : null,
        semanticProgressAt: task.semantic_progress_at || (ACTIVE_STATES.has(task.state) ? task.updated_at : null),
        startedAt: ACTIVE_STATES.has(task.state) ? task.updated_at : null,
        attempt: task.attempt,
        maxAttempts: taskAttemptLimit(task),
        correctionCount: correctionCounts.get(task.task_id) || 0,
        maxCorrections: taskAttemptLimit(task),
        terminalReason: task.terminal_reason,
      };
    }),
  });
}

function stableHash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function actionIdempotencyKey(action, task) {
  return stableHash({
    type: action.type,
    taskId: action.taskId || null,
    slotId: action.slotId || null,
    reason: action.reason || null,
    attempt: task?.attempt ?? null,
    fromHead: action.fromHead || null,
    toHead: action.toHead || null,
  });
}

function continuityActionWasRecorded(db, key) {
  const rows = db.prepare(`SELECT payload_json FROM orchestration_events WHERE type=? ORDER BY event_id DESC LIMIT 1000`).all(CONTINUITY_EVENT);
  return rows.some((row) => {
    try { return JSON.parse(row.payload_json).idempotencyKey === key; }
    catch { return false; }
  });
}

function recordContinuityActionOnce(db, { action, task = null, now = new Date() }) {
  const idempotencyKey = actionIdempotencyKey(action, task);
  if (continuityActionWasRecorded(db, idempotencyKey)) return false;
  recordOrchestrationEvent(db, {
    taskId: action.taskId || null,
    type: CONTINUITY_EVENT,
    payload: { idempotencyKey, ...action },
    now,
  });
  return true;
}

function latestRecordedContinuityAction(db) {
  const row = db.prepare('SELECT payload_json,created_at FROM orchestration_events WHERE type=? ORDER BY event_id DESC LIMIT 1').get(CONTINUITY_EVENT);
  if (!row) return null;
  try {
    const payload = JSON.parse(row.payload_json);
    return payload?.type ? Object.freeze({ type: payload.type, at: row.created_at }) : null;
  } catch {
    return null;
  }
}

export function executeContinuityControlActions(db, decision, {
  killGroup = signalGroup,
  refreshMain = null,
  now = new Date(),
} = {}) {
  const executed = [];
  for (const action of decision.actions) {
    if (CLAIM_ACTIONS.has(action.type) || action.type === 'WAIT_FOR_ACTIVE_PROGRESS' || action.type === 'NO_ACTION') continue;
    const task = action.taskId ? getTask(db, action.taskId) : null;
    if (action.type === 'TERMINATE_STALLED_WORKER') {
      if (!task || !ACTIVE_STATES.has(task.state) || task.slot_id !== action.slotId) continue;
      const key = actionIdempotencyKey(action, task);
      if (continuityActionWasRecorded(db, key)) continue;
      if (Number.isInteger(task.process_group_id) && task.process_group_id > 0) {
        killGroup(task.process_group_id, 'SIGTERM');
      }
      recordContinuityActionOnce(db, { action, task, now });
      executed.push(action);
      continue;
    }
    if (action.type === 'REFRESH_CLEAN_IDLE_RUNTIME') {
      const key = actionIdempotencyKey(action, task);
      if (continuityActionWasRecorded(db, key) || typeof refreshMain !== 'function') continue;
      const result = refreshMain(action);
      recordContinuityActionOnce(db, { action, task, now });
      executed.push(Object.freeze({ ...action, result }));
      continue;
    }
    if (action.type === 'REPLAN_TERMINAL_TASK' && task && ACTIVE_STATES.has(task.state)) {
      const key = actionIdempotencyKey(action, task);
      if (continuityActionWasRecorded(db, key)) continue;
      transitionTask(db, {
        taskId: task.task_id,
        expectedState: task.state,
        toState: 'BLOCKED',
        patch: { terminalReason: `CONTINUITY_REPLAN:${action.reason || 'POLICY'}` },
        now,
      });
      releaseSlotForTerminalTask(db, task.task_id);
      recordContinuityActionOnce(db, { action, task, now });
      executed.push(action);
      continue;
    }
    if (recordContinuityActionOnce(db, { action, task, now })) executed.push(action);
  }
  return Object.freeze(executed);
}

function intakeSummary(intake) {
  const reasons = [...new Set((intake.rejected || []).flatMap((entry) => entry.errors || []).map(String))].sort();
  return Object.freeze({
    imported: intake.imported?.length || 0,
    rejected: intake.rejected?.length || 0,
    duplicates: intake.duplicates?.length || 0,
    rejectionReasonCodes: reasons,
  });
}

export function buildContinuityState({ snapshot, decision, intake, runtime, replenishment = null, latestAction = null, generatedAt = snapshot.now }) {
  const active = snapshot.tasks.filter((task) => ACTIVE_STATES.has(task.state));
  const ready = snapshot.tasks.filter((task) => task.state === 'READY');
  const eligibleReadyCount = decision.actions.filter((action) => CLAIM_ACTIONS.has(action.type)).length;
  const lastSemanticProgressAt = active.map((task) => task.semanticProgressAt).filter(Boolean).sort().at(-1) || null;
  return Object.freeze({
    contractVersion: 'DeliveryContinuityStateV1',
    generatedAt,
    utilization: { activeSlots: active.length, allowedSlots: snapshot.limits.global },
    eligibleReadyCount,
    ineligibleReadyCount: Math.max(0, ready.length - eligibleReadyCount),
    readyCount: ready.length,
    lastSemanticProgressAt,
    mostRecentContinuityAction: latestAction?.type || null,
    mostRecentContinuityActionAt: latestAction?.at || null,
    stalledWorkerCount: decision.actions.filter((action) => action.type === 'TERMINATE_STALLED_WORKER').length,
    correctionCeilingsReached: decision.actions.filter((action) => action.type === 'REPLAN_TERMINAL_TASK').length,
    runtimeRefreshState: runtime.refreshState,
    backlogHealth: Number.isInteger(replenishment?.deficit) && replenishment.deficit > 0
      ? `BACKLOG_CANDIDATE_DEFICIT_${replenishment.deficit}`
      : ready.length === 0
        ? 'BACKLOG_STARVED'
        : eligibleReadyCount === 0
          ? 'BACKLOG_INELIGIBLE'
          : ready.length < snapshot.limits.global ? 'BACKLOG_LOW' : 'BACKLOG_HEALTHY',
    backlogReserve: replenishment ? Object.freeze({
      target: replenishment.reserveTarget,
      hardCap: replenishment.hardCap,
      readyBefore: replenishment.readyBefore,
      promoted: replenishment.promoted,
      deficit: replenishment.deficit,
    }) : null,
    intake: intakeSummary(intake),
    actions: decision.actions,
  });
}

function recordContinuityStateIfChanged(db, state, now = new Date()) {
  const comparable = { ...state, generatedAt: null };
  const stateHash = stableHash(comparable);
  const latest = db.prepare('SELECT payload_json FROM orchestration_events WHERE type=? ORDER BY event_id DESC LIMIT 1').get(CONTINUITY_STATE_EVENT);
  try {
    if (latest && JSON.parse(latest.payload_json).stateHash === stateHash) return false;
  } catch {}
  recordOrchestrationEvent(db, { type: CONTINUITY_STATE_EVENT, payload: { stateHash, state }, now });
  return true;
}

function labels(value) {
  return new Set((value?.labels || []).map((entry) => entry?.name || entry).filter(Boolean));
}

export function syncActiveTaskToGitHub({ task, repoFullName, gh = 'gh', exec = execFileSync }) {
  if (!ACTIVE_STATES.has(task?.state)) return { ok: true, skipped: true };
  const desiredLabel = ACTIVE_LABEL[task.state];
  const run = (args) => String(exec(gh, args, { encoding: 'utf8', timeout: 10_000, maxBuffer: 4 * 1024 * 1024 }));
  run(['label','create',desiredLabel,'--repo',repoFullName,'--force','--description','Orchestration V4 active state']);
  const current = labels(JSON.parse(run(['issue','view',String(task.issue_number),'--repo',repoFullName,'--json','labels,state']) || '{}'));
  for (const label of LIFECYCLE_LABELS) {
    if (label !== desiredLabel && current.has(label)) {
      run(['issue','edit',String(task.issue_number),'--repo',repoFullName,'--remove-label',label]);
    }
  }
  if (!current.has(desiredLabel)) run(['issue','edit',String(task.issue_number),'--repo',repoFullName,'--add-label',desiredLabel]);
  return { ok: true, skipped: false, label: desiredLabel };
}

export function syncTerminalLifecycleTaskToGitHub({ task, repoFullName, gh = 'gh', exec = execFileSync }) {
  const run = (args) => String(exec(gh, args, { encoding: 'utf8', timeout: 10_000, maxBuffer: 4 * 1024 * 1024 }));
  const current = labels(JSON.parse(run(['issue','view',String(task.issue_number),'--repo',repoFullName,'--json','labels,state']) || '{}'));
  for (const label of Object.values(ACTIVE_LABEL)) {
    if (label !== 'orch:running' && current.has(label)) {
      run(['issue','edit',String(task.issue_number),'--repo',repoFullName,'--remove-label',label]);
    }
  }
  return syncTerminalTaskToGitHub({ task, repoFullName, gh, exec });
}

export async function syncActiveGithubTasks({ db, repoFullName, gh = 'gh', sync = syncActiveTaskToGitHub }) {
  const active = db.prepare("SELECT * FROM tasks WHERE state IN ('CLAIMED','RUNNING','VALIDATING','PR_OPENED') ORDER BY updated_at,task_id").all();
  const results = [];
  for (const task of active) {
    try { results.push(await sync({ task, repoFullName, gh })); }
    catch (error) { results.push({ ok: false, issueNumber: task.issue_number, error: String(error?.message || error) }); }
  }
  return results;
}

export async function runProductionPoll({
  db,
  repoRoot,
  repoFullName,
  workspaceRoot,
  configPath,
  issues = null,
  openclaw = '/opt/homebrew/bin/openclaw',
  ollama = '/opt/homebrew/bin/ollama',
  gh = 'gh',
  timeoutMs = 100 * 60_000,
  agentTimeoutMs = 90 * 60_000,
  stallMs = 30 * 60_000,
  continuityEnabled = continuityStewardEnabled(),
  terminalTransition = null,
  refreshRuntime = refreshRuntimeMain,
  replenish = replenishBacklog,
  syncActive = syncActiveGithubTasks,
  now = () => new Date(),
}) {
  if (!path.isAbsolute(repoRoot) || !path.isAbsolute(workspaceRoot) || !path.isAbsolute(configPath)) {
    throw new Error('V4_PRODUCTION_ABSOLUTE_PATHS_REQUIRED');
  }
  if (!Number.isInteger(agentTimeoutMs) || agentTimeoutMs <= 0 || agentTimeoutMs >= timeoutMs) {
    throw new Error('V4_PRODUCTION_AGENT_TIMEOUT_INVALID');
  }
  if (!Number.isInteger(stallMs) || stallMs <= 0 || stallMs >= timeoutMs) {
    throw new Error('V4_PRODUCTION_STALL_TIMEOUT_INVALID');
  }
  const beforeRefresh = db.prepare('SELECT * FROM tasks ORDER BY created_at,task_id').all();
  const runtime = refreshRuntime({ repoRoot, tasks: beforeRefresh, allowAdvance: false });
  const baseSha = runtime.latestHead;
  const replenishment = issues === null
    ? await replenish({
        repoFullName,
        gh,
        tasks: beforeRefresh,
        runtimeHealthy: runtime.clean === true && runtime.refreshState !== 'DIRTY',
      })
    : null;
  const snapshots = issues ?? listReadyIssues({ repoFullName, gh });
  const intake = importReadyIssues({ db, issues: snapshots, baseSha });
  const withdrawnReadyTasks = reconcileWithdrawnReadyTasks(db, snapshots, { now: now() });
  const dependencyBlockedTasks = blockTasksWithFailedDependencies(db, { now: now() });
  const allTasks = db.prepare('SELECT * FROM tasks ORDER BY created_at,task_id').all();
  const dependencies = listTaskDependencies(db);
  const ready = allTasks.filter((task) => task.state === 'READY');
  const runnableTaskIds = new Set(listRunnableTasks(db).map((task) => task.task_id));
  const deliverySelection = selectDeliveryReadyTasks(allTasks, { maxExecutableTasks: PRODUCT_LANE_CAPACITY });
  const integrationReady = ready.filter((task) => task.stream === 'INTEGRATION_RELEASE' && runnableTaskIds.has(task.task_id)).slice(0, 1);
  const continuitySnapshot = buildContinuitySnapshot({
    db,
    runtime,
    now: now(),
    semanticProgressWindowMs: stallMs,
    terminalTransition,
    reservedSlotIds: integrationReady.length ? ['local-e'] : [],
  });
  const continuityDecision = continuityEnabled
    ? decideDeliveryContinuity(continuitySnapshot)
    : Object.freeze({ contractVersion: 'DeliveryContinuityDecisionV1', actions: Object.freeze([]) });
  const continuityTaskIds = new Set(continuityDecision.actions.filter((action) => CLAIM_ACTIONS.has(action.type)).map((action) => action.taskId));
  const executable = continuityEnabled
    ? deliverySelection.selected.filter((task) => continuityTaskIds.has(task.task_id))
    : deliverySelection.selected;
  const controlActions = continuityEnabled
    ? executeContinuityControlActions(db, continuityDecision, {
        now: now(),
        refreshMain: (action) => refreshRuntime({
          repoRoot,
          tasks: beforeRefresh,
          allowAdvance: true,
          expectedFrom: action.fromHead,
          expectedTo: action.toHead,
        }),
      })
    : [];
  const refreshedRuntime = controlActions.find((action) => action.type === 'REFRESH_CLEAN_IDLE_RUNTIME')?.result || runtime;
  const continuity = buildContinuityState({
    snapshot: continuitySnapshot,
    decision: continuityDecision,
    intake,
    runtime: refreshedRuntime,
    replenishment,
    latestAction: latestRecordedContinuityAction(db),
    generatedAt: now().toISOString(),
  });
  recordContinuityStateIfChanged(db, continuity, now());
  const activeGithubSyncBefore = await syncActive({ db, repoFullName, gh });
  const ephemeral = [];
  const commandsByTaskId = {};

  try {
    for (const task of executable) {
      commandsByTaskId[task.task_id] = buildTaskExecutionSpec({
        task,
        agentTimeoutMs,
        openclaw,
        retainState: (state) => ephemeral.push(state),
      });
    }

    const { settled, integrationSettled } = await runConcurrentProductionQueues({
      runExecutableQueue: () => runReadyBatch({
        db,
        registry: createSlotRegistry(),
        repoRoot,
        workspaceRoot,
        commandsByTaskId,
        timeoutMs,
        stallMs,
        finalizeSuccess: ({ task, workspace }) => publishImplementationResult({ task, workspace, repoFullName, gh }),
      }),
      runIntegrationQueue: async () => {
        const results = [];
        for (const task of integrationReady) {
          const resolverPrompt = promptForIntegrationConflict(task);
          try {
            const result = await runIntegrationTask({
              db,
              repoRoot,
              repoFullName,
              workspaceRoot,
              taskId: task.task_id,
              canonicalMainSha: baseSha,
              resolverCommand: process.execPath,
              resolverArgs: [INTEGRATION_PROPOSAL_ENTRYPOINT, resolverPrompt, String(Math.ceil(agentTimeoutMs / 1000)), ollama, 'qwen2.5-coder:14b'],
              gh,
              timeoutMs,
              stallMs,
            });
            results.push({ status: 'fulfilled', value: result });
          } catch (error) {
            results.push({ status: 'rejected', reason: String(error?.message || error) });
          }
        }
        return results;
      },
    });

    const dispatchedActions = [];
    const terminalTransitions = [];
    for (const action of continuityDecision.actions.filter((entry) => CLAIM_ACTIONS.has(entry.type))) {
      const task = getTask(db, action.taskId);
      if (!task || task.state === 'READY') continue;
      if (recordContinuityActionOnce(db, { action, task, now: now() })) dispatchedActions.push(action);
      if (TERMINAL_STATES.has(task.state)) {
        terminalTransitions.push({ taskId: task.task_id, slotId: action.slotId, at: now().toISOString() });
      }
    }

    const githubSync = await syncPendingGithubTasks({ db, repoFullName, gh });
    const activeGithubSyncAfter = await syncActive({ db, repoFullName, gh });

    return Object.freeze({
      baseSha,
      intake,
      replenishment,
      withdrawnReadyTasks,
      dependencyBlockedTasks,
      attempted: settled.length,
      settled,
      integrationAttempted: integrationSettled.length,
      integrationSettled,
      githubSync,
      activeGithubSyncBefore,
      activeGithubSyncAfter,
      continuity: Object.freeze({ ...continuity, executedControlActions: [...controlActions, ...dispatchedActions] }),
      terminalTransitions,
      deliveryPolicy: {
        selected: executable.map((task) => task.task_id),
        deferred: deliverySelection.deferred,
        activeSliceIds: deliverySelection.activeSliceIds,
      },
    });
  } finally {
    cleanupProductionAgentStates(ephemeral);
  }
}
