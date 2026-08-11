/*
  Orchestration Watcher (V1)

  - Polls GitHub issues labeled `agent-orchestration` + `orch:ready`
  - Claims issues assigned to JEEVES
  - If human_approval_required=true -> marks awaiting human approval (no execution)
  - If executable instructions are present (EXECUTE codeblock), runs them under a strict allowlist.
  - Posts OrchestrationResultContractV1 back to the issue.

  This is a safe foundation to remove Telegram relay; it does NOT create DB state.
*/

import fs from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";

function parseArgs(argv) {
  const out = {
    repo: null,
    agent: "JEEVES",
    once: false,
    intervalSeconds: 60,
    maxIssues: 5
  };
  for (let i = 2; i < argv.length; i += 1) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--repo") out.repo = v;
    if (k === "--agent") out.agent = v;
    if (k === "--once") out.once = true;
    if (k === "--interval") out.intervalSeconds = Number(v);
    if (k === "--max") out.maxIssues = Number(v);
  }
  if (!out.repo) throw new Error("Missing --repo owner/repo");
  if (!Number.isFinite(out.intervalSeconds) || out.intervalSeconds < 20) {
    throw new Error("--interval must be >= 20 seconds (avoid busy loops)");
  }
  return out;
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8" }).trim();
}

function listReadyIssues(repo, maxIssues) {
  const json = gh([
    "issue",
    "list",
    "--repo",
    repo,
    "--state",
    "open",
    "--label",
    "agent-orchestration",
    "--label",
    "orch:ready",
    "--limit",
    String(maxIssues),
    "--json",
    "number,title,url"
  ]);
  return JSON.parse(json);
}

function viewIssue(repo, number) {
  const json = gh([
    "issue",
    "view",
    String(number),
    "--repo",
    repo,
    "--json",
    "number,title,body,labels,url"
  ]);
  return JSON.parse(json);
}

function ensureLabels(repo) {
  const needed = [
    { name: "orch:ready", color: "ededed", description: "Orchestration task ready to claim" },
    { name: "orch:running", color: "ededed", description: "Orchestration task claimed/running" },
    { name: "orch:awaiting_review", color: "ededed", description: "Orchestration task awaiting review" },
    { name: "orch:awaiting_human_approval", color: "ededed", description: "Human approval required" }
  ];
  const existing = JSON.parse(gh(["label", "list", "--repo", repo, "--json", "name"]))
    .map((l) => l.name);
  for (const label of needed) {
    if (existing.includes(label.name)) continue;
    // best-effort create
    spawnSync("gh", [
      "label",
      "create",
      label.name,
      "--repo",
      repo,
      "--color",
      label.color,
      "--description",
      label.description
    ], { stdio: "ignore" });
  }
}

