import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { ORCHESTRATION_V3 } from "./config.mjs";
import { inspectGitRoot } from "./preflight.mjs";

const WORKER_SHUTDOWN_GRACE_MS = 5_000;
const WORKER_SHUTDOWN_POLL_MS = 100;

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === "EPERM";
  }
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function processCommand(pid) {
  if (!alive(pid)) return null;
  try {
    return execFileSync("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf8",
      timeout: 2_000
    }).trim();
  } catch {
    return null;
  }
}

function readLeaseRows() {
  const leasesDir = path.join(ORCHESTRATION_V3.runtime.stateRoot, "leases");
  let names = [];
  try {
    names = fs.readdirSync(leasesDir).filter((name) => name.endsWith(".json"));
  } catch {}

  const rows = [];
  for (const name of names) {
    try {
      const leasePath = path.join(leasesDir, name);
      const lease = JSON.parse(fs.readFileSync(leasePath, "utf8"));
      rows.push({
        leasePath,
        workerId: lease?.workerId ?? name.replace(/\.json$/, ""),
        issueNumber: Number(lease?.issueNumber) || null,
        sessionId: lease?.sessionId ?? null,
        pid: Number(lease?.pid) || null,
        worktree: lease?.worktree ?? null
      });
    } catch {}
  }
  return rows;
}

function ownedWorkerProcess(row) {
  if (!row?.workerId || !ORCHESTRATION_V3.workers[row.workerId]) return false;
  if (!Number.isInteger(row.pid) || row.pid <= 0 || !alive(row.pid)) return false;
  const command = processCommand(row.pid);
  if (!command) return false;
  return command.includes("scripts/orchestration-v3/worker.mjs") &&
    command.includes(`--worker ${row.workerId}`) &&
    (!row.issueNumber || command.includes(`--issue ${row.issueNumber}`));
}

function emitLifecycle(event, details = {}) {
  console.log(JSON.stringify({
    event,
    generated_at: new Date().toISOString(),
    hostPid: process.pid,
    ...details
  }));
}

