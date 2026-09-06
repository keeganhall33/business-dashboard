import fs from 'node:fs';
import path from 'node:path';
import { openV4StateStore, recordTaskResult, releaseSlotForTerminalTask, transitionTask } from '../state-store/sqlite-store.mjs';
import { V4_STATES } from '../state-machine.mjs';
import { runProductionPoll } from './daemon.mjs';

function pidIsLive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    return true;
  }
}

function lockPidIsLive(lockPath) {
  let raw;
  try { raw = fs.readFileSync(lockPath, 'utf8').trim(); }
  catch (error) {
    if (error?.code === 'ENOENT') return false;
    return true;
  }
  const pid = Number(raw);
  return pidIsLive(pid);
}

function acquireHostLock(lockPath) {
  try {
    return fs.openSync(lockPath, 'wx');
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    if (lockPidIsLive(lockPath)) throw new Error('V4_HOST_ALREADY_RUNNING');
    try { fs.unlinkSync(lockPath); }
    catch (unlinkError) { if (unlinkError?.code !== 'ENOENT') throw unlinkError; }
    try { return fs.openSync(lockPath, 'wx'); }
    catch (retryError) {
      if (retryError?.code === 'EEXIST') throw new Error('V4_HOST_ALREADY_RUNNING');
      throw retryError;
    }
  }
}

export function recoverStaleActiveTasks(db, { now = () => new Date(), isPidLive = pidIsLive } = {}) {
  const active = db.prepare("SELECT * FROM tasks WHERE state IN ('CLAIMED','RUNNING','VALIDATING','PR_OPENED') ORDER BY updated_at,task_id").all();
  const recovered = [];
  for (const task of active) {
    const pid = Number(task.child_pid);
    if (Number.isInteger(pid) && pid > 0 && isPidLive(pid)) continue;
    const reason = 'V4_STALE_PROCESS_AFTER_HOST_RESTART';
    recordTaskResult(db, {
      taskId: task.task_id,
      result: {
        error: reason,
        staleState: task.state,
        staleChildPid: Number.isInteger(pid) && pid > 0 ? pid : null,
        workspacePreserved: Boolean(task.workspace_path),
      },
      now: now(),
    });
    transitionTask(db, {
      taskId: task.task_id,
      expectedState: task.state,
      toState: V4_STATES.FAILED,
      patch: { terminalReason: reason },
      now: now(),
    });
    releaseSlotForTerminalTask(db, task.task_id);
    recovered.push(task.task_id);
  }
  return Object.freeze(recovered);
}

export async function runProductionHost({ stateRoot, intervalMs = 20_000, poll = runProductionPoll, pollArgs = {}, maxCycles = Infinity, shutdownDrainMs = 5_000, emptyPollTimeoutMs = 2 * 60_000, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  if (!path.isAbsolute(stateRoot)) throw new Error('V4_HOST_STATE_ROOT_REQUIRED');
  if (!Number.isInteger(shutdownDrainMs) || shutdownDrainMs < 0) throw new Error('V4_HOST_SHUTDOWN_DRAIN_INVALID');
  if (!Number.isInteger(emptyPollTimeoutMs) || emptyPollTimeoutMs <= 0) throw new Error('V4_HOST_EMPTY_POLL_TIMEOUT_INVALID');
  fs.mkdirSync(stateRoot, { recursive: true });
  const lockPath = path.join(stateRoot, 'host.lock');
  const lockFd = acquireHostLock(lockPath);
  fs.writeFileSync(lockFd, `${process.pid}\n`);
  const db = openV4StateStore(path.join(stateRoot, 'state.sqlite'));
  const recoveredStaleTasks = recoverStaleActiveTasks(db);
  let stopped = false;
  const stop = () => { stopped = true; };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  let cycles = 0;
  let skippedPolls = 0;
  let lastPollError = null;
  let pollStartedAt = null;
  let stalledReason = null;
  const inFlightPolls = new Set();

  const launchPoll = () => {
    let tracked;
    pollStartedAt = now();
    tracked = Promise.resolve()
      .then(() => poll({ db, ...pollArgs }))
      .then(
        () => ({ ok: true }),
        (error) => {
          lastPollError = String(error?.message || error);
          return { ok: false, error: lastPollError };
        },
      )
      .finally(() => {
        inFlightPolls.delete(tracked);
        if (inFlightPolls.size === 0) pollStartedAt = null;
      });
    inFlightPolls.add(tracked);
    return tracked;
  };

  try {
    while (!stopped && cycles < maxCycles) {
      cycles += 1;
      if (inFlightPolls.size === 0) launchPoll();
      else {
        skippedPolls += 1;
        const activeTasks = db.prepare("SELECT COUNT(*) AS count FROM tasks WHERE state IN ('CLAIMED','RUNNING','VALIDATING','PR_OPENED')").get().count;
        const elapsedMs = pollStartedAt === null ? 0 : Math.max(0, now() - pollStartedAt);
        if (activeTasks === 0 && elapsedMs >= emptyPollTimeoutMs) {
          stalledReason = 'V4_STUCK_EMPTY_POLL';
          lastPollError = stalledReason;
          stopped = true;
        }
      }
      const generatedAtMs = now();
      fs.writeFileSync(path.join(stateRoot, 'heartbeat.json'), `${JSON.stringify({
        pid: process.pid,
        cycles,
        inFlightPolls: inFlightPolls.size,
        skippedPolls,
        recoveredStaleTasks: recoveredStaleTasks.length,
        lastPollError,
        pollState: stalledReason ? 'STALLED' : (inFlightPolls.size ? 'RUNNING' : 'IDLE'),
        stalledReason,
        pollStartedAt: pollStartedAt === null ? null : new Date(pollStartedAt).toISOString(),
        currentPollElapsedMs: pollStartedAt === null ? 0 : Math.max(0, generatedAtMs - pollStartedAt),
        generatedAt: new Date(generatedAtMs).toISOString(),
      })}\n`);
      if (!stopped && cycles < maxCycles) await sleep(intervalMs);
    }
    let drained = true;
    if (inFlightPolls.size) {
      const drain = Promise.allSettled([...inFlightPolls]).then(() => true);
      if (shutdownDrainMs === 0) drained = false;
      else drained = await Promise.race([drain, sleep(shutdownDrainMs).then(() => false)]);
    }
    return { ok: !stalledReason, cycles, stopped, skippedPolls, recoveredStaleTasks, lastPollError, stalledReason, drained };
  } finally {
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
    db.close();
    try { fs.closeSync(lockFd); } catch {}
    try { fs.unlinkSync(lockPath); } catch {}
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const stateRoot = path.resolve(process.env.JEEVES_V4_STATE_ROOT || path.join(process.env.HOME || '.', '.openclaw/state/orchestration-v4'));
  const repoRoot = path.resolve(process.env.JEEVES_V4_REPO_ROOT || path.join(process.env.HOME || '.', '.openclaw/runtime-v4/business-dashboard'));
  const workspaceRoot = path.resolve(process.env.JEEVES_V4_WORKSPACE_ROOT || path.join(process.env.HOME || '.', '.openclaw/workspaces-v4'));
  const configPath = path.resolve(process.env.JEEVES_V4_CONFIG || process.env.OPENCLAW_CONFIG_PATH || path.join(process.env.HOME || '.', '.openclaw/openclaw.json'));
  const result = await runProductionHost({ stateRoot, pollArgs: { repoRoot, repoFullName: 'keeganhall33/business-dashboard', workspaceRoot, configPath } });
  if (!result.ok) process.exitCode = 75;
}
