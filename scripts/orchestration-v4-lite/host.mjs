import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openV4StateStore, blockTasksWithFailedDependencies, getTask, getTaskContract, listRunnableTasks, recordTaskResult, releaseSlotForTerminalTask, transitionTask } from '../orchestration-v4/state-store/sqlite-store.mjs';
import { createSlotRegistry, chooseAvailableSlot } from '../orchestration-v4/slot-scheduler.mjs';
import { V4_STATES } from '../orchestration-v4/state-machine.mjs';
import { importReadyIssues } from '../orchestration-v4/production/github-intake.mjs';
import { syncPendingGithubTasks } from '../orchestration-v4/production/daemon.mjs';
import { signalGroup } from '../orchestration-v4/runner/bounded-process.mjs';
import { createTaskLauncher } from './task-launcher.mjs';

function ownedPaths(task) {
  return String(getTaskContract(task)?.fileOwnership || '').split(',').map((value) => value.trim()).filter(Boolean);
}

export function ownershipOverlaps(left, right) {
  return left.some((a) => right.some((b) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)));
}

export async function withDeadline(work, timeoutMs, label) {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error('V4_LITE_OPERATION_TIMEOUT_INVALID');
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(work),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`V4_LITE_${label}_TIMEOUT`)), timeoutMs); timer.unref?.(); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function recoverLiteStartupTasks({ listActive, failTask }) {
  const recovered = [];
  for (const task of listActive()) {
    failTask(task, 'V4_LITE_STALE_TASK_AT_STARTUP');
    recovered.push(task.task_id);
  }
  return recovered;
}

export function createLiteController({
  registry = createSlotRegistry(),
  intake,
  syncTerminal,
  listReady,
  listActive,
  launchTask,
  failLaunch,
  getCurrentTask,
  operationTimeoutMs = 15_000,
  now = () => Date.now(),
}) {
  if (![intake, syncTerminal, listReady, listActive, launchTask, failLaunch, getCurrentTask].every((fn) => typeof fn === 'function')) throw new Error('V4_LITE_ADAPTERS_REQUIRED');
  const active = new Map();
  let tickPromise = null;
  let lastError = null;
  let ticks = 0;

  const settle = (slotId, taskId, promise) => {
    Promise.resolve(promise).catch((error) => { lastError = String(error?.message || error); }).finally(() => {
      const current = active.get(slotId);
      if (current?.taskId === taskId) active.delete(slotId);
    });
  };

  const performTick = async () => {
    ticks += 1;
    const errors = [];
    try { await withDeadline(intake, operationTimeoutMs, 'INTAKE'); } catch (error) { errors.push(String(error?.message || error)); }
    try { await withDeadline(syncTerminal, operationTimeoutMs, 'SYNC'); } catch (error) { errors.push(String(error?.message || error)); }

    const databaseActive = listActive();
    const occupied = new Set([...active.keys(), ...databaseActive.map((task) => task.slot_id).filter(Boolean)]);
    const activeOwnership = databaseActive.map(ownedPaths);
    const ready = listReady();
    const readyStreams = new Set(ready.map((task) => task.stream));

    for (const task of ready) {
      if (active.size >= registry.size) break;
      const taskOwnership = ownedPaths(task);
      if (activeOwnership.some((paths) => ownershipOverlaps(paths, taskOwnership))) continue;
      const slot = chooseAvailableSlot(registry, { stream: task.stream, occupied, readyStreams });
      if (!slot || active.has(slot.workerId)) continue;
      const launchedAt = now();
      let promise;
      try {
        promise = launchTask({ task, slotId: slot.workerId });
      } catch (error) {
        lastError = String(error?.message || error);
        failLaunch(task, lastError);
        continue;
      }
      active.set(slot.workerId, { taskId: task.task_id, issueNumber: task.issue_number, launchedAt, promise });
      occupied.add(slot.workerId);
      activeOwnership.push(taskOwnership);
      settle(slot.workerId, task.task_id, promise);
    }
    lastError = errors.length ? errors.join(';') : lastError;
    return snapshot();
  };

  const tick = () => {
    if (tickPromise) return tickPromise;
    tickPromise = performTick().finally(() => { tickPromise = null; });
    return tickPromise;
  };

  const snapshot = () => ({
    ticks,
    lastError,
    activeCount: active.size,
    slots: [...registry.keys()].map((slotId) => {
      const owned = active.get(slotId);
      const task = owned ? getCurrentTask(owned.taskId) : null;
      return {
        slotId,
        state: owned ? 'RUNNING' : 'IDLE',
        taskId: owned?.taskId ?? null,
        issueNumber: owned?.issueNumber ?? null,
        childPid: task?.child_pid ?? null,
        processGroupId: task?.process_group_id ?? null,
        semanticProgressSeq: task?.semantic_progress_seq ?? null,
        semanticProgressAt: task?.semantic_progress_at ?? null,
      };
    }),
  });

  return { tick, snapshot, active };
}

function acquireLock(lockPath) {
  try { return fs.openSync(lockPath, 'wx'); }
  catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    let pid = null;
    try { pid = Number(fs.readFileSync(lockPath, 'utf8').trim()); } catch {}
    if (Number.isInteger(pid) && pid > 0) {
      try { process.kill(pid, 0); throw new Error('V4_LITE_ALREADY_RUNNING'); }
      catch (probeError) { if (probeError?.message === 'V4_LITE_ALREADY_RUNNING' || probeError?.code !== 'ESRCH') throw probeError; }
    }
    fs.rmSync(lockPath, { force: true });
    return fs.openSync(lockPath, 'wx');
  }
}

