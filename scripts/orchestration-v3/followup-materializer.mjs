import { ORCHESTRATION_V3, workerCandidatesForStream } from "./config.mjs";
import { formatOwnershipPatterns } from "./file-ownership.mjs";

export const FOLLOWUP_MARKER_PREFIX = "orchestration-v3-followup:";

export function followupIdentity(work) {
  const prNumber = Number(work?.prNumber);
  const reason = String(work?.reason ?? "").trim().toUpperCase();
  const stream = String(work?.stream ?? "").trim().toUpperCase();
  if (!Number.isInteger(prNumber) || prNumber <= 0 || !reason || !stream) return null;
  return `${prNumber}:${reason}:${stream}`;
}

export function followupMarker(work) {
  const identity = followupIdentity(work);
  return identity ? `<!-- ${FOLLOWUP_MARKER_PREFIX}${identity} -->` : null;
}

function labelNames(issue) {
  return new Set(
    (issue?.labels ?? [])
      .map((label) => typeof label === "string" ? label : label?.name)
      .filter(Boolean)
  );
}

function bodyField(body, name) {
  const text = String(body ?? "");
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`^\\s*\\*\\*${escaped}:\\*\\*\\s*(.+?)\\s*$`, "im"),
    new RegExp(`^\\s*${escaped}:\\s*(.+?)\\s*$`, "im")
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

export function followupEligibility(work) {
  const identity = followupIdentity(work);
  if (!identity) return { eligible: false, reason: "INVALID_STABLE_IDENTITY" };

  const stream = String(work.stream).trim().toUpperCase();
  if (workerCandidatesForStream(stream).length === 0) {
    return { eligible: false, reason: "UNMAPPED_STREAM" };
  }

  const sourceReasons = new Set(
    (work.sourceReasons ?? []).map((reason) => String(reason).trim().toUpperCase())
  );

  if (sourceReasons.has("STALE_HISTORICAL_PR")) {
    return { eligible: false, reason: "STALE_HISTORICAL_PR" };
  }
  if (sourceReasons.has("HUMAN_OR_PRODUCTION_GATE")) {
    return { eligible: false, reason: "HUMAN_OR_PRODUCTION_GATE" };
  }

  if (!Number.isInteger(Number(work.issueNumber)) || Number(work.issueNumber) <= 0) {
    return { eligible: false, reason: "MISSING_ORIGINAL_ISSUE" };
  }

  const ownership = work.fileOwnership ?? formatOwnershipPatterns(work.changedFiles ?? []);
  if (!ownership) return { eligible: false, reason: "MISSING_EXPLICIT_FILE_OWNERSHIP" };

  return { eligible: true, reason: null, ownership };
}

export function findCanonicalFollowupIssue(work, issues = []) {
  const marker = followupMarker(work);
  const prNumber = Number(work?.prNumber);
  const originalIssue = Number(work?.issueNumber);
  const stream = String(work?.stream ?? "").trim().toUpperCase();

  for (const issue of issues) {
    const body = String(issue?.body ?? "");
    if (marker && body.includes(marker)) return issue;

    const issueStream = String(bodyField(body, "stream") ?? "").trim().toUpperCase();
    const prMatch =
      new RegExp(`(?:^|\\n)\\s*(?:\\*\\*)?PR(?:\\*\\*)?\\s*:\\s*#?${prNumber}\\b`, "i").test(body);
    const originalMatch =
      new RegExp(`(?:^|\\n)\\s*(?:\\*\\*)?Original issue(?:\\*\\*)?\\s*:\\s*#?${originalIssue}\\b`, "i").test(body);

    if (issueStream === stream && prMatch && originalMatch) return issue;
  }

  return null;
}

