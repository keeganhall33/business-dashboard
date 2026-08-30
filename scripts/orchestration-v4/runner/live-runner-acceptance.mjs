import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createSlotRegistry } from '../slot-scheduler.mjs';
import { openV4StateStore, insertReadyTask, getTask } from '../state-store/sqlite-store.mjs';
import { runReadyBatch } from './task-runner.mjs';

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

async function fixtureExecute({ cwd, onEvent }) {
  await new Promise((resolve) => setTimeout(resolve, 20));
  fs.writeFileSync(path.join(cwd, '.v4-live-runner-marker'), `${path.basename(cwd)}\n`);
  onEvent({ kind: 'WORKTREE_MUTATION', observedAt: new Date().toISOString() });
  if (cwd.includes('v4-live-runner-discovery')) return { status: 'BLOCKED', reason: 'LIVE_FIXTURE_BLOCKED' };
  return { status: 'COMPLETE', reason: null };
}

export async function runLiveRunnerAcceptance({ repoRoot, timeoutMs = 5000, stallMs = 1000 } = {}) {
  if (!repoRoot || !path.isAbsolute(repoRoot)) throw new Error('V4_LIVE_RUNNER_REPO_ROOT_REQUIRED');
  const baseSha = git(repoRoot, 'rev-parse', 'HEAD');
  if (!/^[0-9a-f]{40}$/i.test(baseSha)) throw new Error('V4_LIVE_RUNNER_BASE_SHA_INVALID');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jeeves-orchestration-v4-runner-live-'));
  const workspaceRoot = path.join(root, 'workspaces');
  const db = openV4StateStore(path.join(root, 'state', 'v4.sqlite'));
  const tasks = [
    ['v4-live-runner-core', 96501, 'CORE_INTELLIGENCE'],
    ['v4-live-runner-discovery', 96502, 'DISCOVERY_INTELLIGENCE'],
    ['v4-live-runner-ux', 96503, 'INTELLIGENCE_UX'],
    ['v4-live-runner-backfill', 96504, 'CORE_INTELLIGENCE'],
  ];

  try {
    for (const [taskId, issueNumber, stream] of tasks) {
      insertReadyTask(db, { taskId, issueNumber, stream, baseSha });
    }

    const registry = createSlotRegistry();
    const commandsByTaskId = Object.fromEntries(tasks.map(([taskId]) => [taskId, { command: 'fixture' }]));

    const first = await runReadyBatch({
      db,
      registry,
      repoRoot,
      workspaceRoot,
      commandsByTaskId,
      timeoutMs,
      stallMs,
      execute: fixtureExecute,
    });

    const beforeBackfill = Object.fromEntries(tasks.slice(0, 3).map(([taskId]) => [taskId, getTask(db, taskId)]));
    const backfillBefore = getTask(db, 'v4-live-runner-backfill');

    const second = await runReadyBatch({
      db,
      registry,
      repoRoot,
      workspaceRoot,
      commandsByTaskId,
      timeoutMs,
      stallMs,
      execute: fixtureExecute,
    });

    const final = Object.fromEntries(tasks.map(([taskId]) => [taskId, getTask(db, taskId)]));
    const terminalStatesOk = final['v4-live-runner-core'].state === 'COMPLETE'
      && final['v4-live-runner-discovery'].state === 'BLOCKED'
      && final['v4-live-runner-ux'].state === 'COMPLETE'
      && final['v4-live-runner-backfill'].state === 'COMPLETE';
    const slotsReleased = Object.values(final).every((task) => task.slot_id === null);
    const cleanupOk = Object.values(final).every((task) => task.workspace_path && !fs.existsSync(task.workspace_path));
    const semanticProgressOk = Object.values(final).every((task) => task.semantic_progress_seq === 1);
    const backfillOk = backfillBefore.state === 'READY' && second.length === 1;
    const firstBatchOk = first.length === 3 && Object.values(beforeBackfill).every((task) => task.state !== 'READY');
    const noRunnerWorktreesRemain = !git(repoRoot, 'worktree', 'list', '--porcelain').includes(workspaceRoot);

    return {
      ok: terminalStatesOk && slotsReleased && cleanupOk && semanticProgressOk && backfillOk && firstBatchOk && noRunnerWorktreesRemain,
      baseSha,
      firstBatchCount: first.length,
      backfillBatchCount: second.length,
      states: Object.fromEntries(Object.entries(final).map(([taskId, task]) => [taskId, task.state])),
      slotsReleased,
      cleanupOk,
      semanticProgressOk,
      noRunnerWorktreesRemain,
    };
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repoRoot = path.resolve(process.argv[2] || process.cwd());
  const report = await runLiveRunnerAcceptance({ repoRoot });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}
