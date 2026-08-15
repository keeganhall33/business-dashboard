import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const repo = "keeganhall33/business-dashboard";
const branch = "fix/agent-exec-no-cwd-440";
const worktree = path.join(os.tmpdir(), "business-dashboard-agent-exec-no-cwd-440");

function run(cmd, args, cwd = process.cwd()) {
  return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

try { run("git", ["worktree", "remove", "--force", worktree]); } catch {}
try { run("git", ["branch", "-D", branch]); } catch {}
run("git", ["fetch", "origin", "main", branch]);
run("git", ["worktree", "add", "-b", branch, worktree, "origin/main"]);

const file = path.join(worktree, "scripts/orchestration-run-issue-openclaw.mjs");
let text = fs.readFileSync(file, "utf8");
const oldText = '        "--cwd",\n        process.cwd(),\n';
const count = text.split(oldText).length - 1;
if (count !== 1) throw new Error(`Expected exactly one --cwd anchor, found ${count}`);
text = text.replace(oldText, "");
fs.writeFileSync(file, text);

run(process.execPath, ["--check", "scripts/orchestration-run-issue-openclaw.mjs"], worktree);
run("git", ["diff", "--check"], worktree);
run("git", ["add", "scripts/orchestration-run-issue-openclaw.mjs"], worktree);
run("git", ["commit", "-m", "Remove unsupported agent exec cwd option"], worktree);
run("git", ["push", "--force-with-lease", "-u", "origin", branch], worktree);
const commit = run("git", ["rev-parse", "HEAD"], worktree);
console.log(JSON.stringify({ status: "PASS", branch, commit, repo }));
