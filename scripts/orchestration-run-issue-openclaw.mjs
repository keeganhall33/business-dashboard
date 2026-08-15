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

  const EXPLICIT_LOCAL_ROUTING_ENABLED = /^(?:1|true|on|yes)$/i.test(String(process.env.ORCH_LOCAL_ROUTING_ENABLED ?? ""));
  const EXPLICIT_LOCAL_AGENT_ID = String(process.env.ORCH_LOCAL_AGENT_ID ?? "").trim();
  const ORCH_CLOUD_AGENT_ID = String(process.env.ORCH_CLOUD_AGENT_ID ?? agent);
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
  if (removeLabel) execFileSync("gh", ["issue", "edit", String(issue), "--repo", repo, "--remove-label", removeLabel], { stdio: "ignore", timeout: 30_000 });
  if (addLabel) execFileSync("gh", ["issue", "edit", String(issue), "--repo", repo, "--add-label", addLabel], { stdio: "ignore", timeout: 30_000 });
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
  return { reference: section(body, "Reference"), delta: section(body, "Delta"), goal: section(body, "Goal"), constraints: section(body, "Constraints"), acceptance: section(body, "Acceptance criteria") };
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
    if (/##\s+ArchitectDecisionV1/i.test(body) && /DECISION:\s*(?:APPROVE_AND_PROCEED|APPROVE)\b/i.test(body)) {
      const checkpointId = commentCheckpointId(body);
      if (checkpointId) approvalsByCheckpoint.set(checkpointId, body);
    }
  }
  return latestCheckpointId ? approvalsByCheckpoint.get(latestCheckpointId) ?? null : null;
}

