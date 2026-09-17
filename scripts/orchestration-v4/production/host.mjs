import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { listTaskDependencies, openV4StateStore, recordTaskResult, releaseSlotForTerminalTask, transitionTask } from '../state-store/sqlite-store.mjs';
import { V4_STATES } from '../state-machine.mjs';
import { processIdentityLiveness, runProductionPoll } from './daemon.mjs';
import { buildDeliveryHealth } from '../delivery-policy.mjs';
import { latestContinuityState } from '../delivery-report.mjs';
import { publishContinuityStatusToGitHub } from './github-sync.mjs';
import { advanceClaimStarvationWatchdog, buildLivenessTelemetry, verifyTaskProcessIdentity } from './poll-watchdog.mjs';

const ACTIVE_STATES = new Set(['CLAIMED', 'RUNNING', 'VALIDATING', 'PR_OPENED']);

function lockPidIsLive(lockPath) {
  let raw;
  try { raw = fs.readFileSync(lockPath, 'utf8').trim(); }
  catch (error) {
    if (error?.code === 'ENOENT') return false;
    return true;
  }
  const pid = Number(raw);
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== 'ESRCH';
  }
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

export function readRuntimeCommit(repoRoot, exec = execFileSync) {
  if (!path.isAbsolute(String(repoRoot ?? ''))) return null;
  try {
    const sha = String(exec('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      timeout: 5_000,
      maxBuffer: 64 * 1024,
    })).trim();
    return /^[a-f0-9]{40}$/.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

export function recoverStaleActiveTasks(db, { now = () => new Date(), verifyProcessIdentity = verifyTaskProcessIdentity } = {}) {
  const active = db.prepare("SELECT * FROM tasks WHERE state IN ('CLAIMED','RUNNING','VALIDATING','PR_OPENED') ORDER BY updated_at,task_id").all();
  const recovered = [];
  for (const task of active) {
    const pid = Number(task.child_pid);
    const identity = verifyProcessIdentity(task);
    if (identity.trusted) continue;
    const reason = identity.reason === 'PROCESS_NOT_FOUND'
      ? 'V4_STALE_PROCESS_AFTER_HOST_RESTART'
      : `V4_UNTRUSTED_PROCESS_AFTER_HOST_RESTART:${identity.reason}`;
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

export async function runProductionHost({ stateRoot, intervalMs = 20_000, poll = runProductionPoll, pollArgs = {}, maxCycles = Infinity, shutdownDrainMs = 5_000, emptyPollTimeoutMs = 2 * 60_000, maxConcurrentPolls = 6, publishContinuity = publishContinuityStatusToGitHub, verifyProcessIdentity = verifyTaskProcessIdentity, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  if (!path.isAbsolute(stateRoot)) throw new Error('V4_HOST_STATE_ROOT_REQUIRED');
  if (!Number.isInteger(shutdownDrainMs) || shutdownDrainMs < 0) throw new Error('V4_HOST_SHUTDOWN_DRAIN_INVALID');
  if (!Number.isInteger(emptyPollTimeoutMs) || emptyPollTimeoutMs <= 0) throw new Error('V4_HOST_EMPTY_POLL_TIMEOUT_INVALID');
  if (!Number.isInteger(maxConcurrentPolls) || maxConcurrentPolls <= 0 || maxConcurrentPolls > 6) throw new Error('V4_HOST_MAX_CONCURRENT_POLLS_INVALID');
  fs.mkdirSync(stateRoot, { recursive: true });
  const lockPath = path.join(stateRoot, 'host.lock');
  const lockFd = acquireHostLock(lockPath);
  fs.writeFileSync(lockFd, `${process.pid}\n`);
  const db = openV4StateStore(path.join(stateRoot, 'state.sqlite'));
  const recoveredStaleTasks = recoverStaleActiveTasks(db, { verifyProcessIdentity });
  let stopped = false;
  const stop = () => { stopped = true; };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  let cycles = 0;
  let skippedPolls = 0;
  let lastPollError = null;
  let lastPollResult = null;
  let stalledReason = null;
  let restartRequested = false;
  let continuityPublishError = null;
  let continuityPublishResult = null;
  const continuityPublisherState = {};
  const terminalTransitions = [];
  const terminalTaskIds = new Set();
  const inFlightPolls = new Set();
  const pollStartedAtByPromise = new Map();
  let claimStarvation = Object.freeze({ consecutiveCycles: 0, fault: false, reason: null });
  let claimRecoveryTriggered = false;

  const oldestPollStartedAt = () => {
    if (pollStartedAtByPromise.size === 0) return null;
    return Math.min(...pollStartedAtByPromise.values());
  };

  const queueTerminalTransition = (transition) => {
    if (!transition?.taskId || !transition?.slotId || terminalTaskIds.has(transition.taskId)) return false;
    terminalTaskIds.add(transition.taskId);
    terminalTransitions.push(Object.freeze({ ...transition }));
    if (!stopped && !restartRequested && inFlightPolls.size < maxConcurrentPolls) launchPoll();
    return true;
  };

  const launchPoll = () => {
    let tracked;
    const startedAt = now();
    const terminalTransition = terminalTransitions.shift() || null;
    tracked = Promise.resolve()
      .then(() => poll({
        db,
        ...pollArgs,
        terminalTransition,
        onTaskTerminal: (transition) => {
          const queued = queueTerminalTransition(transition);
          if (queued && typeof pollArgs.onTaskTerminal === 'function') pollArgs.onTaskTerminal(transition);
        },
      }))
      .then(
        (value) => {
          const candidateAt = Date.parse(value?.continuity?.generatedAt || '') || 0;
          const currentAt = Date.parse(lastPollResult?.continuity?.generatedAt || '') || 0;
          if (!lastPollResult || candidateAt >= currentAt) lastPollResult = value || null;
          if (value?.continuity?.executedControlActions?.some((action) => action?.type === 'REFRESH_CLEAN_IDLE_RUNTIME')) {
            restartRequested = true;
          }
          for (const transition of value?.terminalTransitions || []) queueTerminalTransition(transition);
          return { ok: true, value };
        },
        (error) => {
          lastPollError = String(error?.message || error);
          return { ok: false, error: lastPollError };
        },
      )
      .finally(() => {
        inFlightPolls.delete(tracked);
        pollStartedAtByPromise.delete(tracked);
      });
    inFlightPolls.add(tracked);
    pollStartedAtByPromise.set(tracked, startedAt);
    return tracked;
  };

  try {
    while (!stopped && cycles < maxCycles) {
      cycles += 1;
      if (restartRequested && inFlightPolls.size === 0) {
        stopped = true;
      } else if (!restartRequested && inFlightPolls.size < maxConcurrentPolls) {
        launchPoll();
      } else if (!restartRequested) {
        skippedPolls += 1;
        const activeTasks = db.prepare("SELECT COUNT(*) AS count FROM tasks WHERE state IN ('CLAIMED','RUNNING','VALIDATING','PR_OPENED')").get().count;
        const pollStartedAt = oldestPollStartedAt();
        const elapsedMs = pollStartedAt === null ? 0 : Math.max(0, now() - pollStartedAt);
        if (activeTasks === 0 && elapsedMs >= emptyPollTimeoutMs) {
          stalledReason = 'V4_STUCK_EMPTY_POLL';
          lastPollError = stalledReason;
          stopped = true;
        }
      }
      const generatedAtMs = now();
      const pollStartedAt = oldestPollStartedAt();
      const heartbeatTasks = db.prepare('SELECT * FROM tasks ORDER BY created_at,task_id').all().map((task) => {
        const identity = ACTIVE_STATES.has(task.state) ? verifyProcessIdentity(task) : null;
        return {
          ...task,
          processIdentityTrusted: processIdentityLiveness(identity),
        };
      });
      const liveness = buildLivenessTelemetry({
        tasks: heartbeatTasks,
        continuity: lastPollResult?.continuity || latestContinuityState(db),
        daemonPhase: inFlightPolls.size ? 'POLLING' : 'IDLE',
        stalledReason,
      });
      claimStarvation = advanceClaimStarvationWatchdog(claimStarvation, liveness);
      if (!claimStarvation.fault) claimRecoveryTriggered = false;
      if (claimStarvation.fault && !claimRecoveryTriggered && !restartRequested && inFlightPolls.size < maxConcurrentPolls) {
        claimRecoveryTriggered = true;
        launchPoll();
      }
      const heartbeat = {
        pid: process.pid,
        cycles,
        inFlightPolls: inFlightPolls.size,
        skippedPolls,
        recoveredStaleTasks: recoveredStaleTasks.length,
        lastPollError,
        pollState: stalledReason || claimStarvation.fault ? 'STALLED' : restartRequested ? 'RESTARTING' : (inFlightPolls.size ? 'RUNNING' : 'IDLE'),
        stalledReason: stalledReason || claimStarvation.reason,
        ready: liveness.ready,
        claimableReady: liveness.claimableReady,
        routeIneligibleReady: liveness.routeIneligibleReady,
        freeSlots: liveness.freeSlots,
        activeVerifiedWorkers: liveness.activeVerifiedWorkers,
        lastSuccessfulClaimAt: liveness.lastSuccessfulClaimAt,
        lastSemanticProgressAt: liveness.lastSemanticProgressAt,
        daemonPhase: liveness.daemonPhase,
        restartRequested,
        pollStartedAt: pollStartedAt === null ? null : new Date(pollStartedAt).toISOString(),
        currentPollElapsedMs: pollStartedAt === null ? 0 : Math.max(0, generatedAtMs - pollStartedAt),
        delivery: buildDeliveryHealth(
          db.prepare('SELECT * FROM tasks ORDER BY created_at,task_id').all(),
          new Date().toISOString(),
          db.prepare('SELECT * FROM correction_attempts ORDER BY task_id,attempt').all(),
          listTaskDependencies(db),
        ),
        continuity: lastPollResult?.continuity || latestContinuityState(db),
        pendingTerminalReconciliations: terminalTransitions.length,
        runtimeCommit: readRuntimeCommit(pollArgs.repoRoot),
        generatedAt: new Date(generatedAtMs).toISOString(),
      };
      try {
        continuityPublishResult = await publishContinuity({
          repoFullName: pollArgs.repoFullName,
          heartbeat,
          tasks: db.prepare("SELECT issue_number,state,slot_id,semantic_progress_at,updated_at FROM tasks WHERE state IN ('CLAIMED','RUNNING','VALIDATING','PR_OPENED') ORDER BY issue_number").all(),
          publisherState: continuityPublisherState,
          now: new Date(generatedAtMs),
        });
        continuityPublishError = null;
      } catch (error) {
        continuityPublishError = String(error?.message || error);
      }
      heartbeat.githubContinuitySync = {
        lastError: continuityPublishError,
        lastResult: continuityPublishResult,
      };
      fs.writeFileSync(path.join(stateRoot, 'heartbeat.json'), `${JSON.stringify(heartbeat)}\n`);
      if (!stopped && cycles < maxCycles) await sleep(intervalMs);
    }
    let drained = true;
    if (inFlightPolls.size) {
      const drain = Promise.allSettled([...inFlightPolls]).then(() => true);
      if (shutdownDrainMs === 0) drained = false;
      else drained = await Promise.race([drain, sleep(shutdownDrainMs).then(() => false)]);
    }
    return { ok: !stalledReason, cycles, stopped, restartRequested, skippedPolls, recoveredStaleTasks, lastPollError, stalledReason, drained, lastPollResult };
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
