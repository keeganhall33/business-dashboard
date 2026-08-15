import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { ORCHESTRATION_V3 } from "./config.mjs";
import { inspectAllWorkers, inspectGitRoot } from "./preflight.mjs";

function run(exe, args, options = {}) {
  return execFileSync(exe, args, { encoding: "utf8", timeout: 120_000, ...options }).trim();
}
function bestEffort(exe, args, options = {}) {
  return spawnSync(exe, args, { encoding: "utf8", timeout: 60_000, ...options });
}
function requirePrepared() {
  const marker = path.join(ORCHESTRATION_V3.runtime.stateRoot, "prepared.json");
  if (!fs.existsSync(marker)) throw new Error("V3_NOT_PREPARED");
}
function requireHealthyFilesystems() {
  const runtime = inspectGitRoot(ORCHESTRATION_V3.runtime.root);
  if (!runtime.healthy) throw new Error(`RUNTIME_PREFLIGHT:${runtime.errors.join(",")}`);
  for (const [workerId, state] of Object.entries(inspectAllWorkers())) {
    if (!state.healthy) throw new Error(`WORKER_PREFLIGHT:${workerId}:${state.errors.join(",")}`);
  }
}
function ensureLabel(name, description) {
  const labels = JSON.parse(run("gh", ["label", "list", "--repo", ORCHESTRATION_V3.repo, "--limit", "200", "--json", "name"]));
  if (labels.some((l) => l.name === name)) return;
  run("gh", ["label", "create", name, "--repo", ORCHESTRATION_V3.repo, "--color", "ededed", "--description", description]);
}
function legacyPids() {
  const res = bestEffort("pgrep", ["-f", "scripts/orchestration-watch.mjs"]);
  if (res.status !== 0) return [];
  return String(res.stdout ?? "").trim().split(/\s+/).map(Number).filter((n) => Number.isInteger(n) && n > 0 && n !== process.pid);
}

requirePrepared();
requireHealthyFilesystems();
run(process.execPath, ["--check", "scripts/orchestration-v3/watcher.mjs"], { cwd: ORCHESTRATION_V3.runtime.root });
run(process.execPath, ["--check", "scripts/orchestration-v3/worker.mjs"], { cwd: ORCHESTRATION_V3.runtime.root });
run(process.execPath, ["--check", "scripts/orchestration-v3/doctor.mjs"], { cwd: ORCHESTRATION_V3.runtime.root });

ensureLabel(ORCHESTRATION_V3.queue.blocked, "Orchestration task blocked by deterministic runtime evidence");

const uid = process.getuid();
const oldLabel = "com.keegan.jeeves.orchestration-watch";
const newLabel = "com.keegan.jeeves.orchestration-v3";
const launchAgents = path.join(os.homedir(), "Library", "LaunchAgents");
const plist = path.join(launchAgents, `${newLabel}.plist`);
fs.mkdirSync(launchAgents, { recursive: true });

for (const pid of legacyPids()) {
  try { process.kill(pid, "SIGTERM"); } catch {}
}
bestEffort("launchctl", ["bootout", `gui/${uid}/${oldLabel}`]);
bestEffort("launchctl", ["bootout", `gui/${uid}/${newLabel}`]);

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n<key>Label</key><string>${newLabel}</string>\n<key>ProgramArguments</key><array><string>${process.execPath}</string><string>${path.join(ORCHESTRATION_V3.runtime.root, "scripts", "orchestration-v3", "watcher.mjs")}</string><string>--interval</string><string>60</string></array>\n<key>WorkingDirectory</key><string>${ORCHESTRATION_V3.runtime.root}</string>\n<key>RunAtLoad</key><true/>\n<key>KeepAlive</key><true/>\n<key>ThrottleInterval</key><integer>10</integer>\n<key>StandardOutPath</key><string>${path.join(ORCHESTRATION_V3.runtime.logRoot, "jeeves-orchestration-v3.out.log")}</string>\n<key>StandardErrorPath</key><string>${path.join(ORCHESTRATION_V3.runtime.logRoot, "jeeves-orchestration-v3.err.log")}</string>\n<key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>\n</dict></plist>\n`;
fs.writeFileSync(plist, xml);
run("plutil", ["-lint", plist]);
run("launchctl", ["bootstrap", `gui/${uid}`, plist]);
run("launchctl", ["kickstart", "-k", `gui/${uid}/${newLabel}`]);

await new Promise((resolve) => setTimeout(resolve, 4000));
const doctor = spawnSync(process.execPath, ["scripts/orchestration-v3/doctor.mjs"], { cwd: ORCHESTRATION_V3.runtime.root, encoding: "utf8", timeout: 60_000 });
process.stdout.write(doctor.stdout ?? "");
process.stderr.write(doctor.stderr ?? "");
if (doctor.status !== 0) throw new Error("V3_DOCTOR_FAILED_AFTER_CUTOVER");

fs.writeFileSync(path.join(ORCHESTRATION_V3.runtime.stateRoot, "activated.json"), JSON.stringify({ activatedAt: new Date().toISOString(), label: newLabel, plist }, null, 2) + "\n");
console.log(JSON.stringify({ status: "ACTIVATED", launchAgent: newLabel, plist }));
