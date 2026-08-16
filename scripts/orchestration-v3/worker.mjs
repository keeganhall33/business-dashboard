import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ORCHESTRATION_V3 } from "./config.mjs";
import { requireHealthyWorker } from "./preflight.mjs";
import { createObservedExecutionHarness, readObservedExecutionEvidence, requiresTestExecution, requiresDiffCheck } from "./execution-evidence.mjs";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const issue = Number(arg("--issue"));
const workerId = arg("--worker");
if (!Number.isInteger(issue) || issue <= 0 || !workerId) {
  console.error("Usage: node scripts/orchestration-v3/worker.mjs --issue N --worker local-a");
  process.exit(2);
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", timeout: 30_000 }).trim();
}

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", timeout: 30_000 }).trim();
}

function issueSnapshot() {
  return JSON.parse(gh(["issue", "view", String(issue), "--repo", ORCHESTRATION_V3.repo, "--json", "body,labels,comments"]));
}

function labelsOf(snapshot) {
  return new Set((snapshot.labels ?? []).map((l) => l.name));
}

function editLabels({ remove = [], add = [] }) {
  const args = ["issue", "edit", String(issue), "--repo", ORCHESTRATION_V3.repo];
  for (const label of remove) args.push("--remove-label", label);
  for (const label of add) args.push("--add-label", label);
  if (args.length > 6) gh(args);
}

function postComment(body) {
  gh(["issue", "comment", String(issue), "--repo", ORCHESTRATION_V3.repo, "--body", body]);
}

function latestResult(snapshot) {
  const comments = snapshot.comments ?? [];
  for (let i = comments.length - 1; i >= 0; i -= 1) {
    const body = String(comments[i]?.body ?? "");
    const fenced = body.match(/```json\s*([\s\S]*?)```/i);
    if (!fenced) continue;
    try {
      const value = JSON.parse(fenced[1]);
      if (value && typeof value === "object" && typeof value.STATUS === "string") return value;
    } catch {}
  }
  return null;
}

function humanApprovalRequired(body) {
  const match = String(body ?? "").match(/\*\*human_approval_required:\*\*\s*([^\n]+)/i);
  return match ? match[1].trim().toLowerCase() === "true" : false;
}

function openPrSnapshot() {
  const raw = gh([
    "pr", "list", "--repo", ORCHESTRATION_V3.repo, "--state", "open", "--limit", "100",
    "--json", "number,headRefName,headRefOid,updatedAt"
  ]);
  return JSON.parse(raw || "[]");
}

function referencedPrNumbers(body) {
  const result = new Set();
  const re = /\bPR\s*#(\d+)\b/gi;
  for (const match of String(body ?? "").matchAll(re)) result.add(Number(match[1]));
  return [...result];
}

function requiresPrEvidence(body) {
  const text = String(body ?? "");
  return /\bexisting\s+PR\b/i.test(text) || /\bpush\b[^\n]{0,120}\bPR\b/i.test(text) || /\bopen\b[^\n]{0,120}\bPR\b/i.test(text) || /\bpull request\b/i.test(text);
}

function mutationClaimed(body, result) {
  if ((result?.CHANGES ?? []).length > 0 || (result?.FILES_CHANGED ?? []).length > 0 || result?.PR) return true;
  return /\b(?:implement|fix|repair|reconcile|package|create|commit|push|open)\b/i.test(String(body ?? ""));
}

function mapPrs(prs) {
  return new Map((prs ?? []).map((pr) => [Number(pr.number), pr]));
}

function verifyPassEvidence({ body, result, beforeHead, afterHead, beforePrs, afterPrs, executionEvidence }) {
  const before = mapPrs(beforePrs);
  const after = mapPrs(afterPrs);
  const newPrs = [...after.values()].filter((pr) => !before.has(Number(pr.number)));
  const changedPrs = [...after.values()].filter((pr) => {
    const old = before.get(Number(pr.number));
    return old && old.headRefOid !== pr.headRefOid;
  });
  const referenced = referencedPrNumbers(body);
  const referencedChanged = changedPrs.filter((pr) => referenced.includes(Number(pr.number)));
  const headLinkedPrs = [...newPrs, ...changedPrs].filter((pr) => pr.headRefOid === afterHead);
  const gitHeadChanged = beforeHead !== afterHead;
  const mutationObserved = gitHeadChanged || newPrs.length > 0 || changedPrs.length > 0;
  const needsMutation = mutationClaimed(body, result);
  const needsPr = requiresPrEvidence(body) || referenced.length > 0 || Boolean(result?.PR);
  const prObserved = referencedChanged.length > 0 || headLinkedPrs.length > 0;
  const errors = [];

  if (!executionEvidence || executionEvidence.toolCallCount <= 0) errors.push("PASS claimed implementation work but no instrumented repository command execution was observed");
  if (!executionEvidence?.repoPreflightObserved) errors.push("PASS requires observed repo preflight: rev-parse --show-toplevel, status --short --branch, and remote -v must all succeed");
  if (requiresTestExecution(body) && !executionEvidence?.testExecutionObserved) errors.push("PASS requires at least one observed successful test/build/typecheck command");
  if (requiresDiffCheck(body) && !executionEvidence?.gitDiffCheckObserved) errors.push("PASS requires observed successful git diff --check");
  else if (!executionEvidence?.gitDiffObserved) errors.push("PASS requires observed successful git diff inspection");
  if (needsMutation && !executionEvidence?.gitMutationCommandObserved) errors.push("PASS claimed repository mutation but no successful git mutation command was observed");
  if (needsMutation && !mutationObserved) errors.push("PASS claimed repository work but git HEAD and open PR heads did not change");
  if (needsPr && !prObserved) errors.push("PASS claimed/required PR work but no referenced or worker-HEAD-linked PR changed");

  return {
    ok: errors.length === 0,
    errors,
    evidence: {
      beforeHead,
      afterHead,
      gitHeadChanged,
      referencedPrNumbers: referenced,
      newPrNumbers: newPrs.map((pr) => pr.number),
      changedPrNumbers: changedPrs.map((pr) => pr.number),
      workerHeadLinkedPrNumbers: headLinkedPrs.map((pr) => pr.number),
      execution: executionEvidence ?? null
    }
  };
}

