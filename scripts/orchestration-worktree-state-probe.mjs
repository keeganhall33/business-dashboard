#!/usr/bin/env node
import { execFileSync } from "node:child_process";

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--repo") result.repo = argv[++i];
    else if (arg === "--issue") result.issue = argv[++i];
  }
  return result;
}

function runGit(args) {
  try {
    return {
      ok: true,
      code: 0,
      output: execFileSync("git", args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim(),
    };
  } catch (error) {
    return {
      ok: false,
      code: typeof error.status === "number" ? error.status : null,
      output: `${error.stdout ?? ""}\n${error.stderr ?? ""}`.trim(),
    };
  }
}

const { repo, issue } = parseArgs(process.argv.slice(2));
if (!repo || !issue) {
  console.error("Usage: node scripts/orchestration-worktree-state-probe.mjs --repo owner/name --issue N");
  process.exit(2);
}

const fetch = runGit(["fetch", "origin", "main"]);
const data = {
  fetch,
  status: runGit(["status", "--short", "--branch"]),
  branch: runGit(["branch", "--show-current"]),
  head: runGit(["rev-parse", "HEAD"]),
  originMain: runGit(["rev-parse", "origin/main"]),
  localMain: runGit(["rev-parse", "main"]),
  branches: runGit(["branch", "-vv"]),
  worktrees: runGit(["worktree", "list", "--porcelain"]),
  diff: runGit(["diff", "--stat"]),
  cachedDiff: runGit(["diff", "--cached", "--stat"]),
  counts: runGit(["rev-list", "--left-right", "--count", "HEAD...origin/main"]),
  mergeBase: runGit(["merge-base", "HEAD", "origin/main"]),
};

const body = `## Durable worktree diagnostic\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
execFileSync("gh", ["issue", "comment", issue, "--repo", repo, "--body", body], {
  stdio: "inherit",
});
