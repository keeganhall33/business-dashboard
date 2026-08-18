import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ORCHESTRATION_V3 } from "./config.mjs";

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
  const pid = Number(lease?.pid);
  const pidAlive = alive(pid);
  return {
    worker_id: workerId,
    issue_number: Number(lease?.issueNumber) || null,
    pid: Number.isInteger(pid) && pid > 0 ? pid : null,
    pid_alive: pidAlive,
    started_at: lease?.startedAt ?? null,
    log_path: lease?.logPath ?? null,
    process_command: pidAlive ? processCommand(pid) : null,
    lease_path: fs.existsSync(leasePath) ? leasePath : null
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

function githubQueueSnapshot(enabled) {
  if (!enabled) return { checked: false, running: [], ready: [], error: null };
  const common = ["issue", "list", "--repo", ORCHESTRATION_V3.repo, "--state", "open", "--label", ORCHESTRATION_V3.queue.base, "--limit", "100"];
  const running = ghJson([...common, "--label", ORCHESTRATION_V3.queue.running, "--json", "number,title,labels"]);
  const ready = ghJson([...common, "--label", ORCHESTRATION_V3.queue.ready, "--json", "number,title,labels"]);
  return {
    checked: true,
    running: running.data.map((item) => ({ number: Number(item.number), title: item.title })),
    ready: ready.data.map((item) => ({ number: Number(item.number), title: item.title })),
    error: running.error ?? ready.error ?? null
  };
}

export function buildLivenessReport({ includeGithub = false, launchdLabel = "com.keegan.jeeves.orchestration-v3" } = {}) {
  const workers = Object.keys(ORCHESTRATION_V3.workers).map(workerLeaseSnapshot);
  const liveWorkers = workers.filter((worker) => worker.pid_alive);
  const github = githubQueueSnapshot(includeGithub);
  const runningIssuesWithLiveLease = new Set(workers.filter((worker) => worker.pid_alive && worker.issue_number).map((worker) => worker.issue_number));
  return {
    generated_at: new Date().toISOString(),
    runtime_root: ORCHESTRATION_V3.runtime.root,
    state_root: ORCHESTRATION_V3.runtime.stateRoot,
    model: ORCHESTRATION_V3.model,
    watcher: launchdSnapshot(launchdLabel),
    workers,
    github,
    summary: {
      live_worker_count: liveWorkers.length,
      live_worker_ids: liveWorkers.map((worker) => worker.worker_id),
      live_issue_numbers: liveWorkers.map((worker) => worker.issue_number).filter(Boolean),
      running_claims_without_live_lease: github.checked
        ? github.running.map((item) => item.number).filter((issueNumber) => !runningIssuesWithLiveLease.has(issueNumber))
        : [],
      ready_issue_numbers: github.checked ? github.ready.map((item) => item.number) : []
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
