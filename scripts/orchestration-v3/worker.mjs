import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ORCHESTRATION_V3 } from "./config.mjs";
import { extractOrchestrationResult } from "./result-contract.mjs";
import { requireHealthyWorker, recoverIdleWorker } from "./preflight.mjs";
import {
  createObservedExecutionHarness,
  readObservedExecutionEvidence,
  requiresTestExecution,
  requiresDiffCheck
} from "./execution-evidence.mjs";
import { buildIsolatedEnvironment, parseMachineEnvelope } from "./diagnose-local-tool-observed.mjs";
import {
  probeWorkerExecCapabilities,
  buildWorkerExecInvocation,
  codeModeShellInstruction
} from "./worker-exec-invocation.mjs";
import { LEASE_TTL_CONTRACT, touchLeaseHeartbeat } from "./lease-reconciliation.mjs";
import { runBufferedChild } from "./buffered-child-process.mjs";
import {
  MAX_LOCAL_ROUNDS,
  buildContinuationPrompt,
  missingImplementationEvidence,
  shouldContinueLocalRun
} from "./continuation-policy.mjs";

const CLOUD_CREDENTIAL_PREFIXES = [
  "OPENAI_", "ANTHROPIC_", "CODEX_", "GOOGLE_", "GEMINI_", "XAI_", "MISTRAL_",
  "GROQ_", "DEEPSEEK_", "PERPLEXITY_", "OPENROUTER_", "COHERE_", "HUGGINGFACE_",
  "HF_", "TOGETHER_", "CEREBRAS_", "FIREWORKS_", "AZURE_", "BEDROCK_"
];

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

const issue = Number(arg("--issue"));
const workerId = arg("--worker");
if (!Number.isInteger(issue) || issue <= 0 || !workerId || !ORCHESTRATION_V3.workers[workerId]) {
  console.error("Usage: node scripts/orchestration-v3/worker.mjs --issue N --worker local-a");
  process.exit(2);
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function isTransientGhError(err) {
  const text = [err?.message, err?.stderr, err?.stdout].filter(Boolean).join("\n");
  return /\b(429|502|503|504)\b|ETIMEDOUT|TLS handshake timeout|temporar|try resubmitting|Service Unavailable|rate limit/i.test(text);
}
function gh(args, { attempts = 3 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return execFileSync("gh", args, { encoding: "utf8", timeout: 30_000 }).trim();
    } catch (err) {
      lastError = err;
      if (!isTransientGhError(err) || attempt === attempts) throw err;
      const delayMs = 1000 * 2 ** (attempt - 1);
      console.error(JSON.stringify({
        event: "WORKER_GH_TRANSIENT_RETRY",
        attempt,
        delayMs,
        command: args.slice(0, 3),
        error: err instanceof Error ? err.message : String(err)
      }));
      sleepSync(delayMs);
    }
  }
  throw lastError;
}
function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", timeout: 30_000 }).trim();
}
function issueSnapshot() {
  const row = JSON.parse(gh(["api", "--method", "GET", `repos/${ORCHESTRATION_V3.repo}/issues/${issue}`]));
  return { number: row.number, title: row.title, body: row.body, labels: row.labels ?? [] };
}
function labelsOf(snapshot) {
  return new Set((snapshot.labels ?? []).map((x) => typeof x === "string" ? x : x.name).filter(Boolean));
}
function setIssueLabels(labels) {
  const args = ["api", "--method", "PATCH", `repos/${ORCHESTRATION_V3.repo}/issues/${issue}`];
  for (const label of [...new Set(labels.filter(Boolean))]) args.push("-f", `labels[]=${label}`);
  gh(args);
}
function editLabels({ remove = [], add = [] }) {
  const current = [...labelsOf(issueSnapshot())];
  const removeSet = new Set(remove);
  setIssueLabels([...current.filter((label) => !removeSet.has(label)), ...add]);
}
function postResult(value, meta = null) {
  const lines = ["## OrchestrationResultContractV1", "", "```json", JSON.stringify(value, null, 2), "```"];
  if (meta) lines.push("", `<!-- agentMeta: ${JSON.stringify(meta)} -->`);
  gh(["api", "--method", "POST", `repos/${ORCHESTRATION_V3.repo}/issues/${issue}/comments`, "-f", `body=${lines.join("\n")}`]);
}
function taskField(body, name) {
  const text = String(body ?? "");
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`^\\s*\\*\\*${escaped}:\\*\\*\\s*(.+?)\\s*$`, "im"),
    new RegExp(`^\\s*${escaped}:\\s*(.+?)\\s*$`, "im"),
    new RegExp(`^\\s*#{1,6}\\s*${escaped}\\s*$\\s*^\\s*([^#\\n][^\\n]*)`, "im")
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}
function humanApprovalRequired(body) {
  return String(taskField(body, "human_approval_required") ?? "false").trim().toLowerCase() === "true";
}

