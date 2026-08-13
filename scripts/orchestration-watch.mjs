/*
  Orchestration Watcher (V1.2)

  - Polls GitHub issues labeled `agent-orchestration` + `orch:ready`
  - Claims issues assigned to JEEVES
  - Human-gated tasks stop safely
  - Explicit EXECUTE blocks run only through a strict command allowlist
  - Natural-language tasks launch as detached isolated OpenClaw agent-exec turns
  - Every bounded launcher/command has a timeout
  - Per-task failures are converted into structured BLOCKED results
  - One failed/hung task cannot terminate or monopolize the watcher loop
*/

import fs from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";

const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
const ALLOWED_EXECUTABLES = new Set([
  "npm",
  "node",
  "pnpm",
  "git",
  "gh",
  "rg",
  "tsx",
  "openclaw",
  "launchctl",
  "ps",
  "tail",
  "head"
]);

function parseArgs(argv) {
  const out = {
    repo: null,
    agent: "JEEVES",
    once: false,
    intervalSeconds: 60,
    maxIssues: 5,
    commandTimeoutMs: Number(process.env.ORCH_COMMAND_TIMEOUT_MS ?? DEFAULT_COMMAND_TIMEOUT_MS)
  };

  for (let i = 2; i < argv.length; i += 1) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--repo") out.repo = v;
    if (k === "--agent") out.agent = v;
    if (k === "--once") out.once = true;
    if (k === "--interval") out.intervalSeconds = Number(v);
    if (k === "--max") out.maxIssues = Number(v);
    if (k === "--command-timeout-ms") out.commandTimeoutMs = Number(v);
  }

  if (!out.repo) throw new Error("Missing --repo owner/repo");
  if (!Number.isFinite(out.intervalSeconds) || out.intervalSeconds < 20) {
    throw new Error("--interval must be >= 20 seconds (avoid busy loops)");
  }
  if (!Number.isFinite(out.commandTimeoutMs) || out.commandTimeoutMs < 1_000) {
    throw new Error("--command-timeout-ms must be >= 1000");
  }
  return out;
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", timeout: 30_000 }).trim();
}

function listReadyIssues(repo, maxIssues) {
  const json = gh([
    "issue", "list", "--repo", repo, "--state", "open",
    "--label", "agent-orchestration", "--label", "orch:ready",
    "--limit", String(maxIssues), "--json", "number,title,url"
  ]);
  return JSON.parse(json);
}

function listHealCandidates(repo, maxIssues) {
  // Self-heal: valid orchestration tasks must never be invisible due to missing orch:* state.
  // Only heal issues already labeled agent-orchestration and missing ALL known orch state labels.
  const search = [
    'label:"agent-orchestration"',
    '-label:"orch:ready"',
    '-label:"orch:running"',
    '-label:"orch:awaiting_review"',
    '-label:"orch:awaiting_human_approval"'
  ].join(" ");

  const json = gh([
    "issue",
    "list",
    "--repo",
    repo,
    "--state",
    "open",
    "--search",
    search,
    "--limit",
    String(maxIssues),
    "--json",
    "number,title,url"
  ]);
  return JSON.parse(json);
}

function viewIssue(repo, number) {
  const json = gh(["issue", "view", String(number), "--repo", repo, "--json", "number,title,body,labels,url"]);
  return JSON.parse(json);
}

function ensureLabels(repo) {
  const needed = [
    { name: "orch:ready", color: "ededed", description: "Orchestration task ready to claim" },
    { name: "orch:running", color: "ededed", description: "Orchestration task claimed/running" },
    { name: "orch:awaiting_review", color: "ededed", description: "Orchestration task awaiting review" },
    { name: "orch:awaiting_human_approval", color: "ededed", description: "Human approval required" }
  ];
  const existing = JSON.parse(gh(["label", "list", "--repo", repo, "--json", "name"])).map((l) => l.name);
  for (const label of needed) {
    if (existing.includes(label.name)) continue;
    spawnSync("gh", ["label", "create", label.name, "--repo", repo, "--color", label.color, "--description", label.description], {
      stdio: "ignore", timeout: 30_000
    });
  }
}

