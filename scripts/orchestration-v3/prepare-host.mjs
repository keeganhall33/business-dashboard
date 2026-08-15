import fs from "node:fs";
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
    fs.renameSync(worktree, fullBackup);
  }
}

const repoRoot = ensureRepoRoot(process.cwd());
git(repoRoot, ["fetch", "origin", "main"]);
run("ollama", ["show", "qwen3.5:9b"]);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = path.join(ORCHESTRATION_V3.runtime.backupRoot, stamp);
fs.mkdirSync(backupRoot, { recursive: true });

for (const [workerId, cfg] of Object.entries(ORCHESTRATION_V3.workers)) {
  archiveWorker(repoRoot, workerId, cfg.worktree, backupRoot);
}
git(repoRoot, ["worktree", "prune"]);

for (const [workerId, cfg] of Object.entries(ORCHESTRATION_V3.workers)) {
  fs.mkdirSync(path.dirname(cfg.worktree), { recursive: true });
  git(repoRoot, ["worktree", "add", "--detach", cfg.worktree, "origin/main"]);
  const root = git(cfg.worktree, ["rev-parse", "--show-toplevel"]);
  if (root !== cfg.worktree) throw new Error(`WORKER_ROOT_MISMATCH:${workerId}:${root}`);
}

if (fs.existsSync(ORCHESTRATION_V3.runtime.root)) {
  const runtimeRoot = safeText(ORCHESTRATION_V3.runtime.root, ["rev-parse", "--show-toplevel"]);
  if (runtimeRoot !== ORCHESTRATION_V3.runtime.root) throw new Error(`REFUSE_UNKNOWN_RUNTIME_PATH:${ORCHESTRATION_V3.runtime.root}`);
  git(ORCHESTRATION_V3.runtime.root, ["reset", "--hard", "origin/main"]);
  git(ORCHESTRATION_V3.runtime.root, ["clean", "-fd"]);
} else {
  fs.mkdirSync(path.dirname(ORCHESTRATION_V3.runtime.root), { recursive: true });
  git(repoRoot, ["worktree", "add", "--detach", ORCHESTRATION_V3.runtime.root, "origin/main"]);
}

fs.mkdirSync(ORCHESTRATION_V3.runtime.stateRoot, { recursive: true });
fs.writeFileSync(path.join(ORCHESTRATION_V3.runtime.stateRoot, "prepared.json"), JSON.stringify({ preparedAt: new Date().toISOString(), backupRoot, mainSha: git(repoRoot, ["rev-parse", "origin/main"]) }, null, 2) + "\n");

console.log(JSON.stringify({ status: "PREPARED", runtime: ORCHESTRATION_V3.runtime.root, backupRoot, workers: Object.fromEntries(Object.entries(ORCHESTRATION_V3.workers).map(([id, cfg]) => [id, cfg.worktree])) }, null, 2));