function taskMutability(body) {
  const text = String(body ?? "");
  const explicit = String(taskField(text, "task_mutability") ?? "").trim().toUpperCase();

  if (explicit === "VALIDATION_EVIDENCE_ONLY") return "VALIDATION_EVIDENCE_ONLY";
  if (explicit === "IMPLEMENTATION_MUTATION_REQUIRED") return "IMPLEMENTATION_MUTATION_REQUIRED";

  const stream = String(taskField(text, "stream") ?? "").trim().toUpperCase();
  if (stream === "QA_EVALUATION") return "VALIDATION_EVIDENCE_ONLY";

  const evidenceOnly =
    /\b(evidence[- ]only|validation[- ]only|tests?\/evidence[- ]only|QA tests?\/evidence[- ]only)\b/i.test(text) &&
    /\b(no (?:product |repository |code )?mutation|zero repository mutation|without (?:a )?(?:git |repository )?mutation|do not (?:require|fabricate) (?:a )?git mutation)\b/i.test(text);

  return evidenceOnly
    ? "VALIDATION_EVIDENCE_ONLY"
    : "IMPLEMENTATION_MUTATION_REQUIRED";
}
function requiresArchitectureGrounding(snapshot) {
  const body = String(snapshot?.body ?? "");
  const stream = String(taskField(body, "stream") ?? "").trim().toUpperCase();
  if (stream && stream !== "AGENT_ORCHESTRATION" && stream !== "ORCHESTRATION_SYSTEMS") return true;

  const text = `${snapshot?.title ?? ""}\n${body}`.toLowerCase();
  return /\b(product|dashboard|decision room|fusion|intelligence|architecture|canonical|source[- ]of[- ]truth|recommendation|evidence|strategy|financial|learning|external knowledge|scheduler|memory store|agent role)\b/.test(text);
}
function resultBase(status, summary) {
  return {
    TASK_ID: `issue-${issue}`,
    STATUS: status,
    SUMMARY: summary,
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
    SESSION_CONTEXT: `v3/${workerId}/issue-${issue}`,
    ROUTING_TIER: "LOCAL_FIRST",
    MODEL_USED: "qwen3.5:9b",
    LOCAL_ATTEMPTED: true,
    LOCAL_RESULT: status === "PASS" ? "SUCCESS" : "EVIDENCE_REJECTED",
    ESCALATED_TO_CLOUD: false,
    ESCALATION_REASON: null,
    CLOUD_USAGE: null,
    CLOUD_COST: null
  };
}
function openPrSnapshot() {
  const rows = JSON.parse(gh(["api", "--method", "GET", `repos/${ORCHESTRATION_V3.repo}/pulls`, "-f", "state=open", "-f", "per_page=100"]) || "[]");
  return rows.map((pr) => ({ number: pr.number, headRefName: pr.head?.ref ?? null, headRefOid: pr.head?.sha ?? null, updatedAt: pr.updated_at ?? null }));
}
function mapPrs(prs) {
  return new Map((prs ?? []).map((pr) => [Number(pr.number), pr]));
}
function sanitizeCloudEnv(baseEnv) {
  const env = { ...baseEnv };
  for (const key of Object.keys(env)) {
    if (CLOUD_CREDENTIAL_PREFIXES.some((prefix) => key.startsWith(prefix)) && /(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)/i.test(key)) delete env[key];
  }
  return env;
}
function q(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

const preflight = requireHealthyWorker(workerId);
const cfg = ORCHESTRATION_V3.workers[workerId];
const repoRoot = path.resolve(cfg.worktree);
const controlWorkspace = path.resolve(cfg.agentWorkspace);
if (repoRoot === controlWorkspace) throw new Error(`OPENCLAW_WORKSPACE_MUST_NOT_EQUAL_GIT_WORKTREE:${workerId}`);
fs.mkdirSync(controlWorkspace, { recursive: true });
touchLeaseHeartbeat(workerId);
const leaseHeartbeatTimer = setInterval(() => {
  touchLeaseHeartbeat(workerId);
}, LEASE_TTL_CONTRACT.workerHeartbeatIntervalMs);
leaseHeartbeatTimer.unref();

const snapshot = issueSnapshot();
if (humanApprovalRequired(snapshot.body)) {
  const value = { ...resultBase("BLOCKED", "Human approval required; V3 worker refused autonomous execution"), STATUS: "AWAITING_HUMAN_APPROVAL", DECISIONS_REQUIRED: ["KEEGAN_APPROVAL_REQUIRED"] };
  postResult(value);
  const current = labelsOf(issueSnapshot());
  editLabels({ remove: [ORCHESTRATION_V3.queue.running, ORCHESTRATION_V3.queue.ready].filter((x) => current.has(x)), add: [ORCHESTRATION_V3.queue.humanApproval] });
  process.exit(0);
}
const architectureGroundingRequired = requiresArchitectureGrounding(snapshot);
const architectureGroundingInstructions = architectureGroundingRequired
  ? [
      "CANONICAL PRODUCT ARCHITECTURE GROUNDING REQUIRED.",
      "Before planning or editing product/system behavior, inspect docs/ARCHITECTURE.md from the protected repository using the shell exec tool with the protected repository as workdir.",
      "Do NOT use OpenClaw read/write/edit file tools for protected-repository paths; those tools are intentionally sandboxed to the separate control workspace.",
      "Use shell exec for every protected-repository read, search, edit, test, git operation, and diff.",
      "Follow its canonical source hierarchy when older docs, local workspace files, memories, or generated AGENTS.md content conflict.",
      "Do not create a parallel recommendation engine, scheduler, memory store, deployment path, agent role, or source-of-truth boundary without first checking the canonical owner in docs/ARCHITECTURE.md."
    ]
  : [
      "CANONICAL PRODUCT ARCHITECTURE GROUNDING NOT REQUIRED FOR THIS TASK.",
      "This deterministic exemption applies only to narrow orchestration/control-plane work that does not change product or system architecture."
    ];

const beforeHead = git(["rev-parse", "HEAD"], repoRoot);
const beforePrs = openPrSnapshot();
const beforeMap = new Map(
  beforePrs.map((pr) => [Number(pr.number), pr])
);
const harness = createObservedExecutionHarness({ issue, workerId });
const observed = Object.fromEntries(["git", "pnpm", "npm", "npx"].map((name) => [name, path.join(harness.shimRoot, name)]));
if (!fs.existsSync(observed.git)) throw new Error("OBSERVED_GIT_WRAPPER_MISSING");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `jeeves-v3-worker-${issue}-${workerId}-`));
const tempHome = path.join(tempRoot, "home");
const stateDir = path.join(tempRoot, "state");
const configPath = path.join(tempRoot, "openclaw.json");
for (const dir of [tempHome, stateDir, controlWorkspace]) fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(configPath, "{}\n", "utf8");
fs.writeFileSync(path.join(controlWorkspace, "AGENTS.md"), [
  "# Jeeves V3 capability-aware worker",
  `Protected repository: ${repoRoot}`,
  "Use only the explicitly supplied observed command wrappers for git/package-manager commands.",
  "Never initialize, delete, clean, or reseed the protected repository.",
  `Model: ${ORCHESTRATION_V3.model.id}. Cloud fallback forbidden.`,
  ...architectureGroundingInstructions
].join("\n") + "\n", "utf8");

