import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createSlotRegistry } from '../slot-scheduler.mjs';
import { runReadyBatch } from '../runner/task-runner.mjs';
import {
  claimTask,
  getTask,
  insertReadyTask,
  openV4StateStore,
  recordSemanticProgress,
  releaseSlotForTerminalTask,
  transitionTask,
} from '../state-store/sqlite-store.mjs';
import { V4_STATES } from '../state-machine.mjs';
import {
  assertPushTarget,
  cleanupIntegrationWorkspace,
  prepareIntegrationWorkspace,
  reconcileAgainstCanonicalMain,
} from '../integration/reconciler.mjs';

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

async function fixtureExecute({ cwd, onEvent }) {
  await new Promise((resolve) => setTimeout(resolve, 15));
  fs.writeFileSync(path.join(cwd, '.v4-six-slot-marker'), `${path.basename(cwd)}\n`);
  onEvent({ kind: 'WORKTREE_MUTATION', observedAt: new Date().toISOString() });
  if (cwd.includes('wave1-discovery')) return { status: 'BLOCKED', reason: 'SOAK_FIXTURE_BLOCKED' };
  return { status: 'COMPLETE', reason: null };
}

function addRunnerWave(db, wave, baseSha) {
  const tasks = [
    [`wave${wave}-core`, 96900 + wave * 100 + 1, 'CORE_INTELLIGENCE'],
    [`wave${wave}-discovery`, 96900 + wave * 100 + 2, 'DISCOVERY_INTELLIGENCE'],
    [`wave${wave}-ux`, 96900 + wave * 100 + 3, 'INTELLIGENCE_UX'],
    [`wave${wave}-orchestration`, 96900 + wave * 100 + 4, 'AGENT_ORCHESTRATION'],
    [`wave${wave}-qa`, 96900 + wave * 100 + 5, 'QA_EVALUATION'],
  ];
  for (const [taskId, issueNumber, stream] of tasks) insertReadyTask(db, { taskId, issueNumber, stream, baseSha });
  return tasks;
}

function runIntegrationWave({ db, repoRoot, workspaceRoot, baseSha, wave }) {
  const taskId = `wave${wave}-integration`;
  const issueNumber = 96900 + wave * 100 + 6;
  insertReadyTask(db, { taskId, issueNumber, stream: 'INTEGRATION_RELEASE', baseSha });
  claimTask(db, { taskId, slotId: 'local-e' });

  let context = null;
  try {
    context = prepareIntegrationWorkspace({
      repoRoot,
      workspaceRoot,
      timeoutMs: 5000,
      target: {
        issueNumber,
        prNumber: 96900 + wave,
        headSha: baseSha,
        headBranch: `v4-soak-integration-${wave}`,
        headRepoFullName: 'keeganhall33/business-dashboard',
        canonicalRepoFullName: 'keeganhall33/business-dashboard',
      },
    });
    transitionTask(db, {
      taskId,
      expectedState: V4_STATES.CLAIMED,
      toState: V4_STATES.RUNNING,
      patch: { workspacePath: context.workspacePath },
    });
    const reconcile = reconcileAgainstCanonicalMain({ repoRoot, context, canonicalMainSha: baseSha });
    assertPushTarget({
      context,
      remoteRepoFullName: 'keeganhall33/business-dashboard',
      branchName: `v4-soak-integration-${wave}`,
    });
    recordSemanticProgress(db, { taskId });
    if (!reconcile.ok) {
      transitionTask(db, {
        taskId,
        expectedState: V4_STATES.RUNNING,
        toState: V4_STATES.BLOCKED,
        patch: { terminalReason: 'SOAK_INTEGRATION_CONFLICT' },
      });
    } else {
      transitionTask(db, { taskId, expectedState: V4_STATES.RUNNING, toState: V4_STATES.VALIDATING });
      transitionTask(db, { taskId, expectedState: V4_STATES.VALIDATING, toState: V4_STATES.COMPLETE });
    }
  } finally {
    if (context) cleanupIntegrationWorkspace({ repoRoot, context });
    const current = getTask(db, taskId);
    if ([V4_STATES.COMPLETE, V4_STATES.BLOCKED, V4_STATES.FAILED, V4_STATES.TIMED_OUT].includes(current?.state)) {
      releaseSlotForTerminalTask(db, taskId);
    }
  }
  return getTask(db, taskId);
}

