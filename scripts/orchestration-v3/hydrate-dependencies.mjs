import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function defaultRun(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
    timeout: 300_000
  });
}

function assertNoProductDirt(cwd, runCommand) {
  const status = runCommand("git", ["status", "--porcelain=v1", "--untracked-files=normal"], cwd).trim();
  if (status) throw new Error(`DIRTY_AFTER_HYDRATION:${status}`);
}

export function hydrateDependencies(cwd, { runCommand = defaultRun, verify = false } = {}) {
  try {
    if (!fs.existsSync(path.join(cwd, "package-lock.json"))) {
      throw new Error(`PACKAGE_LOCK_MISSING:${cwd}`);
    }

    runCommand("npm", ["ci"], cwd);
    assertNoProductDirt(cwd, runCommand);

    if (verify) {
      runCommand("npx", ["tsc", "--noEmit"], cwd);
      runCommand("npm", ["run", "build"], cwd);
      assertNoProductDirt(cwd, runCommand);
    }

    return { success: true, cwd, method: "npm ci", verified: Boolean(verify) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`HYDRATE_DEPENDENCIES_FAILED:${cwd}:${message}`);
  }
}

export function hydrateAllWorkers({ runCommand = defaultRun, verify = false } = {}) {
  const workers = Object.freeze({
    "local-a": path.join("/Users/keeganhall/.openclaw/worktrees/local-a"),
    "local-b": path.join("/Users/keeganhall/.openclaw/worktrees/local-b"),
    "local-c": path.join("/Users/keeganhall/.openclaw/worktrees/local-c"),
    "local-d": path.join("/Users/keeganhall/.openclaw/worktrees/local-d"),
    "local-e": path.join("/Users/keeganhall/.openclaw/worktrees/local-e"),
    "local-f": path.join("/Users/keeganhall/.openclaw/worktrees/local-f")
  });

  const results = {};
  for (const [workerId, cwd] of Object.entries(workers)) {
    try {
      results[workerId] = hydrateDependencies(cwd, { runCommand, verify });
    } catch (err) {
      results[workerId] = { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  return results;
}