function extractField(body, label) {
  const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\\n]+)`, "i");
  const m = body.match(re);
  return m ? m[1].trim() : null;
}

function hasSection(body, heading) {
  const re = new RegExp(`^###\\s+${heading}\\s*$`, "im");
  return re.test(String(body ?? ""));
}

function looksLikeOrchestrationTaskBody(body) {
  // Canonical task surface is the GitHub issue template.
  // Keep validation deterministic + conservative (fail-closed) to avoid mutating non-task issues.
  const requiredFields = [
    "task_id",
    "milestone",
    "stream",
    "requested_by",
    "assigned_agent",
    "priority",
    "human_approval_required"
  ];

  for (const f of requiredFields) {
    if (!extractField(body, f)) return false;
  }

  if (!hasSection(body, "Reference")) return false;
  if (!hasSection(body, "Delta")) return false;
  return true;
}

function selfHealMissingReady(repo, agent, maxIssues) {
  const candidates = listHealCandidates(repo, maxIssues);
  for (const c of candidates) {
    const issue = viewIssue(repo, c.number);
    const body = issue.body ?? "";
    const assigned = extractField(body, "assigned_agent") ?? "";
    if (assigned && assigned.toUpperCase() !== agent.toUpperCase()) continue;
    if (!looksLikeOrchestrationTaskBody(body)) continue;

    spawnSync(
      "gh",
      ["issue", "edit", String(c.number), "--repo", repo, "--add-label", "orch:ready"],
      { stdio: "ignore", timeout: 30_000 }
    );
  }
}

function extractExecuteBlock(body) {
  const re = /EXECUTE[\s\S]*?```(?:bash|sh)\n([\s\S]*?)```/i;
  const m = body.match(re);
  return m ? m[1].trim() : null;
}

function postResult(repo, issueNumber, result) {
  const tmp = `/tmp/orchestration-result-${issueNumber}.json`;
  fs.writeFileSync(tmp, JSON.stringify(result, null, 2));
  execFileSync(process.execPath, ["scripts/post-orchestration-result.mjs", "--repo", repo, "--issue", String(issueNumber), "--result", tmp], {
    stdio: "inherit", timeout: 30_000
  });
}

function editLabel(repo, issueNumber, removeLabel, addLabel) {
  if (removeLabel) {
    spawnSync("gh", ["issue", "edit", String(issueNumber), "--repo", repo, "--remove-label", removeLabel], { stdio: "ignore", timeout: 30_000 });
  }
  if (addLabel) {
    spawnSync("gh", ["issue", "edit", String(issueNumber), "--repo", repo, "--add-label", addLabel], { stdio: "ignore", timeout: 30_000 });
  }
}

function claimIssue(repo, issueNumber) {
  editLabel(repo, issueNumber, "orch:ready", "orch:running");
}
function setAwaitingReview(repo, issueNumber) {
  editLabel(repo, issueNumber, "orch:running", "orch:awaiting_review");
}
function setAwaitingHuman(repo, issueNumber) {
  editLabel(repo, issueNumber, "orch:ready", "orch:awaiting_human_approval");
}