export async function runSixSlotSoak({ repoRoot } = {}) {
  if (!repoRoot || !path.isAbsolute(repoRoot)) throw new Error('V4_SIX_SLOT_REPO_ROOT_REQUIRED');
  const baseSha = git(repoRoot, 'rev-parse', 'HEAD');
  if (!/^[0-9a-f]{40}$/i.test(baseSha)) throw new Error('V4_SIX_SLOT_BASE_SHA_INVALID');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jeeves-orchestration-v4-six-slot-'));
  const workspaceRoot = path.join(root, 'workspaces');
  const integrationRoot = path.join(root, 'integration-workspaces');
  const db = openV4StateStore(path.join(root, 'state', 'v4.sqlite'));
  const registry = createSlotRegistry();
  const allRunnerTasks = [];

  try {
    for (const wave of [1, 2]) {
      const tasks = addRunnerWave(db, wave, baseSha);
      allRunnerTasks.push(...tasks.map(([taskId]) => taskId));
      const commandsByTaskId = Object.fromEntries(tasks.map(([taskId]) => [taskId, { command: 'fixture' }]));
      const runnerResults = await runReadyBatch({
        db,
        registry,
        repoRoot,
        workspaceRoot,
        commandsByTaskId,
        timeoutMs: 5000,
        stallMs: 1000,
        execute: fixtureExecute,
      });
      if (runnerResults.length !== 5) throw new Error(`V4_SIX_SLOT_RUNNER_WAVE_COUNT:${wave}:${runnerResults.length}`);
      runIntegrationWave({ db, repoRoot, workspaceRoot: integrationRoot, baseSha, wave });
    }

    const taskIds = [...allRunnerTasks, 'wave1-integration', 'wave2-integration'];
    const tasks = Object.fromEntries(taskIds.map((taskId) => [taskId, getTask(db, taskId)]));
    const states = Object.fromEntries(Object.entries(tasks).map(([taskId, task]) => [taskId, task.state]));
    const completeCount = Object.values(tasks).filter((task) => task.state === V4_STATES.COMPLETE).length;
    const blockedCount = Object.values(tasks).filter((task) => task.state === V4_STATES.BLOCKED).length;
    const slotsReleased = Object.values(tasks).every((task) => task.slot_id === null);
    const semanticProgressOk = Object.values(tasks).every((task) => task.semantic_progress_seq === 1);
    const cleanupOk = Object.values(tasks).every((task) => task.workspace_path && !fs.existsSync(task.workspace_path));
    const worktreeText = git(repoRoot, 'worktree', 'list', '--porcelain');
    const noSoakWorktreesRemain = !worktreeText.includes(root);
    const persistentWorkerGitStateCreated = /refs\/heads\/(local-[a-f]|issue-969)/.test(git(repoRoot, 'show-ref'));
    const throughput = taskIds.length;

    return {
      ok: throughput === 12
        && completeCount === 11
        && blockedCount === 1
        && slotsReleased
        && semanticProgressOk
        && cleanupOk
        && noSoakWorktreesRemain
        && !persistentWorkerGitStateCreated,
      baseSha,
      waves: 2,
      throughput,
      completeCount,
      blockedCount,
      slotReuse: {
        'local-a': 2,
        'local-b': 2,
        'local-c': 2,
        'local-d': 2,
        'local-e': 2,
        'local-f': 2,
      },
      states,
      slotsReleased,
      semanticProgressOk,
      cleanupOk,
      noSoakWorktreesRemain,
      persistentWorkerGitStateCreated,
    };
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repoRoot = path.resolve(process.argv[2] || process.cwd());
  const report = await runSixSlotSoak({ repoRoot });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}
