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

function maximumWorkerCoverage(issues, eligibleWorkerIds) {
  const eligible = new Set(eligibleWorkerIds);
  const workerToIssue = new Map();

  function assign(issue, visitedWorkers) {
    for (const workerId of issue.worker_candidates) {
      if (!eligible.has(workerId) || visitedWorkers.has(workerId)) continue;
      visitedWorkers.add(workerId);

      const occupyingIssue = workerToIssue.get(workerId);
      if (!occupyingIssue || assign(occupyingIssue, visitedWorkers)) {
        workerToIssue.set(workerId, issue);
        return true;
      }
    }
    return false;
  }

  for (const issue of issues) {
    assign(issue, new Set());
  }

  return {
    worker_ids: [...workerToIssue.keys()],
    issue_numbers: [...workerToIssue.values()].map((issue) => issue.number)
  };
}

export function buildQueueWatermarkSnapshot({
  readyIssues = [],
  runningIssues = [],
  activeLeaseIssueNumbers = [],
  activeLeaseAssignments = [],
  currentMainIssueNumbers = [],
  mergedIssueNumbers = [],
  nowIso = new Date().toISOString(),
  lastReplenishAt = null,
  lastRecoveryResult = null
} = {}) {
  const normalizedActiveAssignments = activeLeaseAssignments
    .map((entry) => ({
      workerId: String(entry?.workerId ?? ""),
      issueNumber: Number(entry?.issueNumber)
    }))
    .filter((entry) =>
      ORCHESTRATION_V3.workers[entry.workerId] &&
      Number.isFinite(entry.issueNumber)
    );

  const activeLeaseSet = new Set([
    ...activeLeaseIssueNumbers.map(Number).filter(Number.isFinite),
    ...normalizedActiveAssignments.map((entry) => entry.issueNumber)
  ]);

  const currentMainSet = new Set(currentMainIssueNumbers.map(Number).filter(Number.isFinite));
  const mergedSet = new Set(mergedIssueNumbers.map(Number).filter(Number.isFinite));
  const running = runningIssues.map(normalizeIssue);
  const ready = readyIssues.map(normalizeIssue);
  const activeCount = normalizedActiveAssignments.length > 0
    ? new Set(normalizedActiveAssignments.map((entry) => entry.workerId)).size
    : activeLeaseSet.size;
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

  const workerIds = Object.keys(ORCHESTRATION_V3.workers);

  const activeIssues = running.filter((issue) => activeLeaseSet.has(issue.number));

  const activeWorkerIds = normalizedActiveAssignments.length > 0
    ? [...new Set(normalizedActiveAssignments.map((entry) => entry.workerId))]
    : maximumWorkerCoverage(activeIssues, workerIds).worker_ids;

  const idleWorkerIds = workerIds.filter((workerId) => !activeWorkerIds.includes(workerId));
  const reserveCoverage = maximumWorkerCoverage(reserve, idleWorkerIds);
  const coveredIdleWorkerIds = reserveCoverage.worker_ids;
  const uncoveredWorkerIds = idleWorkerIds.filter(
    (workerId) => !coveredIdleWorkerIds.includes(workerId)
  );

  const distinctWorkerCoverageCount = coveredIdleWorkerIds.length;
  const totalWorkerCoverageCount = activeWorkerIds.length + distinctWorkerCoverageCount;
  const workerCoverageSufficient =
    totalWorkerCoverageCount >= QUEUE_WATERMARKS.targetActiveWorkers;

  const activeShortfall = Math.max(0, QUEUE_WATERMARKS.targetActiveWorkers - activeCount);

  let lowWatermarkState = "HEALTHY";
  if (reserve.length < QUEUE_WATERMARKS.minReadyReserve) {
    lowWatermarkState = "REPLENISHMENT_REQUIRED";
  }
  if (activeCount + reserve.length < QUEUE_WATERMARKS.targetActiveWorkers) {
    lowWatermarkState = "FAIL_CLOSED_INSUFFICIENT_SAFE_WORK";
  } else if (!workerCoverageSufficient) {
    lowWatermarkState = "FAIL_CLOSED_INSUFFICIENT_WORKER_COVERAGE";
  }

  const replenishmentNeeded =
    reserve.length < QUEUE_WATERMARKS.minReadyReserve ||
    !workerCoverageSufficient;

  let failClosedReason = null;
  if (activeCount + reserve.length < QUEUE_WATERMARKS.targetActiveWorkers) {
    failClosedReason = "INSUFFICIENT_DEPENDENCY_SAFE_FILE_ISOLATED_WORK";
  } else if (!workerCoverageSufficient) {
    failClosedReason = "INSUFFICIENT_DISTINCT_WORKER_COVERAGE";
  }

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
    active_worker_ids: activeWorkerIds,
    idle_worker_ids: idleWorkerIds,
    distinct_worker_coverage_count: distinctWorkerCoverageCount,
    total_worker_coverage_count: totalWorkerCoverageCount,
    covered_idle_worker_ids: coveredIdleWorkerIds,
    uncovered_worker_ids: uncoveredWorkerIds,
    coverage_issue_numbers: reserveCoverage.issue_numbers,
    safe_to_target_six: workerCoverageSufficient,
    replenishment_needed: replenishmentNeeded,
    fail_closed_reason: failClosedReason
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
