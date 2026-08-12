import { execFileSync } from "node:child_process";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const repo = arg("--repo");
const issue = arg("--issue");
if (!repo || !issue) {
  console.error("Usage: node scripts/run-orchestration-issue-agent.mjs --repo owner/repo --issue N");
  process.exit(2);
}

const issueJson = execFileSync("gh", ["issue", "view", String(issue), "--repo", repo, "--json", "number,title,body,url"], {
  encoding: "utf8",
  timeout: 15000
});
const task = JSON.parse(issueJson);
const prompt = [
  `You are Jeeves executing GitHub orchestration task #${task.number} in ${repo}.`,
  `Work from the local business-dashboard repository/worktree.`,
  `Follow the task exactly, preserve all stated safety/review gates, and do not perform human-gated actions.`,
  `If the task is review-sensitive, stop at the required ArchitectCheckpoint before semantic/schema/security/valuation/recommendation mutation.`,
  `If implementation is allowed, use a dedicated branch, run appropriate tests, open a PR, and post a structured result back to the originating issue.`,
  `Do not use Telegram for routine progress.`,
  `TASK TITLE: ${task.title}`,
  `TASK BODY:\n${task.body}`
].join("\n\n");

try {
  const out = execFileSync("openclaw", [
    "agent",
    "exec",
    "--message", prompt,
    "--json",
    "--thinking", "high",
    "--timeout", "900"
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 960000,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const body = `## Jeeves isolated agent execution\n\n\`\`\`json\n${out.slice(0, 50000)}\n\`\`\``;
  execFileSync("gh", ["issue", "comment", String(issue), "--repo", repo, "--body", body], { timeout: 15000, stdio: "inherit" });
} catch (error) {
  const stderr = typeof error?.stderr === "string" ? error.stderr : "";
  const stdout = typeof error?.stdout === "string" ? error.stdout : "";
  const text = `${stdout}\n${stderr}`.slice(0, 30000);
  const body = `## Jeeves isolated agent execution\n\nSTATUS: FAILED\n\n\`\`\`text\n${text}\n\`\`\``;
  try {
    execFileSync("gh", ["issue", "comment", String(issue), "--repo", repo, "--body", body], { timeout: 15000, stdio: "inherit" });
  } catch {}
  process.exitCode = 1;
}
