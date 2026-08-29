import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ORCHESTRATION_V3 } from "./config.mjs";
import { buildReleaseTrainSnapshot } from "./release-train.mjs";
import { formatOwnershipPatterns } from "./file-ownership.mjs";

export const CURRENT_AUTOMATION_CUTOFF_ISO = "2026-08-17T00:00:00.000Z";
const LOCK_PATH = path.join(ORCHESTRATION_V3.runtime.stateRoot, "integration-queue.lock");
const LOCK_STALE_MS = 20 * 60 * 1000;
const VALIDATED_BRANCH = /^issue-\d+[a-z0-9-]*$/i;
const STALE_QUEUE_TERMINAL_LABELS = Object.freeze([
  ORCHESTRATION_V3.queue.ready,
  ORCHESTRATION_V3.queue.running,
  ORCHESTRATION_V3.queue.awaitingReview,
  ORCHESTRATION_V3.queue.blocked
]);

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function isTransientGhError(err) {
  const text = [err?.message, err?.stderr, err?.stdout].filter(Boolean).join("\n");
  return /\b(429|502|503|504)\b|ECONNRESET|ECONNABORTED|ETIMEDOUT|socket hang up|TLS handshake timeout|connection reset|temporar|try resubmitting|Service Unavailable|rate limit/i.test(text);
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

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (err) { return err?.code === "EPERM"; }
}

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return null; }
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
      if (isNonAuthoritativeVercelQuotaFailure(check)) continue;
      if (!["SUCCESS", "SKIPPED", "NEUTRAL"].includes(conclusion)) return "FAILED";
    }
  }
  return "GREEN";
}

export function isNonAuthoritativeVercelQuotaFailure(check) {
  const haystack = [
    check.name,
    check.context,
    check.title,
    check.summary,
    check.text,
    check.detailsUrl,
    check.conclusion
  ].filter(Boolean).join(" ");

  return /vercel/i.test(haystack) &&
    /(quota|rate[\s_-]*limit|limit exceeded|usage limit|resource limited)/i.test(haystack);
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

function changedFilesFromPr(pr) {
  return [...new Set((pr?.files ?? []).map((file) => String(file?.path ?? file?.name ?? "").trim()).filter(Boolean))].sort();
}

export function classifyIntegrationCandidate(pr, nowIso = new Date().toISOString()) {
  const reasons = [];
  const body = String(pr.body ?? "");
  const headRefName = String(pr.headRefName ?? "");
  const checkState = checkRollupState(pr.statusCheckRollup);
  const createdAt = pr.createdAt ? new Date(pr.createdAt).toISOString() : null;
  const changedFiles = changedFilesFromPr(pr);
  const fileOwnership = formatOwnershipPatterns(changedFiles);

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
    changedFiles,
    fileOwnership,
    eligible: reasons.length === 0,
    reasons,
    evaluatedAt: nowIso
  };
}

export function reconciliationWorkForCandidate(candidate) {
  if (!candidate.issueNumber) return null;
  const shared = {
    issueNumber: candidate.issueNumber,
    prNumber: candidate.prNumber,
    headRefName: candidate.headRefName,
    changedFiles: [...(candidate.changedFiles ?? [])],
    fileOwnership: candidate.fileOwnership ?? null,
    sourceReasons: [...candidate.reasons],
    sourceCreatedAt: candidate.createdAt,
    evaluatedAt: candidate.evaluatedAt
  };
  if (candidate.reasons.some((reason) => reason === "NOT_MERGEABLE:CONFLICTING")) {
    return {
      ...shared,
      stream: "INTEGRATION_RELEASE",
      reason: "MERGE_CONFLICT_RECONCILIATION_REQUIRED",
      title: `Reconcile merge conflict for PR #${candidate.prNumber}`
    };
  }
  if (candidate.reasons.includes("MISSING_VALIDATION_EVIDENCE")) {
    return {
      ...shared,
      stream: "QA_EVALUATION",
      reason: "MISSING_VALIDATION_EVIDENCE",
      title: `Collect validation evidence for PR #${candidate.prNumber}`
    };
  }
  return null;
}