function extractField(body, label) {
  const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\n]+)`, "i");
  const m = body.match(re);
  return m ? m[1].trim() : null;
}

function extractExecuteBlock(body) {
  // Strict: require a fenced block starting with ```sh or ```bash and preceded by a line containing "EXECUTE".
  const re = /EXECUTE[\s\S]*?```(?:bash|sh)\n([\s\S]*?)```/i;
  const m = body.match(re);
  return m ? m[1].trim() : null;
}

function postResult(repo, issueNumber, result) {
  const tmp = "/tmp/orchestration-result.json";
  fs.writeFileSync(tmp, JSON.stringify(result, null, 2));
  execFileSync(
    "node",
    ["scripts/post-orchestration-result.mjs", "--repo", repo, "--issue", String(issueNumber), "--result", tmp],
    { stdio: "inherit" }
  );
}

function claimIssue(repo, issueNumber) {
  // Move labels: ready -> running
  spawnSync("gh", ["issue", "edit", String(issueNumber), "--repo", repo, "--remove-label", "orch:ready"], { stdio: "ignore" });
  spawnSync("gh", ["issue", "edit", String(issueNumber), "--repo", repo, "--add-label", "orch:running"], { stdio: "ignore" });
}

function setAwaitingReview(repo, issueNumber) {
  spawnSync("gh", ["issue", "edit", String(issueNumber), "--repo", repo, "--remove-label", "orch:running"], { stdio: "ignore" });
  spawnSync("gh", ["issue", "edit", String(issueNumber), "--repo", repo, "--add-label", "orch:awaiting_review"], { stdio: "ignore" });
}

function setAwaitingHuman(repo, issueNumber) {
  spawnSync("gh", ["issue", "edit", String(issueNumber), "--repo", repo, "--remove-label", "orch:ready"], { stdio: "ignore" });
  spawnSync("gh", ["issue", "edit", String(issueNumber), "--repo", repo, "--add-label", "orch:awaiting_human_approval"], { stdio: "ignore" });
}

function runShell(command) {
  // Extremely conservative allowlist: no pipes, no redirects, no env exports.
  if (/[|&;<>]/.test(command)) throw new Error("Unsafe shell metacharacters in EXECUTE block");
  const allowed = ["npm", "node", "pnpm", "git", "gh", "rg", "tsx"];
  const first = command.trim().split(/\s+/)[0];
  if (!allowed.includes(first)) throw new Error(`Command not allowlisted: ${first}`);
  const res = spawnSync(command, { shell: true, stdio: "inherit" });
  if (res.status !== 0) throw new Error(`Command failed: ${command}`);
}

async function handleOne(repo, agent, issueNumber) {
  const issue = viewIssue(repo, issueNumber);
  const body = issue.body ?? "";
  const taskId = extractField(body, "task_id") ?? `issue-${issueNumber}`;
  const assigned = extractField(body, "assigned_agent") ?? "";
  const humanRequired = extractField(body, "human_approval_required");

  if (assigned && assigned.toUpperCase() !== agent.toUpperCase()) return;

  if (humanRequired && humanRequired.toLowerCase() === "true") {
    setAwaitingHuman(repo, issueNumber);
    postResult(repo, issueNumber, {
      TASK_ID: taskId,
      STATUS: "AWAITING_HUMAN_APPROVAL",
      SUMMARY: "Task requires human approval; watcher will not execute.",
      CHANGES: [],
      FILES_CHANGED: [],
      DB_CHANGES: "NO",
      MIGRATION: null,
      TESTS: "N/A",
      PR: null,
      MERGE_STATUS: "N/A",
      PRODUCTION_CHANGE: "NO",
      UNEXPECTED_RESULTS: [],
      DECISIONS_REQUIRED: ["Provide human approval or revise task to remove approval-gated actions."],
      BLOCKERS: [],
      NEXT_RECOMMENDED_TASK: null,
      SESSION_HEALTH: "GOOD",
      SESSION_CONTEXT: "UNKNOWN"
    });
    return;
  }

  claimIssue(repo, issueNumber);

  const execBlock = extractExecuteBlock(body);
  if (execBlock) {
    for (const line of execBlock.split("\n").map((l) => l.trim()).filter(Boolean)) {
      runShell(line);
    }
  }

  // V1: watcher does not infer follow-up tasks.
  setAwaitingReview(repo, issueNumber);
  postResult(repo, issueNumber, {
    TASK_ID: taskId,
    STATUS: "AWAITING_REVIEW",
    SUMMARY: execBlock
      ? "Claimed issue and executed bounded EXECUTE block; awaiting review."
      : "Claimed issue. No EXECUTE block present; awaiting review for manual execution by Jeeves.",
    CHANGES: [],
    FILES_CHANGED: [],
    DB_CHANGES: "NO",
    MIGRATION: null,
    TESTS: "N/A",
    PR: null,
    MERGE_STATUS: "N/A",
    PRODUCTION_CHANGE: "NO",
    UNEXPECTED_RESULTS: [],
    DECISIONS_REQUIRED: [],
    BLOCKERS: execBlock ? [] : ["No executable block supplied; add an EXECUTE codeblock or let Jeeves run manually."],
    NEXT_RECOMMENDED_TASK: null,
    SESSION_HEALTH: "GOOD",
    SESSION_CONTEXT: "UNKNOWN"
  });
}

async function loop() {
  const args = parseArgs(process.argv);
  ensureLabels(args.repo);
  do {
    const issues = listReadyIssues(args.repo, args.maxIssues);
    for (const it of issues) {
      await handleOne(args.repo, args.agent, it.number);
    }
    if (args.once) break;
    await new Promise((r) => setTimeout(r, args.intervalSeconds * 1000));
  } while (true);
}

loop().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg);
  process.exitCode = 1;
});