export function refreshCanonicalMainBounded(repoRoot, timeoutMs = 15_000, exec = execFileSync) {
  const options = { cwd: repoRoot, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 };
  exec('git', ['fetch', '--no-tags', 'origin', 'main:refs/remotes/origin/main'], options);
  return String(exec('git', ['rev-parse', 'refs/remotes/origin/main'], options)).trim();
}

export function listReadyIssuesBounded(repoFullName, gh = 'gh', timeoutMs = 15_000, exec = execFileSync) {
  const raw = exec(gh, ['issue','list','--repo',repoFullName,'--state','open','--label','orch:ready','--limit','100','--json','number,title,body,labels'], {
    encoding: 'utf8', timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024,
  });
  return JSON.parse(raw || '[]');
}

export async function runV4LiteHost({
  stateRoot,
  repoRoot,
  repoFullName,
  workspaceRoot,
  intervalMs = 20_000,
  operationTimeoutMs = 15_000,
  shutdownDrainMs = 10_000,
  gh = 'gh',
  maxTicks = Infinity,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  for (const value of [stateRoot, repoRoot, workspaceRoot]) if (!path.isAbsolute(value)) throw new Error('V4_LITE_ABSOLUTE_PATHS_REQUIRED');
  fs.mkdirSync(stateRoot, { recursive: true });
  const lockPath = path.join(stateRoot, 'host-lite.lock');
  const lockFd = acquireLock(lockPath);
  fs.writeFileSync(lockFd, `${process.pid}\n`);
  const db = openV4StateStore(path.join(stateRoot, 'state.sqlite'));
  const failTask = (task, reason) => {
    recordTaskResult(db, { taskId: task.task_id, result: { error: reason, workspacePreserved: Boolean(task.workspace_path) } });
    const terminalState = task.state === V4_STATES.READY ? V4_STATES.BLOCKED : V4_STATES.FAILED;
    transitionTask(db, { taskId: task.task_id, expectedState: task.state, toState: terminalState, patch: { terminalReason: reason } });
    releaseSlotForTerminalTask(db, task.task_id);
  };
  const recovered = recoverLiteStartupTasks({
    listActive: () => db.prepare("SELECT * FROM tasks WHERE state IN ('CLAIMED','RUNNING','VALIDATING','PR_OPENED')").all(),
    failTask,
  });
  let canonicalMainSha = null;
  const launcher = createTaskLauncher({ db, repoRoot, repoFullName, workspaceRoot, gh });
  const controller = createLiteController({
    operationTimeoutMs,
    intake: () => {
      canonicalMainSha = refreshCanonicalMainBounded(repoRoot, operationTimeoutMs);
      return importReadyIssues({ db, issues: listReadyIssuesBounded(repoFullName, gh, operationTimeoutMs), baseSha: canonicalMainSha });
    },
    syncTerminal: () => syncPendingGithubTasks({ db, repoFullName, gh, limit: 1 }),
    listReady: () => { blockTasksWithFailedDependencies(db); return listRunnableTasks(db); },
    listActive: () => db.prepare("SELECT * FROM tasks WHERE state IN ('CLAIMED','RUNNING','VALIDATING','PR_OPENED')").all(),
    getCurrentTask: (taskId) => getTask(db, taskId),
    launchTask: ({ task, slotId }) => launcher({ task, slotId, canonicalMainSha: canonicalMainSha || task.base_sha }),
    failLaunch: failTask,
  });
  let stopped = false;
  const stop = () => { stopped = true; };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  let exitCode = 0;
  try {
    while (!stopped && controller.snapshot().ticks < maxTicks) {
      await controller.tick();
      const heartbeat = { pid: process.pid, mode: 'V4_LITE', state: stopped ? 'STOPPING' : 'RUNNING', recoveredStaleTasks: recovered.length, generatedAt: new Date().toISOString(), ...controller.snapshot() };
      fs.writeFileSync(path.join(stateRoot, 'heartbeat-lite.json'), `${JSON.stringify(heartbeat)}\n`);
      if (!stopped && controller.snapshot().ticks < maxTicks) await sleep(intervalMs);
    }
    for (const entry of controller.active.values()) {
      const task = getTask(db, entry.taskId);
      if (Number.isInteger(task?.process_group_id) && task.process_group_id > 0) signalGroup(task.process_group_id, 'SIGTERM');
    }
    if (controller.active.size) {
      const drained = await Promise.race([
        Promise.allSettled([...controller.active.values()].map((entry) => entry.promise)).then(() => true),
        sleep(shutdownDrainMs).then(() => false),
      ]);
      if (!drained) exitCode = 75;
    }
    return { ok: exitCode === 0, exitCode, recovered, ...controller.snapshot() };
  } finally {
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
    db.close();
    try { fs.closeSync(lockFd); } catch {}
    try { fs.unlinkSync(lockPath); } catch {}
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const home = process.env.HOME || '.';
  const result = await runV4LiteHost({
    stateRoot: path.resolve(process.env.JEEVES_V4_STATE_ROOT || path.join(home, '.openclaw/state/orchestration-v4')),
    repoRoot: path.resolve(process.env.JEEVES_V4_REPO_ROOT || path.join(home, '.openclaw/runtime-v4/business-dashboard')),
    workspaceRoot: path.resolve(process.env.JEEVES_V4_WORKSPACE_ROOT || path.join(home, '.openclaw/workspaces-v4')),
    repoFullName: 'keeganhall33/business-dashboard',
  });
  if (!result.ok) process.exitCode = result.exitCode;
}
