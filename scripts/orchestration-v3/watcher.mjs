import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { ORCHESTRATION_V3, workerForStream } from "./config.mjs";
import { inspectGitRoot } from "./preflight.mjs";

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const intervalSeconds = Number(arg("--interval", "60"));
if (!Number.isFinite(intervalSeconds) || intervalSeconds < 20) throw new Error("--interval must be >=20");

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", timeout: 30_000 }).trim();
}
function issue(number) {
  return JSON.parse(gh(["issue", "view", String(number), "--repo", ORCHESTRATION_V3.repo, "--json", "number,body,labels,title"]));
}
function readyIssues() {
  return JSON.parse(gh(["issue", "list", "--repo", ORCHESTRATION_V3.repo, "--state", "open", "--label", ORCHESTRATION_V3.queue.base, "--label", ORCHESTRATION_V3.queue.ready, "--limit", "100", "--json", "number,title"]));
}
function runningIssues() {
  return JSON.parse(gh(["issue", "list", "--repo", ORCHESTRATION_V3.repo, "--state", "open", "--label", ORCHESTRATION_V3.queue.base, "--label", ORCHESTRATION_V3.queue.running, "--limit", "100", "--json", "number,title"]));
}
function field(body, name) {
  const m = String(body ?? "").match(new RegExp(`\\*\\*${name}:\\*\\*\\s*([^\\n]+)`, "i"));
  return m ? m[1].trim() : null;
}
function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (err) { return err?.code === "EPERM"; }
}
function leasePath(workerId) {
  return path.join(ORCHESTRATION_V3.runtime.stateRoot, "leases", `${workerId}.json`);
}
function readLease(workerId) {
  try { return JSON.parse(fs.readFileSync(leasePath(workerId), "utf8")); } catch { return null; }
}
function issueIsRunning(issueNumber) {
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) return false;
  try {
    const snapshot = issue(issueNumber);
    return (snapshot.labels ?? []).some((label) => label.name === ORCHESTRATION_V3.queue.running);
  } catch {
    return false;
  }
}
function reconcileLease(workerId) {
  const lease = readLease(workerId);
  if (!lease) return null;
  const pidAlive = alive(Number(lease.pid));
  const issueRunning = issueIsRunning(Number(lease.issueNumber));
  if (pidAlive && issueRunning) return lease;
  try { fs.unlinkSync(leasePath(workerId)); } catch {}
  console.log(JSON.stringify({
    event: "STALE_LEASE_RECLAIMED",
    workerId,
    issueNumber: Number(lease.issueNumber) || null,
    pid: Number(lease.pid) || null,
    pidAlive,
    issueRunning
  }));
  return null;
}
function activeLeaseIssueNumbers() {
  const active = new Set();
  for (const workerId of Object.keys(ORCHESTRATION_V3.workers)) {
    const lease = reconcileLease(workerId);
    if (lease) active.add(Number(lease.issueNumber));
  }
  return active;
}
function reconcileRunningClaims() {
  const activeIssues = activeLeaseIssueNumbers();
  for (const candidate of runningIssues()) {
    if (activeIssues.has(Number(candidate.number))) continue;
    gh(["issue", "edit", String(candidate.number), "--repo", ORCHESTRATION_V3.repo, "--remove-label", ORCHESTRATION_V3.queue.running, "--add-label", ORCHESTRATION_V3.queue.ready]);
    console.log(JSON.stringify({
      event: "STALE_RUNNING_REQUEUED",
      issueNumber: Number(candidate.number),
      reason: "NO_AUTHORITATIVE_LIVE_LEASE"
    }));
  }
}
function claim(issueNumber) {
  gh(["issue", "edit", String(issueNumber), "--repo", ORCHESTRATION_V3.repo, "--remove-label", ORCHESTRATION_V3.queue.ready, "--add-label", ORCHESTRATION_V3.queue.running]);
}
function launch(workerId, issueNumber) {
  fs.mkdirSync(path.dirname(leasePath(workerId)), { recursive: true });
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
  fs.writeFileSync(leasePath(workerId), JSON.stringify({ workerId, issueNumber, pid: child.pid, startedAt: new Date().toISOString(), logPath }, null, 2) + "\n");
  child.unref();
  fs.closeSync(fd);
  console.log(JSON.stringify({ event: "CLAIMED", workerId, issueNumber, pid: child.pid, logPath }));
}

const runtime = inspectGitRoot(ORCHESTRATION_V3.runtime.root);
if (!runtime.healthy) throw new Error(`CANONICAL_RUNTIME_UNHEALTHY:${runtime.errors.join(",")}`);

async function poll() {
  reconcileRunningClaims();
  const ready = readyIssues();
  for (const candidate of ready) {
    const snapshot = issue(candidate.number);
    const workerId = workerForStream(field(snapshot.body, "stream"));
    if (!workerId) {
      console.error(JSON.stringify({ event: "UNMAPPED_STREAM", issueNumber: candidate.number, stream: field(snapshot.body, "stream") }));
      continue;
    }
    if (reconcileLease(workerId)) continue;
    claim(candidate.number);
    try {
      launch(workerId, candidate.number);
    } catch (err) {
      gh(["issue", "edit", String(candidate.number), "--repo", ORCHESTRATION_V3.repo, "--remove-label", ORCHESTRATION_V3.queue.running, "--add-label", ORCHESTRATION_V3.queue.blocked]);
      console.error(JSON.stringify({ event: "LAUNCH_FAILED", workerId, issueNumber: candidate.number, error: err instanceof Error ? err.message : String(err) }));
    }
  }
}

console.log(JSON.stringify({ event: "WATCHER_START", version: 3, runtime: ORCHESTRATION_V3.runtime.root, model: ORCHESTRATION_V3.model.id }));
for (;;) {
  try { await poll(); } catch (err) { console.error(JSON.stringify({ event: "POLL_FAILED", error: err instanceof Error ? err.message : String(err) })); }
  await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
}
