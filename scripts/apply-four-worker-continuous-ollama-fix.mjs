import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const repoDir = process.cwd();
const repo = "keeganhall33/business-dashboard";
const home = os.homedir();

function replaceOnce(file, oldText, newText, label) {
  const s = fs.readFileSync(file, "utf8");
  if (s.includes(newText)) return false;
  if (!s.includes(oldText)) throw new Error(`Missing patch anchor for ${label}`);
  fs.writeFileSync(file, s.replace(oldText, newText));
  return true;
}

function gh(args) {
  const r = spawnSync("gh", args, { encoding: "utf8", timeout: 30000 });
  if (r.status !== 0) throw new Error(`gh ${args.join(" ")} failed: ${r.stderr || r.stdout}`);
  return String(r.stdout || "").trim();
}

const watcher = path.join(repoDir, "scripts", "orchestration-watch.mjs");
const launcher = path.join(repoDir, "scripts", "launch-orchestration-nl-detached.mjs");

replaceOnce(
  watcher,
  `function acquireWorkerLock(lockPath, issueNumber) {`,
  `function issueHasRunningLabel(repo, issueNumber) {\n  try {\n    const issue = viewIssue(repo, issueNumber);\n    return (issue.labels ?? []).some((l) => l.name === "orch:running");\n  } catch {\n    return true;\n  }\n}\n\nfunction acquireWorkerLock(repo, lockPath, issueNumber) {`,
  "worker lock signature"
);
replaceOnce(
  watcher,
  `      if (!watcherOwnedLegacyLock && !deadOwner) return false;`,
  `      const existingIssueNumber = Number(existing?.issueNumber);\n      const staleGitHubOwner =\n        existing?.ownerType === "worker" &&\n        Number.isInteger(existingIssueNumber) &&\n        !issueHasRunningLabel(repo, existingIssueNumber);\n\n      if (!watcherOwnedLegacyLock && !deadOwner && !staleGitHubOwner) return false;`,
  "stale lock reclaim"
);
replaceOnce(
  watcher,
  `  if (!acquireWorkerLock(lockPath, issueNumber)) {`,
  `  if (!acquireWorkerLock(repo, lockPath, issueNumber)) {`,
  "worker lock call"
);
replaceOnce(
  launcher,
  `env.ORCH_CLOUD_AGENT_ID = env.ORCH_CLOUD_AGENT_ID ?? cloudAgentId;`,
  `env.ORCH_CLOUD_AGENT_ID = localAgentId ? "" : (env.ORCH_CLOUD_AGENT_ID ?? cloudAgentId);`,
  "zero-cloud local launch"
);
replaceOnce(
  launcher,
  `if (localAgentId) env.ORCH_LOCAL_AGENT_ID = localAgentId;`,
  `if (localAgentId) {\n  env.ORCH_LOCAL_AGENT_ID = localAgentId;\n  env.ORCH_LOCAL_MODEL = env.ORCH_LOCAL_MODEL ?? "ollama/qwen3.5:9b";\n  env.OLLAMA_API_KEY = env.OLLAMA_API_KEY ?? "ollama-local";\n  env.OPENCLAW_FALLBACK_MODELS = "";\n}`,
  "Qwen local pin"
);

const configPath = path.join(home, ".openclaw", "openclaw.json");
const backupPath = `${configPath}.before-four-worker-${Date.now()}.bak`;
fs.copyFileSync(configPath, backupPath);
const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
const ids = new Set(["local-a", "local-b", "local-c", "local-d"]);
if (Array.isArray(cfg?.agents?.list)) {
  for (const a of cfg.agents.list) if (ids.has(a.id ?? a.name)) a.model = "ollama/qwen3.5:9b";
} else if (cfg?.agents?.entries && typeof cfg.agents.entries === "object") {
  for (const id of ids) if (cfg.agents.entries[id]) cfg.agents.entries[id].model = "ollama/qwen3.5:9b";
} else {
  throw new Error("Could not locate OpenClaw agent list/entries");
}
fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + "\n");
const validate = spawnSync("openclaw", ["config", "validate"], { encoding: "utf8", timeout: 30000 });
if (validate.status !== 0) {
  fs.copyFileSync(backupPath, configPath);
  throw new Error(`OpenClaw config validation failed; backup restored: ${validate.stderr || validate.stdout}`);
}

for (const n of [413, 414, 416, 447]) {
  for (const label of ["orch:running", "orch:awaiting_review", "orch:ready"]) {
    spawnSync("gh", ["issue", "edit", String(n), "--repo", repo, "--remove-label", label], { stdio: "ignore", timeout: 30000 });
  }
  const add = spawnSync("gh", ["issue", "edit", String(n), "--repo", repo, "--add-label", "orch:ready"], { encoding: "utf8", timeout: 30000 });
  if (add.status !== 0) throw new Error(`Failed to requeue #${n}: ${add.stderr || add.stdout}`);
}

const lockDir = path.join(home, ".openclaw", "state", "orchestration-worker-locks");
for (const id of ids) {
  const p = path.join(lockDir, `${id}.lock`);
  try {
    const lock = JSON.parse(fs.readFileSync(p, "utf8"));
    const issueNumber = Number(lock?.issueNumber);
    if (Number.isInteger(issueNumber)) {
      const json = JSON.parse(gh(["issue", "view", String(issueNumber), "--repo", repo, "--json", "labels"]));
      const running = (json.labels ?? []).some((l) => l.name === "orch:running");
      if (!running) fs.unlinkSync(p);
    }
  } catch {}
}

spawnSync("pkill", ["-f", "scripts/orchestration-watch.mjs"], { stdio: "ignore", timeout: 5000 });
const logPath = path.join(home, "Library", "Logs", "jeeves-orchestration-watch.log");
fs.mkdirSync(path.dirname(logPath), { recursive: true });
const fd = fs.openSync(logPath, "a");
const child = spawn(
  "/opt/homebrew/bin/node",
  ["scripts/orchestration-watch.mjs", "--repo", repo, "--agent", "JEEVES", "--interval", "60", "--max", "10"],
  { cwd: repoDir, detached: true, stdio: ["ignore", fd, fd], env: { ...process.env, ORCH_LOCAL_MODEL: "ollama/qwen3.5:9b", OLLAMA_API_KEY: "ollama-local", OPENCLAW_FALLBACK_MODELS: "" } }
);
child.unref();
fs.closeSync(fd);
console.log(JSON.stringify({ status: "PASS", watcherPid: child.pid, model: "ollama/qwen3.5:9b", cloudFallback: "DISABLED_FOR_LOCAL_LANES", requeued: [413,414,416,447], configBackup: backupPath }));