function installWorkerRuntimeContract(cfg) {
  const repoRoot = path.resolve(cfg.worktree);
  const agentWorkspace = path.resolve(cfg.agentWorkspace);
  if (repoRoot === agentWorkspace) throw new Error(`OPENCLAW_WORKSPACE_MUST_NOT_EQUAL_GIT_WORKTREE:${workerId}`);
  fs.mkdirSync(agentWorkspace, { recursive: true });
  const contractPath = path.join(agentWorkspace, "AGENTS.md");
  const quotedRepoRoot = JSON.stringify(repoRoot);
  const contract = [
    "# Jeeves Orchestration V3 Worker Contract",
    "",
    "This OpenClaw workspace is a disposable control workspace. It is NOT the business-dashboard git repository.",
    `Protected repository root: ${repoRoot}`,
    `OpenClaw control workspace: ${agentWorkspace}`,
    "Never delete, initialize, reseed, clean, or replace the protected repository root as a workspace.",
    "Do NOT search for a nested business-dashboard directory. The absolute protected repository root above is authoritative.",
    "",
    "## Mandatory first tool action for implementation tasks",
    "Use the structured exec tool before reasoning about repository availability. Run exactly:",
    `cd ${quotedRepoRoot} && pwd && git rev-parse --show-toplevel && git status --short --branch && git remote -v`,
    "Treat a successful git rev-parse result equal to the protected repository root as authoritative repository proof.",
    "",
    "## Mandatory execution behavior",
    "Every repository command must explicitly operate on the protected repository root, either by setting the tool cwd there or by prefixing the command with cd to that exact absolute path.",
    "For tasks requesting code, tests, commits, pushes, PR updates, or PR creation, you MUST perform the work with structured repository tools (exec/read/write/edit/apply_patch) rather than describing commands or inventing results.",
    "Do not emit a proposed tool call as plain text. Actually invoke the tool.",
    "The V3 harness now instruments git/pnpm/npm/npx execution. A PASS requires machine-observed successful repo preflight, test/build execution when required, git diff inspection, mutation commands, and actual git/GitHub state change.",
    "Before returning PASS, verify machine state with git status, git rev-parse HEAD, the requested tests, and gh/pr evidence when PR work is required.",
    "If a required command fails, return BLOCKED or FAILED with the exact observed error. Never fabricate files, commits, tests, pushes, or PRs.",
    "A PASS without observable git/GitHub mutation evidence will be rejected by the V3 verifier.",
    "Do not run broad destructive commands such as rm -rf, git clean, or bulk deletion against the protected repository unless the originating task explicitly requires it and machine safety gates permit it.",
    "",
    `Assigned worker: ${workerId}`,
    `Assigned model: ${ORCHESTRATION_V3.model.id}`,
    "Cloud fallback is forbidden for this acceptance runtime."
  ].join("\n");
  fs.writeFileSync(contractPath, `${contract}\n`, "utf8");
  return { contractPath, repoRoot, agentWorkspace };
}

const preflight = requireHealthyWorker(workerId);
const cfg = ORCHESTRATION_V3.workers[workerId];
const runtimeContract = installWorkerRuntimeContract(cfg);
const beforeSnapshot = issueSnapshot();
const beforeHead = git(["rev-parse", "HEAD"], cfg.worktree);
const beforePrs = openPrSnapshot();
const executionHarness = createObservedExecutionHarness({ issue, workerId });
const env = {
  ...process.env,
  ...executionHarness.envPatch,
  ORCH_LOCAL_ROUTING_ENABLED: "true",
  ORCH_LOCAL_AGENT_ID: workerId,
  ORCH_LOCAL_MODEL: ORCHESTRATION_V3.model.id,
  ORCH_CLOUD_AGENT_ID: workerId,
  ORCH_WORKTREE_ROOT: runtimeContract.repoRoot,
  ORCH_AGENT_WORKSPACE: runtimeContract.agentWorkspace,
  OPENCLAW_MODEL: ORCHESTRATION_V3.model.id,
  OPENCLAW_FALLBACK_MODELS: "",
  OLLAMA_API_KEY: process.env.OLLAMA_API_KEY || "ollama-local"
};

