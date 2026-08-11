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
if (!repo || !issue) {
  console.error("Usage: node scripts/launch-orchestration-agent-detached.mjs --repo owner/repo --issue N");
  process.exit(2);
}

const logDir = path.join(os.homedir(), "Library", "Logs");
fs.mkdirSync(logDir, { recursive: true });
const logPath = path.join(logDir, `jeeves-orchestration-agent-${issue}.log`);
const fd = fs.openSync(logPath, "a");

const child = spawn(process.execPath, [
  "scripts/run-orchestration-issue-agent.mjs",
  "--repo", repo,
  "--issue", String(issue)
], {
  detached: true,
  stdio: ["ignore", fd, fd],
  cwd: process.cwd(),
  env: process.env
});

child.unref();
fs.closeSync(fd);

console.log(`Detached Jeeves agent execution started for issue #${issue}; pid=${child.pid}; log=${logPath}`);
