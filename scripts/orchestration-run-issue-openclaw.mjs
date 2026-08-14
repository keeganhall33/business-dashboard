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

import { execFileSync, spawnSync } from "node:child_process";
import { executeAutoContinueWithLocalFirstV1 } from "./orchestration-routing-core.mjs";
import { executeAutoContinueOnceV1 } from "./orchestration-auto-continue-wrapper.mjs";
import { selectWorkerLocalAgentIdV1, shouldEnableLocalRoutingV1 } from "./orchestration-agent-selection.mjs";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

function collectTopLevelJsonObjects(raw) {
  const text = String(raw ?? "");
  const found = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }
    if (ch === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        const candidate = text.slice(start, i + 1);
        try { found.push(JSON.stringify(JSON.parse(candidate))); } catch {}
        start = -1;
      }
    }
  }
  return found;
}

export function extractOpenclawJson(stdout, stderr) {
  const candidates = [
    ...collectTopLevelJsonObjects(stdout),
    ...collectTopLevelJsonObjects(stderr)
  ];
  const unique = [...new Set(candidates)];
  if (unique.length === 1) return unique[0];
  if (unique.length > 1) {
    throw new Error("Ambiguous OpenClaw JSON output: multiple distinct JSON objects");
  }
  return String(stdout ?? "");
}

async function main() {
  const repo = arg("--repo");
  const issue = arg("--issue");
  const agent = arg("--agent") ?? "main";
  const timeoutSeconds = Number(arg("--timeout") ?? "90");

  // #294 local-first routing + worker identity selection.
  // Agent selection must be decided from the task stream BEFORE execution-class branching.
  const EXPLICIT_LOCAL_ROUTING_ENABLED = /^(?:1|true|on|yes)$/i.test(String(process.env.ORCH_LOCAL_ROUTING_ENABLED ?? ""));
  const EXPLICIT_LOCAL_AGENT_ID = String(process.env.ORCH_LOCAL_AGENT_ID ?? "").trim();
  // Cloud agent remains configurable (review/gating may still use cloud).
  const ORCH_CLOUD_AGENT_ID = String(process.env.ORCH_CLOUD_AGENT_ID ?? agent);
  // Ephemeral local orchestration uses an explicit Ollama model, never a persistent OpenClaw agent session.
  const ORCH_LOCAL_MODEL = String(process.env.ORCH_LOCAL_MODEL ?? "ollama/mistral:latest").trim();

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

function commentCheckpointId(body) {
  const text = String(body ?? "");
  const m = text.match(/["']?CHECKPOINT_ID["']?\s*:\s*["']?([A-Za-z0-9._:-]+)/i);
  return m ? m[1] : null;
}

function latestApprovedArchitectDecision(comments) {
  const list = Array.isArray(comments) ? comments : [];
  let latestCheckpointId = null;
  const approvalsByCheckpoint = new Map();

  for (const comment of list) {
    const body = String(comment?.body ?? "");
    if (/##\s+ArchitectCheckpointV1/i.test(body)) {
      const checkpointId = commentCheckpointId(body);
      if (checkpointId) latestCheckpointId = checkpointId;
      continue;
    }

    if (
      /##\s+ArchitectDecisionV1/i.test(body) &&
      /["']?DECISION["']?\s*:\s*["']?(?:APPROVE_AND_PROCEED|APPROVE)\b/i.test(body)
    ) {
      const checkpointId = commentCheckpointId(body);
      if (checkpointId) approvalsByCheckpoint.set(checkpointId, body);
    }
  }

  return latestCheckpointId ? approvalsByCheckpoint.get(latestCheckpointId) ?? null : null;
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
    return { executionClass: "AUTO_CONTINUE", reason: "latest architect checkpoint has a matching subsequent approval" };
  }

  if (["CORE_INTELLIGENCE", "DISCOVERY_INTELLIGENCE", "INTELLIGENCE_UX"].includes(stream)) {
    return { executionClass: "ARCHITECT_REVIEW_REQUIRED", reason: `stream=${stream} is review-sensitive` };
  }

  const text = reviewIntentText(body);
  const reviewPatterns = [
    /\bmigration\b/,
    /\bschema\b/,
    /\brls\b/,
    /\bsecurity\b/,
    /\bauth(?:entication|orization)?\b/,
    /\bcredentials?\b/,
    /\bsmtp\b/,
    /\bproduction\s+writes?\b/,
    /\bvaluation\b/,
    /\branking\b/,
    /\brecommendation(?:\s+logic)?\b/,
    /\bcoverage\s+semantics\b/,
    /\bclaim\s+semantics\b/,
    /\bevidence\s+semantics\b/
  ];
  if (reviewPatterns.some((re) => re.test(text))) {
    return { executionClass: "ARCHITECT_REVIEW_REQUIRED", reason: "affirmative review-sensitive action intent present" };
  }
  return { executionClass: "AUTO_CONTINUE", reason: "default" };
}

