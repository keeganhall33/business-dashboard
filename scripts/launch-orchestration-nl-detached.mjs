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
if (!repo || !issue) {
  console.error("Usage: node scripts/launch-orchestration-nl-detached.mjs --repo owner/repo --issue N [--timeout 600]");
  process.exit(2);
}

const logDir = path.join(os.homedir(), "Library", "Logs");
fs.mkdirSync(logDir, { recursive: true });
const logPath = path.join(logDir, `jeeves-orchestration-nl-${issue}.log`);
const fd = fs.openSync(logPath, "a");

const nlAgent = process.env.ORCH_NL_AGENT_ID ?? "local";

const child = spawn(process.execPath, [
  "scripts/orchestration-run-issue-openclaw.mjs",
  "--repo", repo,
  "--issue", String(issue),
  "--agent", String(nlAgent),
  "--timeout", String(timeout)
], {
  detached: true,
  stdio: ["ignore", fd, fd],
  cwd: process.cwd(),
  env: process.env
});

child.unref();
fs.closeSync(fd);
console.log(`Detached isolated NL execution started for issue #${issue}; pid=${child.pid}; log=${logPath}`);