function reviewIntentText(body) {
  const s = extractReferenceDelta(body);
  const actionText = [s.delta, s.goal].filter(Boolean).join("\n");
  return actionText.split("\n").filter((line) => !/^\s*(?:[-*]\s*)?(?:no\b|do not\b|don't\b|must not\b|never\b)/i.test(line)).join("\n").toLowerCase();
}

function classifyExecution({ stream, humanApprovalRequired, body, comments }) {
  if (humanApprovalRequired) return { executionClass: "KEEGAN_APPROVAL_REQUIRED", reason: "human_approval_required=true" };
  const approvedDecision = latestApprovedArchitectDecision(comments);
  if (approvedDecision) return { executionClass: "AUTO_CONTINUE", reason: "latest architect checkpoint has a matching subsequent approval" };
  if (["CORE_INTELLIGENCE", "DISCOVERY_INTELLIGENCE", "INTELLIGENCE_UX"].includes(stream)) return { executionClass: "ARCHITECT_REVIEW_REQUIRED", reason: `stream=${stream} is review-sensitive` };
  const text = reviewIntentText(body);
  const reviewPatterns = [/\bmigration\b/,/\bschema\b/,/\brls\b/,/\bsecurity\b/,/\bauth(?:entication|orization)?\b/,/\bcredentials?\b/,/\bsmtp\b/,/\bproduction\s+writes?\b/,/\bvaluation\b/,/\branking\b/,/\brecommendation(?:\s+logic)?\b/,/\bcoverage\s+semantics\b/,/\bclaim\s+semantics\b/,/\bevidence\s+semantics\b/];
  if (reviewPatterns.some((re) => re.test(text))) return { executionClass: "ARCHITECT_REVIEW_REQUIRED", reason: "affirmative review-sensitive action intent present" };
  return { executionClass: "AUTO_CONTINUE", reason: "default" };
}

function buildCompactAgentPrompt({ repo, issueNumber, title, body, comments, executionClass }) {
  const s = extractReferenceDelta(body);
  const approvedDecision = latestApprovedArchitectDecision(comments);
  const maxRefChars = 1200;
  const maxDeltaChars = 1200;
  const maxDecisionChars = 1400;
  const header = [`You are Jeeves executing GitHub orchestration task #${issueNumber} in ${repo}.`,`Work from the local business-dashboard repository/worktree.`,`TASK TITLE: ${title}`].join("\n");
  const reference = s.reference ? `REFERENCE (truncated):\n${safeTrunc(s.reference, maxRefChars)}` : `REFERENCE: (missing)`;
  const delta = s.delta ? `DELTA (truncated):\n${safeTrunc(s.delta, maxDeltaChars)}` : `DELTA: (missing)`;
  const decision = approvedDecision ? `RECORDED ARCHITECT DECISION (authoritative for this rerun):\n${safeTrunc(approvedDecision, maxDecisionChars)}` : null;
  const outputContract = executionClass === "ARCHITECT_REVIEW_REQUIRED" ? [`Return ONLY ArchitectCheckpointV1 as strict JSON (no prose).`,`Do NOT implement code changes until architect approval is explicitly recorded.`,`Keep it short: decision + smallest next validation step.`].join("\n") : [`EXECUTE IMPLEMENTATION NOW. Use repository tools as required to implement, test, commit, push, and open the focused PR requested by the task. Do not merely review, approve, summarize, or restate the task.`,`Return ONLY OrchestrationResultContractV1 as strict JSON (no prose) after the bounded implementation attempt completes.`,`Use EXACT uppercase keys and this complete shape: {\"TASK_ID\":\"${issueNumber}\",\"STATUS\":\"PASS|BLOCKED|FAILED\",\"SUMMARY\":\"concise outcome\",\"CHANGES\":[],\"FILES_CHANGED\":[],\"DB_CHANGES\":\"NO\",\"MIGRATION\":null,\"TESTS\":\"command/results\",\"PR\":null,\"MERGE_STATUS\":\"N/A\",\"PRODUCTION_CHANGE\":\"NO\",\"UNEXPECTED_RESULTS\":[],\"DECISIONS_REQUIRED\":[],\"BLOCKERS\":[],\"NEXT_RECOMMENDED_TASK\":null,\"SESSION_HEALTH\":\"GOOD\",\"SESSION_CONTEXT\":\"branch/session\"}. Never return a DECISION-only object.`,approvedDecision ? `An architect approval is already recorded above and remains authoritative for an identical repeated checkpoint. Proceed within that approved scope; do not ask the same approval question again.` : `Proceed only within AUTO_CONTINUE scope and preserve all safety gates.`].join("\n");
  return [header, "", reference, "", delta, decision ? `\n${decision}` : "", "", outputContract].join("\n\n");
}

function safeTrunc(text, max) { const t = String(text ?? ""); return t.length <= max ? t : `${t.slice(0, max)}\n…(truncated)`; }
function resultBase(taskId) { return { TASK_ID: taskId, STATUS: "FAILED", SUMMARY: "", CHANGES: [], FILES_CHANGED: [], DB_CHANGES: "NO", MIGRATION: null, TESTS: "N/A", PR: null, MERGE_STATUS: "N/A", PRODUCTION_CHANGE: "NO", UNEXPECTED_RESULTS: [], DECISIONS_REQUIRED: [], BLOCKERS: [], NEXT_RECOMMENDED_TASK: null, SESSION_HEALTH: "GOOD", SESSION_CONTEXT: "UNKNOWN" }; }

function parseOrchestrationResult(text, fallbackTaskId = null) {
  const fenced = String(text ?? "").match(/```json\n([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : String(text ?? "");
  if (!candidate.trim()) return { kind: "invalid", error: "OpenClaw envelope contained no renderable final text; result.payloads was empty or contained no text payloads" };
  const obj = JSON.parse(candidate.trim());
  if (obj && typeof obj === "object") {
    const resolvedTaskId = typeof obj.TASK_ID === "string" && obj.TASK_ID.trim() ? obj.TASK_ID.trim() : (fallbackTaskId ? String(fallbackTaskId) : null);
    if (resolvedTaskId && typeof obj.STATUS === "string" && typeof obj.SUMMARY === "string") return { kind: "result", value: { ...resultBase(resolvedTaskId), ...obj, TASK_ID: resolvedTaskId } };
    if (resolvedTaskId && typeof obj.CHECKPOINT_ID === "string" && typeof obj.QUESTION_OR_DECISION === "string") return { kind: "checkpoint", value: { ...obj, TASK_ID: resolvedTaskId } };
  }
  return { kind: "invalid", error: "JSON parsed but did not match known contracts" };
}

function extractTextFromProjection(projection) {
  if (typeof projection === "string" && projection.trim().length > 0) return projection;
  if (!projection || typeof projection !== "object") return "";
  const agentMeta = projection?.meta?.agentMeta ?? projection?.agentMeta ?? null;
  const directCandidates = [projection?.final,projection?.text,projection?.reply,agentMeta?.final,agentMeta?.text,agentMeta?.reply];
  for (const candidate of directCandidates) if (typeof candidate === "string" && candidate.trim().length > 0) return candidate;
  for (const payloads of [projection?.payloads, agentMeta?.payloads]) {
    if (!Array.isArray(payloads)) continue;
    for (const payload of payloads) if (typeof payload?.text === "string" && payload.text.trim().length > 0) return payload.text;
  }
  return "";
}

function extractAgentFinalText(envelope) {
  if (typeof envelope === "string") {
    try { envelope = JSON.parse(envelope); } catch { return envelope; }
  }
  const candidates = [envelope?.result,envelope?.data,envelope];
  for (const candidate of candidates) { const text = extractTextFromProjection(candidate); if (text) return text; }
  return "";
}

function strictJsonTemplate(taskId, proofOpts) {
  const sessionContext = proofOpts?.isProof337 && proofOpts?.proofNonce ? `FRESHNESS_NONCE=${String(proofOpts.proofNonce)}` : "branch/session";
  return JSON.stringify({ TASK_ID: String(taskId ?? "unknown"), STATUS: "PASS", SUMMARY: "concise outcome", CHANGES: [], FILES_CHANGED: [], DB_CHANGES: "NO", MIGRATION: null, TESTS: "command/results", PR: null, MERGE_STATUS: "N/A", PRODUCTION_CHANGE: "NO", UNEXPECTED_RESULTS: [], DECISIONS_REQUIRED: [], BLOCKERS: [], NEXT_RECOMMENDED_TASK: null, SESSION_HEALTH: "GOOD", SESSION_CONTEXT: sessionContext });
}

function buildStrictJsonRetryPrompt(originalPrompt, opts) {
  return [`${String(originalPrompt ?? "").trim()}`,"","STRICT_JSON_ONLY","Your previous response was not accepted as valid orchestration JSON.","Return exactly one JSON object and nothing else.",`Template: ${strictJsonTemplate(issue, opts)}`].join("\n");
}

function shouldEnforceStrictJsonForLocal(message) {
  const text = String(message ?? "");
  return /Return ONLY\s+OrchestrationResultContractV1\s+as strict JSON/i.test(text) || /STRICT_JSON_ONLY/i.test(text) || /OrchestrationResultContractV1/i.test(text);
}

function applyProofGuardForLocalStrictJson(message, opts) {
  const text = String(message ?? "");
  if (!(opts && opts.isProof337 && opts.proofNonce)) return text;
  if (text.includes("CLOUD_FORBIDDEN=true") && text.includes(String(opts.proofNonce))) return text;
  return ["### PROOF_GUARD (AUTHORITATIVE)","CLOUD_FORBIDDEN=true",`FRESHNESS_NONCE=${String(opts.proofNonce)} (MUST be included verbatim inside SESSION_CONTEXT)`,"",text].join("\n");
}

function deltaDemandsPass(body) { const d = section(body, "Delta") ?? ""; return /\bSTATUS\b[^\n]*\bPASS\b/i.test(d); }
function coerceLooseJsonToResultContract(obj, taskId) {
  if (!obj || typeof obj !== "object") return null;
  const status = String(obj.status ?? "").toLowerCase();
  const summary = typeof obj.summary === "string" ? obj.summary : null;
  if (!summary) return null;
  if (status !== "success" && status !== "pass" && status !== "ok") return null;
  return { ...resultBase(taskId), TASK_ID: String(taskId ?? "unknown"), STATUS: "PASS", SUMMARY: summary, BLOCKERS: [], NEXT_RECOMMENDED_TASK: null };
}

let attemptedAgents = [];
let localAttempted = false;
let localResult = "NOT_ATTEMPTED";
let escalatedToCloud = false;
let escalationReason = null;
let proofNonceRun = null;
let isProof337Run = false;
let prompt = "";
let thinking = "low";
let taskId = null;
let task = null;
let classified = null;
let ORCH_LOCAL_ROUTING_ENABLED = false;
let ORCH_LOCAL_AGENT_ID = "local-d";

function routingMeta() { return { localRoutingEnabled: ORCH_LOCAL_ROUTING_ENABLED, localAgentId: ORCH_LOCAL_AGENT_ID, cloudAgentId: ORCH_CLOUD_AGENT_ID, attemptedAgents: attemptedAgents.slice(), localAttempted, localResult, escalatedToCloud, escalationReason }; }
function routingContractFields() { return { ROUTING_TIER: ORCH_LOCAL_ROUTING_ENABLED ? "LOCAL_FIRST" : "CLOUD_ONLY", MODEL_USED: null, LOCAL_ATTEMPTED: localAttempted, LOCAL_RESULT: localResult, ESCALATED_TO_CLOUD: escalatedToCloud, ESCALATION_REASON: escalationReason, CLOUD_USAGE: null, CLOUD_COST: null }; }

function runOpenclaw(agentId) {
  const isLocal = String(agentId).startsWith("local-") || agentId === "local";
  if (isLocal) return runOpenclawWithPrompt(agentId, prompt);
  attemptedAgents.push(agentId);
  const res = spawnSync("/opt/homebrew/bin/openclaw", ["agent","--agent",agentId,"--message",prompt,"--json","--thinking",thinking,"--timeout",String(timeoutSeconds)], { encoding: "utf8", timeout: (timeoutSeconds + 60) * 1000, maxBuffer: 16 * 1024 * 1024, stdio: ["ignore","pipe","pipe"] });
  if (res.error) throw res.error;
  if (res.status !== 0) { const err = new Error(`openclaw exited with code ${res.status}`); err.stdout = res.stdout; err.stderr = res.stderr; throw err; }
  return extractOpenclawJson(res.stdout, res.stderr);
}

function runOpenclawWithPrompt(agentId, message) {
  const useEphemeralLocal = String(agentId).startsWith("local-") || agentId === "local";
  const proofOpts = { isProof337: isProof337Run, proofNonce: proofNonceRun };
  const messageWithGuard = useEphemeralLocal ? applyProofGuardForLocalStrictJson(message, proofOpts) : String(message ?? "");
  const effectiveMessage = useEphemeralLocal && shouldEnforceStrictJsonForLocal(messageWithGuard) ? buildStrictJsonRetryPrompt(messageWithGuard, proofOpts) : String(messageWithGuard ?? "");
  const effectiveTimeout = useEphemeralLocal ? Math.max(Number(timeoutSeconds) || 0, 180) : Number(timeoutSeconds);
  const args = useEphemeralLocal ? ["agent","exec","--message",effectiveMessage,"--cwd",process.cwd(),"--model",ORCH_LOCAL_MODEL,"--code-mode","code","--local-model-lean","--json","--thinking",thinking,"--timeout",String(effectiveTimeout)] : ["agent","--agent",agentId,"--message",effectiveMessage,"--json","--thinking",thinking,"--timeout",String(effectiveTimeout)];
  const res = spawnSync("/opt/homebrew/bin/openclaw", args, { encoding: "utf8", timeout: (effectiveTimeout + 60) * 1000, maxBuffer: 16 * 1024 * 1024, stdio: ["ignore","pipe","pipe"] });
  if (res.error) throw res.error;
  if (res.status !== 0) { const err = new Error("openclaw exited with code " + String(res.status)); err.stdout = res.stdout; err.stderr = res.stderr; throw err; }
  return extractOpenclawJson(res.stdout, res.stderr);
}

function tryParseStructured(envelope) { const finalText = extractAgentFinalText(envelope); const parsed = parseOrchestrationResult(finalText, taskId); return { finalText, parsed }; }
function isInvalidStructured(parsed) { return parsed?.kind === "invalid"; }
function looksLikeTimeout(err) { const msg = err instanceof Error ? err.message : String(err); return msg.includes("ETIMEDOUT") || msg.toLowerCase().includes("gateway timeout"); }

  const rawTask = gh(["issue","view",String(issue),"--repo",repo,"--json","number,title,body,labels,comments"]);
  task = JSON.parse(rawTask);
  taskId = String(task.number ?? issue);
  const stream = extractField(task.body, "stream") ?? "UNKNOWN";
  const humanApprovalRequired = /^true$/i.test(String(extractField(task.body, "human_approval_required") ?? "false"));
  classified = classifyExecution({ stream, humanApprovalRequired, body: task.body ?? "", comments: task.comments ?? [] });
  const selectedLocalAgent = selectWorkerLocalAgentIdV1({ stream, explicitLocalAgentId: EXPLICIT_LOCAL_AGENT_ID });
  ORCH_LOCAL_AGENT_ID = selectedLocalAgent ?? "local-d";
  ORCH_LOCAL_ROUTING_ENABLED = shouldEnableLocalRoutingV1({ explicitEnabled: EXPLICIT_LOCAL_ROUTING_ENABLED, executionClass: classified.executionClass, stream, localAgentId: ORCH_LOCAL_AGENT_ID });
  isProof337Run = String(issue) === "337";
  proofNonceRun = isProof337Run ? `proof-${Date.now()}-${Math.random().toString(36).slice(2,10)}` : null;
  prompt = buildCompactAgentPrompt({ repo, issueNumber: issue, title: task.title ?? "", body: task.body ?? "", comments: task.comments ?? [], executionClass: classified.executionClass });

  if (classified.executionClass === "KEEGAN_APPROVAL_REQUIRED") {
    postComment("KEEGAN_APPROVAL_REQUIRED");
    transitionLabel("orch:running","orch:awaiting_review");
    return;
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
        invokeLocal: async (message) => {
          localAttempted = true;
          attemptedAgents.push(ORCH_LOCAL_AGENT_ID);
          const envelope = JSON.parse(runOpenclawWithPrompt(ORCH_LOCAL_AGENT_ID, message));
          const parsed = tryParseStructured(envelope);
          const verification = verifyStructuredResult({ parsed: parsed.parsed, envelope });
          if (!verification.ok) { localResult = verification.kind; throw Object.assign(new Error(verification.kind), { kind: verification.kind }); }
          localResult = "SUCCESS";
          return { envelope, parsed: parsed.parsed };
        },
        invokeCloud: async (message) => {
          if (isProof337Run) throw Object.assign(new Error("CLOUD_FORBIDDEN"), { kind: "CLOUD_FORBIDDEN" });
          escalatedToCloud = true;
          attemptedAgents.push(ORCH_CLOUD_AGENT_ID);
          const envelope = JSON.parse(runOpenclawWithPrompt(ORCH_CLOUD_AGENT_ID, message));
          return { envelope, parsed: tryParseStructured(envelope).parsed };
        },
        parseResult: ({ envelope, parsed }) => ({ envelope, parsed }),
        isRetryableLocalError: (err) => err?.kind === "INVALID_STRUCTURED_OUTPUT" || looksLikeTimeout(err),
        onEscalation: (reason) => { escalatedToCloud = true; escalationReason = reason; },
        proofCloudForbidden: isProof337Run
      });
      const finalParsed = wrapped?.result?.parsed ?? wrapped?.parsed ?? null;
      const finalEnvelope = wrapped?.result?.envelope ?? wrapped?.envelope ?? null;
      if (!finalParsed || finalParsed.kind !== "result") throw new Error("invalid final orchestration result");
      const out = { ...finalParsed.value, ...routingContractFields() };
      const meta = finalEnvelope?.meta?.agentMeta ?? finalEnvelope?.result?.meta?.agentMeta ?? finalEnvelope?.result?.agentMeta ?? null;
      if (meta?.model) out.MODEL_USED = meta.model;
      postComment(`## OrchestrationResultContractV1\n\n\`\`\`json\n${JSON.stringify(out,null,2)}\n\`\`\`\n\n<!-- routing: ${JSON.stringify(routingMeta())} -->`);
      transitionLabel("orch:running","orch:awaiting_review");
      return;
    }

    const envelope = JSON.parse(runOpenclaw(ORCH_CLOUD_AGENT_ID));
    const { parsed } = tryParseStructured(envelope);
    if (parsed.kind === "checkpoint") {
      postComment(`## ArchitectCheckpointV1\n\n\`\`\`json\n${JSON.stringify(parsed.value,null,2)}\n\`\`\``);
    } else if (parsed.kind === "result") {
      postComment(`## OrchestrationResultContractV1\n\n\`\`\`json\n${JSON.stringify(parsed.value,null,2)}\n\`\`\``);
    } else throw new Error(parsed.error ?? "invalid structured output");
    transitionLabel("orch:running","orch:awaiting_review");
  } catch (err) {
    const base = resultBase(taskId);
    const out = { ...base, STATUS: "FAILED", SUMMARY: err instanceof Error ? err.message : String(err), BLOCKERS: [err instanceof Error ? err.message : String(err)], ...routingContractFields() };
    postComment(`## OrchestrationResultContractV1\n\n\`\`\`json\n${JSON.stringify(out,null,2)}\n\`\`\`\n\n<!-- routing: ${JSON.stringify(routingMeta())} -->`);
    transitionLabel("orch:running","orch:awaiting_review");
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
