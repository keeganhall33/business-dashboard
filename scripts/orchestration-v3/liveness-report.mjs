import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ORCHESTRATION_V3, workerCandidatesForStream } from "./config.mjs";
import { inspectGitRoot } from "./preflight.mjs";
import { readQueueWatermarkState } from "./queue-watermarks.mjs";
import { inspectLease } from "./lease-reconciliation.mjs";

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function run(command, args, options = {}) {
  try {
    return {
      ok: true,
      stdout: execFileSync(command, args, { encoding: "utf8", timeout: options.timeout ?? 20_000 }).trim()
    };
  } catch (err) {
    return {
      ok: false,
      stdout: String(err?.stdout ?? "").trim(),
      stderr: String(err?.stderr ?? "").trim(),
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === "EPERM";
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function processCommand(pid) {
  if (!alive(pid)) return null;
  const out = run("ps", ["-p", String(pid), "-o", "command="]);
  return out.ok ? out.stdout : null;
}

function launchdSnapshot(label) {
  const out = run("launchctl", ["list", label]);
  if (!out.ok) {
    return {
      label,
      loaded: false,
      pid: null,
      last_exit_status: null,
      raw: out.stderr || out.error
    };
  }
  const pid = Number(out.stdout.match(/"PID"\s*=\s*(\d+)/)?.[1] ?? 0) || null;
  const lastExitStatus = Number(out.stdout.match(/"LastExitStatus"\s*=\s*(-?\d+)/)?.[1] ?? 0);
  return {
    label,
    loaded: true,
    pid,
    pid_alive: pid ? alive(pid) : false,
    command: pid ? processCommand(pid) : null,
    last_exit_status: Number.isFinite(lastExitStatus) ? lastExitStatus : null
  };
}

function workerLeaseSnapshot(workerId) {
  const leasePath = path.join(ORCHESTRATION_V3.runtime.stateRoot, "leases", `${workerId}.json`);
  const lease = readJson(leasePath);
  const leaseInspection = inspectLease(workerId, { lease });
  const pidAlive = leaseInspection.pid_alive;
  const cfg = ORCHESTRATION_V3.workers[workerId];
  let integrity = null;
  try { integrity = cfg ? inspectGitRoot(cfg.worktree) : null; } catch {}
  return {
    worker_id: workerId,
    issue_number: Number(lease?.issueNumber) || null,
    pid: leaseInspection.pid,
    pid_alive: pidAlive,
    started_at: lease?.startedAt ?? null,
    heartbeat_at: leaseInspection.heartbeat_at,
    lease_age_seconds: leaseInspection.lease_age_seconds,
    heartbeat_age_seconds: leaseInspection.heartbeat_age_seconds,
    worktree_identity: leaseInspection.worktree,
    expected_worktree: leaseInspection.expected_worktree,
    worktree_matches: leaseInspection.worktree_matches,
    command_matches_lease: leaseInspection.command_matches_lease,
    reconciliation_decision: leaseInspection.reconciliation_decision,
    reconciliation_evidence: leaseInspection.evidence,
    log_path: lease?.logPath ?? null,
    process_command: leaseInspection.process_command,
    lease_path: fs.existsSync(leasePath) ? leasePath : null,
    health: integrity ? {
      healthy: integrity.healthy,
      classification: integrity.classification,
      recovery_policy: integrity.recoveryPolicy,
      errors: integrity.errors,
      deletion_count: integrity.trackedDeletionCount,
      deletion_ratio: integrity.deletionRatio,
      branch: integrity.branch,
      head: integrity.head
    } : null
  };
}

function ghJson(args) {
  const out = run("gh", args, { timeout: 30_000 });
  if (!out.ok) return { ok: false, error: out.stderr || out.error, data: [] };
  try {
    return { ok: true, error: null, data: JSON.parse(out.stdout || "[]") };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), data: [] };
  }
}

function taskField(body, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(body ?? "").match(new RegExp(`\\*\\*${escaped}:\\*\\*\\s*([^\\n]+)`, "i"));
  return match ? match[1].trim() : null;
}

function githubQueueSnapshot(enabled) {
  if (!enabled) return { checked: false, running: [], ready: [], error: null };
  const common = ["issue", "list", "--repo", ORCHESTRATION_V3.repo, "--state", "open", "--label", ORCHESTRATION_V3.queue.base, "--limit", "100"];
  const running = ghJson([...common, "--label", ORCHESTRATION_V3.queue.running, "--json", "number,title,labels"]);
  const ready = ghJson([...common, "--label", ORCHESTRATION_V3.queue.ready, "--json", "number,title,body,labels"]);
  return {
    checked: true,
    running: running.data.map((item) => ({ number: Number(item.number), title: item.title })),
    ready: ready.data.map((item) => {
      const stream = taskField(item.body, "stream");
      return {
        number: Number(item.number),
        title: item.title,
        stream,
        worker_candidates: workerCandidatesForStream(stream)
      };
    }),
    error: running.error ?? ready.error ?? null
  };
}

function latestHeartbeatSnapshot(now = new Date()) {
  const heartbeatPath = path.join(ORCHESTRATION_V3.runtime.stateRoot, "health", "watcher-heartbeats.ndjson");
  let raw = "";
  try {
    raw = fs.readFileSync(heartbeatPath, "utf8").trim();
  } catch {
    return {
      path: heartbeatPath,
      present: false,
      latest_generated_at: null,
      age_seconds: null,
      watcher_alive: null,
      active_worker_count: null
    };
  }
  const line = raw.split("\n").filter(Boolean).at(-1);
  let latest = null;
  try {
    latest = JSON.parse(line ?? "{}");
  } catch {}
  const generatedAt = latest?.generated_at ?? null;
  const ageSeconds = generatedAt ? Math.max(0, Math.round((now.getTime() - new Date(generatedAt).getTime()) / 1000)) : null;
  return {
    path: heartbeatPath,
    present: Boolean(latest),
    latest_generated_at: generatedAt,
    age_seconds: Number.isFinite(ageSeconds) ? ageSeconds : null,
    watcher_alive: typeof latest?.watcher_alive === "boolean" ? latest.watcher_alive : null,
    active_worker_count: Number.isInteger(latest?.active_worker_count) ? latest.active_worker_count : null
  };
}

export function buildLivenessReport({ includeGithub = false, launchdLabel = "com.keegan.jeeves.orchestration-v3" } = {}) {
  const workers = Object.keys(ORCHESTRATION_V3.workers).map(workerLeaseSnapshot);
  const liveWorkers = workers.filter((worker) => worker.pid_alive);
  const liveWorkerIds = new Set(liveWorkers.map((worker) => worker.worker_id));
  const github = githubQueueSnapshot(includeGithub);
  const runningIssuesWithLiveLease = new Set(workers.filter((worker) => worker.pid_alive && worker.issue_number).map((worker) => worker.issue_number));
  const heartbeat = latestHeartbeatSnapshot();
  const queueWatermark = readQueueWatermarkState();
  return {
    generated_at: new Date().toISOString(),
    runtime_root: ORCHESTRATION_V3.runtime.root,
    state_root: ORCHESTRATION_V3.runtime.stateRoot,
    model: ORCHESTRATION_V3.model,
    watcher: launchdSnapshot(launchdLabel),
    heartbeat,
    workers,
    github,
    queue_watermark: queueWatermark,
    summary: {
      live_worker_count: liveWorkers.length,
      active_count: queueWatermark?.active_count ?? liveWorkers.length,
      ready_reserve_count: queueWatermark?.ready_reserve_count ?? null,
      low_watermark_state: queueWatermark?.low_watermark_state ?? "UNKNOWN",
      last_replenish_at: queueWatermark?.last_replenish_at ?? null,
      last_recovery_result: queueWatermark?.last_recovery_result ?? null,
      capacity_acceptance_proof: `${workers.length}/${ORCHESTRATION_V3.capacity.totalWorkers}`,
      utilization_label: `${liveWorkers.length}/${ORCHESTRATION_V3.capacity.totalWorkers} capacity`,
      role_utilization: {
        product: `${ORCHESTRATION_V3.capacity.productWorkers.filter((workerId) => liveWorkerIds.has(workerId)).length}/${ORCHESTRATION_V3.capacity.productWorkers.length}`,
        integration_release: `${ORCHESTRATION_V3.capacity.integrationReleaseWorkers.filter((workerId) => liveWorkerIds.has(workerId)).length}/${ORCHESTRATION_V3.capacity.integrationReleaseWorkers.length}`,
        qa_evaluation: `${ORCHESTRATION_V3.capacity.qaEvaluationWorkers.filter((workerId) => liveWorkerIds.has(workerId)).length}/${ORCHESTRATION_V3.capacity.qaEvaluationWorkers.length}`
      },
      live_worker_ids: liveWorkers.map((worker) => worker.worker_id),
      unhealthy_worker_ids: workers.filter((worker) => worker.health && !worker.health.healthy).map((worker) => worker.worker_id),
      live_issue_numbers: liveWorkers.map((worker) => worker.issue_number).filter(Boolean),
      running_claims_without_live_lease: github.checked
        ? github.running.map((item) => item.number).filter((issueNumber) => !runningIssuesWithLiveLease.has(issueNumber))
        : [],
      ready_issue_numbers: github.checked ? github.ready.map((item) => item.number) : [],
      ready_backfill_candidates: github.checked
        ? github.ready.filter((item) => item.worker_candidates.length > 0).map((item) => ({ number: item.number, stream: item.stream, worker_candidates: item.worker_candidates }))
        : [],
      ready_unmapped_issue_numbers: github.checked ? github.ready.filter((item) => item.worker_candidates.length === 0).map((item) => item.number) : []
    }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = buildLivenessReport({
    includeGithub: hasFlag("--github"),
    launchdLabel: arg("--launchd-label", "com.keegan.jeeves.orchestration-v3")
  });
  console.log(JSON.stringify(report, null, hasFlag("--pretty") ? 2 : 0));
}