const baseEnv = sanitizeCloudEnv(process.env);
let env = buildIsolatedEnvironment({ baseEnv, tempHome, stateDir, configPath, controlWorkspace, harnessEnv: harness.envPatch });
if (process.env.HOME) {
  env.GH_CONFIG_DIR = process.env.GH_CONFIG_DIR || path.join(process.env.HOME, ".config", "gh");
  env.GIT_CONFIG_GLOBAL = process.env.GIT_CONFIG_GLOBAL || path.join(process.env.HOME, ".gitconfig");
}
env.OPENCLAW_FALLBACK_MODELS = "";
env.OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || "ollama-local";

const openclaw = "/opt/homebrew/bin/openclaw";
const capabilities = probeWorkerExecCapabilities(openclaw);
const preflightCommand = `${q(observed.git)} rev-parse --show-toplevel && ${q(observed.git)} status --short --branch && ${q(observed.git)} remote -v`;
const testRequired = requiresTestExecution(snapshot.body);
const diffCheckRequired = requiresDiffCheck(snapshot.body);
const mutability = taskMutability(snapshot.body);
const mutationRequired = mutability === "IMPLEMENTATION_MUTATION_REQUIRED";
// V3 canonical execution is currently AGENT_EXEC_DIRECT.
 // Do not advertise Code Mode merely because the installed CLI supports it.
