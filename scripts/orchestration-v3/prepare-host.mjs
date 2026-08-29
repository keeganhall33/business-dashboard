import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { ORCHESTRATION_V3 } from "./config.mjs";

function run(exe, args, options = {}) {
  return execFileSync(exe, args, { encoding: "utf8", timeout: 120_000, ...options }).trim();
}
function git(cwd, args) { return run("git", args, { cwd }); }
function safeText(cwd, args) {
  try { return git(cwd, args); } catch (err) { return `ERROR: ${err instanceof Error ? err.message : String(err)}`; }
}
function ensureRepoRoot(cwd) {
  const root = git(cwd, ["rev-parse", "--show-toplevel"]);
  if (root !== cwd) throw new Error(`RUN_FROM_REPO_ROOT:${root}`);
  return root;
}
function readAgentConfigSurface() {
  for (const key of ["agents.list", "agents.entries"]) {
    try {
      const value = JSON.parse(run("openclaw", ["config", "get", key]));
      if (Array.isArray(value)) return { key, kind: "array", raw: value, list: value };
      if (value && typeof value === "object") {
        const list = Object.entries(value).map(([id, entry]) => ({ id, ...(entry ?? {}) }));
        return { key, kind: "object", raw: value, list };
      }
    } catch {}
  }
  throw new Error("OPENCLAW_AGENT_CONFIG_SURFACE_UNAVAILABLE");
}
function encodeAgentConfig(surface, list) {
  if (surface.kind === "array") return list;
  return Object.fromEntries(list.map(({ id, ...entry }) => [id, entry]));
}
function workspaceAttestationPath(workspace) {
  const hash = crypto.createHash("sha256").update(workspace).digest("hex");
  return path.join(os.homedir(), ".openclaw", "workspace-attestations", `${hash}.attested`);
}
function archiveWorkspaceAttestation(workerId, workspace, backupRoot, kind) {
  const attestation = workspaceAttestationPath(workspace);
  if (!fs.existsSync(attestation)) return null;
  const targetDir = path.join(backupRoot, workerId);
  fs.mkdirSync(targetDir, { recursive: true });
  const target = path.join(targetDir, `workspace-attestation-${kind}.attested`);
  fs.renameSync(attestation, target);
  return { workerId, workspace, kind, attestation, archivedTo: target };
}
function archiveAgentWorkspace(workerId, workspace, backupRoot) {
  if (!fs.existsSync(workspace)) return null;
  const targetDir = path.join(backupRoot, workerId);
  fs.mkdirSync(targetDir, { recursive: true });
  const target = path.join(targetDir, "openclaw-agent-workspace");
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
  fs.renameSync(workspace, target);
  return { workerId, workspace, archivedTo: target };
}
function archiveWorker(repoRoot, workerId, worktree, backupRoot) {
  const target = path.join(backupRoot, workerId);
  fs.mkdirSync(target, { recursive: true });
  if (!fs.existsSync(worktree)) {
    fs.writeFileSync(path.join(target, "ABSENT.txt"), `${worktree}\n`);
    return;
  }

  fs.writeFileSync(path.join(target, "HEAD.txt"), `${safeText(worktree, ["rev-parse", "HEAD"])}\n`);
  fs.writeFileSync(path.join(target, "STATUS.txt"), `${safeText(worktree, ["status", "--short", "--branch"])}\n`);
  fs.writeFileSync(path.join(target, "tracked.patch"), `${safeText(worktree, ["diff", "--binary"])}\n`);
  fs.writeFileSync(path.join(target, "staged.patch"), `${safeText(worktree, ["diff", "--cached", "--binary"])}\n`);

  try {
    const untracked = git(worktree, ["ls-files", "--others", "--exclude-standard", "-z"]);
    for (const rel of untracked.split("\0").filter(Boolean)) {
      const source = path.join(worktree, rel);
      const destination = path.join(target, "untracked", rel);
      if (!fs.existsSync(source) || fs.statSync(source).isDirectory()) continue;
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination);
    }
  } catch {}

  const remove = spawnSync("git", ["worktree", "remove", "--force", worktree], { cwd: repoRoot, encoding: "utf8", timeout: 120_000 });
  if (remove.status !== 0 && fs.existsSync(worktree)) {
    const fullBackup = path.join(target, "unregistered-worktree");
    if (fs.existsSync(fullBackup)) fs.rmSync(fullBackup, { recursive: true, force: true });
    fs.renameSync(worktree, fullBackup);
  }
}

const repoRoot = ensureRepoRoot(process.cwd());
git(repoRoot, ["fetch", "origin", "main"]);
run("ollama", ["show", "qwen3.5:9b"]);