function stopOwnedWorkers(reason) {
  const rows = readLeaseRows().filter(ownedWorkerProcess);
  emitLifecycle("WATCHER_CHILD_SHUTDOWN_REQUESTED", {
    reason,
    workerCount: rows.length,
    workers: rows.map(({ workerId, issueNumber, sessionId, pid }) => ({ workerId, issueNumber, sessionId, pid }))
  });

  for (const row of rows) {
    try {
      process.kill(row.pid, "SIGTERM");
      emitLifecycle("WATCHER_CHILD_TERM_SENT", {
        workerId: row.workerId,
        issueNumber: row.issueNumber,
        sessionId: row.sessionId,
        pid: row.pid
      });
    } catch (err) {
      if (err?.code !== "ESRCH") {
        emitLifecycle("WATCHER_CHILD_TERM_FAILED", {
          workerId: row.workerId,
          issueNumber: row.issueNumber,
          sessionId: row.sessionId,
          pid: row.pid,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
  }

  const deadline = Date.now() + WORKER_SHUTDOWN_GRACE_MS;
  while (Date.now() < deadline && rows.some((row) => ownedWorkerProcess(row))) {
    sleepSync(WORKER_SHUTDOWN_POLL_MS);
  }

  for (const row of rows) {
    if (!ownedWorkerProcess(row)) {
      emitLifecycle("WATCHER_CHILD_EXITED", {
        workerId: row.workerId,
        issueNumber: row.issueNumber,
        sessionId: row.sessionId,
        pid: row.pid
      });
      continue;
    }
    try {
      process.kill(row.pid, "SIGKILL");
      emitLifecycle("WATCHER_CHILD_KILL_ESCALATED", {
        workerId: row.workerId,
        issueNumber: row.issueNumber,
        sessionId: row.sessionId,
        pid: row.pid
      });
    } catch (err) {
      if (err?.code !== "ESRCH") {
        emitLifecycle("WATCHER_CHILD_KILL_FAILED", {
          workerId: row.workerId,
          issueNumber: row.issueNumber,
          sessionId: row.sessionId,
          pid: row.pid,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
  }

  return rows;
}

function reconcileStartupOrphans() {
  const orphans = readLeaseRows().filter(ownedWorkerProcess);
  if (orphans.length === 0) return;
  emitLifecycle("WATCHER_ORPHAN_WORKERS_DETECTED", {
    workers: orphans.map(({ workerId, issueNumber, sessionId, pid }) => ({ workerId, issueNumber, sessionId, pid }))
  });
  stopOwnedWorkers("STARTUP_ORPHAN_RECONCILIATION");
}

function pacificParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}:${get("second")}`
  };
}

function leaseSummary() {
  const active = [];
  for (const lease of readLeaseRows()) {
    if (ownedWorkerProcess(lease)) {
      active.push({
        worker_id: lease.workerId,
        issue_number: lease.issueNumber,
        pid: lease.pid
      });
    }
  }

  const workerHealth = {};
  for (const [workerId, cfg] of Object.entries(ORCHESTRATION_V3.workers)) {
    try {
      const inspection = inspectGitRoot(cfg.worktree);
      workerHealth[workerId] = {
        healthy: inspection.healthy,
        gitRoot: inspection.gitRoot,
        branch: inspection.branch,
        head: inspection.head,
        trackedChanges: inspection.trackedChangeCount,
        trackedDeletions: inspection.trackedDeletionCount,
        deletionRatio: inspection.deletionRatio,
        classification: inspection.classification,
        recoveryPolicy: inspection.recoveryPolicy,
        untracked: inspection.unexpectedUntracked.length
      };
    } catch (err) {
      workerHealth[workerId] = { healthy: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  const healthReport = Object.entries(workerHealth).map(([id, h]) => ({ id, ...h }));

  return {
    active,
    workerCount: Object.keys(ORCHESTRATION_V3.workers).length,
    allWorkersHealthy: healthReport.every((h) => h.healthy),
    workerHealth
  };
}

function heartbeatPath() {
  return path.join(ORCHESTRATION_V3.runtime.stateRoot, "health", "watcher-heartbeats.ndjson");
}

function appendHeartbeat({ watcherPid, caffeinatePid, caffeinateEnabled, event = "HEARTBEAT" }) {
  const file = heartbeatPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const now = new Date();
  const pacific = pacificParts(now);
  const leaseInfo = leaseSummary();
  const healthSnapshot = Object.entries(leaseInfo.workerHealth).map(([id, h]) => ({ id, healthy: h.healthy, classification: h.classification }));

  fs.appendFileSync(file, JSON.stringify({
    event,
    generated_at: now.toISOString(),
    epoch_ms: now.getTime(),
    pacific_date: pacific.date,
    pacific_time: pacific.time,
    host_pid: process.pid,
    watcher_pid: watcherPid,
    watcher_alive: alive(watcherPid),
    idle_sleep_guard: {
      enabled: caffeinateEnabled,
      pid: caffeinatePid,
      alive: caffeinateEnabled ? alive(caffeinatePid) : null,
      mode: caffeinateEnabled ? "caffeinate -i -w watcher_pid" : "not-required-on-this-platform"
    },
    active_worker_count: leaseInfo.active.length,
    workerCount: leaseInfo.workerCount,
    allWorkersHealthy: leaseInfo.allWorkersHealthy,
    healthSnapshot
  }) + "\n");
}

function spawnWatcher() {
  const args = ["scripts/orchestration-v3/watcher.mjs", ...process.argv.slice(2)];
  return spawn(process.execPath, args, {
    cwd: ORCHESTRATION_V3.runtime.root,
    env: { ...process.env },
    stdio: "inherit"
  });
}

function spawnIdleSleepGuard(watcherPid) {
  if (process.platform !== "darwin") return null;
  const caffeinatePath = "/usr/bin/caffeinate";
  if (!fs.existsSync(caffeinatePath)) throw new Error("MACOS_CAFFEINATE_NOT_FOUND");
  return spawn(caffeinatePath, ["-i", "-w", String(watcherPid)], { stdio: "ignore" });
}

reconcileStartupOrphans();

const watcher = spawnWatcher();
if (!Number.isInteger(watcher.pid) || watcher.pid <= 0) throw new Error("V3_WATCHER_HOST_NO_WATCHER_PID");
let caffeinate = spawnIdleSleepGuard(watcher.pid);
let stopping = false;
let shutdownStarted = false;

function ensureGuard() {
  if (process.platform !== "darwin" || stopping || !alive(watcher.pid)) return;
  if (caffeinate && alive(caffeinate.pid)) return;
  caffeinate = spawnIdleSleepGuard(watcher.pid);
  console.log(JSON.stringify({ event: "IDLE_SLEEP_GUARD_RESTARTED", watcherPid: watcher.pid, caffeinatePid: caffeinate?.pid ?? null }));
}

appendHeartbeat({
  watcherPid: watcher.pid,
  caffeinatePid: caffeinate?.pid ?? null,
  caffeinateEnabled: process.platform === "darwin",
  event: "WATCHER_HOST_START"
});

const heartbeatTimer = setInterval(() => {
  ensureGuard();
  appendHeartbeat({
    watcherPid: watcher.pid,
    caffeinatePid: caffeinate?.pid ?? null,
    caffeinateEnabled: process.platform === "darwin"
  });
}, 60_000);
heartbeatTimer.unref();

function forward(signal) {
  if (shutdownStarted) return;
  shutdownStarted = true;
  stopping = true;
  emitLifecycle("WATCHER_HOST_SHUTDOWN_REQUESTED", { signal });
  stopOwnedWorkers(`HOST_${signal}`);
  try { watcher.kill(signal); } catch {}
  try { caffeinate?.kill(signal); } catch {}
}
process.on("SIGTERM", () => forward("SIGTERM"));
process.on("SIGINT", () => forward("SIGINT"));
process.on("SIGHUP", () => forward("SIGHUP"));

watcher.on("exit", (code, signal) => {
  stopping = true;
  clearInterval(heartbeatTimer);
  if (!shutdownStarted) stopOwnedWorkers("WATCHER_EXITED_UNEXPECTEDLY");
  appendHeartbeat({
    watcherPid: watcher.pid,
    caffeinatePid: caffeinate?.pid ?? null,
    caffeinateEnabled: process.platform === "darwin",
    event: "WATCHER_HOST_STOP"
  });
  try { caffeinate?.kill("SIGTERM"); } catch {}
  emitLifecycle("WATCHER_HOST_STOPPED", { watcherCode: code ?? null, watcherSignal: signal ?? null });
  process.exit(signal ? 0 : (code ?? 1));
});

caffeinate?.on("exit", (code, signal) => {
  if (stopping || !alive(watcher.pid)) return;
  console.error(JSON.stringify({ event: "IDLE_SLEEP_GUARD_EXITED", code, signal, watcherPid: watcher.pid }));
});

console.log(JSON.stringify({
  event: "WATCHER_HOST_READY",
  hostPid: process.pid,
  watcherPid: watcher.pid,
  idleSleepGuardEnabled: process.platform === "darwin",
  caffeinatePid: caffeinate?.pid ?? null,
  heartbeatPath: heartbeatPath()
}));