const codeModeBridge = false;
const firstToolInstruction = codeModeBridge
  ? [
      "MANDATORY FIRST TOOL ACTION: invoke the outer Code Mode exec tool exactly once with this JavaScript:",
      codeModeShellInstruction(preflightCommand, repoRoot),
      "The outer Code Mode exec tool accepts JavaScript/TypeScript, not raw shell. Never place raw shell directly in it."
    ].join("\n")
  : [
      "MANDATORY FIRST TOOL ACTION: execute this exact command with the shell exec tool:",
      preflightCommand
    ].join("\n");
const shellExecutionInstruction = codeModeBridge
  ? [
      "CODE MODE SHELL BRIDGE IS AUTHORITATIVE.",
      "For EVERY shell command, invoke the outer exec tool with JavaScript that calls tools.callValue(\"openclaw:core:exec\", { command: <exact shell command>, workdir: <exact workdir> }).",
      `Every repository command must use workdir ${repoRoot}.`,
      "Do not narrate a command instead of invoking the bridge. Do not claim success from command text you did not execute."
    ].join("\n")
  : [
      "DIRECT SHELL EXECUTION IS AUTHORITATIVE.",
      `Use the shell exec tool for EVERY protected-repository operation with exact workdir ${repoRoot}.`,
      "Do NOT invoke read, write, edit, or other workspace-file tools against protected-repository paths.",
      "For repository file reads use shell commands such as cat/sed/grep through exec.",
      "For repository edits use shell commands or scripts through exec, then verify with the observed git wrapper."
    ].join("\n");

const prompt = [
  `You are Jeeves executing GitHub issue #${issue} in ${ORCHESTRATION_V3.repo}.`,
  `TASK TITLE: ${snapshot.title}`,
  "",
  "TASK BODY:",
  String(snapshot.body ?? "").slice(0, 12000),
  "",
  `PROTECTED REPOSITORY ROOT: ${repoRoot}`,
  mutationRequired
    ? "This is a real implementation run. Perform the focused repository work required by the task."
    : "This is a real validation/evidence run. Execute and record the required verification without fabricating repository mutation.",
  ...architectureGroundingInstructions,
  shellExecutionInstruction,
  firstToolInstruction,
  "Do not substitute /usr/bin/git, /opt/homebrew/bin/git, or plain git for the observed git wrapper.",
  "For every git command use this exact executable:",
  observed.git,
  fs.existsSync(observed.pnpm) ? `For every pnpm command use: ${observed.pnpm}` : null,
  fs.existsSync(observed.npm) ? `For every npm command use: ${observed.npm}` : null,
  fs.existsSync(observed.npx) ? `For every npx command use: ${observed.npx}` : null,
  testRequired ? "The issue requires tests/build/typecheck. Actually execute the relevant successful command through one of the observed package-manager wrappers before PASS." : null,
  `Before PASS, actually execute and inspect: ${q(observed.git)} diff`,
  diffCheckRequired ? `Before PASS, actually execute: ${q(observed.git)} diff --check` : null,
  mutationRequired
    ? "Before PASS, perform a real focused git mutation using the observed git wrapper: add/commit and push the focused branch or update the existing PR branch required by the issue."
    : "TASK MUTABILITY: VALIDATION_EVIDENCE_ONLY. Do NOT create, stage, commit, push, or fabricate a repository mutation merely to satisfy PASS. PASS is allowed with zero mutation when all applicable host-observed validation evidence is present.",
  "Use gh inside the same shell bridge when PR inspection or PR creation/update is required. Do not create a duplicate PR when the issue names an existing PR.",
  "Cloud use is forbidden. Do not request or use OpenAI/Anthropic/Gemini/etc.",
  "After the bounded implementation attempt, return ONLY one strict JSON object with this exact uppercase-key shape:",
  JSON.stringify({
    TASK_ID: `issue-${issue}`, STATUS: "PASS|BLOCKED|FAILED", SUMMARY: "concise outcome", CHANGES: [], FILES_CHANGED: [], DB_CHANGES: "NO", MIGRATION: null, TESTS: "command/results", PR: null, MERGE_STATUS: "N/A", PRODUCTION_CHANGE: "NO", UNEXPECTED_RESULTS: [], DECISIONS_REQUIRED: [], BLOCKERS: [], NEXT_RECOMMENDED_TASK: null, SESSION_HEALTH: "GOOD", SESSION_CONTEXT: `v3/${workerId}/issue-${issue}`
  }),
  "No prose and no markdown fences."
].filter(Boolean).join("\n");