// Validate the OpenClaw config surface before any worker directory is touched.
const agentSurface = readAgentConfigSurface();
const currentAgents = agentSurface.list;
for (const workerId of Object.keys(ORCHESTRATION_V3.workers)) {
  if (!currentAgents.some((entry) => entry.id === workerId)) throw new Error(`OPENCLAW_AGENT_MISSING:${workerId}`);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = path.join(ORCHESTRATION_V3.runtime.backupRoot, stamp);
fs.mkdirSync(backupRoot, { recursive: true });
const openclawConfig = path.join(os.homedir(), ".openclaw", "openclaw.json");
if (fs.existsSync(openclawConfig)) fs.copyFileSync(openclawConfig, path.join(backupRoot, "openclaw.json.before-v3"));

const archivedAttestations = [];
const archivedAgentWorkspaces = [];
for (const [workerId, cfg] of Object.entries(ORCHESTRATION_V3.workers)) {
  // OpenClaw owns agentWorkspace only. The git worktree is never an OpenClaw workspace.
  // During an intentional rebuild, archive exact legacy attestations for both known paths.
  // A prior buggy runtime may have attested the protected git worktree before this invariant existed.
  const archivedAgentWorkspaceAttestation = archiveWorkspaceAttestation(workerId, cfg.agentWorkspace, backupRoot, "agent-workspace");
  if (archivedAgentWorkspaceAttestation) archivedAttestations.push(archivedAgentWorkspaceAttestation);
  const archivedWorktreeAttestation = archiveWorkspaceAttestation(workerId, cfg.worktree, backupRoot, "git-worktree");
  if (archivedWorktreeAttestation) archivedAttestations.push(archivedWorktreeAttestation);
  const archivedWorkspace = archiveAgentWorkspace(workerId, cfg.agentWorkspace, backupRoot);
  if (archivedWorkspace) archivedAgentWorkspaces.push(archivedWorkspace);
  archiveWorker(repoRoot, workerId, cfg.worktree, backupRoot);
}
git(repoRoot, ["worktree", "prune"]);

for (const [workerId, cfg] of Object.entries(ORCHESTRATION_V3.workers)) {
  fs.mkdirSync(path.dirname(cfg.worktree), { recursive: true });
  git(repoRoot, ["worktree", "add", "--detach", cfg.worktree, "refs/remotes/origin/main"]);
  const root = git(cfg.worktree, ["rev-parse", "--show-toplevel"]);
  if (root !== cfg.worktree) throw new Error(`WORKER_ROOT_MISMATCH:${workerId}:${root}`);

  fs.mkdirSync(cfg.agentWorkspace, { recursive: true });
  if (path.resolve(cfg.agentWorkspace) === path.resolve(cfg.worktree)) {
    throw new Error(`OPENCLAW_WORKSPACE_MUST_NOT_EQUAL_GIT_WORKTREE:${workerId}`);
  }
}

// Keep every non-worker agent untouched. A/B/C/D use disposable OpenClaw-owned workspaces,
// while their protected git worktrees stay outside OpenClaw workspace initialization.
const nextAgents = currentAgents.map((entry) => {
  const cfg = ORCHESTRATION_V3.workers[entry.id];
  return cfg ? { ...entry, workspace: cfg.agentWorkspace, model: ORCHESTRATION_V3.model.id } : entry;
});
run("openclaw", ["config", "set", agentSurface.key, JSON.stringify(encodeAgentConfig(agentSurface, nextAgents)), "--strict-json"]);
run("openclaw", ["config", "set", "agents.defaults.models", JSON.stringify({ [ORCHESTRATION_V3.model.id]: {} }), "--strict-json", "--merge"]);
run("openclaw", ["config", "validate"]);

const verifiedSurface = readAgentConfigSurface();
for (const [workerId, cfg] of Object.entries(ORCHESTRATION_V3.workers)) {
  const entry = verifiedSurface.list.find((candidate) => candidate.id === workerId);
  if (!entry) throw new Error(`OPENCLAW_AGENT_MISSING_AFTER_WRITE:${workerId}`);
  if (path.resolve(String(entry.workspace ?? "")) !== path.resolve(cfg.agentWorkspace)) throw new Error(`OPENCLAW_WORKSPACE_MISMATCH:${workerId}:${entry.workspace ?? "<missing>"}`);
  if (path.resolve(String(entry.workspace ?? "")) === path.resolve(cfg.worktree)) throw new Error(`OPENCLAW_WORKSPACE_POINTS_AT_GIT_WORKTREE:${workerId}`);
  const model = typeof entry.model === "string" ? entry.model : entry.model?.primary;
  if (model !== ORCHESTRATION_V3.model.id) throw new Error(`OPENCLAW_MODEL_MISMATCH:${workerId}:${model ?? "<missing>"}`);
}

if (fs.existsSync(ORCHESTRATION_V3.runtime.root)) {
  const runtimeRoot = safeText(ORCHESTRATION_V3.runtime.root, ["rev-parse", "--show-toplevel"]);
  if (runtimeRoot !== ORCHESTRATION_V3.runtime.root) throw new Error(`REFUSE_UNKNOWN_RUNTIME_PATH:${ORCHESTRATION_V3.runtime.root}`);
  git(ORCHESTRATION_V3.runtime.root, ["reset", "--hard", "refs/remotes/origin/main"]);
  git(ORCHESTRATION_V3.runtime.root, ["clean", "-fd"]);
} else {
  fs.mkdirSync(path.dirname(ORCHESTRATION_V3.runtime.root), { recursive: true });
  git(repoRoot, ["worktree", "add", "--detach", ORCHESTRATION_V3.runtime.root, "refs/remotes/origin/main"]);
}

fs.mkdirSync(ORCHESTRATION_V3.runtime.stateRoot, { recursive: true });
fs.writeFileSync(path.join(ORCHESTRATION_V3.runtime.stateRoot, "prepared.json"), JSON.stringify({ preparedAt: new Date().toISOString(), backupRoot, mainSha: git(repoRoot, ["rev-parse", "refs/remotes/origin/main"]), model: ORCHESTRATION_V3.model.id, agentConfigKey: agentSurface.key, archivedAttestations, archivedAgentWorkspaces }, null, 2) + "\n");

console.log(JSON.stringify({
  status: "PREPARED",
  runtime: ORCHESTRATION_V3.runtime.root,
  backupRoot,
  model: ORCHESTRATION_V3.model.id,
  agentConfigKey: agentSurface.key,
  archivedAttestations,
  archivedAgentWorkspaces,
  workers: Object.fromEntries(Object.entries(ORCHESTRATION_V3.workers).map(([id, cfg]) => [id, { worktree: cfg.worktree, agentWorkspace: cfg.agentWorkspace }]))
}, null, 2));
