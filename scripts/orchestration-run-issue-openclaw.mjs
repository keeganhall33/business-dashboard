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
  const ORCH_WORKTREE_ROOT = String(process.env.ORCH_WORKTREE_ROOT ?? "").trim();
  const ORCH_AGENT_WORKSPACE = String(process.env.ORCH_AGENT_WORKSPACE ?? process.cwd()).trim();

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

  function safeTrunc(text, max) {
    const t = String(text ?? "");
    return t.length <= max ? t : `${t.slice(0, max)}\n…(truncated)`;
  }

  function buildCompactAgentPrompt({ repo, issueNumber, title, body, comments, executionClass }) {
    const s = extractReferenceDelta(body);
    const approvedDecision = latestApprovedArchitectDecision(comments);
    const protectedRepoContract = ORCH_WORKTREE_ROOT
      ? [
          `PROTECTED REPOSITORY ROOT: ${ORCH_WORKTREE_ROOT}`,
          `The OpenClaw cwd is a disposable control workspace, not the repository.`,
          `MANDATORY FIRST TOOL ACTION: use exec to run exactly: cd ${JSON.stringify(ORCH_WORKTREE_ROOT)} && pwd && git rev-parse --show-toplevel && git status --short --branch && git remote -v`,
          `Every repository command must explicitly target that protected repository root. Do not search for a nested checkout.`,
          `For implementation work, actually invoke repository tools; never describe or invent tool calls.`
        ].join("\n")
      : null;
    const header = [
      `You are Jeeves executing GitHub orchestration task #${issueNumber} in ${repo}.`,
      `Work from the local business-dashboard repository/worktree.`,
      protectedRepoContract,
      `TASK TITLE: ${title}`
    ].filter(Boolean).join("\n");

    const reference = s.reference ? `REFERENCE (truncated):\n${safeTrunc(s.reference, 1200)}` : `REFERENCE: (missing)`;
    const delta = s.delta ? `DELTA (truncated):\n${safeTrunc(s.delta, 1200)}` : `DELTA: (missing)`;
    const constraints = s.constraints ? `CONSTRAINTS (truncated):\n${safeTrunc(s.constraints, 1200)}` : null;
    const acceptance = s.acceptance ? `ACCEPTANCE CRITERIA (truncated):\n${safeTrunc(s.acceptance, 1200)}` : null;
    const decision = approvedDecision ? `RECORDED ARCHITECT DECISION (authoritative for this rerun):\n${safeTrunc(approvedDecision, 1400)}` : null;

    const outputContract = executionClass === "ARCHITECT_REVIEW_REQUIRED"
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

    return [header, "", reference, "", delta, constraints ? `\n${constraints}` : "", acceptance ? `\n${acceptance}` : "", decision ? `\n${decision}` : "", "", outputContract].join("\n\n");
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
    if (!candidate.trim()) return { kind: "invalid", error: "OpenClaw envelope contained no renderable final text" };
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
    for (const candidate of [projection?.final, projection?.text, projection?.reply, agentMeta?.final, agentMeta?.text, agentMeta?.reply]) {
      if (typeof candidate === "string" && candidate.trim().length > 0) return candidate;
    }
    for (const payloads of [projection?.payloads, agentMeta?.payloads]) {
      if (!Array.isArray(payloads)) continue;
      const text = payloads.map((payload) => (typeof payload?.text === "string" ? payload.text : "")).filter((value) => value.trim().length > 0).join("\n\n");
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
    return `envelopeKeys=${rootKeys.join(",")};resultType=${resultType}`;
  }

  function finishAwaitingReview() {
    try { transitionLabel("orch:running", "orch:awaiting_review"); } catch {}
  }

  const issueJson = gh(["issue", "view", String(issue), "--repo", repo, "--json", "number,title,body,url,comments"]);
  const task = JSON.parse(issueJson);
  const taskId = extractField(task.body ?? "", "task_id") ?? `issue-${task.number}`;
  const humanRequired = /\*\*human_approval_required:\*\*\s*true/i.test(task.body ?? "");
  const stream = extractField(task.body ?? "", "stream") ?? "OTHER";
  const workerLocalAgentId = EXPLICIT_LOCAL_AGENT_ID || selectWorkerLocalAgentIdV1(stream) || "local";
  const ORCH_LOCAL_ROUTING_ENABLED = shouldEnableLocalRoutingV1({ stream, explicitLocalAgentId: EXPLICIT_LOCAL_AGENT_ID, explicitLocalRoutingEnabled: EXPLICIT_LOCAL_ROUTING_ENABLED });
  const ORCH_LOCAL_AGENT_ID = String(workerLocalAgentId);
  const classified = classifyExecution({ stream, humanApprovalRequired: humanRequired, body: task.body ?? "", comments: task.comments ?? [] });

  if (classified.executionClass === "KEEGAN_APPROVAL_REQUIRED") {
    postComment(["## OrchestrationResultContractV1", "", "```json", JSON.stringify({ ...resultBase(taskId), STATUS: "AWAITING_HUMAN_APPROVAL", SUMMARY: "Task requires human approval; adapter will not execute.", DECISIONS_REQUIRED: [classified.reason] }, null, 2), "```"].join("\n"));
    try { transitionLabel("orch:running", "orch:awaiting_human_approval"); } catch {}
    process.exit(0);
  }

  const isProof337Run = Number(task.number) === 337;
  const proofNonceRun = isProof337Run ? `proof-337-${Date.now()}` : null;
  let prompt = buildCompactAgentPrompt({ repo, issueNumber: task.number, title: task.title, body: task.body ?? "", comments: task.comments ?? [], executionClass: classified.executionClass });
  if (isProof337Run && proofNonceRun) prompt += `\n\n### PROOF_GUARD (AUTHORITATIVE)\nCLOUD_FORBIDDEN=true\nFRESHNESS_NONCE=${proofNonceRun} (MUST be included verbatim inside SESSION_CONTEXT)`;

  let out;
  const attemptedAgents = [];
  let localAttempted = false;
  let localResult = "NOT_ATTEMPTED";
  let escalatedToCloud = false;
  let escalationReason = null;

  function buildStrictJsonRetryPrompt(basePrompt, opts) {
    const proofGuard = opts?.isProof337 && opts?.proofNonce
      ? ["PROOF_GUARD (AUTHORITATIVE):", "CLOUD_FORBIDDEN=true", `FRESHNESS_NONCE=${String(opts.proofNonce)} (MUST be included verbatim inside SESSION_CONTEXT)`]
      : [];
    return [
      "STRICT_JSON_ONLY_RETRY:",
      ...proofGuard,
      "The full task context follows below. Execute that task; do not ask the user to restate it.",
      "Return ONLY one OrchestrationResultContractV1 JSON object and nothing else.",
      "No prose. No code fences. No DECISION-only object. No ArchitectCheckpointV1.",
      `TASK_ID MUST BE \"${String(taskId)}\". Never use placeholders such as \"issue-or-task-id\", \"task-id\", or \"unknown\".`,
      "Use EXACT uppercase keys. Minimum valid complete shape:",
      `{"TASK_ID":"${String(taskId)}","STATUS":"PASS|BLOCKED|FAILED","SUMMARY":"concise outcome","CHANGES":[],"FILES_CHANGED":[],"DB_CHANGES":"NO","MIGRATION":null,"TESTS":"command/results","PR":null,"MERGE_STATUS":"N/A","PRODUCTION_CHANGE":"NO","UNEXPECTED_RESULTS":[],"DECISIONS_REQUIRED":[],"BLOCKERS":[],"NEXT_RECOMMENDED_TASK":null,"SESSION_HEALTH":"GOOD","SESSION_CONTEXT":"branch/session"}`,
      "If implementation succeeded, report the actual files/tests/PR. If it failed, use BLOCKED or FAILED and state the blocker.",
      "Your entire response must be a single JSON object starting with '{' and ending with '}'.",
      "",
      "### FULL TASK CONTEXT",
      String(basePrompt ?? "")
    ].join("\n");
  }

  function shouldEnforceStrictJsonForLocal(message) {
    const text = String(message ?? "");
    return /OrchestrationResultContractV1/i.test(text) || /STRICT_JSON_ONLY/i.test(text);
  }

  function applyProofGuardForLocalStrictJson(message, opts) {
    const text = String(message ?? "");
    if (!(opts?.isProof337 && opts?.proofNonce)) return text;
    if (text.includes("CLOUD_FORBIDDEN=true") && text.includes(String(opts.proofNonce))) return text;
    return [`### PROOF_GUARD (AUTHORITATIVE)`, `CLOUD_FORBIDDEN=true`, `FRESHNESS_NONCE=${String(opts.proofNonce)}`, "", text].join("\n");
  }

  function deltaDemandsPass(body) {
    const d = section(body, "Delta") ?? "";
    return /\bSTATUS\b[^\n]*\bPASS\b/i.test(d);
  }

  function coerceLooseJsonToResultContract(obj, id) {
    if (!obj || typeof obj !== "object") return null;
    const status = String(obj.status ?? "").toLowerCase();
    const summary = typeof obj.summary === "string" ? obj.summary : null;
    if (!summary || !["success", "pass", "ok"].includes(status)) return null;
    return { ...resultBase(id), TASK_ID: String(id ?? "unknown"), STATUS: "PASS", SUMMARY: summary, BLOCKERS: [], NEXT_RECOMMENDED_TASK: null };
  }

  function routingMeta() {
    return { localRoutingEnabled: ORCH_LOCAL_ROUTING_ENABLED, localAgentId: ORCH_LOCAL_AGENT_ID, cloudAgentId: ORCH_CLOUD_AGENT_ID, attemptedAgents: attemptedAgents.slice(), localAttempted, localResult, escalatedToCloud, escalationReason };
  }

  function routingContractFields() {
    return { ROUTING_TIER: ORCH_LOCAL_ROUTING_ENABLED ? "LOCAL_FIRST" : "CLOUD_ONLY", MODEL_USED: null, LOCAL_ATTEMPTED: localAttempted, LOCAL_RESULT: localResult, ESCALATED_TO_CLOUD: escalatedToCloud, ESCALATION_REASON: escalationReason, CLOUD_USAGE: null, CLOUD_COST: null };
  }

  function runOpenclawWithPrompt(agentId, message) {
    const useEphemeralLocal = String(agentId).startsWith("local-") || agentId === "local";
    if (useEphemeralLocal) {
      attemptedAgents.push(agentId);
      localAttempted = true;
    } else {
      attemptedAgents.push(agentId);
    }
    const proofOpts = { isProof337: isProof337Run, proofNonce: proofNonceRun };
    const messageWithGuard = useEphemeralLocal ? applyProofGuardForLocalStrictJson(message, proofOpts) : String(message ?? "");
    const effectiveMessage = useEphemeralLocal && shouldEnforceStrictJsonForLocal(messageWithGuard) ? buildStrictJsonRetryPrompt(messageWithGuard, proofOpts) : String(messageWithGuard ?? "");
    const effectiveTimeout = useEphemeralLocal ? Math.max(Number(timeoutSeconds) || 0, 360) : Number(timeoutSeconds);
    const args = useEphemeralLocal
      ? ["agent", "exec", effectiveMessage, "--isolated", "--auth-env-only", "--model", ORCH_LOCAL_MODEL, "--code-mode", "code", "--local-model-lean", "--cwd", ORCH_AGENT_WORKSPACE, "--json", "--timeout", String(effectiveTimeout)]
      : ["agent", "--agent", agentId, "--message", effectiveMessage, "--json", "--timeout", String(effectiveTimeout)];
    const childEnv = useEphemeralLocal ? { ...process.env, OLLAMA_API_KEY: process.env.OLLAMA_API_KEY || "ollama-local", OPENCLAW_MODEL: ORCH_LOCAL_MODEL, OPENCLAW_FALLBACK_MODELS: "" } : process.env;
    const res = spawnSync("/opt/homebrew/bin/openclaw", args, { env: childEnv, encoding: "utf8", timeout: (effectiveTimeout + 60) * 1000, maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
    if (res.error) throw res.error;
    if (res.status !== 0) {
      const err = new Error(`openclaw exited with code ${String(res.status)}`);
      err.stdout = res.stdout;
      err.stderr = res.stderr;
      throw err;
    }
    return extractOpenclawJson(res.stdout, res.stderr);
  }

  try {
    if (classified.executionClass === "AUTO_CONTINUE") {
      const wrapped = await executeAutoContinueOnceV1({
        taskId,
        taskBody: task.body ?? "",
        promptText: prompt,
        strictRetryPrompt: buildStrictJsonRetryPrompt(prompt, { isProof337: isProof337Run, proofNonce: proofNonceRun }),
        localRoutingEnabled: ORCH_LOCAL_ROUTING_ENABLED,
        localAgentId: ORCH_LOCAL_AGENT_ID,
        cloudAgentId: ORCH_CLOUD_AGENT_ID,
        cloudForbidden: true,
        verifyStructuredResult: ({ parsed, envelope }) => {
          if (!parsed || parsed.kind !== "result") return { ok: false, kind: "INVALID_STRUCTURED_OUTPUT" };
          if (isProof337Run) {
            const meta = envelope?.meta?.agentMeta ?? envelope?.result?.meta?.agentMeta ?? envelope?.result?.agentMeta ?? null;
            if (meta?.provider !== "ollama") return { ok: false, kind: "INVALID_STRUCTURED_OUTPUT" };
            if (!String(parsed.value?.SESSION_CONTEXT ?? "").includes(String(proofNonceRun))) return { ok: false, kind: "INVALID_STRUCTURED_OUTPUT" };
          }
          return { ok: true };
        },
        run: async (agentId, message) => runOpenclawWithPrompt(agentId, message),
        extractFinalText: (env) => extractAgentFinalText(env),
        parseStructured: (text) => parseOrchestrationResult(text, taskId),
        deltaDemandsPass: (body) => deltaDemandsPass(body),
        coerceLooseJsonToResultContract: (obj, id) => coerceLooseJsonToResultContract(obj, id)
      });
      attemptedAgents.splice(0, attemptedAgents.length, ...(wrapped.routingState.attemptedAgents ?? attemptedAgents));
      localAttempted = wrapped.routingState.localAttempted ?? localAttempted;
      localResult = wrapped.routingState.localResult ?? localResult;
      escalatedToCloud = wrapped.routingState.escalatedToCloud ?? false;
      escalationReason = wrapped.routingState.escalationReason ?? null;
      out = wrapped.exec.final.raw;
    } else {
      out = runOpenclawWithPrompt(ORCH_CLOUD_AGENT_ID, prompt);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stdout = typeof err?.stdout === "string" ? err.stdout : "";
    const stderr = typeof err?.stderr === "string" ? err.stderr : "";
    postComment(["## OrchestrationResultContractV1", "", "```json", JSON.stringify({ ...resultBase(taskId), ...routingContractFields(), STATUS: "FAILED", SUMMARY: "openclaw agent execution failed", BLOCKERS: [safeTrunc(msg, 400)], UNEXPECTED_RESULTS: [safeTrunc(`routing=${JSON.stringify(routingMeta())}`, 1000), safeTrunc(`STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`, 4000)] }, null, 2), "```"].join("\n"));
    finishAwaitingReview();
    process.exit(1);
  }

  let envelope;
  try { envelope = JSON.parse(String(out ?? "")); }
  catch {
    postComment(["## OrchestrationResultContractV1", "", "```json", JSON.stringify({ ...resultBase(taskId), ...routingContractFields(), STATUS: "FAILED", SUMMARY: "Could not parse openclaw agent --json output", BLOCKERS: ["Invalid JSON envelope"], UNEXPECTED_RESULTS: [safeTrunc(out, 4000)] }, null, 2), "```"].join("\n"));
    finishAwaitingReview();
    process.exit(1);
  }

  let parsed;
  const finalText = extractAgentFinalText(envelope);
  try { parsed = parseOrchestrationResult(finalText, taskId); }
  catch (err) { parsed = { kind: "invalid", error: err instanceof Error ? err.message : String(err) }; }
  if (parsed.kind === "invalid") {
    postComment(["## OrchestrationResultContractV1", "", "```json", JSON.stringify({ ...resultBase(taskId), ...routingContractFields(), STATUS: "BLOCKED", SUMMARY: "Agent returned output that did not match required structured contracts", BLOCKERS: [parsed.error], UNEXPECTED_RESULTS: [safeTrunc(finalText, 4000), envelopeShape(envelope)] }, null, 2), "```"].join("\n"));
    finishAwaitingReview();
    process.exit(1);
  }

  const meta = envelope?.meta?.agentMeta ?? envelope?.result?.meta?.agentMeta ?? envelope?.result?.agentMeta ?? envelope ?? null;
  const modelUsed = meta?.model ?? null;
  const providerUsed = meta?.provider ?? null;
  const localUsage = providerUsed === "ollama" ? (meta?.usage ?? null) : null;
  const cloudUsage = providerUsed === "ollama" ? null : (meta?.usage ?? null);
  const cloudCost = providerUsed === "ollama" ? null : (meta?.costUsd ?? null);
  if (providerUsed === "ollama" && parsed.kind === "result") localResult = "SUCCESS";

  const valueWithRouting = parsed.kind === "result" && parsed.value && typeof parsed.value === "object"
    ? { ...parsed.value, ...routingContractFields(), MODEL_USED: modelUsed, LOCAL_RESULT: localResult, CLOUD_USAGE: cloudUsage, CLOUD_COST: cloudCost, LOCAL_USAGE: localUsage }
    : parsed.value;

  const contractBody = parsed.kind === "checkpoint"
    ? ["## ArchitectCheckpointV1", "", "```json", JSON.stringify(valueWithRouting, null, 2), "```"].join("\n")
    : ["## OrchestrationResultContractV1", "", "```json", JSON.stringify(valueWithRouting, null, 2), "```"].join("\n");
  const metaLine = meta ? `agentMeta: ${JSON.stringify({ model: meta.model ?? null, provider: meta.provider ?? null, usage: meta.usage ?? null, costUsd: meta.costUsd ?? null, toolSummary: meta.toolSummary ?? null, codeModeEngaged: meta.codeModeEngaged ?? null })}` : "agentMeta: unavailable";
  const routingLine = `routing: ${JSON.stringify(routingMeta())}`;
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
    } catch {}
  }
  process.on("exit", releaseWorkerLock);
  process.on("SIGINT", () => process.exit(130));
  process.on("SIGTERM", () => process.exit(143));
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    process.exitCode = 1;
  });
}