const invocation = buildWorkerExecInvocation({
  capabilities,
  prompt,
  controlWorkspace,
  configPath,
  stateDir,
  timeoutSeconds: 900
});
if (!invocation.supported) {
  const value = { ...resultBase("BLOCKED", "Installed OpenClaw cannot provide the V3 agent-exec tool path"), BLOCKERS: [invocation.reason] };
  postResult(value, { provider: null, model: null, fallbackUsed: null, capabilities, invocation });
  const current = labelsOf(issueSnapshot());
  editLabels({ remove: [ORCHESTRATION_V3.queue.running, ORCHESTRATION_V3.queue.ready].filter((x) => current.has(x)), add: [ORCHESTRATION_V3.queue.blocked] });
  process.exit(1);
}

console.log(JSON.stringify({ event: "WORKER_START", issue, workerId, preflight, repoRoot, model: ORCHESTRATION_V3.model.id, cloudFallbackAllowed: false, observed, beforeHead, capabilities, invocationMode: invocation.mode }));

async function executeLocalRound(roundPrompt, roundNumber) {
  const roundInvocation = buildWorkerExecInvocation({
    capabilities,
    prompt: roundPrompt,
    controlWorkspace,
    configPath,
    stateDir,
    timeoutSeconds: 900
  });

  if (!roundInvocation.supported) {
    return {
      run: { status: 1, stdout: "", stderr: "", error: null },
      invocation: roundInvocation,
      machine: {},
      executionEvidence: readObservedExecutionEvidence(harness.journalPath),
      realMutationObserved: false,
      changedPrs: [],
      finalValue: {
        ...resultBase("BLOCKED", "Installed OpenClaw cannot provide the V3 agent-exec tool path"),
        BLOCKERS: [roundInvocation.reason]
      }
    };
  }

  console.log(JSON.stringify({
    event: roundNumber === 1 ? "WORKER_LOCAL_ROUND_START" : "WORKER_REPAIR_ROUND_EXEC",
    issue,
    workerId,
    round: roundNumber,
    invocationMode: roundInvocation.mode
  }));

  const roundRun = await runBufferedChild(openclaw, roundInvocation.args, {
    cwd: controlWorkspace,
    env,
    timeout: 950_000,
    maxBuffer: 24 * 1024 * 1024
  });

  const postModelIntegrity = recoverIdleWorker(workerId);
  const roundExecutionEvidence = readObservedExecutionEvidence(harness.journalPath);
  const roundMachine = parseMachineEnvelope(roundRun.stdout);

  const roundAfterHead = git(["rev-parse", "HEAD"], repoRoot);
  const roundAfterPrs = openPrSnapshot();
  const roundChangedPrs = roundAfterPrs.filter(
    (pr) =>
      !beforeMap.has(Number(pr.number)) ||
      beforeMap.get(Number(pr.number))?.headRefOid !== pr.headRefOid
  );

  const roundRealMutationObserved =
    beforeHead !== roundAfterHead || roundChangedPrs.length > 0;

  const providerOk =
    String(roundMachine.provider ?? "").toLowerCase() === "ollama";
  const modelOk = ["qwen3.5:9b", ORCHESTRATION_V3.model.id].includes(
    String(roundMachine.model ?? "").toLowerCase()
  );
  const fallbackOk = roundMachine.fallbackUsed === false;

  let roundParsed;

  try {
    const envelope = JSON.parse(String(roundRun.stdout ?? ""));
    const value = extractOrchestrationResult(envelope);
    roundParsed = {
      ...resultBase(value.STATUS, String(value.SUMMARY ?? "")),
      ...value
    };
  } catch (error) {
    roundParsed = {
      ...resultBase(
        "BLOCKED",
        "Local model output could not be parsed as OrchestrationResultContractV1"
      ),
      BLOCKERS: [
        "NO_VALID_ORCHESTRATION_RESULT",
        error?.message ?? String(error)
      ]
    };
  }

  const roundEvidenceErrors = [];

  if (roundRun.error?.code === "ETIMEDOUT") {
    roundEvidenceErrors.push("OPENCLAW_PROCESS_TIMEOUT");
  } else if (roundRun.status !== 0) {
    roundEvidenceErrors.push(`OPENCLAW_PROCESS_FAILED:${roundRun.status}`);
  }

  if (!postModelIntegrity.after?.healthy) {
    roundEvidenceErrors.push(
      `POST_MODEL_WORKTREE_INTEGRITY_FAILED:${
        postModelIntegrity.after?.errors?.join(",") ??
        postModelIntegrity.before?.errors?.join(",") ??
        "UNKNOWN"
      }`
    );
  }

  if (!providerOk) {
    roundEvidenceErrors.push(`PROVIDER_MISMATCH:${roundMachine.provider}`);
  }
  if (!modelOk) {
    roundEvidenceErrors.push(`MODEL_MISMATCH:${roundMachine.model}`);
  }
  if (!fallbackOk) {
    roundEvidenceErrors.push(
      `FALLBACK_NOT_PROVEN_FALSE:${roundMachine.fallbackUsed}`
    );
  }
  if (!roundExecutionEvidence.repoPreflightObserved) {
    roundEvidenceErrors.push("MISSING_OBSERVED_REPO_PREFLIGHT");
  }
  if (testRequired && !roundExecutionEvidence.testExecutionObserved) {
    roundEvidenceErrors.push("MISSING_OBSERVED_TEST_BUILD_TYPECHECK");
  }
  if (!roundExecutionEvidence.gitDiffObserved) {
    roundEvidenceErrors.push("MISSING_OBSERVED_GIT_DIFF");
  }
  if (diffCheckRequired && !roundExecutionEvidence.gitDiffCheckObserved) {
    roundEvidenceErrors.push("MISSING_OBSERVED_GIT_DIFF_CHECK");
  }
  if (mutationRequired && !roundExecutionEvidence.gitMutationCommandObserved) {
    roundEvidenceErrors.push("MISSING_OBSERVED_GIT_MUTATION_COMMAND");
  }
  if (mutationRequired && !roundRealMutationObserved) {
    roundEvidenceErrors.push("NO_REAL_GIT_OR_PR_STATE_MUTATION");
  }

  let roundFinalValue = {
    ...roundParsed,
    ROUTING_TIER: "LOCAL_FIRST",
    MODEL_USED: roundMachine.model,
    LOCAL_ATTEMPTED: true,
    LOCAL_RESULT:
      roundParsed.STATUS === "PASS" ? "SUCCESS" : "EVIDENCE_REJECTED",
    ESCALATED_TO_CLOUD: false,
    ESCALATION_REASON: null,
    CLOUD_USAGE: null,
    CLOUD_COST: null
  };

  if (roundParsed.STATUS === "PASS" && roundEvidenceErrors.length > 0) {
    roundFinalValue = {
      ...resultBase(
        "BLOCKED",
        "Machine evidence rejected an unproven model PASS"
      ),
      BLOCKERS: roundEvidenceErrors,
      UNEXPECTED_RESULTS: [
        JSON.stringify({
          machine: roundMachine,
          executionEvidence: roundExecutionEvidence,
          beforeHead,
          afterHead: roundAfterHead,
          changedPrNumbers: roundChangedPrs.map((pr) => pr.number)
        })
      ]
    };
  } else if (roundParsed.STATUS !== "PASS" && roundEvidenceErrors.length > 0) {
    roundFinalValue.BLOCKERS = [
      ...new Set([
        ...(roundFinalValue.BLOCKERS ?? []),
        ...roundEvidenceErrors
      ])
    ];
  }

  return {
    run: roundRun,
    invocation: roundInvocation,
    machine: roundMachine,
    executionEvidence: roundExecutionEvidence,
    realMutationObserved: roundRealMutationObserved,
    changedPrs: roundChangedPrs,
    finalValue: roundFinalValue
  };
}

