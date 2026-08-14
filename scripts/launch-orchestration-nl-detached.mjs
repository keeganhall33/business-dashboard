import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const repo = arg("--repo");
const issue = arg("--issue");
const timeout = arg("--timeout") ?? "600";
const cloudAgentId = arg("--cloud-agent-id") ?? "main";
const localAgentId = arg("--local-agent-id") ?? null;
const lockPath = arg("--worker-lock-path") ?? null;

if (!repo || !issue) {
  console.error(
    "Usage: node scripts/launch-orchestration-nl-detached.mjs --repo owner/repo --issue N [--timeout 600] [--cloud-agent-id main] [--local-agent-id local-a] [--worker-lock-path /path]"
  );
  process.exit(2);
}

const logDir = path.join(os.homedir(), "Library", "Logs");
fs.mkdirSync(logDir, { recursive: true });
const logPath = path.join(logDir, `jeeves-orchestration-nl-${issue}.log`);
const fd = fs.openSync(logPath, "a");

const env = { ...process.env };
// Cloud/default agent stays explicit.
env.ORCH_CLOUD_AGENT_ID = env.ORCH_CLOUD_AGENT_ID ?? cloudAgentId;

// Optional per-worker local agent identity.
if (localAgentId) env.ORCH_LOCAL_AGENT_ID = localAgentId;
// Allow disabling local routing by omitting ORCH_LOCAL_ROUTING_ENABLED.

// Optional lock path for per-worker one-in-flight enforcement.
if (lockPath) env.ORCH_WORKER_LOCK_PATH = lockPath;

const child = spawn(
  process.execPath,
  [
    "scripts/orchestration-run-issue-openclaw.mjs",
    "--repo",
    repo,
    "--issue",
    String(issue),
    "--agent",
    String(cloudAgentId),
    "--timeout",
    String(timeout)
  ],
  {
    detached: true,
    stdio: ["ignore", fd, fd],
    cwd: process.cwd(),
    env
  }
);

// The watcher creates the lock as a short-lived launch reservation. Once the
// detached worker exists, transfer durable lock ownership to that worker PID so
// orchestration-run-issue-openclaw.mjs can release its own lock on exit.
if (lockPath) {
  if (!Number.isInteger(child.pid) || child.pid <= 0) {
    try { child.kill("SIGTERM"); } catch {}
    fs.closeSync(fd);
    throw new Error(`Detached worker launched without a valid pid for issue #${issue}`);
  }
  try {
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        pid: child.pid,
        issueNumber: Number(issue),
        ownerType: "worker",
        createdAt: new Date().toISOString()
      }) + "\n",
      "utf8"
    );
  } catch (err) {
    try { child.kill("SIGTERM"); } catch {}
    fs.closeSync(fd);
    throw err;
  }
}

child.unref();
fs.closeSync(fd);
console.log(`Detached isolated NL execution started for issue #${issue}; pid=${child.pid}; log=${logPath}`);