export function integrationFollowupWork(candidates) {
  const workByKey = new Map();
  for (const candidate of candidates) {
    const work = reconciliationWorkForCandidate(candidate);
    if (!work) continue;
    workByKey.set(`${work.prNumber}:${work.reason}:${work.stream}`, work);
  }
  return [...workByKey.values()].sort((a, b) => {
    if (a.issueNumber !== b.issueNumber) return a.issueNumber - b.issueNumber;
    return a.prNumber - b.prNumber;
  });
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
    "--json", "number,title,body,headRefName,baseRefName,isDraft,mergeable,statusCheckRollup,url,createdAt,updatedAt,files"
  ]) || "[]");
}

function issueLabels(issueNumber) {
  const snapshot = JSON.parse(gh(["issue", "view", String(issueNumber), "--repo", ORCHESTRATION_V3.repo, "--json", "labels"]) || "{}");
  return new Set((snapshot.labels ?? []).map((label) => label.name));
}

export function successfulIntegrationLabelEdits(labels) {
  const present = labels instanceof Set ? labels : new Set(labels ?? []);
  return STALE_QUEUE_TERMINAL_LABELS.filter((label) => present.has(label));
}

function finalizeSuccessfulIntegrationIssue(candidate) {
  if (!candidate.issueNumber) return;
  const removeLabels = successfulIntegrationLabelEdits(issueLabels(candidate.issueNumber));
  if (removeLabels.length > 0) {
    const args = ["issue", "edit", String(candidate.issueNumber), "--repo", ORCHESTRATION_V3.repo];
    for (const label of removeLabels) args.push("--remove-label", label);
    gh(args);
  }
  gh(["issue", "close", String(candidate.issueNumber), "--repo", ORCHESTRATION_V3.repo, "--comment", `Integrated by V3 validated PR queue via PR #${candidate.prNumber}.`]);
}

function mergePr(candidate) {
  gh(["pr", "merge", String(candidate.prNumber), "--repo", ORCHESTRATION_V3.repo, "--squash", "--delete-branch"]);
  finalizeSuccessfulIntegrationIssue(candidate);
}

export function inspectIntegrationLock(now = new Date()) {
  const lock = readJson(LOCK_PATH);
  if (!lock) return { exists: false, stale: false, pidAlive: false, ageMs: null, lock: null };
  const pid = Number(lock.pid);
  const startedAtMs = Date.parse(lock.startedAt);
  const ageMs = Number.isFinite(startedAtMs) ? Math.max(0, now.getTime() - startedAtMs) : Number.POSITIVE_INFINITY;
  const pidAlive = alive(pid);
  return { exists: true, stale: !pidAlive && ageMs >= LOCK_STALE_MS, pidAlive, ageMs, lock };
}

export function recoverStaleIntegrationLock(now = new Date()) {
  const inspection = inspectIntegrationLock(now);
  if (!inspection.exists || !inspection.stale) return { recovered: false, inspection };
  fs.rmSync(LOCK_PATH, { force: true });
  return { recovered: true, inspection };
}

function withLock(fn) {
  fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true });
  try {
    const fd = fs.openSync(LOCK_PATH, "wx");
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }) + "\n");
    try { return fn(); } finally { fs.closeSync(fd); fs.rmSync(LOCK_PATH, { force: true }); }
  } catch (err) {
    if (err?.code === "EEXIST") {
      const recovered = recoverStaleIntegrationLock();
      if (recovered.recovered) return withLock(fn);
      return { event: "INTEGRATION_QUEUE_SKIPPED", reason: "LOCK_HELD", lock: recovered.inspection, merged: [], skipped: [], followupWork: [] };
    }
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
    return {
      event: "INTEGRATION_QUEUE_RESULT",
      dryRun,
      merged,
      skipped,
      followupWork: integrationFollowupWork(skipped),
      releaseTrain: buildReleaseTrainSnapshot({ evaluatedCandidates: evaluated, mergedCandidates: merged })
    };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dryRun = process.argv.includes("--dry-run");
  const result = integrateValidatedPrQueue({ dryRun, maxMerges: 1 });
  console.log(JSON.stringify(result, null, 2));
}