let localRound = 1;
let localResult = await executeLocalRound(prompt, localRound);

let run = localResult.run;
let finalValue = localResult.finalValue;
let resultMachine = localResult.machine;
let resultExecutionEvidence = localResult.executionEvidence;
let resultInvocationMode = localResult.invocation.mode;
let resultRealMutationObserved = localResult.realMutationObserved;
let resultChangedPrs = localResult.changedPrs;

while (
  shouldContinueLocalRun({
    completedRound: localRound,
    status: finalValue.STATUS,
    blockers: finalValue.BLOCKERS ?? []
  })
) {
  const nextRound = localRound + 1;
  const missingEvidence = missingImplementationEvidence(
    finalValue.BLOCKERS ?? []
  );

  console.log(JSON.stringify({
    event: "WORKER_REPAIR_ROUND_START",
    issue,
    workerId,
    round: nextRound,
    missingEvidence,
    invocationMode: "AGENT_EXEC_DIRECT"
  }));

  const continuationPrompt = buildContinuationPrompt(prompt, {
    nextRound,
    blockers: finalValue.BLOCKERS ?? []
  });

  localResult = await executeLocalRound(continuationPrompt, nextRound);
  localRound = nextRound;

  run = localResult.run;
  finalValue = localResult.finalValue;
  resultMachine = localResult.machine;
  resultExecutionEvidence = localResult.executionEvidence;
  resultInvocationMode = localResult.invocation.mode;
  resultRealMutationObserved = localResult.realMutationObserved;
  resultChangedPrs = localResult.changedPrs;

  if (localRound >= MAX_LOCAL_ROUNDS) break;
}

