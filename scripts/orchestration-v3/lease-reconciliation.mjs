import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { ORCHESTRATION_V3 } from "./config.mjs";

export const LEASE_TTL_CONTRACT = Object.freeze({
  leaseTtlMs: 4 * 60 * 60 * 1000,
  heartbeatFreshMs: 2 * 60 * 1000,
  workerHeartbeatIntervalMs: 30 * 1000,
  progressFreshMs: 3 * 60 * 1000
});

export function leasePath(workerId) {
  return path.join(ORCHESTRATION_V3.runtime.stateRoot, "leases", `${workerId}.json`);
}

export function readLease(workerId, filePath = leasePath(workerId)) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

export function writeLease(workerId, lease, filePath = leasePath(workerId)) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const startedAt = lease.startedAt ?? new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify({
    sessionId: lease.sessionId ?? randomUUID(),
    workerId,
    issueNumber: Number(lease.issueNumber),
    pid: Number(lease.pid),
    startedAt,
    heartbeatAt: lease.heartbeatAt ?? startedAt,
    lastProgressAt: lease.lastProgressAt ?? startedAt,
    progressSequence: Number.isInteger(Number(lease.progressSequence)) ? Number(lease.progressSequence) : 0,
    progressPhase: lease.progressPhase ?? "LEASE_ACQUIRED",
    lastObservedToolEventAt: lease.lastObservedToolEventAt ?? null,
    childPid: Number.isInteger(Number(lease.childPid)) && Number(lease.childPid) > 0 ? Number(lease.childPid) : null,
    childProcessGroupId: Number.isInteger(Number(lease.childProcessGroupId)) && Number(lease.childProcessGroupId) > 0 ? Number(lease.childProcessGroupId) : null,
    worktree: lease.worktree ?? ORCHESTRATION_V3.workers[workerId]?.worktree ?? null,
    logPath: lease.logPath ?? null
  }, null, 2) + "\n");
}

export function touchLeaseHeartbeat(workerId, { pid = process.pid, nowIso = new Date().toISOString() } = {}) {
  const lease = readLease(workerId);
  if (!lease || Number(lease.pid) !== Number(pid)) return false;
  writeLease(workerId, { ...lease, heartbeatAt: nowIso });
  return true;
}

export function touchLeaseProgress(workerId, {
  pid = process.pid,
  phase = "PROGRESS",
  childPid = undefined,
  childProcessGroupId = undefined,
  observedToolEvent = false,
  semanticProgress = true,
  nowIso = new Date().toISOString()
} = {}) {
  const lease = readLease(workerId);
  if (!lease || Number(lease.pid) !== Number(pid)) return false;
  const next = {
    ...lease,
    progressPhase: phase
  };
  if (semanticProgress) {
    next.lastProgressAt = nowIso;
    next.progressSequence = Number(lease.progressSequence ?? 0) + 1;
  }
  if (childPid !== undefined) next.childPid = childPid;
  if (childProcessGroupId !== undefined) next.childProcessGroupId = childProcessGroupId;
  if (observedToolEvent) next.lastObservedToolEventAt = nowIso;
  writeLease(workerId, next);
  return true;
}

export function touchOwnedLeaseProgress(options = {}) {
  for (const workerId of Object.keys(ORCHESTRATION_V3.workers)) {
    const lease = readLease(workerId);
    if (lease && Number(lease.pid) === Number(process.pid)) {
      return touchLeaseProgress(workerId, options);
    }
  }
  return false;
}

function processState(pid) {
  if (process.platform === "win32") return null;
  try {
    return execFileSync("ps", ["-p", String(pid), "-o", "stat="], {
      encoding: "utf8",
      timeout: 5000
    }).trim() || null;
  } catch {
    return null;
  }
}

export function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
  } catch (err) {
    return err?.code === "EPERM";
  }

  const state = processState(pid);
  if (state && state.startsWith("Z")) return false;
  return true;
}

function processCommand(pid) {
  if (!alive(pid)) return null;
  try {
    return execFileSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8", timeout: 5000 }).trim() || null;
  } catch {
    return null;
  }
}

function ageMs(value, nowMs) {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? Math.max(0, nowMs - parsed) : Number.POSITIVE_INFINITY;
}

function commandMatchesLease(command, lease) {
  if (!command) return false;
  return command.includes("scripts/orchestration-v3/worker.mjs")
    && command.includes(`--worker ${lease.workerId}`)
    && command.includes(`--issue ${Number(lease.issueNumber)}`);
}