function parseSimpleCommand(line) {
  const command = line.trim();
  if (!command || command.startsWith("#")) return null;
  if (/[|&;<>`$()]/.test(command)) {
    throw new Error(`Unsafe shell syntax in EXECUTE line: ${command}`);
  }
  const parts = command.split(/\s+/).filter(Boolean);
  const executable = parts.shift();
  if (!executable || !ALLOWED_EXECUTABLES.has(executable)) {
    throw new Error(`Command not allowlisted: ${executable ?? "<empty>"}`);
  }
  return { executable, args: parts, display: command };
}

function runCommand(line, timeoutMs) {
  const parsed = parseSimpleCommand(line);
  if (!parsed) return;
  const res = spawnSync(parsed.executable, parsed.args, {
    encoding: "utf8", timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024
  });
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  if (res.error) {
    if (res.error.code === "ETIMEDOUT") throw new Error(`Command timed out after ${timeoutMs}ms: ${parsed.display}`);
    throw new Error(`Command execution error (${res.error.code ?? "unknown"}): ${parsed.display}`);
  }
  if (res.status !== 0) throw new Error(`Command failed with exit ${res.status}: ${parsed.display}`);
}

function resultBase(taskId) {
  return {
    TASK_ID: taskId,
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
    NEXT_RECOMMENDED_TASK: null,
    SESSION_HEALTH: "GOOD",
    SESSION_CONTEXT: "UNKNOWN"
  };
}

async function handleOne(repo, agent, issueNumber, commandTimeoutMs) {
  const issue = viewIssue(repo, issueNumber);
  const body = issue.body ?? "";
  const taskId = extractField(body, "task_id") ?? `issue-${issueNumber}`;
  const assigned = extractField(body, "assigned_agent") ?? "";
  const humanRequired = extractField(body, "human_approval_required");

  if (assigned && assigned.toUpperCase() !== agent.toUpperCase()) return;

  if (humanRequired && humanRequired.toLowerCase() === "true") {
    setAwaitingHuman(repo, issueNumber);
    postResult(repo, issueNumber, {
      ...resultBase(taskId),
      STATUS: "AWAITING_HUMAN_APPROVAL",
      SUMMARY: "Task requires human approval; watcher will not execute.",
      DECISIONS_REQUIRED: ["Provide human approval or revise task to remove approval-gated actions."],
      BLOCKERS: []
    });
    return;
  }

  claimIssue(repo, issueNumber);
  const execBlock = extractExecuteBlock(body);

  try {
    if (execBlock) {
      const lines = execBlock.split("\n").map((line) => line.trim()).filter(Boolean);
      for (const line of lines) runCommand(line, commandTimeoutMs);
      setAwaitingReview(repo, issueNumber);
      postResult(repo, issueNumber, {
        ...resultBase(taskId),
        STATUS: "AWAITING_REVIEW",
        SUMMARY: "Claimed issue and executed bounded EXECUTE block; awaiting review.",
        BLOCKERS: []
      });
      return;
    }

    // Natural-language tasks are launched detached. The adapter owns its isolated
    // OpenClaw execution, result posting, timeout/cleanup, and final label transition.
    runCommand(
      `node scripts/launch-orchestration-nl-detached.mjs --repo ${repo} --issue ${issueNumber} --timeout 180`,
      Math.max(commandTimeoutMs, 30_000)
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setAwaitingReview(repo, issueNumber);
    postResult(repo, issueNumber, {
      ...resultBase(taskId),
      STATUS: "BLOCKED",
      SUMMARY: "Bounded task execution stopped safely and requires review.",
      BLOCKERS: [message]
    });
  }
}

async function loop() {
  const args = parseArgs(process.argv);
  ensureLabels(args.repo);
  // Heal first so we never miss tasks created without orch:ready.
  selfHealMissingReady(args.repo, args.agent, Math.max(args.maxIssues, 20));
  do {
    let issues = [];
    try {
      // Periodic heal to enforce template/watcher parity over time.
      selfHealMissingReady(args.repo, args.agent, Math.max(args.maxIssues, 20));
      issues = listReadyIssues(args.repo, args.maxIssues);
    } catch (err) {
      console.error(`Watcher poll failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    for (const it of issues) {
      try {
        await handleOne(args.repo, args.agent, it.number, args.commandTimeoutMs);
      } catch (err) {
        console.error(`Issue #${it.number} handler failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (args.once) break;
    await new Promise((resolve) => setTimeout(resolve, args.intervalSeconds * 1000));
  } while (true);
}

loop().catch((err) => {
  console.error(`Fatal watcher startup error: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