/*
 * Product delivery and the background 4/4 Ollama proof are intentionally
 * separate concerns.
 *
 * #337 remains strict Ollama-only acceptance.
 * Every other non-human task may use the approved stronger coding path after
 * one bounded local failure, but only when the central model policy explicitly
 * permits cloud fallback. The production default is false/$0 autonomous spend.
 */
if (finalValue.STATUS !== "PASS" && issue !== 337 && ORCHESTRATION_V3.model.cloudFallbackAllowed) {
  const localFailureReason =
    (finalValue.BLOCKERS ?? [])[0] ??
    (run.error?.code === "ETIMEDOUT" ? "OPENCLAW_PROCESS_TIMEOUT" : null) ??
    "LOCAL_EVIDENCE_FAILURE";

  const cloudPrompt = prompt.replace(
    "Cloud use is forbidden. Do not request or use OpenAI/Anthropic/Gemini/etc.",
    [
      "The bounded local Ollama attempt failed.",
      "You are now the APPROVED STRONGER CODING PATH for this normal product task.",
      "Complete the implementation now.",
      "Preserve every repository, test, diff, mutation, PR, and human-approval safety gate above.",
      "Do not perform production/business actions."
    ].join(" ")
  );

  const cloudEnv = { ...process.env, ...harness.envPatch };
  if (process.env.HOME) {
    cloudEnv.GH_CONFIG_DIR =
      process.env.GH_CONFIG_DIR || path.join(process.env.HOME, ".config", "gh");
    cloudEnv.GIT_CONFIG_GLOBAL =
      process.env.GIT_CONFIG_GLOBAL || path.join(process.env.HOME, ".gitconfig");
  }

  console.log(JSON.stringify({
    event: "PRODUCT_ESCALATION_START",
    issue,
    workerId,
    reason: localFailureReason,
    cloudAgent: "main"
  }));

  const cloudRun = await runBufferedChild(
    openclaw,
    [
      "agent",
      "--agent", "main",
      "--message", cloudPrompt,
      "--json",
      "--timeout", "900"
    ],
    {
      cwd: controlWorkspace,
      env: cloudEnv,
      timeout: 950_000,
      maxBuffer: 24 * 1024 * 1024
    }
  );

  const postCloudIntegrity = recoverIdleWorker(workerId);
  const cloudExecutionEvidence =
    readObservedExecutionEvidence(harness.journalPath);
  const cloudMachine = parseMachineEnvelope(cloudRun.stdout);

  const cloudAfterHead = git(["rev-parse", "HEAD"], repoRoot);
  const cloudAfterPrs = openPrSnapshot();
  const cloudChangedPrs = cloudAfterPrs.filter(
    (pr) =>
      !beforeMap.has(Number(pr.number)) ||
      beforeMap.get(Number(pr.number))?.headRefOid !== pr.headRefOid
  );

  const cloudRealMutationObserved =
    beforeHead !== cloudAfterHead || cloudChangedPrs.length > 0;

  let cloudParsed;
  try {
    const envelope = JSON.parse(String(cloudRun.stdout ?? ""));
    const value = extractOrchestrationResult(envelope);
    cloudParsed = {
      ...resultBase(value.STATUS, String(value.SUMMARY ?? "")),
      ...value
    };
  } catch (error) {
    cloudParsed = {
      ...resultBase(
        "BLOCKED",
        "Stronger coding path output could not be parsed as OrchestrationResultContractV1"
      ),
      BLOCKERS: [error?.message ?? String(error)]
    };
  }

  const cloudEvidenceErrors = [];

  if (cloudRun.error?.code === "ETIMEDOUT") {
    cloudEvidenceErrors.push("CLOUD_OPENCLAW_PROCESS_TIMEOUT");
  } else if (cloudRun.status !== 0) {
    cloudEvidenceErrors.push(`CLOUD_OPENCLAW_PROCESS_FAILED:${cloudRun.status}`);
  }
  if (!postCloudIntegrity.after?.healthy) {
    cloudEvidenceErrors.push(`POST_CLOUD_WORKTREE_INTEGRITY_FAILED:${postCloudIntegrity.after?.errors?.join(",") ?? postCloudIntegrity.before?.errors?.join(",") ?? "UNKNOWN"}`);
  }

  if (!cloudExecutionEvidence.repoPreflightObserved) {
    cloudEvidenceErrors.push("MISSING_OBSERVED_REPO_PREFLIGHT");
  }
  if (testRequired && !cloudExecutionEvidence.testExecutionObserved) {
    cloudEvidenceErrors.push("MISSING_OBSERVED_TEST_BUILD_TYPECHECK");
  }
  if (!cloudExecutionEvidence.gitDiffObserved) {
    cloudEvidenceErrors.push("MISSING_OBSERVED_GIT_DIFF");
  }
  if (diffCheckRequired && !cloudExecutionEvidence.gitDiffCheckObserved) {
    cloudEvidenceErrors.push("MISSING_OBSERVED_GIT_DIFF_CHECK");
  }
  if (mutationRequired && !cloudExecutionEvidence.gitMutationCommandObserved) {
    cloudEvidenceErrors.push("MISSING_OBSERVED_GIT_MUTATION_COMMAND");
  }
  if (mutationRequired && !cloudRealMutationObserved) {
    cloudEvidenceErrors.push("NO_REAL_GIT_OR_PR_STATE_MUTATION");
  }

  let cloudFinalValue = {
    ...cloudParsed,
    ROUTING_TIER: "LOCAL_FIRST_WITH_CLOUD_ESCALATION",
    MODEL_USED: cloudMachine.model,
    LOCAL_ATTEMPTED: true,
    LOCAL_RESULT: "EVIDENCE_REJECTED",
    ESCALATED_TO_CLOUD: true,
    ESCALATION_REASON: localFailureReason,
    CLOUD_USAGE: "USED",
    CLOUD_COST: null
  };

  if (cloudParsed.STATUS === "PASS" && cloudEvidenceErrors.length > 0) {
    cloudFinalValue = {
      ...resultBase(
        "BLOCKED",
        "Machine evidence rejected an unproven stronger-path PASS"
      ),
      ROUTING_TIER: "LOCAL_FIRST_WITH_CLOUD_ESCALATION",
      MODEL_USED: cloudMachine.model,
      LOCAL_ATTEMPTED: true,
      LOCAL_RESULT: "EVIDENCE_REJECTED",
      ESCALATED_TO_CLOUD: true,
      ESCALATION_REASON: localFailureReason,
      CLOUD_USAGE: "USED",
      CLOUD_COST: null,
      BLOCKERS: cloudEvidenceErrors,
      UNEXPECTED_RESULTS: [
        JSON.stringify({
          cloudMachine,
          cloudExecutionEvidence,
          beforeHead,
          cloudAfterHead,
          changedPrNumbers: cloudChangedPrs.map((pr) => pr.number)
        })
      ]
    };
  }

  if (cloudParsed.STATUS !== "PASS" && cloudEvidenceErrors.length > 0) {
    cloudFinalValue.BLOCKERS = [
      ...new Set([
        ...(cloudFinalValue.BLOCKERS ?? []),
        ...cloudEvidenceErrors
      ])
    ];
  }

  finalValue = cloudFinalValue;
  resultMachine = cloudMachine;
  resultExecutionEvidence = cloudExecutionEvidence;
  resultInvocationMode = "CLOUD_AGENT_MAIN_AFTER_LOCAL_FAILURE";
  resultRealMutationObserved = cloudRealMutationObserved;
  resultChangedPrs = cloudChangedPrs;
}

