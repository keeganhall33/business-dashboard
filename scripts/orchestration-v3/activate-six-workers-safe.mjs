import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const RUNTIME = path.join(os.homedir(), ".openclaw", "runtime-v3", "business-dashboard");
const SERVICE = "com.keegan.jeeves.orchestration-v3";
const PLIST = path.join(os.homedir(), "Library", "LaunchAgents", `${SERVICE}.plist`);

function run(exe, args, options = {}) {
  return execFileSync(exe, args, { encoding: "utf8", timeout: 120_000, ...options }).trim();
}
function ensureRuntimeSafeBeforeActivation() {
  if (!fs.existsSync(RUNTIME)) return;
  const root = run("git", ["rev-parse", "--show-toplevel"], { cwd: RUNTIME });
  if (path.resolve(root) !== path.resolve(RUNTIME)) throw new Error(`REFUSE_UNKNOWN_RUNTIME_PATH:${RUNTIME}`);
  const dirty = run("git", ["status", "--porcelain"], { cwd: RUNTIME });
  if (dirty) throw new Error("REFUSE_DIRTY_RUNTIME_BEFORE_SERVICE_RESTART");
}
function restoreWatcherBestEffort() {
  if (!fs.existsSync(PLIST)) return { restored: false, reason: "PLIST_MISSING" };
  const uid = process.getuid();
  spawnSync("launchctl", ["bootout", `gui/${uid}/${SERVICE}`], { encoding: "utf8", timeout: 30_000 });
  const bootstrap = spawnSync("launchctl", ["bootstrap", `gui/${uid}`, PLIST], { encoding: "utf8", timeout: 30_000 });
  const kickstart = spawnSync("launchctl", ["kickstart", "-k", `gui/${uid}/${SERVICE}`], { encoding: "utf8", timeout: 30_000 });
  return {
    restored: bootstrap.status === 0 && kickstart.status === 0,
    bootstrapStatus: bootstrap.status,
    kickstartStatus: kickstart.status,
    bootstrapError: String(bootstrap.stderr ?? "").trim() || null,
    kickstartError: String(kickstart.stderr ?? "").trim() || null
  };
}

if (!fs.existsSync(PLIST)) throw new Error(`V3_LAUNCHAGENT_PLIST_MISSING:${PLIST}`);
ensureRuntimeSafeBeforeActivation();

const child = spawnSync(process.execPath, [path.join(path.dirname(new URL(import.meta.url).pathname), "activate-six-workers-incremental.mjs")], {
  cwd: process.cwd(),
  encoding: "utf8",
  timeout: 600_000
});
process.stdout.write(child.stdout ?? "");
process.stderr.write(child.stderr ?? "");

if (child.error || child.status !== 0) {
  const restore = restoreWatcherBestEffort();
  console.error(JSON.stringify({
    event: "SIX_WORKER_INCREMENTAL_ACTIVATION_FAILED_SAFE",
    childStatus: child.status,
    childError: child.error instanceof Error ? child.error.message : child.error ?? null,
    watcherRestore: restore
  }));
  process.exitCode = child.status || 1;
} else {
  console.log(JSON.stringify({ status: "SIX_WORKER_SAFE_ACTIVATION_COMPLETE" }));
}
