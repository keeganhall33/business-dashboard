export const RELEASE_TRAIN_CONTRACT_VERSION = "orchestration_v3_release_train_v1";

const DEFAULT_PRODUCTION_VERIFICATION = Object.freeze({
  routeAvailability: true,
  rendering: true,
  dataContract: true,
  criticalInteractions: true,
  readOnly: true
});

function ageHours(iso, nowIso) {
  const then = Date.parse(iso);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(then) || !Number.isFinite(now)) return null;
  return Math.max(0, Math.round(((now - then) / 36_000) / 10) / 10);
}

function includesReason(candidate, reason) {
  return (candidate.reasons ?? []).some((item) => item === reason || String(item).startsWith(`${reason}:`));
}

function isCurrentCandidate(candidate) {
  return !(candidate.reasons ?? []).includes("STALE_HISTORICAL_PR");
}

function verificationRequired(candidate) {
  return {
    prNumber: candidate.prNumber,
    issueNumber: candidate.issueNumber,
    stage: "POST_MERGE_PRODUCTION_VERIFICATION",
    requiredChecks: { ...DEFAULT_PRODUCTION_VERIFICATION },
    stopRules: [
      "ROUTE_UNAVAILABLE",
      "RENDER_FAILED",
      "DATA_CONTRACT_MISMATCH",
      "CRITICAL_INTERACTION_FAILED",
      "PRODUCTION_WRITE_REQUIRED"
    ],
    failureAction: {
      stream: "QA_EVALUATION",
      reason: "POST_MERGE_PRODUCTION_VERIFICATION_FAILED",
      title: `Repair production verification for PR #${candidate.prNumber}`,
      changedFiles: [...(candidate.changedFiles ?? [])],
      fileOwnership: candidate.fileOwnership ?? null
    }
  };
}

function followupForSkippedCandidate(candidate) {
  if (!isCurrentCandidate(candidate)) return null;
  const shared = {
    changedFiles: [...(candidate.changedFiles ?? [])],
    fileOwnership: candidate.fileOwnership ?? null
  };
  if (includesReason(candidate, "NOT_MERGEABLE:CONFLICTING")) {
    return {
      ...shared,
      prNumber: candidate.prNumber,
      issueNumber: candidate.issueNumber,
      stream: "INTEGRATION_RELEASE",
      reason: "MERGE_CONFLICT_RECONCILIATION_REQUIRED",
      title: `Reconcile merge conflict for PR #${candidate.prNumber}`,
      blocksOriginalProductLane: false
    };
  }
  if ((candidate.reasons ?? []).includes("MISSING_VALIDATION_EVIDENCE")) {
    return {
      ...shared,
      prNumber: candidate.prNumber,
      issueNumber: candidate.issueNumber,
      stream: "QA_EVALUATION",
      reason: "MISSING_VALIDATION_EVIDENCE",
      title: `Collect validation evidence for PR #${candidate.prNumber}`,
      blocksOriginalProductLane: false
    };
  }
  if ((candidate.reasons ?? []).includes("STACKED_PR_REQUIRES_PARENT_FIRST")) {
    return {
      ...shared,
      prNumber: candidate.prNumber,
      issueNumber: candidate.issueNumber,
      stream: "INTEGRATION_RELEASE",
      reason: "STACKED_PR_FLATTEN_AFTER_PARENT",
      title: `Flatten stacked PR #${candidate.prNumber} after parent lands`,
      blocksOriginalProductLane: false
    };
  }
  return null;
}

export function buildReleaseTrainSnapshot({ evaluatedCandidates, mergedCandidates = [], nowIso = new Date().toISOString() }) {
  const evaluated = [...(evaluatedCandidates ?? [])];
  const current = evaluated.filter(isCurrentCandidate);
  const eligible = current.filter((candidate) => candidate.eligible);
  const skipped = current.filter((candidate) => !candidate.eligible);
  const staleHistorical = evaluated.filter((candidate) => !isCurrentCandidate(candidate));
  const followupByKey = new Map();
  for (const candidate of skipped) {
    const followup = followupForSkippedCandidate(candidate);
    if (!followup) continue;
    followupByKey.set(`${followup.reason}:${followup.prNumber}`, followup);
  }

  const sequentialQueue = [...eligible].sort((a, b) => {
    const leftIssue = a.issueNumber ?? Number.MAX_SAFE_INTEGER;
    const rightIssue = b.issueNumber ?? Number.MAX_SAFE_INTEGER;
    if (leftIssue !== rightIssue) return leftIssue - rightIssue;
    return a.prNumber - b.prNumber;
  });

  const oldestCreatedAt = current.map((candidate) => candidate.createdAt).filter(Boolean).sort()[0] ?? null;
  return {
    contractVersion: RELEASE_TRAIN_CONTRACT_VERSION,
    generatedAt: nowIso,
    queueMode: "DEPENDENCY_SAFE_SEQUENTIAL",
    releaseTrainState: skipped.some((candidate) => includesReason(candidate, "NOT_MERGEABLE:CONFLICTING")) ? "RECONCILIATION_REQUIRED" : "FLOWING",
    mergeQueue: sequentialQueue.map((candidate, index) => ({
      position: index + 1,
      prNumber: candidate.prNumber,
      issueNumber: candidate.issueNumber,
      headRefName: candidate.headRefName,
      action: "MERGE_THEN_REFRESH_MERGEABILITY",
      productionVerification: verificationRequired(candidate)
    })),
    merged: mergedCandidates.map((candidate) => ({
      prNumber: candidate.prNumber,
      issueNumber: candidate.issueNumber,
      productionVerification: verificationRequired(candidate),
      closeOriginalTaskAfterVerification: true
    })),
    followupWork: [...followupByKey.values()],
    excludedHistoricalPrs: staleHistorical.map((candidate) => ({
      prNumber: candidate.prNumber,
      issueNumber: candidate.issueNumber,
      reason: "STALE_HISTORICAL_PR_EXCLUDED_UNLESS_EXPLICITLY_REVIVED"
    })),
    metrics: {
      currentPrCount: current.length,
      eligiblePrCount: eligible.length,
      followupWorkCount: followupByKey.size,
      oldestCurrentPrAgeHours: oldestCreatedAt ? ageHours(oldestCreatedAt, nowIso) : null
    },
    safety: {
      humanProductionGatesUnchanged: true,
      productionVerificationIsReadOnly: true,
      failedVerificationPreventsFalseCompletion: true,
      staleHistoricalPrsExcluded: true,
      followupOwnershipDerivedFromPrFiles: true
    }
  };
}
