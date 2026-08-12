/*
  Natural-language orchestration adapter (V1.4)

  Contract:
  - Uses VERIFIED OpenClaw CLI interface: `openclaw agent --agent main --message ... --json`
  - Preserves gates:
    - AUTO_CONTINUE
    - ARCHITECT_REVIEW_REQUIRED
    - KEEGAN_APPROVAL_REQUIRED (human_approval_required=true)
  - Posts OrchestrationResultContractV1 or ArchitectCheckpointV1 back to the originating GitHub issue.
  - Consumes recorded ArchitectDecisionV1 approvals from issue comments.

  Usage:
    node scripts/orchestration-run-issue-openclaw.mjs --repo owner/repo --issue 212 --agent main --timeout 120

  Notes:
  - This script is self-contained JS (launchd-safe; no TS loader required).
  - It does not implement SMTP or any mailbox/network integrations.
*/

import { execFileSync } from "node:child_process";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const repo = arg("--repo");
const issue = arg("--issue");
const agent = arg("--agent") ?? "main";
const timeoutSeconds = Number(arg("--timeout") ?? "90");

if (!repo || !issue) {
  console.error("Usage: node scripts/orchestration-run-issue-openclaw.mjs --repo owner/repo --issue N [--agent main] [--timeout 120]");
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
  execFileSync("gh", ["issue", "comment", String(issue), "--repo", repo, "--body", body], {
    stdio: "inherit",
    timeout: 30_000
  });
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
  const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\\n]+)`, "i");
  const m = String(body ?? "").match(re);
  return m ? m[1].trim() : null;
}

function section(body, heading) {
  const re = new RegExp(`^###\\s+${heading}\\s*$`, "im");
  const start = String(body ?? "").search(re);
  if (start < 0) return null;
  const afterHeading = String(body ?? "").slice(start).replace(re, "").trimStart();
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