export function inspectLease(workerId, {
  now = new Date(),
  lease = readLease(workerId),
  pidAlive = null,
  processCommandText = undefined
} = {}) {
  const cfg = ORCHESTRATION_V3.workers[workerId];
  const nowMs = now.getTime();
  const pid = Number(lease?.pid);
  const hasLease = Boolean(lease);
  const resolvedPidAlive = pidAlive ?? alive(pid);
  const command = processCommandText === undefined ? processCommand(pid) : processCommandText;
  const leaseAgeMs = hasLease ? ageMs(lease.startedAt, nowMs) : null;
  const heartbeatAgeMs = hasLease ? ageMs(lease.heartbeatAt ?? lease.startedAt, nowMs) : null;
  const progressAgeMs = hasLease ? ageMs(lease.lastProgressAt ?? lease.startedAt, nowMs) : null;
  const worktreeMatches = !hasLease || !cfg
    ? false
    : lease.worktree === null || lease.worktree === undefined || path.resolve(String(lease.worktree)) === path.resolve(cfg.worktree);
  const commandMatches = hasLease && resolvedPidAlive ? commandMatchesLease(command, lease) : false;
  const heartbeatFresh = hasLease && Number.isFinite(heartbeatAgeMs) && heartbeatAgeMs <= LEASE_TTL_CONTRACT.heartbeatFreshMs;
  const progressFresh = hasLease && Number.isFinite(progressAgeMs) && progressAgeMs <= LEASE_TTL_CONTRACT.progressFreshMs;
  const leaseWithinTtl = hasLease && Number.isFinite(leaseAgeMs) && leaseAgeMs <= LEASE_TTL_CONTRACT.leaseTtlMs;

  let decision = "NO_LEASE";
  const evidence = [];
  if (hasLease) {
    if (!resolvedPidAlive) evidence.push("PID_NOT_ALIVE");
    if (resolvedPidAlive && !commandMatches) evidence.push("PID_COMMAND_MISMATCH");
    if (!worktreeMatches) evidence.push("WORKTREE_IDENTITY_MISMATCH");
    if (!heartbeatFresh) evidence.push("HEARTBEAT_STALE");
    if (!progressFresh) evidence.push("PROGRESS_STALE");
    if (!leaseWithinTtl) evidence.push("LEASE_TTL_EXPIRED");

    if (!resolvedPidAlive && worktreeMatches) {
      decision = "PROVEN_STALE_RECLAIM";
    } else if (resolvedPidAlive && commandMatches && worktreeMatches && heartbeatFresh) {
      decision = "LIVE_LEASE_PRESERVED";
    } else if (!heartbeatFresh && (!resolvedPidAlive || !commandMatches || !worktreeMatches)) {
      decision = "PROVEN_STALE_RECLAIM";
    } else {
      decision = "INSUFFICIENT_EVIDENCE_PRESERVE";
    }
  }

  return {
    worker_id: workerId,
    issue_number: Number(lease?.issueNumber) || null,
    pid: Number.isInteger(pid) && pid > 0 ? pid : null,
    session_id: lease?.sessionId ?? null,
    started_at: lease?.startedAt ?? null,
    heartbeat_at: lease?.heartbeatAt ?? null,
    last_progress_at: lease?.lastProgressAt ?? null,
    progress_sequence: Number(lease?.progressSequence ?? 0),
    progress_phase: lease?.progressPhase ?? null,
    last_observed_tool_event_at: lease?.lastObservedToolEventAt ?? null,
    child_pid: Number(lease?.childPid) || null,
    child_process_group_id: Number(lease?.childProcessGroupId) || null,
    lease_age_seconds: Number.isFinite(leaseAgeMs) ? Math.round(leaseAgeMs / 1000) : null,
    heartbeat_age_seconds: Number.isFinite(heartbeatAgeMs) ? Math.round(heartbeatAgeMs / 1000) : null,
    progress_age_seconds: Number.isFinite(progressAgeMs) ? Math.round(progressAgeMs / 1000) : null,
    pid_alive: Boolean(resolvedPidAlive),
    process_command: command,
    worktree: lease?.worktree ?? null,
    expected_worktree: cfg?.worktree ?? null,
    worktree_matches: worktreeMatches,
    command_matches_lease: commandMatches,
    heartbeat_fresh: heartbeatFresh,
    progress_fresh: progressFresh,
    lease_within_ttl: leaseWithinTtl,
    reconciliation_decision: decision,
    evidence
  };
}

export function reconcileLeaseState(workerId, {
  inspect = inspectLease,
  unlink = fs.unlinkSync,
  filePath = leasePath(workerId),
  recoverIdleWorker = null,
  now = new Date()
} = {}) {
  const inspection = inspect(workerId, { now });
  if (inspection.reconciliation_decision !== "PROVEN_STALE_RECLAIM") {
    return { lease: readLease(workerId, filePath), inspection, reclaimed: false, recovery: null };
  }

  const recovery = recoverIdleWorker ? recoverIdleWorker(workerId) : null;
  if (recovery && !recovery.after?.healthy) {
    return { lease: readLease(workerId, filePath), inspection: { ...inspection, reconciliation_decision: "STALE_RECLAIM_BLOCKED_UNHEALTHY_WORKTREE" }, reclaimed: false, recovery };
  }

  try {
    unlink(filePath);
  } catch {}
  return { lease: null, inspection, reclaimed: true, recovery };
}
