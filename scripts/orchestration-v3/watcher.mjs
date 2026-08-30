import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { ORCHESTRATION_V3, workerCandidatesForStream } from "./config.mjs";
import { inspectGitRoot, recoverIdleWorker } from "./preflight.mjs";
import { integrateValidatedPrQueue } from "./integration-queue.mjs";
import {
  buildFollowupBody,
  planFollowupMaterialization
} from "./followup-materializer.mjs";
import { buildQueueWatermarkSnapshot, writeQueueWatermarkState } from "./queue-watermarks.mjs";
import { evaluateRoadmapCandidate, planRoadmapReplenishment } from "./roadmap-replenisher.mjs";
import { alive, readLease, reconcileLeaseState, writeLease } from "./lease-reconciliation.mjs";

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const intervalSeconds = Number(arg("--interval", "20"));
if (!Number.isFinite(intervalSeconds) || intervalSeconds < 20) throw new Error("--interval must be >=20");
const RECOVERY_PRIORITY_ISSUES = new Map([537, 535, 536, 538, 416, 542].map((issueNumber, index) => [issueNumber, index]));
const PRIORITY_RANK = Object.freeze({ P0: 0, P1: 1, P2: 2, P3: 3 });
const BACKGROUND_OLLAMA_PROOF_ISSUE = 337;

let wakeResolver = null;
let wakePending = false;
let wakeReason = "STARTUP";
let pollInFlight = false;
let pollWakePending = false;

function requestWake(reason, details = {}) {
  if (pollInFlight) pollWakePending = true;
  wakePending = true;
  wakeReason = reason;
  console.log(JSON.stringify({ event: "WATCHER_WAKE_REQUESTED", reason, coalescedWithInFlightPoll: pollInFlight, ...details }));
  if (!wakeResolver) return;
  const resolve = wakeResolver;
  wakeResolver = null;
  resolve();
}