function latestApprovedArchitectDecision(comments) {
  const list = Array.isArray(comments) ? comments : [];
  let latestCheckpointIndex = -1;
  let latestApprovalIndex = -1;
  let latestApprovalBody = "";

  for (let i = 0; i < list.length; i += 1) {
    const body = String(list[i]?.body ?? "");
    if (/##\s+ArchitectCheckpointV1/i.test(body)) latestCheckpointIndex = i;
    if (/##\s+ArchitectDecisionV1/i.test(body) && /DECISION:\s*(?:APPROVE|APPROVE_AND_PROCEED)\b/i.test(body)) {
      latestApprovalIndex = i;
      latestApprovalBody = body;
    }
  }

  return latestApprovalIndex > latestCheckpointIndex ? latestApprovalBody : null;
}

function reviewIntentText(body) {
  const s = extractReferenceDelta(body);
  const actionText = [s.delta, s.goal].filter(Boolean).join("\n");
  return actionText
    .split("\n")
    .filter((line) => !/^\s*(?:[-*]\s*)?(?:no\b|do not\b|don't\b|must not\b|never\b)/i.test(line))
    .join("\n")
    .toLowerCase();
}

function classifyExecution({ stream, humanApprovalRequired, body, comments }) {
  if (humanApprovalRequired) return { executionClass: "KEEGAN_APPROVAL_REQUIRED", reason: "human_approval_required=true" };

  const approvedDecision = latestApprovedArchitectDecision(comments);
  if (approvedDecision) {
    return { executionClass: "AUTO_CONTINUE", reason: "latest architect checkpoint has a subsequent approval" };
  }

  if (["CORE_INTELLIGENCE", "DISCOVERY_INTELLIGENCE", "INTELLIGENCE_UX"].includes(stream)) {
    return { executionClass: "ARCHITECT_REVIEW_REQUIRED", reason: `stream=${stream} is review-sensitive` };
  }

  // Review only affirmative action intent. Safety constraints such as
  // "No credentials" or "Do not perform production writes" must not turn
  // a read-only AUTO_CONTINUE task into an architect checkpoint.
  const text = reviewIntentText(body);
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
    return { executionClass: "ARCHITECT_REVIEW_REQUIRED", reason: "affirmative review-sensitive action intent present" };
  }
  return { executionClass: "AUTO_CONTINUE", reason: "default" };
}

function buildCompactAgentPrompt({ repo, issueNumber, title, body, comments, executionClass }) {
  const s = extractReferenceDelta(body);
  const approvedDecision = latestApprovedArchitectDecision(comments);

  // Hard token discipline: do not replay full issue bodies or comment history.
  // Provide only REFERENCE + DELTA + the latest applicable architect decision.
  const maxRefChars = 1200;
  const maxDeltaChars = 1200;
  const maxDecisionChars = 1400;

  const header = [
    `You are Jeeves executing GitHub orchestration task #${issueNumber} in ${repo}.`,
    `Work from the local business-dashboard repository/worktree.`,
    `TASK TITLE: ${title}`
  ].join("\n");

  const reference = s.reference
    ? `REFERENCE (truncated):\n${safeTrunc(s.reference, maxRefChars)}`
    : `REFERENCE: (missing)`;
  const delta = s.delta
    ? `DELTA (truncated):\n${safeTrunc(s.delta, maxDeltaChars)}`
    : `DELTA: (missing)`;
  const decision = approvedDecision
    ? `RECORDED ARCHITECT DECISION (authoritative for this rerun):\n${safeTrunc(approvedDecision, maxDecisionChars)}`
    : null;

  const outputContract =
    executionClass === "ARCHITECT_REVIEW_REQUIRED"
      ? [
          `Return ONLY ArchitectCheckpointV1 as strict JSON (no prose).`,
          `Do NOT implement code changes until architect approval is explicitly recorded.`,
          `Keep it short: decision + smallest next validation step.`
        ].join("\n")
      : [
          `Return ONLY OrchestrationResultContractV1 as strict JSON (no prose).`,
          approvedDecision
            ? `An architect approval is already recorded above. Proceed only within that approved scope; do not ask the same approval question again.`
            : `Do not run tools unless explicitly required; prefer a concise result.`
        ].join("\n");

  return [header, "", reference, "", delta, decision ? `\n${decision}` : "", "", outputContract].join("\n\n");
}

function safeTrunc(text, max) {
  const t = String(text ?? "");
  return t.length <= max ? t : `${t.slice(0, max)}\n…(truncated)`;
}

function resultBase(taskId) {
  return {
    TASK_ID: taskId,
    STATUS: "FAILED",
    SUMMARY: "",
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
    SESSION_CONTEXT: "UNKNOWN"
  };
}

function parseOrchestrationResult(text) {
  const fenced = String(text ?? "").match(/```json\n([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : String(text ?? "");
  const obj = JSON.parse(candidate.trim());

  if (obj && typeof obj === "object") {
    if (typeof obj.TASK_ID === "string" && typeof obj.STATUS === "string" && typeof obj.SUMMARY === "string") {
      return { kind: "result", value: obj };
    }
    if (typeof obj.TASK_ID === "string" && typeof obj.CHECKPOINT_ID === "string" && typeof obj.QUESTION_OR_DECISION === "string") {
      return { kind: "checkpoint", value: obj };
    }
  }

  return { kind: "invalid", error: "JSON parsed but did not match known contracts" };
}

function extractTextFromProjection(projection) {
  if (typeof projection === "string" && projection.trim().length > 0) return projection;
  if (!projection || typeof projection !== "object") return "";

  const agentMeta = projection?.meta?.agentMeta ?? projection?.agentMeta ?? null;
  const directCandidates = [
    projection?.final,
    projection?.text,
    projection?.reply,
    agentMeta?.final,
    agentMeta?.text,
    agentMeta?.reply
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) return candidate;
  }

  for (const payloads of [projection?.payloads, agentMeta?.payloads]) {
    if (!Array.isArray(payloads)) continue;
    const text = payloads
      .map((payload) => (typeof payload?.text === "string" ? payload.text : ""))
      .filter((value) => value.trim().length > 0)
      .join("\n\n");
    if (text.trim().length > 0) return text;
  }

  return "";
}

function extractAgentFinalText(envelope) {
  for (const projection of [envelope, envelope?.result, envelope?.meta?.agentMeta, envelope?.result?.meta?.agentMeta]) {
    const text = extractTextFromProjection(projection);
    if (text) return text;
  }
  return "";
}

function envelopeShape(envelope) {
  const rootKeys = envelope && typeof envelope === "object" ? Object.keys(envelope).sort() : [];
  const result = envelope?.result;
  const resultType = Array.isArray(result) ? "array" : result === null ? "null" : typeof result;
  const resultKeys = result && typeof result === "object" && !Array.isArray(result) ? Object.keys(result).sort() : [];
  const meta = envelope?.meta;
  const metaKeys = meta && typeof meta === "object" ? Object.keys(meta).sort() : [];
  const agentMeta = meta?.agentMeta;
  const agentMetaKeys = agentMeta && typeof agentMeta === "object" ? Object.keys(agentMeta).sort() : [];
  const resultMeta = result?.meta?.agentMeta ?? result?.agentMeta;
  const resultMetaKeys = resultMeta && typeof resultMeta === "object" ? Object.keys(resultMeta).sort() : [];
  return `envelopeKeys=${rootKeys.join(",")};resultType=${resultType};resultKeys=${resultKeys.join(",")};metaKeys=${metaKeys.join(",")};agentMetaKeys=${agentMetaKeys.join(",")};resultAgentMetaKeys=${resultMetaKeys.join(",")};attemptedAgents=${attemptedAgents.join(",")}`;
}

function finishAwaitingReview() {
  try {
    transitionLabel("orch:running", "orch:awaiting_review");
  } catch {}
}

const issueJson = gh(["issue", "view", String(issue), "--repo", repo, "--json", "number,title,body,url,comments"]);
const task = JSON.parse(issueJson);

const taskId = extractField(task.body ?? "", "task_id") ?? `issue-${task.number}`;
const humanRequired = /\*\*human_approval_required:\*\*\s*true/i.test(task.body ?? "");
const stream = extractField(task.body ?? "", "stream") ?? "OTHER";

const classified = classifyExecution({
  stream,
  humanApprovalRequired: humanRequired,
  body: task.body ?? "",
  comments: task.comments ?? []
});

if (classified.executionClass === "KEEGAN_APPROVAL_REQUIRED") {
  postComment([
    "## OrchestrationResultContractV1",
    "",
    "```json",
    JSON.stringify(
      {
        ...resultBase(taskId),
        STATUS: "AWAITING_HUMAN_APPROVAL",
        SUMMARY: "Task requires human approval; adapter will not execute.",
        DECISIONS_REQUIRED: [classified.reason]
      },
      null,
      2
    ),
    "```"
  ].join("\n"));
  try {
    transitionLabel("orch:running", "orch:awaiting_human_approval");
  } catch {}
  process.exit(0);
}

const prompt = buildCompactAgentPrompt({
  repo,
  issueNumber: task.number,
  title: task.title,
  body: task.body ?? "",
  comments: task.comments ?? [],
  executionClass: classified.executionClass
});

// Keep turns fast to avoid gateway-level timeouts; prompts are compact and output is strict JSON.
const thinking = "minimal";

let out;
const attemptedAgents = [];

function runOpenclaw(agentId) {
  attemptedAgents.push(agentId);
  return execFileSync(
    "/opt/homebrew/bin/openclaw",
    [
      "agent",
      "--agent",
      agentId,
      "--message",
      prompt,
      "--json",
      "--thinking",
      thinking,
      "--timeout",
      String(timeoutSeconds)
    ],
    {
      encoding: "utf8",
      timeout: (timeoutSeconds + 30) * 1000,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
}

function looksLikeTimeout(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("ETIMEDOUT") || msg.toLowerCase().includes("gateway timeout");
}

try {
  out = runOpenclaw(agent);
} catch (err) {
  // If main is degraded/unavailable, fall back to a known-fast orchestration agent.
  // This preserves the transport contract (openclaw agent) while preventing watcher stalls.
  if (agent === "main" && looksLikeTimeout(err)) {
    try {
      out = runOpenclaw("coding");
    } catch (err2) {
      const msg = err2 instanceof Error ? err2.message : String(err2);
      const stdout = typeof err2?.stdout === "string" ? err2.stdout : "";
      const stderr = typeof err2?.stderr === "string" ? err2.stderr : "";

      postComment([
        "## OrchestrationResultContractV1",
        "",
        "```json",
        JSON.stringify(
          {
            ...resultBase(taskId),
            STATUS: "FAILED",
            SUMMARY: "openclaw agent execution failed",
            BLOCKERS: [safeTrunc(msg, 400)],
            UNEXPECTED_RESULTS: [
              `attemptedAgents=${attemptedAgents.join(",")}`,
              safeTrunc(`STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`, 4000)
            ],
            NEXT_RECOMMENDED_TASK: "Verify OpenClaw gateway health and provider availability; main timed out and fallback agent also failed."
          },
          null,
          2
        ),
        "```"
      ].join("\n"));

      finishAwaitingReview();
      process.exit(1);
    }
  } else {
    const msg = err instanceof Error ? err.message : String(err);
    const stdout = typeof err?.stdout === "string" ? err.stdout : "";
    const stderr = typeof err?.stderr === "string" ? err.stderr : "";

    postComment([
      "## OrchestrationResultContractV1",
      "",
      "```json",
      JSON.stringify(
        {
          ...resultBase(taskId),
          STATUS: "FAILED",
          SUMMARY: "openclaw agent execution failed",
          BLOCKERS: [safeTrunc(msg, 400)],
          UNEXPECTED_RESULTS: [
            `attemptedAgents=${attemptedAgents.join(",")}`,
            safeTrunc(`STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`, 4000)
          ],
          NEXT_RECOMMENDED_TASK: "Retry after verifying Gateway health and provider availability."
        },
        null,
        2
      ),
      "```"
    ].join("\n"));

    finishAwaitingReview();
    process.exit(1);
  }
}

let envelope;
try {
  envelope = JSON.parse(String(out ?? ""));
} catch {
  postComment([
    "## OrchestrationResultContractV1",
    "",
    "```json",
    JSON.stringify(
      {
        ...resultBase(taskId),
        STATUS: "FAILED",
        SUMMARY: "Could not parse openclaw agent --json output",
        BLOCKERS: ["Invalid JSON envelope"],
        UNEXPECTED_RESULTS: [safeTrunc(out, 4000)]
      },
      null,
      2
    ),
    "```"
  ].join("\n"));
  finishAwaitingReview();
  process.exit(1);
}

const finalText = extractAgentFinalText(envelope);

let parsed;
try {
  parsed = parseOrchestrationResult(finalText);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  postComment([
    "## OrchestrationResultContractV1",
    "",
    "```json",
    JSON.stringify(
      {
        ...resultBase(taskId),
        STATUS: "BLOCKED",
        SUMMARY: "Agent returned output that did not match required structured contracts",
        BLOCKERS: [safeTrunc(msg, 400)],
        UNEXPECTED_RESULTS: [
          safeTrunc(finalText, 4000),
          envelopeShape(envelope)
        ],
        NEXT_RECOMMENDED_TASK: "Inspect the reported envelope shape or re-run with strict JSON output."
      },
      null,
      2
    ),
    "```"
  ].join("\n"));
  finishAwaitingReview();
  process.exit(1);
}

if (parsed.kind === "invalid") {
  postComment([
    "## OrchestrationResultContractV1",
    "",
    "```json",
    JSON.stringify(
      {
        ...resultBase(taskId),
        STATUS: "BLOCKED",
        SUMMARY: "Agent returned output that did not match required structured contracts",
        BLOCKERS: [parsed.error],
        UNEXPECTED_RESULTS: [
          safeTrunc(finalText, 4000),
          envelopeShape(envelope)
        ]
      },
      null,
      2
    ),
    "```"
  ].join("\n"));
  finishAwaitingReview();
  process.exit(1);
}

const meta = envelope?.meta?.agentMeta ?? envelope?.result?.meta?.agentMeta ?? envelope?.result?.agentMeta ?? null;
const metaLine = meta
  ? `agentMeta: ${JSON.stringify({ model: meta.model ?? null, usage: meta.usage ?? null, costUsd: meta.costUsd ?? null })}`
  : "agentMeta: unavailable";

const contractBody =
  parsed.kind === "checkpoint"
    ? ["## ArchitectCheckpointV1", "", "```json", JSON.stringify(parsed.value, null, 2), "```"].join("\n")
    : ["## OrchestrationResultContractV1", "", "```json", JSON.stringify(parsed.value, null, 2), "```"].join("\n");

postComment([contractBody, "", `<!-- ${metaLine} -->`].join("\n"));
finishAwaitingReview();