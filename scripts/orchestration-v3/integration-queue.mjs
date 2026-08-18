import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ORCHESTRATION_V3 } from "./config.mjs";

export const CURRENT_AUTOMATION_CUTOFF_ISO = "2026-08-17T00:00:00.000Z";
const LOCK_PATH = path.join(ORCHESTRATION_V3.runtime.stateRoot, "integration-queue.lock");
const VALIDATED_BRANCH = /^issue-\d+[a-z0-9-]*$/i;

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function isTransientGhError(err) {
  const text = [err?.message, err?.stderr, err?.stdout].filter(Boolean).join("\n");
  return /\b(502|503|504)\b|ETIMEDOUT|TLS handshake timeout|temporar|try resubmitting|Service Unavailable/i.test(text);
}

export function gh(args, { attempts = 3 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return execFileSync("gh", args, { encoding: "utf8", timeout: 30_000 }).trim();
    } catch (err) {
      lastError = err;
      if (!isTransientGhError(err) || attempt === attempts) throw err;
      const delayMs = 1000 * 2 ** (attempt - 1);
      console.error(JSON.stringify({ event: "INTEGRATION_GH_TRANSIENT_RETRY", attempt, delayMs, command: args.slice(0, 3), error: err instanceof Error ? err.message : String(err) }));
      sleepSync(delayMs);
    }
  }
  throw lastError;
}

export function checkRollupState(statusCheckRollup = []) {
  const checks = Array.isArray(statusCheckRollup) ? statusCheckRollup : [];
  if (checks.length === 0) return "NO_CHECKS";
  for (const check of checks) {
    if (check.__typename === "StatusContext") {
      const state = String(check.state ?? "").toUpperCase();
      if (state !== "SUCCESS") return state === "PENDING" || state === "EXPECTED" ? "PENDING" : "FAILED";
      continue;
    }
    if (check.__typename === "CheckRun") {
      const status = String(check.status ?? "").toUpperCase();
      const conclusion = String(check.conclusion ?? "").toUpperCase();
      if (status !== "COMPLETED") return "PENDING";
      if (!["SUCCESS", "SKIPPED", "NEUTRAL"].includes(conclusion)) return "FAILED";
    }
  }
  return "GREEN";
}

export function hasRequiredValidationEvidence(text) {
  const body = String(text ?? "");
  return [
    /tsx --test|npm test|node --test/i,
    /tsc --noEmit/i,
    /npm run build|next build/i,
    /git diff --check/i
  ].every((pattern) => pattern.test(body));
}

export function hasHumanOrProductionGate(text) {
  const body = String(text ?? "");
  return /human_approval_required:\s*true/i.test(body) ||
    /\b(KEEGAN_ACTION_REQUIRED|HUMAN_ACTION_REQUIRED)\s*=\s*(YES|TRUE)\b/i.test(body) ||
    /"PRODUCTION_CHANGE"\s*:\s*"YES"/i.test(body) ||
    /\bproduction\/business action\b/i.test(body) ||
    /\b(ad spend|public publishing|publish public|art-material purchase|material purchase|enter(?:ing|ed)? contracts?|rights\/licensing commitment|pricing\/publication change|pricing change|send outreach|live sends?|deployment)\b/i.test(body);
}

export function issueNumberFromBranch(headRefName) {
  const match = String(headRefName ?? "").match(/^issue-(\d+)/i);
  return match ? Number(match[1]) : null;
}

export function classifyIntegrationCandidate(pr, nowIso = new Date().toISOString()) {
  const reasons = [];
  const body = String(pr.body ?? "");
  const headRefName = String(pr.headRefName ?? "");
  const checkState = checkRollupState(pr.statusCheckRollup);
  const createdAt = pr.createdAt ? new Date(pr.createdAt).toISOString() : null;

  if (pr.isDraft) reasons.push("DRAFT_PR");
  if (!VALIDATED_BRANCH.test(headRefName)) reasons.push("UNVERIFIED_BRANCH_IDENTITY");
  if (createdAt && createdAt < CURRENT_AUTOMATION_CUTOFF_ISO) reasons.push("STALE_HISTORICAL_PR");
  if (String(pr.baseRefName ?? "") !== "main") reasons.push("STACKED_PR_REQUIRES_PARENT_FIRST");
  if (String(pr.mergeable ?? "").toUpperCase() !== "MERGEABLE") reasons.push(`NOT_MERGEABLE:${String(pr.mergeable ?? "UNKNOWN").toUpperCase()}`);
  if (checkState === "PENDING") reasons.push("CHECKS_PENDING");
  else if (checkState === "FAILED") reasons.push("CHECKS_FAILED");
  if (!hasRequiredValidationEvidence(body)) reasons.push("MISSING_VALIDATION_EVIDENCE");
  if (hasHumanOrProductionGate(body)) reasons.push("HUMAN_OR_PRODUCTION_GATE");

  return {
    prNumber: Number(pr.number),
    issueNumber: issueNumberFromBranch(headRefName),
    url: pr.url ?? null,
    headRefName,
    baseRefName: pr.baseRefName ?? null,
    createdAt,
    checkState,
    eligible: reasons.length === 0,
    reasons,
    evaluatedAt: nowIso
  };
}

export function orderIntegrationCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    const left = a.issueNumber ?? Number.MAX_SAFE_INTEGER;
    const right = b.issueNumber ?? Number.MAX_SAFE_INTEGER;
    if (left !== right) return left - right;
    return a.prNumber - b.prNumber;
  });
}

function openPullRequests() {
  return JSON.parse(gh([
    "pr", "list",
    "--repo", ORCHESTRATION_V3.repo,
    "--state", "open",
    "--limit", "50",
    "--json", "number,title,body,headRefName,baseRefName,isDraft,mergeable,statusCheckRollup,url,createdAt,updatedAt"
  ]) || "[]");
}

function mergePr(candidate) {
  gh(["pr", "merge", String(candidate.prNumber), "--repo", ORCHESTRATION_V3.repo, "--squash", "--delete-branch"]);
  if (candidate.issueNumber) {
    gh(["issue", "close", String(candidate.issueNumber), "--repo", ORCHESTRATION_V3.repo, "--comment", `Integrated by V3 validated PR queue via PR #${candidate.prNumber}.`]);
  }
}

function withLock(fn) {
  fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true });
  try {
    const fd = fs.openSync(LOCK_PATH, "wx");
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }) + "\n");
    try { return fn(); } finally { fs.closeSync(fd); fs.rmSync(LOCK_PATH, { force: true }); }
  } catch (err) {
    if (err?.code === "EEXIST") return { event: "INTEGRATION_QUEUE_SKIPPED", reason: "LOCK_HELD", merged: [], skipped: [] };
    throw err;
  }
}

export function integrateValidatedPrQueue({ dryRun = false, maxMerges = 1 } = {}) {
  return withLock(() => {
    const prs = openPullRequests();
    const evaluated = prs.map((pr) => classifyIntegrationCandidate(pr));
    const eligible = orderIntegrationCandidates(evaluated.filter((candidate) => candidate.eligible)).slice(0, maxMerges);
    const merged = [];
    for (const candidate of eligible) {
      if (!dryRun) mergePr(candidate);
      merged.push(candidate);
    }
    const skipped = evaluated.filter((candidate) => !candidate.eligible);
    return { event: "INTEGRATION_QUEUE_RESULT", dryRun, merged, skipped };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dryRun = process.argv.includes("--dry-run");
  const result = integrateValidatedPrQueue({ dryRun, maxMerges: 1 });
  console.log(JSON.stringify(result, null, 2));
}
