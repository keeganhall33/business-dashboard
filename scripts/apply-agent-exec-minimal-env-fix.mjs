import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const branch = "fix/agent-exec-minimal-env-443";
const worktree = path.join(os.tmpdir(), "business-dashboard-agent-exec-minimal-env-443");

function run(cmd, args, cwd = process.cwd()) {
  return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

try { run("git", ["worktree", "remove", "--force", worktree]); } catch {}
try { run("git", ["branch", "-D", branch]); } catch {}
run("git", ["fetch", "origin", "main"]);
run("git", ["fetch", "origin", branch]);
run("git", ["worktree", "add", "-b", branch, worktree, "origin/main"]);

const file = path.join(worktree, "scripts/orchestration-run-issue-openclaw.mjs");
let text = fs.readFileSync(file, "utf8");

const oldArgs = `        "--model",\n        ORCH_LOCAL_MODEL,\n        "--code-mode",\n        "code",\n        "--local-model-lean",\n        "--json",\n        "--thinking",\n        thinking,\n        "--timeout",\n        String(effectiveTimeout)`;
const newArgs = `        "--json"`;
if ((text.split(oldArgs).length - 1) !== 1) throw new Error("Expected exactly one local agent exec optional-flag block");
text = text.replace(oldArgs, newArgs);

const oldSpawn = `  const res = spawnSync("/opt/homebrew/bin/openclaw", args, {\n    encoding: "utf8",\n    timeout: (effectiveTimeout + 60) * 1000,`;
const newSpawn = `  const childEnv = useEphemeralLocal\n    ? { ...process.env, OPENCLAW_MODEL: ORCH_LOCAL_MODEL, OPENCLAW_FALLBACK_MODELS: "" }\n    : process.env;\n\n  const res = spawnSync("/opt/homebrew/bin/openclaw", args, {\n    env: childEnv,\n    encoding: "utf8",\n    timeout: (effectiveTimeout + 60) * 1000,`;
if ((text.split(oldSpawn).length - 1) !== 1) throw new Error("Expected exactly one OpenClaw spawn block");
text = text.replace(oldSpawn, newSpawn);

fs.writeFileSync(file, text);
run(process.execPath, ["--check", "scripts/orchestration-run-issue-openclaw.mjs"], worktree);
run("git", ["diff", "--check"], worktree);
run("git", ["add", "scripts/orchestration-run-issue-openclaw.mjs"], worktree);
run("git", ["commit", "-m", "Use minimal compatible agent exec flags with Ollama env pin"], worktree);
run("git", ["push", "--force-with-lease", "-u", "origin", branch], worktree);
const commit = run("git", ["rev-parse", "HEAD"], worktree);
console.log(JSON.stringify({ status: "PASS", branch, commit }));