postResult(finalValue, {
  provider: resultMachine.provider,
  model: resultMachine.model,
  fallbackUsed: resultMachine.fallbackUsed,
  toolCalls: resultMachine.toolCalls,
  toolFailures: resultMachine.toolFailures,
  executionEvidence: resultExecutionEvidence,
  capabilities,
  invocationMode: resultInvocationMode
});
const current = labelsOf(issueSnapshot());
const remove = [ORCHESTRATION_V3.queue.running, ORCHESTRATION_V3.queue.ready, ORCHESTRATION_V3.queue.awaitingReview, ORCHESTRATION_V3.queue.blocked].filter((x) => current.has(x));
const add = finalValue.STATUS === "PASS" ? [ORCHESTRATION_V3.queue.awaitingReview] : [ORCHESTRATION_V3.queue.blocked];
editLabels({ remove, add });
console.log(JSON.stringify({
  event: "WORKER_END",
  issue,
  workerId,
  status: finalValue.STATUS,
  machine: resultMachine,
  executionEvidence: resultExecutionEvidence,
  realMutationObserved: resultRealMutationObserved,
  changedPrNumbers: resultChangedPrs.map((pr) => pr.number),
  invocationMode: resultInvocationMode,
  escalatedToCloud: finalValue.ESCALATED_TO_CLOUD
}));
process.exit(finalValue.STATUS === "PASS" ? 0 : 1);