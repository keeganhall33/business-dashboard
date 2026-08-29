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

function processRows() {
  try {
    const output = execFileSync("ps", ["-axo", "pid=,ppid=,pgid=,command="], {
      encoding: "utf8",
      timeout: 2_000
    });
    return output.split("\n").map((line) => {
      const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
      if (!match) return null;
      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        pgid: Number(match[3]),
        command: match[4]
      };
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function processCommand(pid) {
  return processRows().find((row) => row.pid === pid)?.command ?? null;
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
        worktree: lease?.worktree ?? null,
        heartbeatAt: lease?.heartbeatAt ?? null,
        lastProgressAt: lease?.lastProgressAt ?? null,
        progressSequence: Number(lease?.progressSequence ?? 0),
        progressPhase: lease?.progressPhase ?? null,
        childPid: Number(lease?.childPid) || null,
        childProcessGroupId: Number(lease?.childProcessGroupId) || null
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

function descendantsOf(rootPid, rows = processRows()) {
  const byParent = new Map();
  for (const row of rows) {
    if (!byParent.has(row.ppid)) byParent.set(row.ppid, []);
    byParent.get(row.ppid).push(row);
  }
  const result = [];
  const queue = [{ pid: rootPid, depth: 0 }];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const child of byParent.get(current.pid) ?? []) {
      const entry = { ...child, depth: current.depth + 1 };
      result.push(entry);
      queue.push(entry);
    }
  }
  return result;
}

function emitLifecycle(event, details = {}) {
  console.log(JSON.stringify({
    event,
    generated_at: new Date().toISOString(),
    hostPid: process.pid,
    ...details
  }));
}

function safeSignalPid(pid, signal) {
  if (!alive(pid)) return false;
  try {
    process.kill(pid, signal);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}

function safeSignalGroup(pgid, signal) {
  if (process.platform === "win32") return false;
  if (!Number.isInteger(pgid) || pgid <= 0) return false;
  try {
    process.kill(-pgid, signal);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}

function stopOwnedWorker(row, reason) {
  if (!ownedWorkerProcess(row)) return { workerId: row.workerId, rootPid: row.pid, targets: [], survivors: [] };

  const snapshot = processRows();
  const descendants = descendantsOf(row.pid, snapshot);
  const targetPids = [...new Set([row.pid, ...descendants.map((entry) => entry.pid)])];
  const descendantGroups = [...new Set(descendants
    .filter((entry) => entry.pgid > 0 && entry.pgid !== row.pid)
    .map((entry) => entry.pgid))];

  emitLifecycle("WATCHER_OWNED_TREE_IDENTIFIED", {
    reason,
    workerId: row.workerId,
    issueNumber: row.issueNumber,
    sessionId: row.sessionId,
    rootPid: row.pid,
    descendantPids: descendants.map((entry) => entry.pid),
    descendantProcessGroups: descendantGroups
  });

  for (const pgid of descendantGroups) {
    try {
      if (safeSignalGroup(pgid, "SIGTERM")) {
        emitLifecycle("WATCHER_OWNED_GROUP_TERM_SENT", { workerId: row.workerId, issueNumber: row.issueNumber, pgid });
      }
    } catch (error) {
      emitLifecycle("WATCHER_OWNED_GROUP_TERM_FAILED", { workerId: row.workerId, issueNumber: row.issueNumber, pgid, error: error?.message ?? String(error) });
    }
  }

  for (const entry of [...descendants].sort((a, b) => b.depth - a.depth)) {
    try {
      if (safeSignalPid(entry.pid, "SIGTERM")) {
        emitLifecycle("WATCHER_DESCENDANT_TERM_SENT", { workerId: row.workerId, issueNumber: row.issueNumber, pid: entry.pid, ppid: entry.ppid, pgid: entry.pgid });
      }
    } catch (error) {
      emitLifecycle("WATCHER_DESCENDANT_TERM_FAILED", { workerId: row.workerId, issueNumber: row.issueNumber, pid: entry.pid, error: error?.message ?? String(error) });
    }
  }

  try {
    if (safeSignalPid(row.pid, "SIGTERM")) {
      emitLifecycle("WATCHER_CHILD_TERM_SENT", { workerId: row.workerId, issueNumber: row.issueNumber, sessionId: row.sessionId, pid: row.pid });
    }
  } catch (error) {
    emitLifecycle("WATCHER_CHILD_TERM_FAILED", { workerId: row.workerId, issueNumber: row.issueNumber, sessionId: row.sessionId, pid: row.pid, error: error?.message ?? String(error) });
  }

  const deadline = Date.now() + WORKER_SHUTDOWN_GRACE_MS;
  while (Date.now() < deadline && targetPids.some(alive)) sleepSync(WORKER_SHUTDOWN_POLL_MS);

  const survivors = targetPids.filter(alive);
  for (const pid of survivors) {
    try {
      if (safeSignalPid(pid, "SIGKILL")) {
        emitLifecycle("WATCHER_OWNED_PID_KILL_ESCALATED", { workerId: row.workerId, issueNumber: row.issueNumber, pid });
      }
    } catch (error) {
      emitLifecycle("WATCHER_OWNED_PID_KILL_FAILED", { workerId: row.workerId, issueNumber: row.issueNumber, pid, error: error?.message ?? String(error) });
    }
  }

  const killDeadline = Date.now() + 1_000;
  while (Date.now() < killDeadline && targetPids.some(alive)) sleepSync(WORKER_SHUTDOWN_POLL_MS);
  const finalSurvivors = targetPids.filter(alive);

  emitLifecycle("WATCHER_OWNED_TREE_SHUTDOWN_COMPLETE", {
    reason,
    workerId: row.workerId,
    issueNumber: row.issueNumber,
    rootPid: row.pid,
    targetedPids: targetPids,
    survivorCount: finalSurvivors.length,
    survivors: finalSurvivors
  });

  return { workerId: row.workerId, rootPid: row.pid, targets: targetPids, survivors: finalSurvivors };
}

function stopOwnedWorkers(reason) {
  const rows = readLeaseRows().filter(ownedWorkerProcess);
  emitLifecycle("WATCHER_CHILD_SHUTDOWN_REQUESTED", {
    reason,
    workerCount: rows.length,
    workers: rows.map(({ workerId, issueNumber, sessionId, pid }) => ({ workerId, issueNumber, sessionId, pid }))
  });
  return rows.map((row) => stopOwnedWorker(row, reason));
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
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}:${get("second")}` };
}

function leaseSummary() {
  const active = [];
  const nowMs = Date.now();
  for (const lease of readLeaseRows()) {
    if (ownedWorkerProcess(lease)) {
      const progressMs = Date.parse(lease.lastProgressAt ?? "");
      active.push({
        worker_id: lease.workerId,
        issue_number: lease.issueNumber,
        pid: lease.pid,
        heartbeat_at: lease.heartbeatAt,
        last_progress_at: lease.lastProgressAt,
        progress_sequence: lease.progressSequence,
        progress_phase: lease.progressPhase,
        progress_age_seconds: Number.isFinite(progressMs) ? Math.max(0, Math.round((nowMs - progressMs) / 1000)) : null,
        child_pid: lease.childPid,
        child_process_group_id: lease.childProcessGroupId
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
  return { active, workerCount: Object.keys(ORCHESTRATION_V3.workers).length, allWorkersHealthy: healthReport.every((h) => h.healthy), workerHealth };
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
    active_workers: leaseInfo.active,
    workerCount: leaseInfo.workerCount,
    allWorkersHealthy: leaseInfo.allWorkersHealthy,
    healthSnapshot
  }) + "\n");
}

function spawnWatcher() {
  const args = ["scripts/orchestration-v3/watcher.mjs", ...process.argv.slice(2)];
  return spawn(process.execPath, args, { cwd: ORCHESTRATION_V3.runtime.root, env: { ...process.env }, stdio: "inherit" });
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

appendHeartbeat({ watcherPid: watcher.pid, caffeinatePid: caffeinate?.pid ?? null, caffeinateEnabled: process.platform === "darwin", event: "WATCHER_HOST_START" });

const heartbeatTimer = setInterval(() => {
  ensureGuard();
  appendHeartbeat({ watcherPid: watcher.pid, caffeinatePid: caffeinate?.pid ?? null, caffeinateEnabled: process.platform === "darwin" });
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
  appendHeartbeat({ watcherPid: watcher.pid, caffeinatePid: caffeinate?.pid ?? null, caffeinateEnabled: process.platform === "darwin", event: "WATCHER_HOST_STOP" });
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
