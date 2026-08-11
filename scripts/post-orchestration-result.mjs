/*
  Post OrchestrationResultContractV1 back to a GitHub Issue.

  Usage:
    node scripts/post-orchestration-result.mjs --repo <owner/repo> --issue 193 --result /tmp/result.json

  Security:
  - Uses GitHub CLI only.
  - Does not read secrets from files.
*/

import fs from "node:fs";
import { execFileSync } from "node:child_process";

function parseArgs(argv) {
  const args = { repo: null, issue: null, result: null };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const val = argv[i + 1];
    if (key === "--repo") args.repo = val;
    if (key === "--issue") args.issue = val;
    if (key === "--result") args.result = val;
  }
  if (!args.repo) throw new Error("Missing --repo owner/repo");
  if (!args.issue) throw new Error("Missing --issue <number>");
  if (!args.result) throw new Error("Missing --result <path>");
  return args;
}

function formatMarkdown(result) {
  return [
    "## OrchestrationResultContractV1",
    "",
    "```json",
    JSON.stringify(result, null, 2),
    "```",
    ""
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv);
  const raw = fs.readFileSync(args.result, "utf8");
  const result = JSON.parse(raw);

  const body = formatMarkdown(result);
  const tmp = "/tmp/orchestration-result-comment.md";
  fs.writeFileSync(tmp, body);

  execFileSync(
    "gh",
    ["issue", "comment", String(args.issue), "--repo", args.repo, "--body-file", tmp],
    { stdio: "inherit" }
  );
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg);
  process.exitCode = 1;
});