export function buildFollowupBody(work) {
  const stream = String(work.stream).trim().toUpperCase();
  const reason = String(work.reason).trim().toUpperCase();
  const originalIssue = Number(work.issueNumber);
  const prNumber = Number(work.prNumber);
  const marker = followupMarker(work);
  const ownership = work.fileOwnership ?? formatOwnershipPatterns(work.changedFiles ?? []);
  if (!ownership) throw new Error(`FOLLOWUP_FILE_OWNERSHIP_REQUIRED:PR#${prNumber}`);
  const taskMutability = stream === "INTEGRATION_RELEASE"
    ? "IMPLEMENTATION_MUTATION_REQUIRED"
    : "EVIDENCE_ONLY";

  return [
    "Source: orchestration-v3 integration release-train follow-up.",
    `Original issue: #${originalIssue}`,
    `PR: #${prNumber}${work.headRefName ? ` (\`${work.headRefName}\`)` : ""}`,
    `Reason: ${reason}`,
    marker,
    "",
    `**stream:** ${stream}`,
    "**priority:** P0",
    "**human_approval_required:** false",
    `**task_mutability:** ${taskMutability}`,
    `**file_ownership:** ${ownership}`,
    "",
    "## Goal",
    String(work.title ?? `Resolve release-train follow-up for PR #${prNumber}`),
    "",
    "## Safety",
    "- No production/business action.",
    "- No paid-cloud model/API usage.",
    "- Preserve worktree and repository safety gates.",
    "- Do not reopen the completed original product issue."
  ].join("\n");
}

export function planFollowupMaterialization(work, issues = []) {
  const eligibility = followupEligibility(work);
  if (!eligibility.eligible) {
    return {
      action: "SKIP",
      reason: eligibility.reason,
      identity: followupIdentity(work),
      issue: null
    };
  }

  const existing = findCanonicalFollowupIssue(work, issues);
  if (!existing) {
    return {
      action: "CREATE_READY",
      reason: "NO_CANONICAL_FOLLOWUP",
      identity: followupIdentity(work),
      issue: null
    };
  }

  const labels = labelNames(existing);

  if (labels.has(ORCHESTRATION_V3.queue.running)) {
    return {
      action: "REUSE_NO_CHANGE",
      reason: "ALREADY_RUNNING",
      identity: followupIdentity(work),
      issue: existing
    };
  }

  if (labels.has(ORCHESTRATION_V3.queue.awaitingReview)) {
    return {
      action: "REUSE_NO_CHANGE",
      reason: "AWAITING_REVIEW",
      identity: followupIdentity(work),
      issue: existing
    };
  }

  if (labels.has(ORCHESTRATION_V3.queue.humanApproval)) {
    return {
      action: "REUSE_NO_CHANGE",
      reason: "AWAITING_HUMAN_APPROVAL",
      identity: followupIdentity(work),
      issue: existing
    };
  }

  const existingHumanApprovalRequired =
    String(bodyField(existing.body, "human_approval_required") ?? "false")
      .trim()
      .toLowerCase() === "true";

  if (existingHumanApprovalRequired) {
    return {
      action: "REUSE_NO_CHANGE",
      reason: "EXISTING_HUMAN_APPROVAL_GATE",
      identity: followupIdentity(work),
      issue: existing
    };
  }

  const existingOwnership = bodyField(existing.body, "file_ownership");
  if (!existingOwnership) {
    return {
      action: "REUSE_NO_CHANGE",
      reason: "EXISTING_FOLLOWUP_MISSING_FILE_OWNERSHIP",
      identity: followupIdentity(work),
      issue: existing
    };
  }

  if (labels.has(ORCHESTRATION_V3.queue.blocked)) {
    return {
      action: "REUSE_NO_CHANGE",
      reason: "BLOCKED_CANONICAL_FOLLOWUP_PRESERVED",
      identity: followupIdentity(work),
      issue: existing
    };
  }

  if (String(existing?.state ?? "open").toLowerCase() === "closed") {
    return {
      action: "REUSE_NO_CHANGE",
      reason: "CLOSED_CANONICAL_FOLLOWUP_SUPPRESSES_REGENERATION",
      identity: followupIdentity(work),
      issue: existing
    };
  }

  if (labels.has(ORCHESTRATION_V3.queue.ready)) {
    return {
      action: "REUSE_NO_CHANGE",
      reason: "ALREADY_READY",
      identity: followupIdentity(work),
      issue: existing
    };
  }

  return {
    action: "REUSE_AND_READY",
    reason: "OPEN_CANONICAL_FOLLOWUP_NOT_QUEUED",
    identity: followupIdentity(work),
    issue: existing
  };
}
