import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ORCHESTRATION_V3, workerForStream } from "./config.mjs";
import { inspectAllWorkers, inspectGitRoot } from "./preflight.mjs";

const TOLERATED_ACTIVE_WORKER_ERRORS = new Set([
  "TRACKED_WORKTREE_DIRTY",
  "UNEXPECTED_UNTRACKED_FILES"
]);

function command(name, args, options = {}) {
  try {
    return { ok: true, stdout: execFileSync(name, args, { encoding: "utf8", timeout: 30_000, ...options }).trim() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function issueList(label) {
  const res = command("gh", [
    "api", "--method", "GET",
    `repos/${ORCHESTRATION_V3.repo}/issues`,
    "-f", "state=open",
    "-f", `labels=${ORCHESTRATION_V3.queue.base},${label}`,
    "-f", "per_page=100"
  ]);
  if (!res.ok) return { ok: false, issues: [], error: res.error };
  const rows = JSON.parse(res.stdout || "[]").filter((row) => !row.pull_request);
  return { ok: true, issues: rows.map((row) => ({ number: row.number, title: row.title, body: row.body, labels: row.labels ?? [] })) };
}

function processList(pattern) {
  const res = command("pgrep", ["-fl", pattern]);
  if (!res.ok) return [];
  return res.stdout ? res.stdout.split("\n") : [];
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

function extractStream(body) {
  return taskField(body, "stream");
}

function activeWorkerIds(runningIssues) {
  return new Set((runningIssues ?? []).map((issue) => workerForStream(extractStream(issue.body))).filter(Boolean));
}

function workerHealthyForControlPlane(workerId, inspection, activeWorkers) {
  if (inspection.healthy) return true;
  if (!activeWorkers.has(workerId)) return false;
  if (!Array.isArray(inspection.errors) || inspection.errors.length === 0) return false;
  return inspection.errors.every((error) => TOLERATED_ACTIVE_WORKER_ERRORS.has(error));
}

const runtime = inspectGitRoot(ORCHESTRATION_V3.runtime.root);
const workers = inspectAllWorkers();
const ready = issueList(ORCHESTRATION_V3.queue.ready);
const running = issueList(ORCHESTRATION_V3.queue.running);
const activeWorkers = activeWorkerIds(running.issues);
const ollama = command("ollama", ["ps"]);
const watcherProcesses = processList("orchestration-v3/watcher.mjs");
const legacyProcesses = {
  WATCHER: processList("scripts/orchestration-watch.mjs"),
  DETACHED_LAUNCHER: processList("scripts/launch-orchestration-nl-detached.mjs"),
  RUNNER: processList("scripts/orchestration-run-issue-openclaw.mjs")
};
const legacyPlist = path.join(os.homedir(), "Library", "LaunchAgents", "com.keegan.jeeves.orchestration-watch.plist");
const legacyProcessCount = Object.values(legacyProcesses).reduce((sum, values) => sum + values.length, 0);

const workerEffectiveHealth = Object.fromEntries(
  Object.entries(workers).map(([workerId, inspection]) => [workerId, workerHealthyForControlPlane(workerId, inspection, activeWorkers)])
);
const liveWorkerCount = activeWorkers.size;
const productLiveWorkerCount = ORCHESTRATION_V3.capacity.productWorkers.filter((workerId) => activeWorkers.has(workerId)).length;
const integrationReleaseLiveWorkerCount = ORCHESTRATION_V3.capacity.integrationReleaseWorkers.filter((workerId) => activeWorkers.has(workerId)).length;
const qaEvaluationLiveWorkerCount = ORCHESTRATION_V3.capacity.qaEvaluationWorkers.filter((workerId) => activeWorkers.has(workerId)).length;

const report = {
  CONTROL_PLANE: "UNKNOWN",
  VERSION: ORCHESTRATION_V3.version,
  REPO: ORCHESTRATION_V3.repo,
  MODEL: ORCHESTRATION_V3.model.id,
  CLOUD_FALLBACK_ALLOWED: ORCHESTRATION_V3.model.cloudFallbackAllowed,
  RUNTIME: runtime,
  WORKERS: workers,
  ACTIVE_WORKERS: [...activeWorkers],
  CAPACITY: {
    ACCEPTANCE_PROOF: `${Object.keys(ORCHESTRATION_V3.workers).length}/${ORCHESTRATION_V3.capacity.totalWorkers}`,
    TOTAL_WORKERS: ORCHESTRATION_V3.capacity.totalWorkers,
    DEFINED_WORKERS: Object.keys(ORCHESTRATION_V3.workers).length,
    PRODUCT_WORKERS: ORCHESTRATION_V3.capacity.productWorkers,
    INTEGRATION_RELEASE_WORKERS: ORCHESTRATION_V3.capacity.integrationReleaseWorkers,
    QA_EVALUATION_WORKERS: ORCHESTRATION_V3.capacity.qaEvaluationWorkers,
    LIVE_UTILIZATION: `${liveWorkerCount}/${ORCHESTRATION_V3.capacity.totalWorkers}`,
    LIVE_BY_ROLE: {
      PRODUCT: `${productLiveWorkerCount}/${ORCHESTRATION_V3.capacity.productWorkers.length}`,
      INTEGRATION_RELEASE: `${integrationReleaseLiveWorkerCount}/${ORCHESTRATION_V3.capacity.integrationReleaseWorkers.length}`,
      QA_EVALUATION: `${qaEvaluationLiveWorkerCount}/${ORCHESTRATION_V3.capacity.qaEvaluationWorkers.length}`
    }
  },
  WORKER_EFFECTIVE_HEALTH: workerEffectiveHealth,
  QUEUE: {
    READY: ready.issues.map((i) => i.number),
    RUNNING: running.issues.map((i) => i.number)
  },
  PROCESSES: {
    V3_WATCHER: watcherProcesses,
    LEGACY: legacyProcesses
  },
  LEGACY_LAUNCHAGENT_PLIST_ACTIVE: fs.existsSync(legacyPlist),
  OLLAMA_PS: ollama.ok ? ollama.stdout : ollama.error,
  STATE_ROOT_EXISTS: fs.existsSync(ORCHESTRATION_V3.runtime.stateRoot)
};

const workerHealthy = Object.values(workerEffectiveHealth).every(Boolean);
const exactlyOneWatcher = watcherProcesses.length === 1;
const legacyRetired = legacyProcessCount === 0 && !fs.existsSync(legacyPlist);
report.CONTROL_PLANE = runtime.healthy && workerHealthy && exactlyOneWatcher && legacyRetired ? "HEALTHY" : "DEGRADED";

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = report.CONTROL_PLANE === "HEALTHY" ? 0 : 2;
