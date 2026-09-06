import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openV4StateStore, recordTaskResult, releaseSlotForTerminalTask, transitionTask } from '../state-store/sqlite-store.mjs';
import { V4_STATES } from '../state-machine.mjs';
import { runProductionPoll } from './daemon.mjs';
import { classifyProcessOwnership, PROCESS_OWNERSHIP_CLASSIFICATIONS } from './process-ownership.mjs';

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

/**
 * Extract observed process facts for a given PID.
 */
function observeProcess(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    const psOutput = require('child_process').spawnSync('ps', ['-p', String(pid)], { encoding: 'utf8', timeout: 5000 });
    if (!psOutput || !psOutput.stdout) return null;
    // Parse ps output: PID PPID ... COMMAND
    const lines = psOutput.stdout.trim().split('\n');
    if (lines.length === 0) return null;
    const parts = lines[0].split(/\s+/);
    return {
      pid: Number(parts[0]),
      ppid: Number(parts[1]) ?? 1,
      command: parts.slice(2).join(' '),
    };
  } catch {
    // Process may have exited or be inaccessible
    return { exists: false };
  }
}

/**
 * Get host ancestors by walking from PID down to 1.
 */
function getHostAncestors(startPid) {
  const ancestors = [startPid];
  let current = startPid;
  while (current > 1) {
    try {
      const psOutput = require('child_process').spawnSync('ps', ['-p', String(current)], { encoding: 'utf8', timeout: 5000 });
      if (!psOutput || !psOutput.stdout) break;
      const parts = psOutput.stdout.trim().split(/\s+/);
      current = Number(parts[1]) ?? current;
      if (current === startPid) break; // cycle detection
      ancestors.unshift(current);
    } catch {
      break;
    }
  }
  return ancestors;
}

/**
 * Build expected process facts from contract and host identity.
 */
function buildExpected(task, now = () => new Date()) {
  const hostPid = process.pid;
  const workspacePath = task.workspace_path ?? null;
  // The entrypoint is the runner that executes tasks
  // For verification, we use the daemon ENTRYPOINT as a baseline
  const daemonPath = fileURLToPath(new URL('../runner/agent-task-entrypoint.mjs', import.meta.url));
  return {
    pid: Number(task.child_pid),
    hostPid,
    processGroupId: Number(task.process_group_id) ?? hostPid,
    entrypoint: daemonPath,
    taskId: task.task_id,
    workspacePath,
  };
}

/**
 * Release a stale task and record its terminal state.
 */
