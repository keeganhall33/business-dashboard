import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const REPO = "keeganhall33/business-dashboard";
const REQUEUE = [844, 845, 846, 852, 847, 848, 837, 838, 839];
const WORKER_IDS = ["local-a", "local-b", "local-c", "local-d", "local-e", "local-f"];
const LEGACY_TERMINAL_LABELS = ["orch:awaiting_review", "orch:blocked", "orch:running", "orch:awaiting_human_approval"];
const V3_LABEL = "com.keegan.jeeves.orchestration-v3";
const LEGACY_LABEL = "com.keegan.jeeves.orchestration-watch";
const OPENCLAW_ROOT = path.join(os.homedir(), ".openclaw");
const RUNTIME = path.join(OPENCLAW_ROOT, "runtime-v3", "business-dashboard");
const WORKTREE_ROOT = path.join(OPENCLAW_ROOT, "worktrees");
const LEGACY_PROCESS_PATTERNS = [
  "scripts/orchestration-watch.mjs",
  "scripts/launch-orchestration-nl-detached.mjs",
  "scripts/orchestration-run-issue-openclaw.mjs",
  "openclaw agent --local --agent local-"
];

function run(exe, args, options = {}) {
  return execFileSync(exe, args, { encoding: "utf8", timeout: 180_000, ...options }).trim();
}
function runLive(exe, args, options = {}) {
  const result = spawnSync(exe, args, { stdio: "inherit", timeout: 900_000, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${exe} ${args.join(" ")} failed with exit ${result.status}`);
}
function git(cwd, args) { return run("git", args, { cwd }); }
function issueSnapshot(issueNumber) {
  return JSON.parse(run("gh", ["issue", "view", String(issueNumber), "--repo", REPO, "--json", "state,labels"]));
}
function requeue(issueNumber) {
  const snapshot = issueSnapshot(issueNumber);
  if (snapshot.state !== "OPEN") {
    console.log(JSON.stringify({ status: "SKIP_CLOSED_REQUEUE", issueNumber, state: snapshot.state }));
    return false;
  }
  const present = new Set((snapshot.labels ?? []).map((label) => label.name));
  for (const label of LEGACY_TERMINAL_LABELS) {
    if (!present.has(label)) continue;
    run("gh", ["issue", "edit", String(issueNumber), "--repo", REPO, "--remove-label", label]);
  }
  if (!present.has("orch:ready")) run("gh", ["issue", "edit", String(issueNumber), "--repo", REPO, "--add-label", "orch:ready"]);
  return true;
}
function bestEffort(exe, args, options = {}) {
  return spawnSync(exe, args, { encoding: "utf8", timeout: 60_000, ...options });
}
function matchingPids(pattern) {
  const result = bestEffort("pgrep", ["-f", pattern]);
  if (result.status !== 0) return [];
  return String(result.stdout ?? "").trim().split(/\s+/).map(Number).filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
}
function terminatePattern(pattern) {
  const initial = matchingPids(pattern);
  for (const pid of initial) {
    try { process.kill(pid, "SIGTERM"); } catch {}
  }
  return initial;
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function hydrateWorkerToolchain(workerId) {
  const worktree = path.join(WORKTREE_ROOT, workerId);
  const lockfile = path.join(worktree, "package-lock.json");
  if (!fs.existsSync(lockfile)) throw new Error(`PACKAGE_LOCK_MISSING:${workerId}:${lockfile}`);
  runLive("npm", ["ci", "--no-audit", "--no-fund", "--prefer-offline"], { cwd: worktree });
  const nextBin = path.join(worktree, "node_modules", ".bin", "next");
  if (!fs.existsSync(nextBin)) throw new Error(`NEXT_BINARY_MISSING_AFTER_NPM_CI:${workerId}:${nextBin}`);
  const status = git(worktree, ["status", "--short"]);
  if (status) throw new Error(`TOOLCHAIN_HYDRATION_DIRTIED_WORKTREE:${workerId}:${status}`);
  console.log(JSON.stringify({ status: "TOOLCHAIN_HYDRATED", workerId, worktree, nextBin }));
}

const sourceRoot = git(process.cwd(), ["rev-parse", "--show-toplevel"]);
if (path.resolve(sourceRoot) !== path.resolve(process.cwd())) throw new Error(`RUN_FROM_REPO_ROOT:${sourceRoot}`);

console.log("=== V3 BOOTSTRAP: FETCH CLEAN MAIN ===");
git(sourceRoot, ["fetch", "origin", "main"]);
git(sourceRoot, ["worktree", "prune"]);
const mainSha = git(sourceRoot, ["rev-parse", "refs/remotes/origin/main"]);
const tempRoot = path.join("/tmp", `jeeves-v3-bootstrap-${process.pid}`);
if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
git(sourceRoot, ["worktree", "add", "--detach", tempRoot, "refs/remotes/origin/main"]);

try {
  console.log(`V3_MAIN_SHA=${mainSha}`);
  console.log("=== V3 BOOTSTRAP: STATIC GATE ===");
  for (const file of [
    "scripts/orchestration-v3/config.mjs",
    "scripts/orchestration-v3/preflight.mjs",
    "scripts/orchestration-v3/watcher.mjs",
    "scripts/orchestration-v3/worker.mjs",
    "scripts/orchestration-v3/doctor.mjs",
    "scripts/orchestration-v3/prepare-host.mjs",
    "scripts/orchestration-v3/activate-host.mjs",
    "scripts/orchestration-v3/bootstrap-host.mjs",
    "scripts/orchestration-v3/execution-evidence.mjs"
  ]) runLive(process.execPath, ["--check", file], { cwd: tempRoot });
  runLive(process.execPath, ["--test", "test/orchestration-v3-control-plane.test.mjs", "test/orchestration-v3-mass-deletion-guard.test.mjs"], { cwd: tempRoot });

  console.log("=== V3 BOOTSTRAP: QUIESCE EXISTING CONTROL PLANE ===");
  const uid = process.getuid();
  bestEffort("launchctl", ["bootout", `gui/${uid}/${V3_LABEL}`]);
  bestEffort("launchctl", ["bootout", `gui/${uid}/${LEGACY_LABEL}`]);
  const terminated = Object.fromEntries(LEGACY_PROCESS_PATTERNS.map((pattern) => [pattern, terminatePattern(pattern)]));
  terminated.v3Watcher = terminatePattern("scripts/orchestration-v3/watcher.mjs");
  terminated.v3Workers = terminatePattern("scripts/orchestration-v3/worker.mjs");
  await sleep(1500);
  for (const pattern of [...LEGACY_PROCESS_PATTERNS, "scripts/orchestration-v3/watcher.mjs", "scripts/orchestration-v3/worker.mjs"]) {
    for (const pid of matchingPids(pattern)) {
      try { process.kill(pid, "SIGKILL"); } catch {}
    }
  }
  console.log(JSON.stringify({ status: "QUIESCED", terminated }, null, 2));

  console.log("=== V3 BOOTSTRAP: SAFE PREPARE ===");
  runLive(process.execPath, ["scripts/orchestration-v3/prepare-host.mjs"], { cwd: tempRoot });

  console.log("=== V3 BOOTSTRAP: HYDRATE SIX LOCAL TOOLCHAINS ===");
  for (const workerId of WORKER_IDS) hydrateWorkerToolchain(workerId);

  console.log("=== V3 BOOTSTRAP: RELEASE SIX LANES + READY RESERVE BEFORE WATCHER START ===");
  const requeued = REQUEUE.filter((issueNumber) => requeue(issueNumber));

  console.log("=== V3 BOOTSTRAP: ACTIVATE SINGLE WATCHER AGAINST POPULATED QUEUE ===");
  runLive(process.execPath, ["scripts/orchestration-v3/activate-host.mjs"], { cwd: RUNTIME });

  await sleep(7000);

  console.log("=== V3 BOOTSTRAP: DOCTOR ===");
  runLive(process.execPath, ["scripts/orchestration-v3/doctor.mjs"], { cwd: RUNTIME });

  const running = JSON.parse(run("gh", ["issue", "list", "--repo", REPO, "--state", "open", "--label", "orch:running", "--limit", "20", "--json", "number,title"]));
  const stillReady = requeued.filter((issueNumber) => {
    const labels = new Set((issueSnapshot(issueNumber).labels ?? []).map((label) => label.name));
    return labels.has("orch:ready");
  });
  const initialClaimObservation = {
    observedWithinBootstrapWindow: running.length > 0 || stillReady.length < requeued.length,
    runningCount: running.length,
    requeuedCount: requeued.length,
    stillReadyCount: stillReady.length,
    note: "Diagnostic only. Watcher poll cadence may exceed bootstrap observation window; doctor/process health is authoritative for cutover success."
  };

  console.log(JSON.stringify({
    status: "V3_CUTOVER_COMPLETE",
    mainSha,
    runtime: RUNTIME,
    requeued,
    runningIssues: running.map((item) => item.number),
    stillReady,
    initialClaimObservation,
    note: "Six-worker local-only execution remains evidence-gated until provider/model/cloud/worktree proof completes."
  }, null, 2));
} finally {
  try { git(sourceRoot, ["worktree", "remove", "--force", tempRoot]); } catch {}
  try { git(sourceRoot, ["worktree", "prune"]); } catch {}
}