console.log(JSON.stringify({ event: "WORKER_START", issue, workerId, preflight, runtimeContract, executionHarness: { journalPath: executionHarness.journalPath, shimRoot: executionHarness.shimRoot, instrumented: Object.keys(executionHarness.resolved) }, model: ORCHESTRATION_V3.model.id, cloudFallbackAllowed: false, beforeHead }));
const runnerPath = path.join(ORCHESTRATION_V3.runtime.root, "scripts", "orchestration-run-issue-openclaw.mjs");
const run = spawnSync(process.execPath, [
  runnerPath,
  "--repo", ORCHESTRATION_V3.repo,
  "--issue", String(issue),
  "--agent", workerId,
  "--timeout", "900"
], {
  cwd: runtimeContract.agentWorkspace,
  env,
  stdio: "inherit",
  timeout: 950_000
});

let snapshot = issueSnapshot();
let result = latestResult(snapshot);
let status = result?.STATUS ?? null;
const humanRequired = humanApprovalRequired(snapshot.body);
const afterHead = git(["rev-parse", "HEAD"], cfg.worktree);
const afterPrs = openPrSnapshot();
const executionEvidence = readObservedExecutionEvidence(executionHarness.journalPath);
console.log(JSON.stringify({ event: "OBSERVED_EXECUTION_EVIDENCE", issue, workerId, executionEvidence }));

if (["PASS", "COMPLETE", "SUCCESS"].includes(status)) {
  const verification = verifyPassEvidence({
    body: snapshot.body,
    result,
    beforeHead,
    afterHead,
    beforePrs,
    afterPrs,
    executionEvidence
  });
  if (!verification.ok) {
    const correction = {
      TASK_ID: result?.TASK_ID ?? `issue-${issue}`,
      STATUS: "BLOCKED",
      SUMMARY: "V3 observed-execution and machine-evidence gates rejected an unproven model PASS",
      CHANGES: [],
      FILES_CHANGED: [],
      DB_CHANGES: "NO",
      MIGRATION: null,
      TESTS: "Model-reported tests are not accepted without observed command execution and repository/PR mutation evidence",
      PR: null,
      MERGE_STATUS: "N/A",
      PRODUCTION_CHANGE: "NO",
      UNEXPECTED_RESULTS: [JSON.stringify(verification.evidence)],
      DECISIONS_REQUIRED: [],
      BLOCKERS: verification.errors,
      NEXT_RECOMMENDED_TASK: "Retry the task; PASS remains blocked until required execution stages and actual git/GitHub mutation are machine-observed.",
      SESSION_HEALTH: "GOOD",
      SESSION_CONTEXT: `v3-machine-evidence/${workerId}`,
      ROUTING_TIER: "LOCAL_FIRST",
      MODEL_USED: result?.MODEL_USED ?? ORCHESTRATION_V3.model.id.replace(/^ollama\//, ""),
      LOCAL_ATTEMPTED: result?.LOCAL_ATTEMPTED ?? true,
      LOCAL_RESULT: "EVIDENCE_REJECTED",
      ESCALATED_TO_CLOUD: false,
      ESCALATION_REASON: null,
      CLOUD_USAGE: null,
      CLOUD_COST: null
    };
    postComment(["## OrchestrationResultContractV1", "", "```json", JSON.stringify(correction, null, 2), "```"].join("\n"));
    status = "BLOCKED";
    result = correction;
    snapshot = issueSnapshot();
    console.log(JSON.stringify({ event: "PASS_REJECTED_BY_EVIDENCE", issue, workerId, ...verification }));
  }
}

const current = labelsOf(snapshot);
const remove = [ORCHESTRATION_V3.queue.running, ORCHESTRATION_V3.queue.ready, ORCHESTRATION_V3.queue.awaitingReview, ORCHESTRATION_V3.queue.blocked, ORCHESTRATION_V3.queue.humanApproval].filter((x) => current.has(x));
let add = [];

if (humanRequired || status === "AWAITING_HUMAN_APPROVAL") {
  add = [ORCHESTRATION_V3.queue.humanApproval];
} else if (["PASS", "COMPLETE", "SUCCESS"].includes(status)) {
  add = [];
} else if (status === "AWAITING_REVIEW") {
  // V3 never creates a fake review gate for work explicitly marked as not requiring a human.
  add = [ORCHESTRATION_V3.queue.blocked];
} else if (["BLOCKED", "FAILED"].includes(status) || run.status !== 0 || run.error) {
  add = [ORCHESTRATION_V3.queue.blocked];
} else {
  add = [ORCHESTRATION_V3.queue.blocked];
}

editLabels({ remove, add });
console.log(JSON.stringify({ event: "WORKER_END", issue, workerId, status, exitCode: run.status, finalLabels: add, beforeHead, afterHead, executionEvidence }));
if (run.error) throw run.error;
process.exitCode = status === "BLOCKED" ? 1 : (run.status ?? 1);
