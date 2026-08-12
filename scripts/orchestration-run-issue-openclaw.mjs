/*
  Natural-language orchestration adapter (V1.1)

  - Fetches a GitHub issue OrchestrationTaskV1 body
  - Classifies execution class
  - Builds compact prompt (REFERENCE + DELTA)
  - Runs an isolated headless OpenClaw turn via `openclaw agent exec`
  - Parses OrchestrationResultContractV1 or ArchitectCheckpointV1 from agent output
  - Posts structured comment back to the issue and moves it to awaiting review

  `agent exec` intentionally avoids the long-lived interactive `main` session. This
  prevents live-session model-switch/session-lock collisions and skips workspace
  bootstrap injection for automation runs.
*/

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

function section(body, heading) {
  const re = new RegExp(`^###\\s+${heading}\\s*$`, "im");
  const start = body.search(re);
  if (start < 0) return null;
  const afterHeading = body.slice(start).replace(re, "").trimStart();
  const next = afterHeading.search(/^###\s+/m);
  const chunk = next < 0 ? afterHeading : afterHeading.slice(0, next);
  return chunk.trim();
}

function extractReferenceDelta(body) {
  return {
    reference: section(body, "Reference"),
    delta: section(body, "Delta"),
    goal: section(body, "Goal"),
    constraints: section(body, "Constraints"),
    acceptance: section(body, "Acceptance criteria")
  };
}

function classifyExecution({ stream, humanApprovalRequired, body }) {
  if (humanApprovalRequired) {
    return { executionClass: "KEEGAN_APPROVAL_REQUIRED", reason: "human_approval_required=true" };
  }
  if (["CORE_INTELLIGENCE", "DISCOVERY_INTELLIGENCE", "INTELLIGENCE_UX"].includes(stream)) {
    return { executionClass: "ARCHITECT_REVIEW_REQUIRED", reason: `stream=${stream} is review-sensitive` };
  }
  const text = String(body ?? "").toLowerCase();
  const reviewKeywords = [
    "migration",
    "schema",
    "rls",
    "security",
    "auth",
    "credentials",
    "smtp",
    "production write",
    "valuation",
    "ranking",
    "recommendation",
    "coverage semantics",
    "claim semantics",
    "evidence semantics"
  ];
  if (reviewKeywords.some((k) => text.includes(k))) {
    return { executionClass: "ARCHITECT_REVIEW_REQUIRED", reason: "review keywords present" };
  }
  return { executionClass: "AUTO_CONTINUE", reason: "default" };
}

function buildCompactAgentPrompt({ repo, issueNumber, title, body, executionClass }) {
  const s = extractReferenceDelta(body);
  const header = [
    `You are Jeeves executing GitHub orchestration task #${issueNumber} in ${repo}.`,
    `Work from the local business-dashboard repository/worktree.`,
    `Do NOT use Telegram for routine progress; all routine results go to GitHub issue comments.`,
    `TASK TITLE: ${title}`
  ].join("\n");

  const safety = [
    `Safety gates (hard):`,
    `- Never execute human-gated actions (credentials, outreach, purchases, destructive actions, material production writes).`,
    `- No DB schema/migrations unless explicitly allowed (default: forbidden).`,
    `- No SMTP/email sending.`,
    `- No external publishing beyond GitHub issue/PR comments.`
  ].join("\n");

  const reference = s.reference ? `REFERENCE:\n${s.reference}` : `REFERENCE: (missing)`;
  const delta = s.delta ? `DELTA:\n${s.delta}` : `DELTA: (missing)`;
  const goal = s.goal ? `GOAL:\n${s.goal}` : "";
  const constraints = s.constraints ? `CONSTRAINTS:\n${s.constraints}` : "";
  const acceptance = s.acceptance ? `ACCEPTANCE CRITERIA:\n${s.acceptance}` : "";

  const outputContract =
    executionClass === "ARCHITECT_REVIEW_REQUIRED"
      ? [
          `Return ONLY ArchitectCheckpointV1 as strict JSON (no prose).`,
          `Do NOT implement code changes until architect approval is explicitly recorded.`
        ].join("\n")
      : [
          `Return ONLY OrchestrationResultContractV1 as strict JSON (no prose).`,
          `If blocked, set STATUS=BLOCKED and explain blockers.`
        ].join("\n");

  return [header, "", safety, reference, "", delta, "", goal, "", constraints, "", acceptance, "", outputContract]
    .filter((p) => typeof p === "string" && p.trim().length > 0)
    .join("\n\n");
}

function parseOrchestrationResult(text) {
  function extractJsonObject(t) {
    const fenced = t.match(/```json\n([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1] : t;
    return JSON.parse(candidate.trim());
  }
  try {
    const obj = extractJsonObject(text);
    if (obj && typeof obj === "object") {
      if (typeof obj.TASK_ID === "string" && typeof obj.STATUS === "string" && typeof obj.SUMMARY === "string") {
        return { kind: "result", value: obj };
      }
      if (typeof obj.TASK_ID === "string" && typeof obj.CHECKPOINT_ID === "string" && typeof obj.QUESTION_OR_DECISION === "string") {
        return { kind: "checkpoint", value: obj };
      }
    }
    return { kind: "invalid", error: "JSON parsed but did not match known contracts" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { kind: "invalid", error: message };
  }
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const repo = arg("--repo");
const issue = arg("--issue");
const timeoutSeconds = Number(arg("--timeout") ?? "600");
if (!repo || !issue) {
  console.error("Usage: node scripts/orchestration-run-issue-openclaw.mjs --repo owner/repo --issue N [--timeout 600]");
  process.exit(2);
}
if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 30) {
  console.error("--timeout must be >= 30 seconds");
  process.exit(2);
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", timeout: 30_000 }).trim();
}

function postComment(body) {
  execFileSync("gh", ["issue", "comment", String(issue), "--repo", repo, "--body", body], { stdio: "inherit", timeout: 30_000 });
}

function transitionLabel(removeLabel, addLabel) {
  if (removeLabel) {
    execFileSync("gh", ["issue", "edit", String(issue), "--repo", repo, "--remove-label", removeLabel], {
      stdio: "ignore",
      timeout: 30_000
    });
  }
  if (addLabel) {
    execFileSync("gh", ["issue", "edit", String(issue), "--repo", repo, "--add-label", addLabel], {
      stdio: "ignore",
      timeout: 30_000
    });
  }
}

function extractField(body, label) {
  const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\n]+)`, "i");
  const m = body.match(re);
  return m ? m[1].trim() : null;
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
    BLOCKERS: [],
    NEXT_RECOMMENDED_TASK: null,
    SESSION_HEALTH: "GOOD",
    SESSION_CONTEXT: "ISOLATED_HEADLESS"
  };
}

function safeTrunc(text, max) {
  if (!text) return "";
  return text.length <= max ? text : `${text.slice(0, max)}\n…(truncated)`;
}

function finishAwaitingReview() {
  try {
    transitionLabel("orch:running", "orch:awaiting_review");
  } catch (err) {
    console.error(`Failed to transition issue #${issue} to awaiting review: ${err instanceof Error ? err.message : String(err)}`);
  }
}

const issueJson = gh(["issue", "view", String(issue), "--repo", repo, "--json", "number,title,body,url"]);
const task = JSON.parse(issueJson);
const taskId = extractField(task.body ?? "", "task_id") ?? `issue-${task.number}`;
const humanRequired = /\*\*human_approval_required:\*\*\s*true/i.test(task.body ?? "");
const streamMatch = (task.body ?? "").match(/\*\*stream:\*\*\s*([^\n]+)/i);
const stream = streamMatch ? streamMatch[1].trim() : "OTHER";
const classified = classifyExecution({ stream, humanApprovalRequired: humanRequired, body: task.body ?? "" });
const prompt = buildCompactAgentPrompt({
  repo,
  issueNumber: task.number,
  title: task.title,
  body: task.body ?? "",
  executionClass: classified.executionClass
});

if (classified.executionClass === "KEEGAN_APPROVAL_REQUIRED") {
  postComment([
    "## OrchestrationResultContractV1",
    "",
    "```json",
    JSON.stringify({
      ...resultBase(taskId),
      STATUS: "AWAITING_HUMAN_APPROVAL",
      SUMMARY: "Task requires human approval; adapter will not execute.",
      DECISIONS_REQUIRED: [classified.reason]
    }, null, 2),
    "```"
  ].join("\n"));
  try {
    transitionLabel("orch:running", "orch:awaiting_human_approval");
  } catch {}
  process.exit(0);
}

const openclawPath = "/opt/homebrew/bin/openclaw";
const promptPath = path.join(os.tmpdir(), `orchestration-agent-prompt-${issue}-${process.pid}.md`);
fs.writeFileSync(promptPath, prompt, { encoding: "utf8", mode: 0o600 });

let out = "";
let stderr = "";
try {
  out = execFileSync(openclawPath, [
    "agent",
    "exec",
    "--message-file", promptPath,
    "--cwd", process.cwd(),
    "--json",
    "--thinking", "high",
    "--timeout", String(timeoutSeconds)
  ], {
    encoding: "utf8",
    timeout: (timeoutSeconds + 60) * 1000,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"]
  });
} catch (err) {
  stderr = typeof err?.stderr === "string" ? err.stderr : "";
  const stdout = typeof err?.stdout === "string" ? err.stdout : "";
  const msg = err instanceof Error ? err.message : String(err);
  postComment([
    "## OrchestrationResultContractV1",
    "",
    "```json",
    JSON.stringify({
      ...resultBase(taskId),
      STATUS: "FAILED",
      SUMMARY: "isolated openclaw agent exec failed",
      BLOCKERS: [safeTrunc(msg, 400)],
      UNEXPECTED_RESULTS: [safeTrunc(`STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`, 4000)],
      NEXT_RECOMMENDED_TASK: "Inspect the isolated agent-exec failure; do not retry through the live main session."
    }, null, 2),
    "```"
  ].join("\n"));
  finishAwaitingReview();
  try { fs.unlinkSync(promptPath); } catch {}
  process.exit(1);
}
try { fs.unlinkSync(promptPath); } catch {}

let envelope;
try {
  envelope = JSON.parse(out);
} catch {
  postComment([
    "## OrchestrationResultContractV1",
    "",
    "```json",
    JSON.stringify({
      ...resultBase(taskId),
      STATUS: "FAILED",
      SUMMARY: "Could not parse openclaw agent exec --json output",
      BLOCKERS: ["Invalid JSON envelope from openclaw agent exec"],
      UNEXPECTED_RESULTS: [safeTrunc(out, 4000)]
    }, null, 2),
    "```"
  ].join("\n"));
  finishAwaitingReview();
  process.exit(1);
}

if (envelope?.ok === false || envelope?.status === "error" || envelope?.status === "timeout") {
  postComment([
    "## OrchestrationResultContractV1",
    "",
    "```json",
    JSON.stringify({
      ...resultBase(taskId),
      STATUS: envelope?.status === "timeout" ? "BLOCKED" : "FAILED",
      SUMMARY: `openclaw agent exec returned ${envelope?.status ?? "error"}`,
      BLOCKERS: [safeTrunc(envelope?.error?.message ?? "agent exec failed", 1000)],
      UNEXPECTED_RESULTS: [safeTrunc(JSON.stringify(envelope), 4000)]
    }, null, 2),
    "```"
  ].join("\n"));
  finishAwaitingReview();
  process.exit(1);
}

const finalText = envelope?.final ?? (Array.isArray(envelope?.payloads) ? envelope.payloads.map((p) => p.text).filter(Boolean).join("\n\n") : "");
const parsed = parseOrchestrationResult(String(finalText ?? ""));
const metaLine = `agentExecMeta: ${JSON.stringify({
  model: envelope?.model ?? null,
  provider: envelope?.provider ?? null,
  usage: envelope?.usage ?? null,
  costUsd: envelope?.costUsd ?? null,
  sessionId: envelope?.sessionId ?? null
})}`;

if (parsed.kind === "invalid") {
  postComment([
    "## OrchestrationResultContractV1",
    "",
    "```json",
    JSON.stringify({
      ...resultBase(taskId),
      STATUS: "BLOCKED",
      SUMMARY: "Agent returned output that did not match required structured contracts",
      BLOCKERS: [parsed.error],
      UNEXPECTED_RESULTS: [safeTrunc(String(finalText ?? ""), 4000)],
      NEXT_RECOMMENDED_TASK: "Request strict OrchestrationResultContractV1 or ArchitectCheckpointV1 JSON only."
    }, null, 2),
    "```",
    "",
    `<!-- ${metaLine} -->`
  ].join("\n"));
  finishAwaitingReview();
  process.exit(1);
}

const contractBody = parsed.kind === "checkpoint"
  ? ["## ArchitectCheckpointV1", "", "```json", JSON.stringify(parsed.value, null, 2), "```"].join("\n")
  : ["## OrchestrationResultContractV1", "", "```json", JSON.stringify(parsed.value, null, 2), "```"].join("\n");

postComment([contractBody, "", `<!-- ${metaLine} -->`].join("\n"));
finishAwaitingReview();
