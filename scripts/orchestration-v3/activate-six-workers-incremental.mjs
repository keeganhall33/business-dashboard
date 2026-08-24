import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const OPENCLAW_ROOT = path.join(os.homedir(), ".openclaw");
const RUNTIME = path.join(OPENCLAW_ROOT, "runtime-v3", "business-dashboard");
const STATE_ROOT = path.join(OPENCLAW_ROOT, "state", "orchestration-v3");
const MODEL = "ollama/qwen3.5:9b";
const SERVICE = "com.keegan.jeeves.orchestration-v3";
const PLIST = path.join(os.homedir(), "Library", "LaunchAgents", `${SERVICE}.plist`);
const TARGETS = {
  "local-e": {
    stream: "INTEGRATION_RELEASE",
    worktree: path.join(OPENCLAW_ROOT, "worktrees", "local-e"),
    workspace: path.join(OPENCLAW_ROOT, "agent-workspaces-v3", "local-e")
  },
  "local-f": {
    stream: "QA_EVALUATION",
    worktree: path.join(OPENCLAW_ROOT, "worktrees", "local-f"),
    workspace: path.join(OPENCLAW_ROOT, "agent-workspaces-v3", "local-f")
  }
};

function run(exe, args, options = {}) {
  return execFileSync(exe, args, { encoding: "utf8", timeout: 180_000, ...options }).trim();
}
function bestEffort(exe, args, options = {}) {
  return spawnSync(exe, args, { encoding: "utf8", timeout: 60_000, ...options });
}
function git(cwd, args) {
  return run("git", args, { cwd });
}
function repoRoot(cwd) {
  return git(cwd, ["rev-parse", "--show-toplevel"]);
}
function readAgentConfigSurface() {
  for (const key of ["agents.list", "agents.entries"]) {
    try {
      const raw = JSON.parse(run("openclaw", ["config", "get", key]));
      if (Array.isArray(raw)) return { key, kind: "array", raw, list: raw };
      if (raw && typeof raw === "object") {
        const list = Object.entries(raw).map(([id, entry]) => ({ id, ...(entry ?? {}) }));
        return { key, kind: "object", raw, list };
      }
    } catch {}
  }
  throw new Error("OPENCLAW_AGENT_CONFIG_SURFACE_UNAVAILABLE");
}
function encodeAgentConfig(surface, list) {
  if (surface.kind === "array") return list;
  return Object.fromEntries(list.map(({ id, ...entry }) => [id, entry]));
}
function modelOf(entry) {
  return typeof entry?.model === "string" ? entry.model : entry?.model?.primary;
}
function ensureTargetWorktree(sourceRoot, workerId, cfg) {
  fs.mkdirSync(path.dirname(cfg.worktree), { recursive: true });
  if (fs.existsSync(cfg.worktree)) {
    let root;
    try { root = repoRoot(cfg.worktree); } catch { throw new Error(`REFUSE_NON_GIT_WORKTREE:${workerId}:${cfg.worktree}`); }
    if (path.resolve(root) !== path.resolve(cfg.worktree)) throw new Error(`REFUSE_NESTED_WORKTREE:${workerId}:${root}`);
    const dirty = git(cfg.worktree, ["status", "--porcelain"]);
    if (dirty) throw new Error(`REFUSE_DIRTY_TARGET_WORKTREE:${workerId}`);
    git(cfg.worktree, ["reset", "--hard", "origin/main"]);
    git(cfg.worktree, ["clean", "-fd"]);
  } else {
    git(sourceRoot, ["worktree", "add", "--detach", cfg.worktree, "origin/main"]);
  }
  fs.mkdirSync(cfg.workspace, { recursive: true });
  if (path.resolve(cfg.workspace) === path.resolve(cfg.worktree)) throw new Error(`WORKSPACE_EQUALS_WORKTREE:${workerId}`);
}
function updateRuntime(sourceRoot) {
  if (fs.existsSync(RUNTIME)) {
    const root = repoRoot(RUNTIME);
    if (path.resolve(root) !== path.resolve(RUNTIME)) throw new Error(`REFUSE_UNKNOWN_RUNTIME_PATH:${RUNTIME}`);
    const dirty = git(RUNTIME, ["status", "--porcelain"]);
    if (dirty) throw new Error("REFUSE_DIRTY_RUNTIME");
    git(RUNTIME, ["reset", "--hard", "origin/main"]);
    git(RUNTIME, ["clean", "-fd"]);
  } else {
    fs.mkdirSync(path.dirname(RUNTIME), { recursive: true });
    git(sourceRoot, ["worktree", "add", "--detach", RUNTIME, "origin/main"]);
  }
}

