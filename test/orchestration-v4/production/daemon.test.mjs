import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildContinuitySnapshot,
  buildContinuityState,
  buildCorrectionAgentAttempt,
  buildTaskExecutionSpec,
  cleanupProductionAgentStates,
  continuityStewardEnabled,
  executeContinuityControlActions,
  PRODUCT_LANE_CAPACITY,
  reconcileWithdrawnReadyTasks,
  refreshRuntimeMain,
  syncActiveTaskToGitHub,
  syncTerminalLifecycleTaskToGitHub,
  syncPendingGithubTasks,
  runProductionPoll,
  taskMutationMode,
} from '../../../scripts/orchestration-v4/production/daemon.mjs';
import { decideDeliveryContinuity } from '../../../scripts/orchestration-v4/production/delivery-continuity-policy.mjs';
import { runProductionHost } from '../../../scripts/orchestration-v4/production/host.mjs';
import { createEphemeralAgentState } from '../../../scripts/orchestration-v4/runner/agent-executor.mjs';
import {
  claimTask,
  getGithubSyncMarker,
  getTask,
  insertReadyTask,
  openV4StateStore,
  transitionTask,
} from '../../../scripts/orchestration-v4/state-store/sqlite-store.mjs';
import { V4_STATES } from '../../../scripts/orchestration-v4/state-machine.mjs';

const BASE_SHA = 'a'.repeat(40);

function terminalFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-github-sync-'));
  const db = openV4StateStore(path.join(root, 'state.sqlite'));
  insertReadyTask(db, {
    taskId: 'terminal-only',
    issueNumber: 1138,
    stream: 'AGENT_ORCHESTRATION',
    baseSha: 'a'.repeat(40),
  });
  claimTask(db, { taskId: 'terminal-only', slotId: 'local-d' });
  transitionTask(db, {
    taskId: 'terminal-only',
    expectedState: V4_STATES.CLAIMED,
    toState: V4_STATES.FAILED,
    patch: { terminalReason: 'TEST_FAILURE' },
  });
  return {
    db,
    close() {
      db.close();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

test('unsynced terminal task is selected when no READY rows exist and unchanged state is not resynced', async () => {
  const fixture = terminalFixture();
  const calls = [];
  try {
    const first = await syncPendingGithubTasks({
      db: fixture.db,
      repoFullName: 'owner/repo',
      sync: async ({ task }) => {
        calls.push(task.task_id);
        return { ok: true, skipped: false };
      },
    });
    assert.equal(first.length, 1);
    assert.deepEqual(calls, ['terminal-only']);
    assert.equal(getGithubSyncMarker(fixture.db, 'terminal-only').last_state, V4_STATES.FAILED);

    const second = await syncPendingGithubTasks({
      db: fixture.db,
      repoFullName: 'owner/repo',
      sync: async () => {
        throw new Error('UNCHANGED_TASK_MUST_NOT_SYNC');
      },
    });
    assert.deepEqual(second, []);
  } finally {
    fixture.close();
  }
});

test('failed bounded synchronization remains pending and a later poll can succeed', async () => {
  const fixture = terminalFixture();
  try {
    const failed = await syncPendingGithubTasks({
      db: fixture.db,
      repoFullName: 'owner/repo',
      sync: async () => { throw new Error('V4_GITHUB_COMMAND_TIMED_OUT'); },
    });
    assert.equal(failed[0].ok, false);
    assert.equal(getGithubSyncMarker(fixture.db, 'terminal-only'), null);

    const recovered = await syncPendingGithubTasks({
      db: fixture.db,
      repoFullName: 'owner/repo',
      sync: async () => ({ ok: true, skipped: false }),
    });
    assert.equal(recovered[0].ok, true);
    assert.equal(getGithubSyncMarker(fixture.db, 'terminal-only').last_state, V4_STATES.FAILED);
  } finally {
    fixture.close();
  }
});

// Verify timeout default values and invariant from source code
const DAEMON_SOURCE = fs.readFileSync(
  new URL('../../../scripts/orchestration-v4/production/daemon.mjs', import.meta.url),
  'utf8'
);

// Extract default timeout values
const TIMEOUT_MS_MATCH = DAEMON_SOURCE.match(/timeoutMs = (\d+) \* 60_000,/);
const AGENT_TIMEOUT_MS_MATCH = DAEMON_SOURCE.match(/agentTimeoutMs = (\d+) \* 60_000,/);
const STALL_MS_MATCH = DAEMON_SOURCE.match(/stallMs = (\d+) \* 60_000,/);

test('runProductionPoll uses updated default timeouts: 100-min outer, 90-min agent, 30-min stall', async () => {
  const TIMEOUT_MINUTES = Object.freeze({
    DEFAULT_TIMEOUT_MS: parseInt(TIMEOUT_MS_MATCH?.[1] || '0', 10),
    DEFAULT_AGENT_TIMEOUT_MS: parseInt(AGENT_TIMEOUT_MS_MATCH?.[1] || '0', 10),
    DEFAULT_STALL_MS: parseInt(STALL_MS_MATCH?.[1] || '0', 10),
  });

  assert.equal(TIMEOUT_MINUTES.DEFAULT_TIMEOUT_MS, 100, 'outer timeout default should be 100 minutes');
  assert.equal(TIMEOUT_MINUTES.DEFAULT_AGENT_TIMEOUT_MS, 90, 'agent timeout default should be 90 minutes');
  assert.equal(TIMEOUT_MINUTES.DEFAULT_STALL_MS, 30, 'stall timeout default should be 30 minutes');
});

test('continuity steward defaults on after exact-head rollout approval and retains an explicit rollback', async () => {
  assert.equal(continuityStewardEnabled({}), true);
  assert.equal(continuityStewardEnabled({ JEEVES_V4_CONTINUITY_STEWARD: '0' }), false);
  assert.equal(continuityStewardEnabled({ JEEVES_V4_CONTINUITY_STEWARD: '1' }), true);
});

test('production continuity exposes all six product execution lanes', () => {
  assert.equal(PRODUCT_LANE_CAPACITY, 6);
  assert.match(DAEMON_SOURCE, /limits: \{ global: PRODUCT_LANE_CAPACITY, perSlice: 3, perStream: 3, executable: PRODUCT_LANE_CAPACITY \}/);
  assert.match(DAEMON_SOURCE, /selectDeliveryReadyTasks\(allTasks, \{ maxExecutableTasks: PRODUCT_LANE_CAPACITY \}\)/);
});

test('timeout invariant: stallMs < agentTimeoutMs < timeoutMs', async () => {
  const TIMEOUT_MINUTES = Object.freeze({
    DEFAULT_TIMEOUT_MS: parseInt(TIMEOUT_MS_MATCH?.[1] || '0', 10),
    DEFAULT_AGENT_TIMEOUT_MS: parseInt(AGENT_TIMEOUT_MS_MATCH?.[1] || '0', 10),
    DEFAULT_STALL_MS: parseInt(STALL_MS_MATCH?.[1] || '0', 10),
  });

  assert.ok(TIMEOUT_MINUTES.DEFAULT_STALL_MS < TIMEOUT_MINUTES.DEFAULT_AGENT_TIMEOUT_MS, 'stallMs should be less than agentTimeoutMs');
  assert.ok(TIMEOUT_MINUTES.DEFAULT_AGENT_TIMEOUT_MS < TIMEOUT_MINUTES.DEFAULT_TIMEOUT_MS, 'agentTimeoutMs should be less than timeoutMs');
});

function correctionPacket(reason = 'APPLY_PATCH_FORMAT_ERROR') {
  return { unitId: 'unit', verdict: 'RED', reason, evidence: 'evidence', scope: 'owned', attempt: 1, maxAttempts: 3 };
}

function taskWithBody(body) {
  return { contract_json: JSON.stringify({ body }) };
}

test('task mutation mode accepts only absent, exact DEFAULT, or exact SHELL_ONLY directives', () => {
  assert.equal(taskMutationMode(taskWithBody('ordinary task')), 'DEFAULT');
  assert.equal(taskMutationMode(taskWithBody('**mutation_mode:** DEFAULT')), 'DEFAULT');
  assert.equal(taskMutationMode(taskWithBody('**mutation_mode:** SHELL_ONLY')), 'SHELL_ONLY');
});

test('task mutation mode fails closed on blank, unsupported, and extra-token directives', () => {
  for (const body of [
    '**mutation_mode:**',
    '**mutation_mode:** SOMETHING_ELSE',
    '**mutation_mode:** SHELL_ONLY extra',
  ]) {
    assert.throws(
      () => taskMutationMode(taskWithBody(body)),
      /V4_PRODUCTION_MUTATION_MODE_DIRECTIVE_INVALID/,
      body,
    );
  }
});

test('task mutation mode fails closed on duplicate identical or conflicting directives', () => {
  for (const body of [
    '**mutation_mode:** SHELL_ONLY\n**mutation_mode:** SHELL_ONLY',
    '**mutation_mode:** DEFAULT\n**mutation_mode:** SHELL_ONLY',
  ]) {
    assert.throws(
      () => taskMutationMode(taskWithBody(body)),
      /V4_PRODUCTION_MUTATION_MODE_DIRECTIVE_INVALID/,
      body,
    );
  }
});

test('patch-format correction receives a distinct shell-only configuration', () => {
  const retained = [];
  const calls = [];
  const next = buildCorrectionAgentAttempt({
    packet: correctionPacket(),
    command: 'node',
    args: ['entry.mjs', 'primary prompt', '/primary/config.json', '/primary/state', '90', 'openclaw'],
    createState: (options) => {
      calls.push(options);
      return { configPath: '/correction/config.json', stateDir: '/correction/state' };
    },
    retainState: (state) => retained.push(state),
  });
  assert.deepEqual(calls, [{ taskId: 'unit-correction-1', applyPatchEnabled: false }]);
  assert.equal(next.args[2], '/correction/config.json');
  assert.equal(next.args[3], '/correction/state');
  assert.match(next.args[1], /MUTATION_MODE: SHELL_ONLY/);
  assert.equal(retained.length, 1);
});

test('production cleanup removes both primary and correction ephemeral states', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-daemon-capability-cleanup-'));
  const primary = createEphemeralAgentState({ taskId: 'unit', root });
  const retained = [];
  try {
    buildCorrectionAgentAttempt({
      packet: correctionPacket(),
      command: 'node',
      args: ['entry.mjs', 'primary prompt', primary.configPath, primary.stateDir, '90', 'openclaw'],
      createState: (options) => createEphemeralAgentState({ ...options, root }),
      retainState: (state) => retained.push(state),
    });
    assert.equal(retained.length, 1);
    assert.equal(fs.existsSync(primary.stateDir), true);
    assert.equal(fs.existsSync(retained[0].stateDir), true);

    cleanupProductionAgentStates([primary, ...retained]);

    assert.equal(fs.existsSync(primary.stateDir), false);
    assert.equal(fs.existsSync(retained[0].stateDir), false);
  } finally {
    cleanupProductionAgentStates([primary, ...retained]);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('unrelated correction retains the primary configuration', () => {
  const next = buildCorrectionAgentAttempt({
    packet: correctionPacket('EXIT_2'),
    command: 'node',
    args: ['entry.mjs', 'primary prompt', '/primary/config.json', '/primary/state', '90', 'openclaw'],
    createState: () => { throw new Error('MUST_NOT_CREATE_STATE'); },
  });
  assert.equal(next.args[2], '/primary/config.json');
  assert.equal(next.args[3], '/primary/state');
  assert.doesNotMatch(next.args[1], /MUTATION_MODE: SHELL_ONLY/);
});


test('deterministic verifier bypasses OpenClaw state while ordinary work is unchanged', () => {
  const deterministicTask = {
    task_id: 'ionos-live-verification',
    issue_number: 1508,
    contract_json: JSON.stringify({
      taskId: 'ionos-live-verification',
      issueNumber: 1508,
      taskMutability: 'VALIDATION_EVIDENCE_ONLY',
      sliceStage: 'PRODUCTION_VERIFICATION',
      deterministicVerifier: 'IONOS_HISTORICAL_PREVIEW_V1',
    }),
  };
  const deterministic = buildTaskExecutionSpec({
    task: deterministicTask,
    agentTimeoutMs: 90 * 60_000,
    openclaw: '/openclaw',
    createState: () => { throw new Error('DETERMINISTIC_ROUTE_MUST_NOT_CREATE_AGENT_STATE'); },
  });
  assert.match(deterministic.args[0], /deterministic-verification-executor\.mjs$/);
  assert.equal(deterministic.buildCorrectionAttempt, undefined);

  const retained = [];
  const ordinaryTask = {
    task_id: 'ordinary',
    issue_number: 42,
    contract_json: JSON.stringify({
      taskId: 'ordinary',
      issueNumber: 42,
      title: 'Ordinary',
      body: '**mutation_mode:** SHELL_ONLY',
      fileOwnership: 'src/example.mjs',
      taskMutability: 'IMPLEMENTATION_MUTATION_REQUIRED',
    }),
  };
  const ordinary = buildTaskExecutionSpec({
    task: ordinaryTask,
    agentTimeoutMs: 90 * 60_000,
    openclaw: '/openclaw',
    createState: (options) => {
      assert.deepEqual(options, { taskId: 'ordinary', applyPatchEnabled: false });
      return { configPath: '/state/config.json', stateDir: '/state' };
    },
    retainState: (state) => retained.push(state),
  });
  assert.equal(ordinary.command, process.execPath);
  assert.equal(ordinary.args[2], '/state/config.json');
  assert.equal(ordinary.args[3], '/state');
  assert.equal(ordinary.args.at(-1), '/openclaw');
  assert.equal(retained.length, 1);
});

test('runtime observation is non-mutating and policy-authorized clean idle refresh fast-forwards', () => {
  const latest = 'b'.repeat(40);
  const createExec = ({ active = false, dirty = false } = {}) => {
    let head = 'a'.repeat(40);
    const calls = [];
    const exec = (_command, args) => {
      calls.push(args.slice(2));
      const gitArgs = args.slice(2);
      if (gitArgs[0] === 'rev-parse') return `${head}\n`;
      if (gitArgs[0] === 'status') return dirty ? ' M owned.mjs\n' : '';
      if (gitArgs[0] === 'branch') return 'main\n';
      if (gitArgs[0] === 'merge') { head = latest; return 'fast-forward\n'; }
      if (gitArgs[0] === 'merge-base') return '';
      throw new Error(`UNEXPECTED_GIT:${gitArgs.join(':')}`);
    };
    const tasks = active ? [{ state: 'RUNNING', base_sha: 'a'.repeat(40) }] : [];
    return { exec, calls, tasks };
  };

  const idle = createExec();
  const observed = refreshRuntimeMain({ repoRoot: '/repo', tasks: idle.tasks, fetchMain: () => latest, exec: idle.exec });
  assert.equal(observed.refreshState, 'OBSERVED_STALE');
  assert.equal(idle.calls.some((args) => args[0] === 'merge'), false);
  const advanced = refreshRuntimeMain({ repoRoot: '/repo', tasks: idle.tasks, allowAdvance: true, fetchMain: () => latest, exec: idle.exec });
  assert.equal(advanced.refreshState, 'ADVANCED');
  assert.equal(advanced.head, latest);
  assert.equal(idle.calls.some((args) => args[0] === 'merge'), true);

  for (const options of [{ active: true }, { dirty: true }]) {
    const fixture = createExec(options);
    const result = refreshRuntimeMain({ repoRoot: '/repo', tasks: fixture.tasks, allowAdvance: true, fetchMain: () => latest, exec: fixture.exec });
    assert.equal(result.refreshState, options.active ? 'DEFERRED_ACTIVE' : 'DEFERRED_DIRTY');
    assert.equal(fixture.calls.some((args) => args[0] === 'merge'), false);
  }
});

test('withdrawn GitHub-ready work is terminalized before it can create a duplicate PR', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-withdrawn-ready-'));
  const db = openV4StateStore(path.join(root, 'state.sqlite'));
  try {
    insertReadyTask(db, { taskId: 'still-ready', issueNumber: 2001, stream: 'CORE_INTELLIGENCE', baseSha: BASE_SHA });
    insertReadyTask(db, { taskId: 'already-complete-on-github', issueNumber: 2002, stream: 'CORE_INTELLIGENCE', baseSha: BASE_SHA });
    const withdrawn = reconcileWithdrawnReadyTasks(db, [{ number: 2001 }], { now: new Date('2026-09-13T20:00:00Z') });
    assert.deepEqual(withdrawn, ['already-complete-on-github']);
    assert.equal(getTask(db, 'still-ready').state, V4_STATES.READY);
    assert.equal(getTask(db, 'already-complete-on-github').state, V4_STATES.BLOCKED);
    assert.equal(getTask(db, 'already-complete-on-github').terminal_reason, 'GITHUB_READY_WITHDRAWN');
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runtime snapshot drives compatible startup claims and terminal slot refill', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-continuity-snapshot-'));
  const db = openV4StateStore(path.join(root, 'state.sqlite'));
  try {
    insertReadyTask(db, {
      taskId: 'core-next', issueNumber: 2011, stream: 'CORE_INTELLIGENCE', baseSha: BASE_SHA,
      contract: { fileOwnership: 'src/core.mjs', priority: 'P0', maxAttempts: 1 },
    });
    insertReadyTask(db, {
      taskId: 'ux-next', issueNumber: 2012, stream: 'INTELLIGENCE_UX', baseSha: BASE_SHA,
      contract: { fileOwnership: 'src/ux.mjs', priority: 'P1', maxAttempts: 1 },
    });
    const snapshot = buildContinuitySnapshot({
      db,
      runtime: { head: BASE_SHA, latestHead: BASE_SHA, ancestorHeads: [], clean: true, idle: true, refreshState: 'CURRENT' },
      now: new Date('2026-09-13T20:00:00Z'),
      semanticProgressWindowMs: 30 * 60_000,
      terminalTransition: { taskId: 'previous', slotId: 'local-a', at: '2026-09-13T19:59:59Z' },
    });
    const decision = decideDeliveryContinuity(snapshot);
    assert.equal(decision.actions.some((action) => action.type === 'REFILL_VACATED_SLOT' && action.taskId === 'core-next'), true);
    assert.equal(decision.actions.some((action) => action.type === 'CLAIM_READY_TASK' && action.taskId === 'ux-next'), true);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('stall termination action is process-owned and idempotent across duplicate polls', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-continuity-action-'));
  const db = openV4StateStore(path.join(root, 'state.sqlite'));
  const signals = [];
  try {
    insertReadyTask(db, { taskId: 'stalled', issueNumber: 2021, stream: 'CORE_INTELLIGENCE', baseSha: BASE_SHA });
    claimTask(db, { taskId: 'stalled', slotId: 'local-a' });
    transitionTask(db, {
      taskId: 'stalled', expectedState: V4_STATES.CLAIMED, toState: V4_STATES.RUNNING,
      patch: { childPid: 4567, processGroupId: 4567 },
    });
    const decision = { actions: [{ type: 'TERMINATE_STALLED_WORKER', taskId: 'stalled', slotId: 'local-a', reason: 'SEMANTIC_PROGRESS_STALL' }] };
    const options = { killGroup: (pgid, signal) => { signals.push([pgid, signal]); return true; }, now: new Date('2026-09-13T20:00:00Z') };
    assert.equal(executeContinuityControlActions(db, decision, options).length, 1);
    assert.equal(executeContinuityControlActions(db, decision, options).length, 0);
    assert.deepEqual(signals, [[4567, 'SIGTERM']]);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('terminal replan releases an orphaned active slot exactly once after a stall decision', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-continuity-replan-'));
  const db = openV4StateStore(path.join(root, 'state.sqlite'));
  try {
    insertReadyTask(db, { taskId: 'orphaned', issueNumber: 2022, stream: 'CORE_INTELLIGENCE', baseSha: BASE_SHA });
    claimTask(db, { taskId: 'orphaned', slotId: 'local-a' });
    transitionTask(db, { taskId: 'orphaned', expectedState: V4_STATES.CLAIMED, toState: V4_STATES.RUNNING });
    const decision = { actions: [{ type: 'REPLAN_TERMINAL_TASK', taskId: 'orphaned', reason: 'SEMANTIC_PROGRESS_STALL' }] };
    const options = { now: new Date('2026-09-13T20:00:00Z') };
    assert.equal(executeContinuityControlActions(db, decision, options).length, 1);
    assert.equal(executeContinuityControlActions(db, decision, options).length, 0);
    assert.equal(getTask(db, 'orphaned').state, V4_STATES.BLOCKED);
    assert.equal(getTask(db, 'orphaned').slot_id, null);
    assert.equal(getTask(db, 'orphaned').terminal_reason, 'CONTINUITY_REPLAN:SEMANTIC_PROGRESS_STALL');
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runtime refresh executes only through the emitted allow-listed action and only once', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-continuity-refresh-'));
  const db = openV4StateStore(path.join(root, 'state.sqlite'));
  const refreshes = [];
  try {
    const action = { type: 'REFRESH_CLEAN_IDLE_RUNTIME', fromHead: 'a'.repeat(40), toHead: 'b'.repeat(40) };
    const decision = { actions: [action] };
    const options = {
      refreshMain: (value) => { refreshes.push(value); return { refreshState: 'ADVANCED' }; },
      now: new Date('2026-09-13T20:00:00Z'),
    };
    assert.equal(executeContinuityControlActions(db, decision, options).length, 1);
    assert.equal(executeContinuityControlActions(db, decision, options).length, 0);
    assert.deepEqual(refreshes, [action]);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('active GitHub lifecycle sync removes contradictory labels before adding running', () => {
  const calls = [];
  const exec = (_command, args) => {
    calls.push(args);
    if (args[0] === 'issue' && args[1] === 'view') return JSON.stringify({ labels: [{ name: 'orch:ready' }, { name: 'orch:blocked' }] });
    return '';
  };
  const result = syncActiveTaskToGitHub({
    task: { state: V4_STATES.RUNNING, issue_number: 2031 },
    repoFullName: 'owner/repo',
    exec,
  });
  assert.equal(result.label, 'orch:running');
  assert.equal(calls.some((args) => args.includes('--remove-label') && args.includes('orch:ready')), true);
  assert.equal(calls.some((args) => args.includes('--remove-label') && args.includes('orch:blocked')), true);
  assert.equal(calls.some((args) => args.includes('--add-label') && args.includes('orch:running')), true);
});

test('active lifecycle labels preserve claimed, validating, and PR-opened distinctions', () => {
  for (const [state, expected] of [
    [V4_STATES.CLAIMED, 'orch:claimed'],
    [V4_STATES.VALIDATING, 'orch:validating'],
    [V4_STATES.PR_OPENED, 'orch:pr-opened'],
  ]) {
    const calls = [];
    const exec = (_command, args) => {
      calls.push(args);
      if (args[0] === 'issue' && args[1] === 'view') return JSON.stringify({ labels: [{ name: 'orch:ready' }] });
      return '';
    };
    assert.equal(syncActiveTaskToGitHub({ task: { state, issue_number: 2032 }, repoFullName: 'owner/repo', exec }).label, expected);
    assert.equal(calls.some((args) => args.includes('--add-label') && args.includes(expected)), true);
  }
});

test('terminal lifecycle sync removes active-only labels before applying terminal state', () => {
  const calls = [];
  let views = 0;
  const exec = (_command, args) => {
    calls.push(args);
    if (args[0] === 'issue' && args[1] === 'view') {
      views += 1;
      return JSON.stringify({ labels: views === 1 ? [{ name: 'orch:claimed' }] : [{ name: 'orch:complete' }] });
    }
    return '';
  };
  const result = syncTerminalLifecycleTaskToGitHub({
    task: { state: V4_STATES.COMPLETE, issue_number: 2033 },
    repoFullName: 'owner/repo',
    exec,
  });
  assert.equal(result.ok, true);
  assert.equal(calls.some((args) => args.includes('--remove-label') && args.includes('orch:claimed')), true);
});

test('continuity state exposes bounded rejection reasons and clears them on corrected intake', () => {
  const snapshot = {
    now: '2026-09-13T20:00:00.000Z', limits: { global: 6 },
    tasks: [],
  };
  const decision = { actions: [{ type: 'REPORT_BACKLOG_STARVATION', reason: 'NO_READY_TASKS' }] };
  const runtime = { refreshState: 'CURRENT' };
  const rejected = buildContinuityState({
    snapshot, decision, runtime,
    intake: { imported: [], duplicates: [], rejected: [{ issueNumber: 9, errors: ['CONTRACT_INVALID'] }] },
  });
  assert.deepEqual(rejected.intake, { imported: 0, rejected: 1, duplicates: 0, rejectionReasonCodes: ['CONTRACT_INVALID'] });
  assert.equal(rejected.ineligibleReadyCount, 0);
  assert.equal(rejected.mostRecentContinuityActionAt, null);
  const corrected = buildContinuityState({ snapshot, decision, runtime, intake: { imported: [{}], duplicates: [], rejected: [] } });
  assert.deepEqual(corrected.intake.rejectionReasonCodes, []);
  assert.equal(corrected.intake.imported, 1);
});

test('continuity state exposes an exact bounded candidate deficit from replenishment', () => {
  const state = buildContinuityState({
    snapshot: { now: '2026-09-13T22:00:00.000Z', limits: { global: 6 }, tasks: [] },
    decision: { actions: [{ type: 'REPORT_BACKLOG_STARVATION', reason: 'NO_READY_TASKS' }] },
    runtime: { refreshState: 'CURRENT' },
    intake: { imported: [], duplicates: [], rejected: [] },
    replenishment: {
      reserveTarget: 12,
      hardCap: 20,
      readyBefore: 0,
      promoted: 2,
      deficit: 10,
    },
  });
  assert.equal(state.backlogHealth, 'BACKLOG_CANDIDATE_DEFICIT_10');
  assert.deepEqual(state.backlogReserve, {
    target: 12,
    hardCap: 20,
    readyBefore: 0,
    promoted: 2,
    deficit: 10,
  });
});

test('host publishes continuity telemetry and carries terminal transition into the next reconciliation', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-host-continuity-'));
  const observedTransitions = [];
  let calls = 0;
  const continuity = {
    contractVersion: 'DeliveryContinuityStateV1',
    utilization: { activeSlots: 1, allowedSlots: 6 },
    backlogHealth: 'BACKLOG_LOW',
  };
  try {
    await runProductionHost({
      stateRoot: root,
      maxCycles: 2,
      intervalMs: 1,
      sleep: async () => { await new Promise((resolve) => setImmediate(resolve)); },
      poll: async ({ terminalTransition }) => {
        calls += 1;
        observedTransitions.push(terminalTransition);
        return calls === 1
          ? { continuity, terminalTransitions: [{ taskId: 'done', slotId: 'local-a', at: '2026-09-13T20:00:00.000Z' }] }
          : { continuity, terminalTransitions: [] };
      },
    });
    assert.equal(observedTransitions[0], null);
    assert.deepEqual(observedTransitions[1], { taskId: 'done', slotId: 'local-a', at: '2026-09-13T20:00:00.000Z' });
    const heartbeat = JSON.parse(fs.readFileSync(path.join(root, 'heartbeat.json'), 'utf8'));
    assert.deepEqual(heartbeat.continuity, continuity);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
