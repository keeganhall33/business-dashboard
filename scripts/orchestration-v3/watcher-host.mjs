import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { ORCHESTRATION_V3 } from "./config.mjs";

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === "EPERM";
  }
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
  const leasesDir = path.join(ORCHESTRATION_V3.runtime.stateRoot, "leases");
  let names = [];
  try {
    names = fs.readdirSync(leasesDir).filter((name) => name.endsWith(".json"));
  } catch {}

  const active = [];
  for (const name of names) {
    try {
      const lease = JSON.parse(fs.readFileSync(path.join(leasesDir, name), "utf8"));
      const pid = Number(lease?.pid);
      if (alive(pid)) {
        active.push({
          worker_id: lease?.workerId ?? name.replace(/\.json$/, ""),
          issue_number: Number(lease?.issueNumber) || null,
          pid
        });
      }
    } catch {}
  }
  return active;
}

function heartbeatPath() {
  return path.join(ORCHESTRATION_V3.runtime.stateRoot, "health", "watcher-heartbeats.ndjson");
}

function appendHeartbeat({ watcherPid, caffeinatePid, caffeinateEnabled, event = "HEARTBEAT" }) {
  const file = heartbeatPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const now = new Date();
  const pacific = pacificParts(now);
  const workers = leaseSummary();
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
    active_worker_count: workers.length,
    active_workers: workers
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
  const child = spawn(caffeinatePath, ["-i", "-w", String(watcherPid)], {
    stdio: "ignore"
  });
  return child;
}

const watcher = spawnWatcher();
if (!Number.isInteger(watcher.pid) || watcher.pid <= 0) throw new Error("V3_WATCHER_HOST_NO_WATCHER_PID");
let caffeinate = spawnIdleSleepGuard(watcher.pid);
let stopping = false;

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
  stopping = true;
  try { watcher.kill(signal); } catch {}
  try { caffeinate?.kill(signal); } catch {}
}
process.on("SIGTERM", () => forward("SIGTERM"));
process.on("SIGINT", () => forward("SIGINT"));
process.on("SIGHUP", () => forward("SIGHUP"));

watcher.on("exit", (code, signal) => {
  stopping = true;
  clearInterval(heartbeatTimer);
  appendHeartbeat({
    watcherPid: watcher.pid,
    caffeinatePid: caffeinate?.pid ?? null,
    caffeinateEnabled: process.platform === "darwin",
    event: "WATCHER_HOST_STOP"
  });
  try { caffeinate?.kill("SIGTERM"); } catch {}
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
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