function buildCompactAgentPrompt({ repo, issueNumber, title, body, comments, executionClass }) {
  const s = extractReferenceDelta(body);
  const approvedDecision = latestApprovedArchitectDecision(comments);
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
          `EXECUTE IMPLEMENTATION NOW. Use repository tools as required to implement, test, commit, push, and open the focused PR requested by the task. Do not merely review, approve, summarize, or restate the task.`,
          `Return ONLY OrchestrationResultContractV1 as strict JSON (no prose) after the bounded implementation attempt completes.`,
          `Use EXACT uppercase keys and this complete shape: {\"TASK_ID\":\"${issueNumber}\",\"STATUS\":\"PASS|BLOCKED|FAILED\",\"SUMMARY\":\"concise outcome\",\"CHANGES\":[],\"FILES_CHANGED\":[],\"DB_CHANGES\":\"NO\",\"MIGRATION\":null,\"TESTS\":\"command/results\",\"PR\":null,\"MERGE_STATUS\":\"N/A\",\"PRODUCTION_CHANGE\":\"NO\",\"UNEXPECTED_RESULTS\":[],\"DECISIONS_REQUIRED\":[],\"BLOCKERS\":[],\"NEXT_RECOMMENDED_TASK\":null,\"SESSION_HEALTH\":\"GOOD\",\"SESSION_CONTEXT\":\"branch/session\"}. Never return a DECISION-only object.`,
          approvedDecision
            ? `An architect approval is already recorded above and remains authoritative for an identical repeated checkpoint. Proceed within that approved scope; do not ask the same approval question again.`
            : `Proceed only within AUTO_CONTINUE scope and preserve all safety gates.`
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

function parseOrchestrationResult(text, fallbackTaskId = null) {
  const fenced = String(text ?? "").match(/```json\n([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : String(text ?? "");
  if (!candidate.trim()) {
    return {
      kind: "invalid",
      error: "OpenClaw envelope contained no renderable final text; result.payloads was empty or contained no text payloads"
    };
  }
  const obj = JSON.parse(candidate.trim());

  if (obj && typeof obj === "object") {
    const resolvedTaskId = typeof obj.TASK_ID === "string" && obj.TASK_ID.trim()
      ? obj.TASK_ID.trim()
      : (fallbackTaskId ? String(fallbackTaskId) : null);
    if (resolvedTaskId && typeof obj.STATUS === "string" && typeof obj.SUMMARY === "string") {
      return {
        kind: "result",
        value: { ...resultBase(resolvedTaskId), ...obj, TASK_ID: resolvedTaskId }
      };
    }
    if (resolvedTaskId && typeof obj.CHECKPOINT_ID === "string" && typeof obj.QUESTION_OR_DECISION === "string") {
      return { kind: "checkpoint", value: { ...obj, TASK_ID: resolvedTaskId } };
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

  const workerLocalAgentId = EXPLICIT_LOCAL_AGENT_ID || selectWorkerLocalAgentIdV1(stream) || "local";
  const ORCH_LOCAL_ROUTING_ENABLED = shouldEnableLocalRoutingV1({
    stream,
    explicitLocalAgentId: EXPLICIT_LOCAL_AGENT_ID,
    explicitLocalRoutingEnabled: EXPLICIT_LOCAL_ROUTING_ENABLED
  });
  const ORCH_LOCAL_AGENT_ID = String(workerLocalAgentId);

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

  const isProof337Run = Number(task.number) === 337;
  const proofNonceRun = isProof337Run ? `proof-337-${Date.now()}` : null;

  let prompt = buildCompactAgentPrompt({
  repo,
  issueNumber: task.number,
  title: task.title,
  body: task.body ?? "",
  comments: task.comments ?? [],
  executionClass: classified.executionClass
});

  if (isProof337Run && proofNonceRun) {
    prompt = [
      prompt,
      "",
      "### PROOF_GUARD (AUTHORITATIVE)",
      "CLOUD_FORBIDDEN=true",
      `FRESHNESS_NONCE=${proofNonceRun} (MUST be included verbatim inside SESSION_CONTEXT)`,
      "If you cannot comply, return STATUS=BLOCKED with BLOCKERS explaining why.",
      "Reminder: response MUST be a single JSON object only."
    ].join("\n");
  }

  const thinking = "minimal";

  let out;
  const attemptedAgents = [];

  let localAttempted = false;
  let localResult = "NOT_ATTEMPTED";
  let escalatedToCloud = false;
  let escalationReason = null;

function buildStrictJsonRetryPrompt(basePrompt, opts) {
  const proofGuard =
    opts && opts.isProof337 && opts.proofNonce
      ? [
          "PROOF_GUARD (AUTHORITATIVE):",
          "CLOUD_FORBIDDEN=true",
          `FRESHNESS_NONCE=${String(opts.proofNonce)} (MUST be included verbatim inside SESSION_CONTEXT)`
        ]
      : [];
  return [
    "STRICT_JSON_ONLY_RETRY:",
    ...proofGuard,
    "Return ONLY one OrchestrationResultContractV1 JSON object and nothing else.",
    "No prose. No code fences. No DECISION-only object. No ArchitectCheckpointV1.",
    "Use EXACT uppercase keys. Minimum valid complete shape:",
    '{"TASK_ID":"issue-or-task-id","STATUS":"PASS|BLOCKED|FAILED","SUMMARY":"concise outcome","CHANGES":[],"FILES_CHANGED":[],"DB_CHANGES":"NO","MIGRATION":null,"TESTS":"command/results","PR":null,"MERGE_STATUS":"N/A","PRODUCTION_CHANGE":"NO","UNEXPECTED_RESULTS":[],"DECISIONS_REQUIRED":[],"BLOCKERS":[],"NEXT_RECOMMENDED_TASK":null,"SESSION_HEALTH":"GOOD","SESSION_CONTEXT":"branch/session"}',
    "If implementation succeeded, report the actual files/tests/PR. If it failed, use BLOCKED or FAILED and state the blocker.",
    "Your entire response must be a single JSON object starting with '{' and ending with '}'.",
    "",
    "Task context omitted for retry (intentional)."
  ].join("\n");
}

function shouldEnforceStrictJsonForLocal(message) {
  const text = String(message ?? "");
  return /Return ONLY\s+OrchestrationResultContractV1\s+as strict JSON/i.test(text) ||
    /STRICT_JSON_ONLY/i.test(text) ||
    /OrchestrationResultContractV1/i.test(text);
}

function applyProofGuardForLocalStrictJson(message, opts) {
  const text = String(message ?? "");
  if (!(opts && opts.isProof337 && opts.proofNonce)) return text;
  if (text.includes("CLOUD_FORBIDDEN=true") && text.includes(String(opts.proofNonce))) return text;
  return [
    "### PROOF_GUARD (AUTHORITATIVE)",
    "CLOUD_FORBIDDEN=true",
    `FRESHNESS_NONCE=${String(opts.proofNonce)} (MUST be included verbatim inside SESSION_CONTEXT)`,
    "",
    text
  ].join("\n");
}

function deltaDemandsPass(body) {
  const d = section(body, "Delta") ?? "";
  return /\bSTATUS\b[^\n]*\bPASS\b/i.test(d);
}

function coerceLooseJsonToResultContract(obj, taskId) {
  if (!obj || typeof obj !== "object") return null;
  const status = String(obj.status ?? "").toLowerCase();
  const summary = typeof obj.summary === "string" ? obj.summary : null;
  if (!summary) return null;
  if (status !== "success" && status !== "pass" && status !== "ok") return null;
  return {
    ...resultBase(taskId),
    TASK_ID: String(taskId ?? "unknown"),
    STATUS: "PASS",
    SUMMARY: summary,
    BLOCKERS: [],
    NEXT_RECOMMENDED_TASK: null
  };
}

function routingMeta() {
  return {
    localRoutingEnabled: ORCH_LOCAL_ROUTING_ENABLED,
    localAgentId: ORCH_LOCAL_AGENT_ID,
    cloudAgentId: ORCH_CLOUD_AGENT_ID,
    attemptedAgents: attemptedAgents.slice(),
    localAttempted,
    localResult,
    escalatedToCloud,
    escalationReason
  };
}

function routingContractFields() {
  return {
    ROUTING_TIER: ORCH_LOCAL_ROUTING_ENABLED ? "LOCAL_FIRST" : "CLOUD_ONLY",
    MODEL_USED: null,
    LOCAL_ATTEMPTED: localAttempted,
    LOCAL_RESULT: localResult,
    ESCALATED_TO_CLOUD: escalatedToCloud,
    ESCALATION_REASON: escalationReason,
    CLOUD_USAGE: null,
    CLOUD_COST: null
  };
}

function runOpenclaw(agentId) {
  const isLocal = String(agentId).startsWith("local-") || agentId === "local";
  if (isLocal) return runOpenclawWithPrompt(agentId, prompt);

  attemptedAgents.push(agentId);
  const res = spawnSync(
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
      timeout: (timeoutSeconds + 60) * 1000,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  if (res.error) throw res.error;
  if (res.status !== 0) {
    const err = new Error(`openclaw exited with code ${res.status}`);
    err.stdout = res.stdout;
    err.stderr = res.stderr;
    throw err;
  }
  return extractOpenclawJson(res.stdout, res.stderr);
}

function runOpenclawWithPrompt(agentId, message) {
  const useEphemeralLocal = String(agentId).startsWith("local-") || agentId === "local";
  const proofOpts = { isProof337: isProof337Run, proofNonce: proofNonceRun };
  const messageWithGuard = useEphemeralLocal
    ? applyProofGuardForLocalStrictJson(message, proofOpts)
    : String(message ?? "");
  const effectiveMessage = useEphemeralLocal && shouldEnforceStrictJsonForLocal(messageWithGuard)
    ? buildStrictJsonRetryPrompt(messageWithGuard, proofOpts)
    : String(messageWithGuard ?? "");
  const effectiveTimeout = useEphemeralLocal
    ? Math.max(Number(timeoutSeconds) || 0, 360)
    : Number(timeoutSeconds);

  const freshLocalSessionId = useEphemeralLocal
    ? "orch-" + String(taskId) + "-" + String(process.pid) + "-" + String(Date.now()) + "-" + Math.random().toString(36).slice(2, 10)
    : null;

  const args = useEphemeralLocal
    ? [
        "agent",
        "--local",
        "--agent",
        agentId,
        "--session-id",
        freshLocalSessionId,
        "--model",
        ORCH_LOCAL_MODEL,
        "--message",
        effectiveMessage,
        "--json",
        "--timeout",
        String(effectiveTimeout)
      ]
    : [
        "agent",
        "--agent",
        agentId,
        "--message",
        effectiveMessage,
        "--json",
        "--thinking",
        thinking,
        "--timeout",
        String(effectiveTimeout)
      ];

  const childEnv = useEphemeralLocal
    ? { ...process.env, OLLAMA_API_KEY: process.env.OLLAMA_API_KEY || "ollama-local", OPENCLAW_MODEL: ORCH_LOCAL_MODEL, OPENCLAW_FALLBACK_MODELS: "" }
    : process.env;

  const res = spawnSync("/opt/homebrew/bin/openclaw", args, {
    env: childEnv,
    encoding: "utf8",
    timeout: (effectiveTimeout + 60) * 1000,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    const err = new Error("openclaw exited with code " + String(res.status));
    err.stdout = res.stdout;
    err.stderr = res.stderr;
    throw err;
  }
  return extractOpenclawJson(res.stdout, res.stderr);
}
function tryParseStructured(envelope) {
  const finalText = extractAgentFinalText(envelope);
  const parsed = parseOrchestrationResult(finalText, taskId);
  return { finalText, parsed };
}

function isInvalidStructured(parsed) {
  return parsed?.kind === "invalid";
}

function looksLikeTimeout(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("ETIMEDOUT") || msg.toLowerCase().includes("gateway timeout");
}

  try {
  const usedAutoContinueWrapper = classified.executionClass === "AUTO_CONTINUE";
  if (usedAutoContinueWrapper) {
      const verifyStructuredResult = ({ parsed, envelope }) => {
        if (!isProof337Run) return { ok: true };
        if (!parsed || parsed.kind !== "result") return { ok: false, kind: "INVALID_STRUCTURED_OUTPUT" };

        const meta = envelope?.meta?.agentMeta ?? envelope?.result?.meta?.agentMeta ?? envelope?.result?.agentMeta ?? null;
        const provider = meta?.provider ?? null;
        const model = meta?.model ?? null;
        if (provider !== "ollama") return { ok: false, kind: "INVALID_STRUCTURED_OUTPUT" };
        if (typeof model !== "string" || !model.trim()) return { ok: false, kind: "INVALID_STRUCTURED_OUTPUT" };

        const ctx = String(parsed.value?.SESSION_CONTEXT ?? "");
        if (!proofNonceRun || !ctx.includes(String(proofNonceRun))) return { ok: false, kind: "INVALID_STRUCTURED_OUTPUT" };
        return { ok: true };
      };

      const wrapped = await executeAutoContinueOnceV1({
      taskId,
      taskBody: task.body ?? "",
      promptText: prompt,
      strictRetryPrompt: buildStrictJsonRetryPrompt(prompt, { isProof337: isProof337Run, proofNonce: proofNonceRun }),
      localRoutingEnabled: ORCH_LOCAL_ROUTING_ENABLED,
      localAgentId: ORCH_LOCAL_AGENT_ID,
      cloudAgentId: ORCH_CLOUD_AGENT_ID,
      cloudForbidden: isProof337Run,
      verifyStructuredResult,
      run: async (agentId, message) => runOpenclawWithPrompt(agentId, message),
      extractFinalText: (env) => extractAgentFinalText(env),
      parseStructured: (text) => parseOrchestrationResult(text, taskId),
      deltaDemandsPass: (body) => deltaDemandsPass(body),
      coerceLooseJsonToResultContract: (obj, id) => coerceLooseJsonToResultContract(obj, id)
    });

    attemptedAgents.splice(0, attemptedAgents.length, ...(wrapped.routingState.attemptedAgents ?? []));
    localAttempted = wrapped.routingState.localAttempted;
    localResult = wrapped.routingState.localResult;
    escalatedToCloud = wrapped.routingState.escalatedToCloud;
    escalationReason = wrapped.routingState.escalationReason;

    const exec = wrapped.exec;

    if (exec.coerced) {
      postComment([
        "## OrchestrationResultContractV1",
        "",
        "```json",
        JSON.stringify(exec.coerced, null, 2),
        "```",
        "",
        `<!-- agentMeta: ${JSON.stringify({ model: exec.final.envelope?.result?.meta?.agentMeta?.model ?? null, provider: exec.final.envelope?.result?.meta?.agentMeta?.provider ?? null })} -->`,
        `<!-- routing: ${JSON.stringify(routingMeta())} -->`
      ].join("\n"));
      finishAwaitingReview();
      process.exit(0);
    }

    out = exec.final.raw;
  } else {
    out = runOpenclaw(ORCH_CLOUD_AGENT_ID);
  }
  } catch (err) {
  if (classified.executionClass !== "AUTO_CONTINUE" && ORCH_CLOUD_AGENT_ID === "main" && looksLikeTimeout(err)) {
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
            ...routingContractFields(),
            STATUS: "FAILED",
            SUMMARY: "openclaw agent execution failed",
            BLOCKERS: [safeTrunc(msg, 400)],
            UNEXPECTED_RESULTS: [
              safeTrunc(`routing=${JSON.stringify(routingMeta())}`, 1000),
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
            ...routingContractFields(),
            STATUS: "FAILED",
            SUMMARY: "openclaw agent execution failed",
            BLOCKERS: [safeTrunc(msg, 400)],
          UNEXPECTED_RESULTS: [
            safeTrunc(`routing=${JSON.stringify(routingMeta())}`, 1000),
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
        ...routingContractFields(),
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
        ...routingContractFields(),
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
  if (classified.executionClass === "AUTO_CONTINUE") {
    postComment([
      "## OrchestrationResultContractV1",
      "",
      "```json",
      JSON.stringify(
        {
          ...resultBase(taskId),
          ...routingContractFields(),
          STATUS: "BLOCKED",
          SUMMARY: "Agent returned output that did not match required structured contracts",
          BLOCKERS: [parsed.error],
          UNEXPECTED_RESULTS: [safeTrunc(finalText, 4000), envelopeShape(envelope)],
          NEXT_RECOMMENDED_TASK: "Fix worker prompt/contract compliance; bounded retries are already exhausted for this run."
        },
        null,
        2
      ),
      "```"
    ].join("\n"));
    finishAwaitingReview();
    process.exit(1);
  }

  if (
    classified.executionClass === "AUTO_CONTINUE" &&
    ORCH_LOCAL_ROUTING_ENABLED &&
    attemptedAgents[0] === ORCH_LOCAL_AGENT_ID &&
    !attemptedAgents.includes(ORCH_CLOUD_AGENT_ID)
  ) {
    try {
      localResult = "INVALID_STRUCTURED_OUTPUT";
      escalatedToCloud = true;
      escalationReason = escalationReason ?? "LOCAL_INVALID_STRUCTURED_OUTPUT";
      const cloudOut = runOpenclaw(ORCH_CLOUD_AGENT_ID);
      const cloudEnvelope = JSON.parse(String(cloudOut ?? ""));
      const cloudFinal = extractAgentFinalText(cloudEnvelope);
      const cloudParsed = parseOrchestrationResult(cloudFinal, taskId);
      if (cloudParsed.kind !== "invalid") {
        envelope = cloudEnvelope;
        parsed = cloudParsed;
      }
    } catch {
    }
  }

  if (parsed.kind !== "invalid") {
  } else {
  postComment([
    "## OrchestrationResultContractV1",
    "",
    "```json",
    JSON.stringify(
      {
        ...resultBase(taskId),
        ...routingContractFields(),
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
  }

  const meta = envelope?.meta?.agentMeta ?? envelope?.result?.meta?.agentMeta ?? envelope?.result?.agentMeta ?? null;
  const modelUsed = meta?.model ?? null;
  const cloudUsage = meta?.usage ?? null;
  const cloudCost = meta?.costUsd ?? null;
  const metaLine = meta
    ? `agentMeta: ${JSON.stringify({ model: meta.model ?? null, usage: meta.usage ?? null, costUsd: meta.costUsd ?? null })}`
    : "agentMeta: unavailable";
  const routingLine = `routing: ${JSON.stringify(routingMeta())}`;

  const valueWithRouting =
    parsed.kind === "result" && parsed.value && typeof parsed.value === "object"
      ? {
          ...parsed.value,
          ...routingContractFields(),
          MODEL_USED: modelUsed,
          CLOUD_USAGE: cloudUsage,
          CLOUD_COST: cloudCost
        }
      : parsed.value;

  const contractBody =
    parsed.kind === "checkpoint"
      ? ["## ArchitectCheckpointV1", "", "```json", JSON.stringify(valueWithRouting, null, 2), "```"].join("\n")
      : ["## OrchestrationResultContractV1", "", "```json", JSON.stringify(valueWithRouting, null, 2), "```"].join("\n");

  postComment([contractBody, "", `<!-- ${metaLine} -->`, `<!-- ${routingLine} -->`].join("\n"));
  finishAwaitingReview();
}

if (process.argv[1] && process.argv[1].includes("orchestration-run-issue-openclaw.mjs")) {
  function releaseWorkerLock() {
    const lockPath = process.env.ORCH_WORKER_LOCK_PATH;
    if (!lockPath) return;
    try {
      const raw = fs.readFileSync(lockPath, "utf8");
      const pid = JSON.parse(raw).pid;
      if (pid === process.pid) fs.unlinkSync(lockPath);
    } catch {
    }
  }

  process.on("exit", releaseWorkerLock);
  process.on("SIGINT", () => process.exit(130));
  process.on("SIGTERM", () => process.exit(143));

  main().catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    process.exitCode = 1;
  });
}
