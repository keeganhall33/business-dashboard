import fs from "node:fs";
import path from "node:path";
import { ORCHESTRATION_V3, workerCandidatesForStream } from "./config.mjs";

export const QUEUE_WATERMARKS = Object.freeze({
  targetActiveWorkers: 6,
  minReadyReserve: 3,
  replenishBelowReady: 2
});

export function queueWatermarkStatePath() {
  return path.join(ORCHESTRATION_V3.runtime.stateRoot, "queue-watermark-state.json");
}

function taskField(body, name) {
  const text = String(body ?? "");
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`^\\s*\\*\\*${escaped}:\\*\\*\\s*(.+?)\\s*$`, "im"),
    new RegExp(`^\\s*${escaped}:\\s*(.+?)\\s*$`, "im"),
    new RegExp(`^\\s*#{1,6}\\s*${escaped}\\s*$\\s*^\\s*([^#\\n][^\\n]*)`, "im")
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

function taskIdentity(issue) {
  return String(taskField(issue?.body, "task_id") ?? issue?.title ?? issue?.number ?? "UNKNOWN").trim().toLowerCase();
}

function normalizeIssue(issue) {
  const stream = taskField(issue?.body, "stream");
  const candidates = workerCandidatesForStream(stream);
  return {
    number: Number(issue?.number),
    title: String(issue?.title ?? ""),
    stream,
    task_id: taskField(issue?.body, "task_id"),
    priority: taskField(issue?.body, "priority"),
    identity: taskIdentity(issue),
    worker_candidates: candidates,
    dependency_safe: candidates.length > 0
  };
}

export function buildQueueWatermarkSnapshot({
  readyIssues = [],
  runningIssues = [],
  activeLeaseIssueNumbers = [],
  currentMainIssueNumbers = [],
  mergedIssueNumbers = [],
  nowIso = new Date().toISOString(),
  lastReplenishAt = null,
  lastRecoveryResult = null
} = {}) {
  const activeLeaseSet = new Set(activeLeaseIssueNumbers.map(Number).filter(Number.isFinite));
  const currentMainSet = new Set(currentMainIssueNumbers.map(Number).filter(Number.isFinite));
  const mergedSet = new Set(mergedIssueNumbers.map(Number).filter(Number.isFinite));
  const running = runningIssues.map(normalizeIssue);
  const ready = readyIssues.map(normalizeIssue);
  const activeCount = activeLeaseSet.size;
  const activeIdentities = new Set(running.map((issue) => issue.identity));
  const seenReserveIdentities = new Set();
  const reserve = [];
  const rejected = [];

  for (const issue of ready) {
    let reason = null;
    if (!issue.dependency_safe) reason = "UNMAPPED_STREAM";
    else if (currentMainSet.has(issue.number) || mergedSet.has(issue.number)) reason = "ALREADY_ON_MAIN_OR_MERGED";
    else if (activeLeaseSet.has(issue.number)) reason = "ALREADY_ACTIVE";
    else if (activeIdentities.has(issue.identity) || seenReserveIdentities.has(issue.identity)) reason = "DUPLICATE_TASK_ID_OR_TITLE";
    if (reason) {
      rejected.push({ number: issue.number, stream: issue.stream, reason });
      continue;
    }
    seenReserveIdentities.add(issue.identity);
    reserve.push(issue);
  }

  const activeShortfall = Math.max(0, QUEUE_WATERMARKS.targetActiveWorkers - activeCount);
  let lowWatermarkState = "HEALTHY";
  if (reserve.length < QUEUE_WATERMARKS.minReadyReserve) lowWatermarkState = "REPLENISHMENT_REQUIRED";
  if (activeCount + reserve.length < QUEUE_WATERMARKS.targetActiveWorkers) lowWatermarkState = "FAIL_CLOSED_INSUFFICIENT_SAFE_WORK";

  return {
    generated_at: nowIso,
    target_active_workers: QUEUE_WATERMARKS.targetActiveWorkers,
    minimum_ready_reserve: QUEUE_WATERMARKS.minReadyReserve,
    replenish_below_ready: QUEUE_WATERMARKS.replenishBelowReady,
    active_count: activeCount,
    ready_reserve_count: reserve.length,
    active_shortfall: activeShortfall,
    low_watermark_state: lowWatermarkState,
    last_replenish_at: lastReplenishAt,
    last_recovery_result: lastRecoveryResult,
    reserve_issue_numbers: reserve.map((issue) => issue.number),
    rejected_issue_numbers: rejected,
    safe_to_target_six: activeCount + reserve.length >= QUEUE_WATERMARKS.targetActiveWorkers,
    replenishment_needed: reserve.length < QUEUE_WATERMARKS.minReadyReserve,
    fail_closed_reason: activeCount + reserve.length < QUEUE_WATERMARKS.targetActiveWorkers
      ? "INSUFFICIENT_DEPENDENCY_SAFE_FILE_ISOLATED_WORK"
      : null
  };
}

export function readQueueWatermarkState(filePath = queueWatermarkStatePath()) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

export function writeQueueWatermarkState(snapshot, filePath = queueWatermarkStatePath()) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2) + "\n");
  return snapshot;
}

export function simulateFailureInjectionAcceptance({
  before = {},
  afterWatcherRestart = {},
  afterWorkerCrash = {},
  afterStaleLease = {},
  afterEmptyReserve = {}
} = {}) {
  const stages = [
    ["WATCHER_RESTART_OR_LOGIN", afterWatcherRestart],
    ["WORKER_CRASH_BACKFILL", afterWorkerCrash],
    ["STALE_LEASE_RECONCILIATION", afterStaleLease],
    ["EMPTY_RESERVE_REPLENISHMENT", afterEmptyReserve]
  ].map(([stage, snapshot]) => ({
    stage,
    active_count: snapshot.active_count ?? 0,
    ready_reserve_count: snapshot.ready_reserve_count ?? 0,
    low_watermark_state: snapshot.low_watermark_state ?? "UNKNOWN",
    last_recovery_result: snapshot.last_recovery_result ?? null,
    passed: (snapshot.active_count ?? 0) >= (before.active_count ?? 0)
      && (snapshot.ready_reserve_count ?? 0) >= QUEUE_WATERMARKS.replenishBelowReady
      && !["UNKNOWN", "FAIL_CLOSED_INSUFFICIENT_SAFE_WORK"].includes(snapshot.low_watermark_state)
  }));
  return {
    status: stages.every((stage) => stage.passed) ? "PASS" : "FAIL",
    stages
  };
}