function waitForWakeOrTimeout(ms) {
  if (wakePending) {
    const reason = wakeReason;
    wakePending = false;
    return Promise.resolve(reason);
  }
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      wakeResolver = null;
      resolve("SAFETY_TIMER");
    }, ms);
    wakeResolver = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      wakeResolver = null;
      const reason = wakeReason;
      wakePending = false;
      resolve(reason);
    };
  });
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function isTransientGhError(err) {
  const text = [err?.message, err?.stderr, err?.stdout].filter(Boolean).join("\n");
  return /\b(429|502|503|504)\b|ECONNRESET|ECONNABORTED|ETIMEDOUT|socket hang up|TLS handshake timeout|connection reset|temporar|try resubmitting|Service Unavailable|rate limit/i.test(text);
}
function gh(args, { attempts = 3 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return execFileSync("gh", args, { encoding: "utf8", timeout: 30_000 }).trim();
    } catch (err) {
      lastError = err;
      if (!isTransientGhError(err) || attempt === attempts) throw err;
      const delayMs = 1000 * 2 ** (attempt - 1);
      console.error(JSON.stringify({ event: "GH_TRANSIENT_RETRY", attempt, delayMs, command: args.slice(0, 3), error: err instanceof Error ? err.message : String(err) }));
      sleepSync(delayMs);
    }
  }
  throw lastError;
}
function restIssue(number) {
  return JSON.parse(gh(["api", "--method", "GET", `repos/${ORCHESTRATION_V3.repo}/issues/${number}`]));
}
function issue(number) {
  const row = restIssue(number);
  return { number: row.number, body: row.body, labels: row.labels ?? [], title: row.title, state: row.state };
}
function issuesWithLabels(...labels) {
  const rows = JSON.parse(gh([
    "api", "--method", "GET",
    `repos/${ORCHESTRATION_V3.repo}/issues`,
    "-f", "state=open",
    "-f", `labels=${labels.join(",")}`,
    "-f", "per_page=100"
  ]));
  return rows.filter((row) => !row.pull_request);
}
function readyIssues() {
  return issuesWithLabels(ORCHESTRATION_V3.queue.base, ORCHESTRATION_V3.queue.ready)
    .map((row) => ({ number: row.number, title: row.title, body: row.body }));
}
function runningIssues() {
  return issuesWithLabels(ORCHESTRATION_V3.queue.base, ORCHESTRATION_V3.queue.running)
    .map((row) => ({ number: row.number, title: row.title }));
}
function setIssueLabels(issueNumber, labels) {
  const unique = [...new Set(labels.filter(Boolean))];
  const args = ["api", "--method", "PATCH", `repos/${ORCHESTRATION_V3.repo}/issues/${issueNumber}`];
  for (const label of unique) args.push("-f", `labels[]=${label}`);
  gh(args);
}
function transitionLabels(issueNumber, { remove = [], add = [] }) {
  const snapshot = restIssue(issueNumber);
  const current = (snapshot.labels ?? []).map((label) => typeof label === "string" ? label : label.name).filter(Boolean);
  const removeSet = new Set(remove);
  setIssueLabels(issueNumber, [...current.filter((label) => !removeSet.has(label)), ...add]);
}
function field(body, name) {
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
function priorityRank(body, issueNumber) {
  if (Number(issueNumber) === BACKGROUND_OLLAMA_PROOF_ISSUE) return Number.MAX_SAFE_INTEGER;
  return PRIORITY_RANK[String(field(body, "priority") ?? "P2").toUpperCase()] ?? PRIORITY_RANK.P2;
}
function reconcileLease(workerId) {
  const currentLease = readLease(workerId);
  if (!currentLease) return null;

  // Local process/worktree evidence is authoritative for lease liveness.
  // Never require GitHub issue availability before reclaiming a proven-dead
  // worker lease. Queue-label reconciliation happens separately.
  const result = reconcileLeaseState(workerId, { recoverIdleWorker });
  const { inspection, recovery } = result;
  if (inspection.reconciliation_decision === "LIVE_LEASE_PRESERVED") return result.lease;
  if (inspection.reconciliation_decision === "INSUFFICIENT_EVIDENCE_PRESERVE") return result.lease;
  if (inspection.reconciliation_decision === "STALE_RECLAIM_BLOCKED_UNHEALTHY_WORKTREE") {
    console.error(JSON.stringify({
      event: "WORKER_LANE_QUARANTINED",
      workerId,
      issueNumber: inspection.issue_number,
      pid: inspection.pid,
      classification: recovery.after?.classification ?? recovery.before?.classification ?? null,
      deletionCount: recovery.before?.trackedDeletionCount ?? null,
      deletionRatio: recovery.before?.deletionRatio ?? null,
      branch: recovery.before?.branch ?? null,
      head: recovery.before?.head ?? null,
      recoveryAttempted: recovery.recoverable,
      recoveryResult: recovery.error ? "FAILED" : "REFUSED",
      quarantineResult: "QUARANTINED"
    }));
    return result.lease;
  }
  if (result.reclaimed) console.log(JSON.stringify({ event: "STALE_LEASE_RECLAIMED", workerId, issueNumber: inspection.issue_number, pid: inspection.pid, evidence: inspection.evidence, heartbeatAgeSeconds: inspection.heartbeat_age_seconds, leaseAgeSeconds: inspection.lease_age_seconds, reconciliationDecision: inspection.reconciliation_decision }));
  return null;
}
function activeLeaseAssignments() {
  const active = [];
  for (const workerId of Object.keys(ORCHESTRATION_V3.workers)) {
    const lease = reconcileLease(workerId);
    if (lease && alive(Number(lease.pid))) {
      active.push({
        workerId,
        issueNumber: Number(lease.issueNumber)
      });
    }
  }
  return active;
}

function activeLeaseIssueNumbers() {
  return new Set(activeLeaseAssignments().map((entry) => entry.issueNumber));
}
function labelSet(snapshot) {
  return new Set(
    (snapshot?.labels ?? [])
      .map((label) => typeof label === "string" ? label : label?.name)
      .filter(Boolean)
  );
}

function humanApprovalRequiredForBody(body) {
  return String(field(body, "human_approval_required") ?? "false").trim().toLowerCase() === "true";
}

function reconcileRunningClaims(activeAssignments = activeLeaseAssignments()) {
  const activeIssues = new Set(
    activeAssignments.map((entry) => Number(entry.issueNumber))
  );
  const candidates = runningIssues();
  for (const candidate of candidates) {
    if (activeIssues.has(Number(candidate.number))) continue;

    const fresh = issue(Number(candidate.number));
    const labels = labelSet(fresh);
    const gated =
      labels.has(ORCHESTRATION_V3.queue.blocked) ||
      labels.has(ORCHESTRATION_V3.queue.awaitingReview) ||
      labels.has(ORCHESTRATION_V3.queue.humanApproval) ||
      humanApprovalRequiredForBody(fresh.body);

    if (gated) {
      transitionLabels(candidate.number, {
        remove: [ORCHESTRATION_V3.queue.running],
        add: []
      });
      console.log(JSON.stringify({
        event: "STALE_RUNNING_DEQUEUED_GATED",
        issueNumber: Number(candidate.number),
        reason: "NO_AUTHORITATIVE_LIVE_LEASE_AND_CURRENTLY_GATED"
      }));
      continue;
    }

    transitionLabels(candidate.number, {
      remove: [ORCHESTRATION_V3.queue.running],
      add: [ORCHESTRATION_V3.queue.ready]
    });
    console.log(JSON.stringify({
      event: "STALE_RUNNING_REQUEUED",
      issueNumber: Number(candidate.number),
      reason: "NO_AUTHORITATIVE_LIVE_LEASE"
    }));
  }
}

function revalidateClaim(issueNumber) {
  const fresh = issue(Number(issueNumber));
  const labels = labelSet(fresh);
  const reasons = [];

  if (!labels.has(ORCHESTRATION_V3.queue.base)) reasons.push("MISSING_BASE_LABEL");
  if (!labels.has(ORCHESTRATION_V3.queue.ready)) reasons.push("READY_LABEL_MISSING");
  if (labels.has(ORCHESTRATION_V3.queue.running)) reasons.push("ALREADY_RUNNING");
  if (labels.has(ORCHESTRATION_V3.queue.blocked)) reasons.push("BLOCKED");
  if (labels.has(ORCHESTRATION_V3.queue.awaitingReview)) reasons.push("AWAITING_REVIEW");
  if (labels.has(ORCHESTRATION_V3.queue.humanApproval)) reasons.push("AWAITING_HUMAN_APPROVAL");
  if (humanApprovalRequiredForBody(fresh.body)) reasons.push("HUMAN_APPROVAL_REQUIRED");

  return {
    claimable: reasons.length === 0,
    reasons,
    snapshot: fresh
  };
}

function claim(issueNumber) {
  const validation = revalidateClaim(issueNumber);
  if (!validation.claimable) {
    console.log(JSON.stringify({
      event: "CLAIM_REVALIDATION_SKIPPED",
      issueNumber: Number(issueNumber),
      reasons: validation.reasons
    }));
    return false;
  }

  transitionLabels(issueNumber, {
    remove: [ORCHESTRATION_V3.queue.ready],
    add: [ORCHESTRATION_V3.queue.running]
  });
  return true;
}

function openOrchestrationIssues() {
  return issuesWithLabels(ORCHESTRATION_V3.queue.base);
}

function dependencyStatesForIssues(issues = []) {
  const refs = new Set();
  for (const candidate of issues) {
    const text = String(candidate?.body ?? "");
    const declarations = [
      ...text.matchAll(/^\s*(?:\*\*)?(?:depends_on|dependency|dependencies)(?:\*\*)?\s*:\s*(.+)$/gim),
      ...text.matchAll(/^\s*(?:[-*]\s*)?Depends\s+on\s+(.+)$/gim)
    ];
    for (const declaration of declarations) {
      for (const match of String(declaration[1] ?? "").matchAll(/#(\d+)\b/g)) refs.add(Number(match[1]));
    }
  }
  return new Map([...refs].map((number) => [number, String(restIssue(number).state ?? "unknown").toLowerCase()]));
}

function replenishProductRoadmap(watermark) {
  const uncoveredWorkerIds = (watermark?.uncovered_worker_ids ?? []).filter((workerId) =>
    ORCHESTRATION_V3.capacity.productWorkers.includes(workerId)
  );
  if (!watermark?.replenishment_needed || uncoveredWorkerIds.length === 0) {
    return { selected: [], promoted: [], still_uncovered_worker_ids: uncoveredWorkerIds };
  }

  const allOpen = openOrchestrationIssues();
  const occupiedIssues = allOpen.filter((candidate) => {
    const labels = labelSet(candidate);
    return labels.has(ORCHESTRATION_V3.queue.ready) || labels.has(ORCHESTRATION_V3.queue.running);
  });
  const dependencyStates = dependencyStatesForIssues(allOpen);
  const plan = planRoadmapReplenishment({
    openIssues: allOpen,
    uncoveredWorkerIds,
    dependencyStates,
    occupiedIssues
  });

  for (const rejected of plan.rejected) {
    console.log(JSON.stringify({ event: "ROADMAP_REPLENISHMENT_REJECTED", ...rejected }));
  }

  const promoted = [];
  const occupiedNow = [...occupiedIssues];
  for (const selected of plan.selected) {
    const fresh = issue(Number(selected.issue_number));
    const validation = evaluateRoadmapCandidate(fresh, {
      uncoveredWorkerIds: [selected.worker_id],
      dependencyStates,
      occupiedIssues: occupiedNow
    });
    if (!validation.eligible) {
      console.log(JSON.stringify({
        event: "ROADMAP_REPLENISHMENT_REVALIDATION_SKIPPED",
        workerId: selected.worker_id,
        issueNumber: selected.issue_number,
        reasons: validation.reasons
      }));
      continue;
    }
    transitionLabels(Number(selected.issue_number), { remove: [], add: [ORCHESTRATION_V3.queue.ready] });
    occupiedNow.push(fresh);
    promoted.push(selected);
    console.log(JSON.stringify({ event: "ROADMAP_REPLENISHMENT_PROMOTED", ...selected }));
  }

  return { ...plan, promoted };
}

function createFollowupIssue(work) {
  const body = buildFollowupBody(work);
  const args = [
    "api", "--method", "POST",
    `repos/${ORCHESTRATION_V3.repo}/issues`,
    "-f", `title=[P0 ${String(work.stream).toUpperCase() === "QA_EVALUATION" ? "QA" : "Integration"}] ${work.title}`,
    "-f", `body=${body}`,
    "-f", `labels[]=${ORCHESTRATION_V3.queue.base}`,
    "-f", `labels[]=${ORCHESTRATION_V3.queue.ready}`
  ];
  return JSON.parse(gh(args));
}

function materializeIntegrationFollowups(followupWork = []) {
  for (const work of followupWork) {
    const currentIssues = openOrchestrationIssues();
    const plan = planFollowupMaterialization(work, currentIssues);

    if (plan.action === "SKIP") {
      console.log(JSON.stringify({
        event: "INTEGRATION_FOLLOWUP_SKIPPED",
        identity: plan.identity,
        reason: plan.reason,
        ...work
      }));
      continue;
    }

    if (plan.action === "CREATE_READY") {
      const created = createFollowupIssue(work);
      console.log(JSON.stringify({
        event: "INTEGRATION_FOLLOWUP_ENQUEUED",
        identity: plan.identity,
        issueNumber: Number(created.number),
        reason: plan.reason,
        ...work
      }));
      continue;
    }

    if (plan.action === "REUSE_AND_READY") {
      transitionLabels(Number(plan.issue.number), {
        remove: [ORCHESTRATION_V3.queue.blocked],
        add: [ORCHESTRATION_V3.queue.ready]
      });
      console.log(JSON.stringify({
        event: "INTEGRATION_FOLLOWUP_REUSED",
        identity: plan.identity,
        issueNumber: Number(plan.issue.number),
        reason: plan.reason,
        transitionedToReady: true,
        ...work
      }));
      continue;
    }

    console.log(JSON.stringify({
      event: "INTEGRATION_FOLLOWUP_REUSED",
      identity: plan.identity,
      issueNumber: Number(plan.issue?.number),
      reason: plan.reason,
      transitionedToReady: false,
      ...work
    }));
  }
}
function quarantineUnmappedIssue(issueNumber, stream) {
  transitionLabels(issueNumber, { remove: [ORCHESTRATION_V3.queue.ready], add: [ORCHESTRATION_V3.queue.blocked] });
  gh(["issue", "comment", String(issueNumber), "--repo", ORCHESTRATION_V3.repo, "--body", `V3 quarantined this task because stream \`${stream ?? "UNKNOWN"}\` has no mapped worker. Valid mapped streams must be added to scripts/orchestration-v3/config.mjs before this can re-enter orch:ready.`], { attempts: 2 });
}
function launch(workerId, issueNumber) {
  const recovery = recoverIdleWorker(workerId);
  if (!recovery.after?.healthy) {
    throw new Error(`WORKER_LANE_UNHEALTHY:${workerId}:${recovery.after?.errors?.join(",") ?? recovery.before?.errors?.join(",") ?? "UNKNOWN"}`);
  }
  const logPath = path.join(ORCHESTRATION_V3.runtime.logRoot, `jeeves-orchestration-v3-${workerId}-${issueNumber}.log`);
  fs.mkdirSync(ORCHESTRATION_V3.runtime.logRoot, { recursive: true });
  const fd = fs.openSync(logPath, "a");
  const child = spawn(process.execPath, ["scripts/orchestration-v3/worker.mjs", "--issue", String(issueNumber), "--worker", workerId], {
    cwd: ORCHESTRATION_V3.runtime.root,
    detached: true,
    stdio: ["ignore", fd, fd],
    env: { ...process.env }
  });
  if (!Number.isInteger(child.pid) || child.pid <= 0) throw new Error(`NO_WORKER_PID:${workerId}:${issueNumber}`);
  writeLease(workerId, { issueNumber, pid: child.pid, logPath, worktree: ORCHESTRATION_V3.workers[workerId]?.worktree ?? null });
  child.on("exit", (code, signal) => requestWake("WORKER_EXIT", { workerId, issueNumber, pid: child.pid, code, signal }));
  child.unref();
  fs.closeSync(fd);
  console.log(JSON.stringify({ event: "CLAIMED", workerId, issueNumber, pid: child.pid, logPath }));
}

const runtime = inspectGitRoot(ORCHESTRATION_V3.runtime.root);
if (!runtime.healthy) throw new Error(`CANONICAL_RUNTIME_UNHEALTHY:${runtime.errors.join(",")}`);

async function poll(reason = "UNKNOWN") {
  try {
    const integration = integrateValidatedPrQueue({ maxMerges: 1 });
    console.log(JSON.stringify(integration));
    for (const work of integration.followupWork ?? []) {
      console.log(JSON.stringify({ event: "INTEGRATION_FOLLOWUP_WORK_READY", ...work }));
    }
    materializeIntegrationFollowups(integration.followupWork ?? []);
  } catch (err) {
    if (isTransientGhError(err)) console.error(JSON.stringify({ event: "INTEGRATION_QUEUE_DEFERRED_GITHUB_TRANSIENT", error: err instanceof Error ? err.message : String(err) }));
    else console.error(JSON.stringify({ event: "INTEGRATION_QUEUE_FAILED", error: err instanceof Error ? err.message : String(err) }));
  }

  const activeAssignments = activeLeaseAssignments();
  reconcileRunningClaims(activeAssignments);
  const claimedWorkersThisPass = new Set();
  const ready = readyIssues().sort((left, right) => {
    const leftRecovery = RECOVERY_PRIORITY_ISSUES.get(Number(left.number));
    const rightRecovery = RECOVERY_PRIORITY_ISSUES.get(Number(right.number));
    if (leftRecovery !== undefined || rightRecovery !== undefined) {
      if (leftRecovery === undefined) return 1;
      if (rightRecovery === undefined) return -1;
      if (leftRecovery !== rightRecovery) return leftRecovery - rightRecovery;
    }
    const leftPriority = priorityRank(left.body, left.number);
    const rightPriority = priorityRank(right.body, right.number);
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return Number(left.number) - Number(right.number);
  });
  let watermark = writeQueueWatermarkState(buildQueueWatermarkSnapshot({
    readyIssues: ready,
    runningIssues: runningIssues(),
    activeLeaseAssignments: activeAssignments,
    lastRecoveryResult: ["STARTUP", "SAFETY_TIMER"].includes(reason) ? "STARTUP_RECONCILIATION_COMPLETE" : reason
  }));
  console.log(JSON.stringify({ event: "QUEUE_WATERMARK_STATE", ...watermark }));

  const replenishment = replenishProductRoadmap(watermark);
  if (replenishment.promoted?.length > 0) {
    ready.splice(0, ready.length, ...readyIssues().sort((left, right) => {
      const leftPriority = priorityRank(left.body, left.number);
      const rightPriority = priorityRank(right.body, right.number);
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return Number(left.number) - Number(right.number);
    }));
    watermark = writeQueueWatermarkState(buildQueueWatermarkSnapshot({
      readyIssues: ready,
      runningIssues: runningIssues(),
      activeLeaseAssignments: activeAssignments,
      lastReplenishAt: new Date().toISOString(),
      lastRecoveryResult: "PRODUCT_ROADMAP_REPLENISHED"
    }));
    console.log(JSON.stringify({ event: "QUEUE_WATERMARK_REPLENISHED", ...watermark }));
  }

  for (const candidate of ready) {
    try {
      const snapshot = candidate;
      const stream = field(snapshot.body, "stream");
      const workerCandidates = workerCandidatesForStream(stream);
      if (workerCandidates.length === 0) {
        console.error(JSON.stringify({ event: "UNMAPPED_STREAM_QUARANTINED", issueNumber: snapshot.number, stream }));
        quarantineUnmappedIssue(snapshot.number, stream);
        continue;
      }
      const workerId = workerCandidates.find((candidateWorkerId) => !claimedWorkersThisPass.has(candidateWorkerId) && !reconcileLease(candidateWorkerId));
      if (!workerId) continue;
      if (!claim(snapshot.number)) continue;
      claimedWorkersThisPass.add(workerId);
      try {
        launch(workerId, snapshot.number);
      } catch (err) {
        claimedWorkersThisPass.delete(workerId);
        transitionLabels(snapshot.number, { remove: [ORCHESTRATION_V3.queue.running], add: [ORCHESTRATION_V3.queue.blocked] });
        console.error(JSON.stringify({ event: "LAUNCH_FAILED", workerId, issueNumber: snapshot.number, error: err instanceof Error ? err.message : String(err) }));
      }
    } catch (err) {
      if (isTransientGhError(err)) {
        console.error(JSON.stringify({ event: "CANDIDATE_DEFERRED_GITHUB_TRANSIENT", issueNumber: candidate.number, error: err instanceof Error ? err.message : String(err) }));
        continue;
      }
      throw err;
    }
  }
}

async function runSerializedPoll(reason) {
  if (pollInFlight) {
    pollWakePending = true;
    console.log(JSON.stringify({ event: "POLL_WAKE_COALESCED", reason }));
    return;
  }
  pollInFlight = true;
  try {
    let passReason = reason;
    do {
      pollWakePending = false;
      try {
        await poll(passReason);
      } catch (err) {
        console.error(JSON.stringify({ event: "POLL_FAILED", reason: passReason, error: err instanceof Error ? err.message : String(err) }));
      }
      if (pollWakePending) {
        console.log(JSON.stringify({ event: "POLL_COALESCED_WAKE_DRAINED", reason: wakeReason }));
        passReason = wakeReason;
      }
    } while (pollWakePending);
  } finally {
    pollInFlight = false;
  }
}

console.log(JSON.stringify({ event: "WATCHER_START", version: 3, runtime: ORCHESTRATION_V3.runtime.root, model: ORCHESTRATION_V3.model.id, intervalSeconds }));
let nextPollReason = "STARTUP";
for (;;) {
  await runSerializedPoll(nextPollReason);
  nextPollReason = await waitForWakeOrTimeout(intervalSeconds * 1000);
  console.log(JSON.stringify({ event: "WATCHER_WAKE", reason: nextPollReason }));
}