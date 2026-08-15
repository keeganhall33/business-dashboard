import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const REPO = "keeganhall33/business-dashboard";
const REQUEUE = [413, 414, 416, 447];
const LEGACY_TERMINAL_LABELS = ["orch:awaiting_review", "orch:blocked", "orch:running", "orch:awaiting_human_approval"];
const V3_LABEL = "com.keegan.jeeves.orchestration-v3";
const RUNTIME = path.join(os.homedir(), ".openclaw", "runtime-v3", "business-dashboard");

function run(exe, args, options = {}) {
  return execFileSync(exe, args, { encoding: "utf8", timeout: 180_000, ...options }).trim();
}
function runLive(exe, args, options = {}) {
  const result = spawnSync(exe, args, { stdio: "inherit", timeout: 900_000, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${exe} ${args.join(" ")} failed with exit ${result.status}`);
}
function git(cwd, args) { return run("git", args, { cwd }); }
function labels(issueNumber) {
  const snapshot = JSON.parse(run("gh", ["issue", "view", String(issueNumber), "--repo", REPO, "--json", "labels"]));
  return new Set((snapshot.labels ?? []).map((label) => label.name));
}
function requeue(issueNumber) {
  const present = labels(issueNumber);
  for (const label of LEGACY_TERMINAL_LABELS) {
    if (!present.has(label)) continue;
    run("gh", ["issue", "edit", String(issueNumber), "--repo", REPO, "--remove-label", label]);
  }
  if (!present.has("orch:ready")) run("gh", ["issue", "edit", String(issueNumber), "--repo", REPO, "--add-label", "orch:ready"]);
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

const sourceRoot = git(process.cwd(), ["rev-parse", "--show-toplevel"]);
if (path.resolve(sourceRoot) !== path.resolve(process.cwd())) throw new Error(`RUN_FROM_REPO_ROOT:${sourceRoot}`);

console.log("=== V3 BOOTSTRAP: FETCH CLEAN MAIN ===");
git(sourceRoot, ["fetch", "origin", "main"]);
git(sourceRoot, ["worktree", "prune"]);
const mainSha = git(sourceRoot, ["rev-parse", "origin/main"]);
const tempRoot = path.join("/tmp", `jeeves-v3-bootstrap-${process.pid}`);
if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
git(sourceRoot, ["worktree", "add", "--detach", tempRoot, "origin/main"]);

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
    "scripts/orchestration-v3/bootstrap-host.mjs"
  ]) runLive(process.execPath, ["--check", file], { cwd: tempRoot });
  runLive(process.execPath, ["--test", "test/orchestration-v3-control-plane.test.mjs"], { cwd: tempRoot });

  console.log("=== V3 BOOTSTRAP: SAFE PREPARE ===");
  runLive(process.execPath, ["scripts/orchestration-v3/prepare-host.mjs"], { cwd: tempRoot });

  console.log("=== V3 BOOTSTRAP: ACTIVATE SINGLE WATCHER ===");
  runLive(process.execPath, ["scripts/orchestration-v3/activate-host.mjs"], { cwd: RUNTIME });

  console.log("=== V3 BOOTSTRAP: RELEASE FOUR LANES ===");
  for (const issueNumber of REQUEUE) requeue(issueNumber);

  // Restart the already-installed V3 watcher so it polls the freshly released queue immediately.
  run("launchctl", ["kickstart", "-k", `gui/${process.getuid()}/${V3_LABEL}`]);
  await sleep(7000);

  console.log("=== V3 BOOTSTRAP: DOCTOR ===");
  runLive(process.execPath, ["scripts/orchestration-v3/doctor.mjs"], { cwd: RUNTIME });

  const running = JSON.parse(run("gh", ["issue", "list", "--repo", REPO, "--state", "open", "--label", "orch:running", "--limit", "20", "--json", "number,title"]));
  console.log(JSON.stringify({
    status: "V3_CUTOVER_COMPLETE",
    mainSha,
    runtime: RUNTIME,
    requeued: REQUEUE,
    runningIssues: running.map((item) => item.number),
    note: "4/4 acceptance remains evidence-gated until provider/model/cloud/worktree proof completes."
  }, null, 2));
} finally {
  try { git(sourceRoot, ["worktree", "remove", "--force", tempRoot]); } catch {}
  try { git(sourceRoot, ["worktree", "prune"]); } catch {}
}