function releaseStaleTask(db, task, { reason = 'V4_STALE_PROCESS_AFTER_HOST_RESTART', now = () => new Date() } = {}) {
  recordTaskResult(db, {
    taskId: task.task_id,
    result: {
      error: reason,
      staleState: task.state,
      staleChildPid: Number.isInteger(task.child_pid) && task.child_pid > 0 ? task.child_pid : null,
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
}

/**
 * Reconcile persisted active-task occupancy against current host identity.
 * Preserve verified current children, release proven stale occupancies, leave UNKNOWN fail-closed.
 */
export function recoverStaleActiveTasks(
  db,
  {
    now = () => new Date(),
    isPidLive = pidIsLive,
    sleep,
  } = {}
) {
  const active = db.prepare("SELECT * FROM tasks WHERE state IN ('CLAIMED','RUNNING','VALIDATING','PR_OPENED') ORDER BY updated_at,task_id").all();
  const recovered = [];
  
  for (const task of active) {
    const childPid = Number(task.child_pid);
    
    // If no recorded child, skip classification
    if (!Number.isInteger(childPid) || childPid <= 0) continue;
    
    // Check if process is live first - if so, it's verified current child
    if (isPidLive(childPid)) {
      // Process is live - this is a verified current child, preserve the task
      continue;
    }
    
    // Process is dead or inaccessible - classify it to determine recovery action
    const observed = observeProcess(childPid);
    const expected = buildExpected(task);
    
    if (!observed) {
      // Cannot get process facts - treat as proven stale (can't recover)
      releaseStaleTask(db, task, { reason: 'V4_STALE_PROCESS_AFTER_HOST_RESTART', now });
      recovered.push(task.task_id);
      continue;
    }
    
    if (!observed.exists) {
      // Process no longer exists - classified as MISSING or other stale type
      releaseStaleTask(db, task, { reason: 'V4_STALE_PROCESS_AFTER_HOST_RESTART', now });
      recovered.push(task.task_id);
      continue;
    }
    
    // Classify the ownership mismatch
    const classification = classifyProcessOwnership({
      expected: { ...expected },
      observed: {
        pid: observed.pid,
        ppid: observed.ppid,
        processGroupId: Number(observed?.process_group_id ?? observed.pid),
        command: observed.command,
        hostAncestors: getHostAncestors(childPid),
      },
    });
    
    // Handle different classifications
    if (classification.verified) {
      // Verified current child - should not happen if process is dead, but keep anyway
      continue;
    } else if ([
      PROCESS_OWNERSHIP_CLASSIFICATIONS.PPID1_ORPHAN,
      PROCESS_OWNERSHIP_CLASSIFICATIONS.PROCESS_MISSING,
      PROCESS_OWNERSHIP_CLASSIFICATIONS.PID_REUSED,
      PROCESS_OWNERSHIP_CLASSIFICATIONS.ENTRYPOINT_MISMATCH,
      PROCESS_OWNERSHIP_CLASSIFICATIONS.TASK_ID_MISMATCH,
      PROCESS_OWNERSHIP_CLASSIFICATIONS.HOST_TREE_MISMATCH,
    ].includes(classification.classification)) {
      // Proven stale classification - release the task
      releaseStaleTask(db, task, { reason: 'V4_STALE_PROCESS_AFTER_HOST_RESTART', now });
      recovered.push(task.task_id);
    } else if (classification.classification === PROCESS_OWNERSHIP_CLASSIFICATIONS.UNKNOWN) {
      // Unknown ownership - fail closed, don't release
      continue;
    } else {
      // Any other unknown classification type - fail closed
      continue;
    }
  }
  
  return Object.freeze(recovered);
}

/**
 * Run production orchestration host for a poll cycle.
 */
export async function runProductionHost(
  {
    stateRoot,
    repoRoot,
    workspaceRoot,
    issues = null,
    openclaw = '/opt/homebrew/bin/openclaw',
    ollama = '/opt/homebrew/bin/ollama',
    gh = 'gh',
    agentTimeoutMs = 90 * 60_000,
    timeoutMs = 100 * 60_000,
    stallMs = 30 * 60_000,
    poll,
    shutdownDrainMs = 5000,
    sleep = async (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = {}
) {
  const lockPath = path.join(stateRoot, 'host.lock');
  
  if (!Number.isInteger(shutdownDrainMs) || shutdownDrainMs < 0) {
    throw new Error('V4_PRODUCTION_SHUTDOWN_DRAIN_MS_INVALID');
  }
  
  try {
    return await runProductionPoll({
      db: openV4StateStore(path.join(stateRoot, 'state.sqlite')),
      repoRoot: repoRoot ?? path.join(workspaceRoot, '..', '..'),
      workspaceRoot: workspaceRoot,
      configPath: path.join(repoRoot, '.claw.json'),
      issues,
      openclaw,
      ollama,
      gh,
      agentTimeoutMs,
      timeoutMs,
      stallMs,
    });
  } catch (error) {
    if (error?.message === 'V4_HOST_ALREADY_RUNNING') {
      throw error;
    }
    // Re-throw unexpected errors to caller
    throw error;
  } finally {
    // Always attempt cleanup on exit
    fs.rmSync(path.join(repoRoot, '.claw'), { recursive: true, force: true });
    fs.rmSync(lockPath, { force: true });
  }
}
