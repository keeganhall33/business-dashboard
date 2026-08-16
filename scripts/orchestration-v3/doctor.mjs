import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ORCHESTRATION_V3 } from "./config.mjs";
import { inspectAllWorkers, inspectGitRoot } from "./preflight.mjs";

function command(name, args, options = {}) {
  try {
    return { ok: true, stdout: execFileSync(name, args, { encoding: "utf8", timeout: 30_000, ...options }).trim() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function issueList(label) {
  const res = command("gh", ["issue", "list", "--repo", ORCHESTRATION_V3.repo, "--state", "open", "--label", label, "--limit", "100", "--json", "number,title,labels"]);
  if (!res.ok) return { ok: false, issues: [], error: res.error };
  return { ok: true, issues: JSON.parse(res.stdout || "[]") };
}

function processList(pattern) {
  const res = command("pgrep", ["-fl", pattern]);
  if (!res.ok) return [];
  return res.stdout ? res.stdout.split("\n") : [];
}

const runtime = inspectGitRoot(ORCHESTRATION_V3.runtime.root);
const workers = inspectAllWorkers();
const ready = issueList(ORCHESTRATION_V3.queue.ready);
const running = issueList(ORCHESTRATION_V3.queue.running);
const ollama = command("ollama", ["ps"]);
const watcherProcesses = processList("orchestration-v3/watcher.mjs");
const legacyProcesses = {
  WATCHER: processList("scripts/orchestration-watch.mjs"),
  DETACHED_LAUNCHER: processList("scripts/launch-orchestration-nl-detached.mjs"),
  RUNNER: processList("scripts/orchestration-run-issue-openclaw.mjs")
};
const legacyPlist = path.join(os.homedir(), "Library", "LaunchAgents", "com.keegan.jeeves.orchestration-watch.plist");
const legacyProcessCount = Object.values(legacyProcesses).reduce((sum, values) => sum + values.length, 0);

const report = {
  CONTROL_PLANE: "UNKNOWN",
  VERSION: ORCHESTRATION_V3.version,
  REPO: ORCHESTRATION_V3.repo,
  MODEL: ORCHESTRATION_V3.model.id,
  CLOUD_FALLBACK_ALLOWED: ORCHESTRATION_V3.model.cloudFallbackAllowed,
  RUNTIME: runtime,
  WORKERS: workers,
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

const workerHealthy = Object.values(workers).every((w) => w.healthy);
const exactlyOneWatcher = watcherProcesses.length === 1;
const legacyRetired = legacyProcessCount === 0 && !fs.existsSync(legacyPlist);
report.CONTROL_PLANE = runtime.healthy && workerHealthy && exactlyOneWatcher && legacyRetired ? "HEALTHY" : "DEGRADED";

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = report.CONTROL_PLANE === "HEALTHY" ? 0 : 2;