const sourceRoot = repoRoot(process.cwd());
git(sourceRoot, ["fetch", "origin", "main"]);
git(sourceRoot, ["worktree", "prune"]);
const mainSha = git(sourceRoot, ["rev-parse", "origin/main"]);
run("ollama", ["show", "qwen3.5:9b"]);

console.log(JSON.stringify({ event: "SIX_WORKER_INCREMENTAL_START", mainSha, targets: Object.keys(TARGETS) }));

// Add or repair only local-e/local-f in OpenClaw. Existing agents are preserved byte-for-byte except these target entries.
const surface = readAgentConfigSurface();
const next = [...surface.list];
for (const [workerId, cfg] of Object.entries(TARGETS)) {
  const index = next.findIndex((entry) => entry.id === workerId);
  const targetEntry = index >= 0
    ? { ...next[index], id: workerId, workspace: cfg.workspace, model: MODEL }
    : { id: workerId, workspace: cfg.workspace, model: MODEL };
  if (index >= 0) next[index] = targetEntry;
  else next.push(targetEntry);
}
run("openclaw", ["config", "set", surface.key, JSON.stringify(encodeAgentConfig(surface, next)), "--strict-json"]);
run("openclaw", ["config", "set", "agents.defaults.models", JSON.stringify({ [MODEL]: {} }), "--strict-json", "--merge"]);
run("openclaw", ["config", "validate"]);

const verified = readAgentConfigSurface();
for (const [workerId, cfg] of Object.entries(TARGETS)) {
  const entry = verified.list.find((candidate) => candidate.id === workerId);
  if (!entry) throw new Error(`OPENCLAW_AGENT_MISSING_AFTER_WRITE:${workerId}`);
  if (path.resolve(String(entry.workspace ?? "")) !== path.resolve(cfg.workspace)) throw new Error(`OPENCLAW_WORKSPACE_MISMATCH:${workerId}`);
  if (modelOf(entry) !== MODEL) throw new Error(`OPENCLAW_MODEL_MISMATCH:${workerId}:${modelOf(entry) ?? "<missing>"}`);
}

// Provision only the two new worker filesystems. local-a..local-d are never reset, removed, cleaned, or rewritten here.
for (const [workerId, cfg] of Object.entries(TARGETS)) ensureTargetWorktree(sourceRoot, workerId, cfg);

if (!fs.existsSync(PLIST)) throw new Error(`V3_LAUNCHAGENT_PLIST_MISSING:${PLIST}`);
const uid = process.getuid();

// Stop only the watcher service, refresh its disposable runtime, then restart it. Existing worker processes/worktrees are not killed.
bestEffort("launchctl", ["bootout", `gui/${uid}/${SERVICE}`]);
updateRuntime(sourceRoot);

fs.mkdirSync(STATE_ROOT, { recursive: true });
const preparedPath = path.join(STATE_ROOT, "prepared.json");
let prepared = {};
try { prepared = JSON.parse(fs.readFileSync(preparedPath, "utf8")); } catch {}
fs.writeFileSync(preparedPath, JSON.stringify({
  ...prepared,
  preparedAt: new Date().toISOString(),
  mainSha,
  model: MODEL,
  incrementalSixWorkerActivation: true,
  workersAdded: Object.keys(TARGETS)
}, null, 2) + "\n");

run("launchctl", ["bootstrap", `gui/${uid}`, PLIST]);
run("launchctl", ["kickstart", "-k", `gui/${uid}/${SERVICE}`]);
await new Promise((resolve) => setTimeout(resolve, 6000));

const doctor = spawnSync(process.execPath, ["scripts/orchestration-v3/doctor.mjs"], { cwd: RUNTIME, encoding: "utf8", timeout: 90_000 });
process.stdout.write(doctor.stdout ?? "");
process.stderr.write(doctor.stderr ?? "");
if (doctor.status !== 0) throw new Error("V3_DOCTOR_FAILED_AFTER_INCREMENTAL_ACTIVATION");

const liveness = spawnSync(process.execPath, ["scripts/orchestration-v3/liveness-report.mjs", "--github", "--pretty"], { cwd: RUNTIME, encoding: "utf8", timeout: 90_000 });
process.stdout.write(liveness.stdout ?? "");
process.stderr.write(liveness.stderr ?? "");
if (liveness.status !== 0) throw new Error("V3_LIVENESS_FAILED_AFTER_INCREMENTAL_ACTIVATION");

console.log(JSON.stringify({
  status: "SIX_WORKER_INCREMENTAL_ACTIVATION_COMPLETE",
  mainSha,
  untouchedProductWorkers: ["local-a", "local-b", "local-c", "local-d"],
  activatedWorkers: Object.entries(TARGETS).map(([id, cfg]) => ({ id, stream: cfg.stream, worktree: cfg.worktree, workspace: cfg.workspace })),
  service: SERVICE
}, null, 2));
