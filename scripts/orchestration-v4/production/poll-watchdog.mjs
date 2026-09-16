import { execFileSync } from 'node:child_process';
import { classifyProcessOwnership } from './process-ownership.mjs';

const ACTIVE_STATES = new Set(['CLAIMED', 'RUNNING', 'VALIDATING', 'PR_OPENED']);

export function inspectProcessIdentity(pid, exec = execFileSync) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    const raw = String(exec('ps', ['-o', 'ppid=,pgid=,command=', '-p', String(pid)], {
      encoding: 'utf8', timeout: 5_000, maxBuffer: 64 * 1024,
    })).trim();
    const match = raw.match(/^(\d+)\s+(\d+)\s+([\s\S]+)$/);
    if (!match) return null;
    const hostAncestors = [];
    let ancestor = Number(match[1]);
    for (let depth = 0; depth < 32 && ancestor > 1; depth += 1) {
      hostAncestors.push(ancestor);
      const parent = Number(String(exec('ps', ['-o', 'ppid=', '-p', String(ancestor)], {
        encoding: 'utf8', timeout: 5_000, maxBuffer: 64 * 1024,
      })).trim());
      if (!Number.isInteger(parent) || parent <= 0 || parent === ancestor) break;
      ancestor = parent;
    }
    return Object.freeze({ exists: true, pid, ppid: Number(match[1]), processGroupId: Number(match[2]), hostAncestors, command: match[3] });
  } catch {
    return Object.freeze({ exists: false });
  }
}

function taskEntrypoint(task) {
  if (task?.stream === 'INTEGRATION_RELEASE') return 'integration-resolution-entrypoint.mjs';
  try {
    if (JSON.parse(task?.contract_json || '{}').deterministicVerifier) return 'deterministic-verification-executor.mjs';
  } catch {}
  return 'agent-task-entrypoint.mjs';
}

export function verifyTaskProcessIdentity(task, { inspect = inspectProcessIdentity, hostPid = process.pid } = {}) {
  const pid = Number(task?.child_pid ?? task?.childPid);
  const observed = inspect(pid);
  const ownership = classifyProcessOwnership({
    expected: {
      pid,
      hostPid,
      processGroupId: Number(task?.process_group_id ?? task?.processGroupId),
      entrypoint: taskEntrypoint(task),
      taskId: String(task?.task_id ?? task?.taskId ?? ''),
    },
    observed,
  });
  return Object.freeze({ trusted: ownership.verified, reason: ownership.verified ? null : ownership.reason, ownership, identity: observed });
}

export function progressAt(task) {
  if (!task) return null;
  return task.semantic_progress_at || task.semanticProgressAt || task.updated_at || task.updatedAt || null;
}

export function buildLivenessTelemetry({ tasks = [], slots = [], continuity = null, daemonPhase = 'IDLE', stalledReason = null } = {}) {
  const ready = tasks.filter((task) => task.state === 'READY');
  const active = tasks.filter((task) => ACTIVE_STATES.has(task.state));
  const claimableReady = Number.isInteger(continuity?.eligibleReadyCount)
    ? continuity.eligibleReadyCount
    : ready.length;
  const occupied = new Set(active.map((task) => task.slot_id ?? task.slotId).filter(Boolean));
  const freeSlots = slots.length
    ? slots.filter((slot) => !occupied.has(slot.slotId ?? slot.workerId)).length
    : Math.max(0, Number(continuity?.utilization?.allowedSlots || 0) - active.length);
  return Object.freeze({
    ready: ready.length,
    claimableReady,
    routeIneligibleReady: Math.max(0, ready.length - claimableReady),
    freeSlots,
    activeVerifiedWorkers: active.filter((task) => task.processIdentityTrusted !== false).length,
    lastSuccessfulClaimAt: continuity?.lastSuccessfulClaimAt || null,
    lastSemanticProgressAt: active.map(progressAt).filter(Boolean).sort().at(-1) || continuity?.lastSemanticProgressAt || null,
    daemonPhase,
    stalledReason,
  });
}

export function advanceClaimStarvationWatchdog(previous, telemetry, { threshold = 2 } = {}) {
  const starved = telemetry.claimableReady > 0 && telemetry.freeSlots > 0;
  const consecutiveCycles = starved ? (previous?.consecutiveCycles || 0) + 1 : 0;
  const fault = consecutiveCycles >= threshold;
  return Object.freeze({
    consecutiveCycles,
    fault,
    reason: fault ? 'V4_CLAIMABLE_READY_STARVATION' : null,
  });
}
