import type {
  V1ReleaseActionRequirementV1,
  V1ReleaseFreshnessV1,
  V1ReleaseGateEvidenceV1
} from "@/lib/release/v1-release-certificate-v1";

export const V1_P0_REQUIRED_INVARIANTS_V1 = [
  "WHOLE_DASHBOARD_NO_FIXTURE",
  "FAIL_CLOSED_TRUTH_STATES",
  "PRIVACY_SECRET_BOUNDARY",
  "VISIBLE_V1_ROUTE_ACTION_INTEGRITY"
] as const;

export type V1P0RequiredInvariantIdV1 = (typeof V1_P0_REQUIRED_INVARIANTS_V1)[number];
export type V1P0IssueDispositionV1 = "V1_BLOCKER" | "NOT_V1_BLOCKER" | "UNKNOWN";
export type V1P0IssueCategoryV1 =
  | "CORRECTNESS"
  | "SECURITY"
  | "DATA_TRUTH"
  | "PRIVACY"
  | "OTHER"
  | "UNKNOWN";
export type V1P0InvariantStateV1 = "PASS" | "FAIL" | "UNKNOWN" | "CONFLICTED";

export type V1P0IssueManifestV1 = {
  scope: "OPEN_P0_ISSUES";
  releaseSha: string;
  observedAt: string;
  issueNumbers: readonly number[];
  evidenceRefs: readonly string[];
};

export type V1P0IssueAssessmentV1 = {
  issueNumber: number;
  releaseSha: string;
  observedAt: string;
  disposition: V1P0IssueDispositionV1;
  category: V1P0IssueCategoryV1;
  evidenceRefs: readonly string[];
  actionRequirement: V1ReleaseActionRequirementV1;
};

export type V1P0InvariantObservationV1 = {
  invariantId: V1P0RequiredInvariantIdV1;
  state: V1P0InvariantStateV1;
  releaseSha: string;
  observedAt: string;
  evidenceRefs: readonly string[];
  actionRequirement: V1ReleaseActionRequirementV1;
};

export type V1P0CorrectnessSecurityAuditInputV1 = {
  releaseSha: string;
  evaluatedAt: string;
  maxEvidenceAgeMs: number;
  issueManifest: V1P0IssueManifestV1;
  issueAssessments: readonly V1P0IssueAssessmentV1[];
  invariants: readonly V1P0InvariantObservationV1[];
};

export type V1P0CorrectnessSecurityBlockerCodeV1 =
  | "INVALID_RELEASE_SHA"
  | "INVALID_EVALUATED_AT"
  | "INVALID_FRESHNESS_POLICY"
  | "MANIFEST_SHA_MISMATCH"
  | "MANIFEST_INVALID_TIMESTAMP"
  | "MANIFEST_FUTURE_EVIDENCE"
  | "MANIFEST_STALE_EVIDENCE"
  | "MANIFEST_MISSING_PROVENANCE"
  | "MANIFEST_UNSAFE_PROVENANCE"
  | "INVALID_MANIFEST_ISSUE_NUMBER"
  | "DUPLICATE_MANIFEST_ISSUE"
  | "MISSING_ISSUE_ASSESSMENT"
  | "UNEXPECTED_ISSUE_ASSESSMENT"
  | "DUPLICATE_ISSUE_ASSESSMENT"
  | "ISSUE_SHA_MISMATCH"
  | "ISSUE_INVALID_TIMESTAMP"
  | "ISSUE_FUTURE_EVIDENCE"
  | "ISSUE_STALE_EVIDENCE"
  | "ISSUE_MISSING_PROVENANCE"
  | "ISSUE_UNSAFE_PROVENANCE"
  | "ISSUE_SCOPE_UNKNOWN"
  | "OPEN_V1_P0_BLOCKER"
  | "MISSING_INVARIANT"
  | "DUPLICATE_INVARIANT"
  | "INVARIANT_SHA_MISMATCH"
  | "INVARIANT_INVALID_TIMESTAMP"
  | "INVARIANT_FUTURE_EVIDENCE"
  | "INVARIANT_STALE_EVIDENCE"
  | "INVARIANT_MISSING_PROVENANCE"
  | "INVARIANT_UNSAFE_PROVENANCE"
  | "INVARIANT_NOT_PASS";

export type V1P0CorrectnessSecurityBlockerV1 = {
  code: V1P0CorrectnessSecurityBlockerCodeV1;
  issueNumber: number | null;
  invariantId: V1P0RequiredInvariantIdV1 | null;
  detail: string;
  evidenceRefs: readonly string[];
  actionRequirement: V1ReleaseActionRequirementV1;
};

export type V1P0CorrectnessSecurityAuditV1 = {
  contractVersion: "V1_P0_CORRECTNESS_SECURITY_AUDIT_V1";
  evaluatedAt: string;
  releaseSha: string;
  manifestIssueCount: number;
  assessedIssueCount: number;
  invariantCount: number;
  gateEvidence: V1ReleaseGateEvidenceV1;
  blockers: readonly V1P0CorrectnessSecurityBlockerV1[];
  authority: {
    canCloseIssue: false;
    canMerge: false;
    canDeploy: false;
    canMutateProduction: false;
    canBypassApproval: false;
  };
};

const SHA_40 = /^[0-9a-f]{40}$/;
const UNSAFE_EVIDENCE_REF =
  /(?:op:\/\/|begin\s+(?:rsa\s+)?private\s+key|(?:password|passwd|secret|token|api[_-]?key)\s*[=:])/i;

function parsedTimestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanEvidenceRefs(refs: readonly string[]): string[] {
  return [...new Set(refs.map((ref) => ref.trim()).filter(Boolean))].sort();
}

function sanitizeEvidenceRefs(refs: readonly string[]): { refs: string[]; unsafe: boolean } {
  const cleaned = cleanEvidenceRefs(refs);
  const unsafe = cleaned.some((ref) => UNSAFE_EVIDENCE_REF.test(ref));
  return { refs: unsafe ? [] : cleaned, unsafe };
}

function blocker(
  code: V1P0CorrectnessSecurityBlockerCodeV1,
  detail: string,
  evidenceRefs: readonly string[] = [],
  actionRequirement: V1ReleaseActionRequirementV1 = "UNKNOWN",
  issueNumber: number | null = null,
  invariantId: V1P0RequiredInvariantIdV1 | null = null
): V1P0CorrectnessSecurityBlockerV1 {
  return {
    code,
    issueNumber,
    invariantId,
    detail,
    evidenceRefs: [...evidenceRefs],
    actionRequirement
  };
}

function isFresh(
  observedAtMs: number,
  evaluatedAtMs: number,
  maxEvidenceAgeMs: number
): boolean {
  return evaluatedAtMs - observedAtMs <= maxEvidenceAgeMs;
}

function aggregateActionRequirement(
  blockers: readonly V1P0CorrectnessSecurityBlockerV1[]
): V1ReleaseActionRequirementV1 {
  if (blockers.some((entry) => entry.actionRequirement === "KEEGAN")) return "KEEGAN";
  if (blockers.length > 0 && blockers.every((entry) => entry.actionRequirement === "NONE")) {
    return "NONE";
  }
  return blockers.length === 0 ? "NONE" : "UNKNOWN";
}

function freshnessFromBlockers(
  blockers: readonly V1P0CorrectnessSecurityBlockerV1[]
): V1ReleaseFreshnessV1 {
  if (
    blockers.some((entry) =>
      [
        "MANIFEST_STALE_EVIDENCE",
        "ISSUE_STALE_EVIDENCE",
        "INVARIANT_STALE_EVIDENCE"
      ].includes(entry.code)
    )
  ) {
    return "STALE";
  }

  if (
    blockers.some((entry) =>
      [
        "INVALID_EVALUATED_AT",
        "INVALID_FRESHNESS_POLICY",
        "MANIFEST_INVALID_TIMESTAMP",
        "MANIFEST_FUTURE_EVIDENCE",
        "MANIFEST_MISSING_PROVENANCE",
        "MANIFEST_UNSAFE_PROVENANCE",
        "INVALID_MANIFEST_ISSUE_NUMBER",
        "DUPLICATE_MANIFEST_ISSUE",
        "MISSING_ISSUE_ASSESSMENT",
        "UNEXPECTED_ISSUE_ASSESSMENT",
        "DUPLICATE_ISSUE_ASSESSMENT",
        "ISSUE_INVALID_TIMESTAMP",
        "ISSUE_FUTURE_EVIDENCE",
        "ISSUE_MISSING_PROVENANCE",
        "ISSUE_UNSAFE_PROVENANCE",
        "ISSUE_SCOPE_UNKNOWN",
        "MISSING_INVARIANT",
        "DUPLICATE_INVARIANT",
        "INVARIANT_INVALID_TIMESTAMP",
        "INVARIANT_FUTURE_EVIDENCE",
        "INVARIANT_MISSING_PROVENANCE",
        "INVARIANT_UNSAFE_PROVENANCE"
      ].includes(entry.code)
    )
  ) {
    return "UNKNOWN";
  }

  return "CURRENT";
}

/**
 * Compiles the Useful V1 P0 correctness/security/data-truth gate from explicit,
 * externally collected evidence. This function does not query GitHub, close issues,
 * reinterpret issue priority, infer release scope, deploy, or mutate production.
 *
 * The caller must provide an evidence-backed manifest of all open P0 issues observed
 * for the audit plus an explicit release-scope assessment for every manifest issue.
 * Missing or unknown scope fails closed so an omitted blocker cannot silently become
 * a passing release claim.
 */
export function compileV1P0CorrectnessSecurityAuditV1(
  input: V1P0CorrectnessSecurityAuditInputV1
): V1P0CorrectnessSecurityAuditV1 {
  const blockers: V1P0CorrectnessSecurityBlockerV1[] = [];
  const releaseShaValid = SHA_40.test(input.releaseSha);
  const evaluatedAtMs = parsedTimestamp(input.evaluatedAt);
  const freshnessPolicyValid =
    Number.isFinite(input.maxEvidenceAgeMs) && input.maxEvidenceAgeMs > 0;

  if (!releaseShaValid) {
    blockers.push(
      blocker(
        "INVALID_RELEASE_SHA",
        "P0 release audit requires an exact lowercase 40-character Git commit SHA."
      )
    );
  }

  if (evaluatedAtMs == null) {
    blockers.push(
      blocker("INVALID_EVALUATED_AT", "P0 release audit evaluatedAt must be a valid timestamp.")
    );
  }

  if (!freshnessPolicyValid) {
    blockers.push(
      blocker(
        "INVALID_FRESHNESS_POLICY",
        "P0 release audit requires an explicit positive finite maxEvidenceAgeMs policy."
      )
    );
  }

  const manifestEvidence = sanitizeEvidenceRefs(input.issueManifest.evidenceRefs);
  const manifestObservedAtMs = parsedTimestamp(input.issueManifest.observedAt);

  if (!releaseShaValid || input.issueManifest.releaseSha !== input.releaseSha) {
    blockers.push(
      blocker(
        "MANIFEST_SHA_MISMATCH",
        "The open-P0 manifest is not explicitly bound to the exact audited release SHA.",
        manifestEvidence.refs,
        "UNKNOWN"
      )
    );
  }

  if (manifestObservedAtMs == null) {
    blockers.push(
      blocker(
        "MANIFEST_INVALID_TIMESTAMP",
        "The open-P0 manifest observedAt timestamp is invalid.",
        manifestEvidence.refs,
        "UNKNOWN"
      )
    );
  } else if (evaluatedAtMs != null && manifestObservedAtMs > evaluatedAtMs) {
    blockers.push(
      blocker(
        "MANIFEST_FUTURE_EVIDENCE",
        "The open-P0 manifest is dated after the audit evaluation time.",
        manifestEvidence.refs,
        "UNKNOWN"
      )
    );
  } else if (
    evaluatedAtMs != null &&
    freshnessPolicyValid &&
    !isFresh(manifestObservedAtMs, evaluatedAtMs, input.maxEvidenceAgeMs)
  ) {
    blockers.push(
      blocker(
        "MANIFEST_STALE_EVIDENCE",
        "The open-P0 manifest is older than the caller-owned freshness policy.",
        manifestEvidence.refs,
        "NONE"
      )
    );
  }

  if (manifestEvidence.refs.length === 0 && !manifestEvidence.unsafe) {
    blockers.push(
      blocker(
        "MANIFEST_MISSING_PROVENANCE",
        "The open-P0 manifest requires provenance proving the observed issue set.",
        [],
        "UNKNOWN"
      )
    );
  }

  if (manifestEvidence.unsafe) {
    blockers.push(
      blocker(
        "MANIFEST_UNSAFE_PROVENANCE",
        "The open-P0 manifest contains secret/reference material that cannot enter release evidence.",
        [],
        "UNKNOWN"
      )
    );
  }

  const invalidManifestIssueNumbers = input.issueManifest.issueNumbers.filter(
    (issueNumber) => !Number.isInteger(issueNumber) || issueNumber <= 0
  );
  if (invalidManifestIssueNumbers.length > 0) {
    blockers.push(
      blocker(
        "INVALID_MANIFEST_ISSUE_NUMBER",
        "The open-P0 manifest contains a non-positive or non-integer issue identifier. Invalid identifiers cannot be discarded from release evidence.",
        manifestEvidence.refs,
        "UNKNOWN"
      )
    );
  }

  const manifestIssueNumbers = input.issueManifest.issueNumbers.filter(
    (issueNumber) => Number.isInteger(issueNumber) && issueNumber > 0
  );
  const manifestCounts = new Map<number, number>();
  for (const issueNumber of manifestIssueNumbers) {
    manifestCounts.set(issueNumber, (manifestCounts.get(issueNumber) ?? 0) + 1);
  }
  for (const [issueNumber, count] of manifestCounts) {
    if (count > 1) {
      blockers.push(
        blocker(
          "DUPLICATE_MANIFEST_ISSUE",
          `Open-P0 manifest contains issue #${issueNumber} more than once.`,
          manifestEvidence.refs,
          "UNKNOWN",
          issueNumber
        )
      );
    }
  }

  const assessmentGroups = new Map<number, V1P0IssueAssessmentV1[]>();
  for (const assessment of input.issueAssessments) {
    const entries = assessmentGroups.get(assessment.issueNumber) ?? [];
    entries.push(assessment);
    assessmentGroups.set(assessment.issueNumber, entries);
  }

  const uniqueManifestIssues = [...new Set(manifestIssueNumbers)].sort((a, b) => a - b);
  const manifestIssueSet = new Set(uniqueManifestIssues);

  for (const issueNumber of uniqueManifestIssues) {
    const assessments = assessmentGroups.get(issueNumber) ?? [];
    if (assessments.length === 0) {
      blockers.push(
        blocker(
          "MISSING_ISSUE_ASSESSMENT",
          `Open P0 issue #${issueNumber} has no explicit V1 release-scope assessment.`,
          manifestEvidence.refs,
          "UNKNOWN",
          issueNumber
        )
      );
      continue;
    }

    if (assessments.length > 1) {
      const evidence = sanitizeEvidenceRefs(assessments.flatMap((entry) => entry.evidenceRefs));
      blockers.push(
        blocker(
          "DUPLICATE_ISSUE_ASSESSMENT",
          `Open P0 issue #${issueNumber} has multiple release-scope assessments; the audit refuses to choose one.`,
          evidence.refs,
          "UNKNOWN",
          issueNumber
        )
      );
      continue;
    }

    const assessment = assessments[0];
    const assessmentEvidence = sanitizeEvidenceRefs(assessment.evidenceRefs);
    const assessmentObservedAtMs = parsedTimestamp(assessment.observedAt);

    if (!releaseShaValid || assessment.releaseSha !== input.releaseSha) {
      blockers.push(
        blocker(
          "ISSUE_SHA_MISMATCH",
          `Issue #${issueNumber} assessment is not bound to the exact audited release SHA.`,
          assessmentEvidence.refs,
          assessment.actionRequirement,
          issueNumber
        )
      );
    }

    if (assessmentObservedAtMs == null) {
      blockers.push(
        blocker(
          "ISSUE_INVALID_TIMESTAMP",
          `Issue #${issueNumber} assessment has an invalid observedAt timestamp.`,
          assessmentEvidence.refs,
          assessment.actionRequirement,
          issueNumber
        )
      );
    } else if (evaluatedAtMs != null && assessmentObservedAtMs > evaluatedAtMs) {
      blockers.push(
        blocker(
          "ISSUE_FUTURE_EVIDENCE",
          `Issue #${issueNumber} assessment is dated after the audit evaluation time.`,
          assessmentEvidence.refs,
          assessment.actionRequirement,
          issueNumber
        )
      );
    } else if (
      evaluatedAtMs != null &&
      freshnessPolicyValid &&
      !isFresh(assessmentObservedAtMs, evaluatedAtMs, input.maxEvidenceAgeMs)
    ) {
      blockers.push(
        blocker(
          "ISSUE_STALE_EVIDENCE",
          `Issue #${issueNumber} assessment is older than the caller-owned freshness policy.`,
          assessmentEvidence.refs,
          assessment.actionRequirement,
          issueNumber
        )
      );
    }

    if (assessmentEvidence.refs.length === 0 && !assessmentEvidence.unsafe) {
      blockers.push(
        blocker(
          "ISSUE_MISSING_PROVENANCE",
          `Issue #${issueNumber} assessment requires provenance.`,
          [],
          assessment.actionRequirement,
          issueNumber
        )
      );
    }

    if (assessmentEvidence.unsafe) {
      blockers.push(
        blocker(
          "ISSUE_UNSAFE_PROVENANCE",
          `Issue #${issueNumber} assessment contains unsafe provenance.`,
          [],
          assessment.actionRequirement,
          issueNumber
        )
      );
    }

    if (assessment.disposition === "UNKNOWN" || assessment.category === "UNKNOWN") {
      blockers.push(
        blocker(
          "ISSUE_SCOPE_UNKNOWN",
          `Issue #${issueNumber} has unresolved V1 scope/category and cannot be assumed non-blocking.`,
          assessmentEvidence.refs,
          assessment.actionRequirement,
          issueNumber
        )
      );
    } else if (assessment.disposition === "V1_BLOCKER") {
      blockers.push(
        blocker(
          "OPEN_V1_P0_BLOCKER",
          `Issue #${issueNumber} is explicitly assessed as an open Useful V1 P0 ${assessment.category.toLowerCase()} blocker.`,
          assessmentEvidence.refs,
          assessment.actionRequirement,
          issueNumber
        )
      );
    }
  }

  for (const [issueNumber, assessments] of assessmentGroups) {
    if (!manifestIssueSet.has(issueNumber)) {
      const evidence = sanitizeEvidenceRefs(assessments.flatMap((entry) => entry.evidenceRefs));
      blockers.push(
        blocker(
          "UNEXPECTED_ISSUE_ASSESSMENT",
          `Issue #${issueNumber} was assessed but is absent from the evidence-backed open-P0 manifest.`,
          evidence.refs,
          "UNKNOWN",
          issueNumber
        )
      );
    }
  }

  const invariantGroups = new Map<V1P0RequiredInvariantIdV1, V1P0InvariantObservationV1[]>();
  for (const invariant of input.invariants) {
    const entries = invariantGroups.get(invariant.invariantId) ?? [];
    entries.push(invariant);
    invariantGroups.set(invariant.invariantId, entries);
  }

  for (const invariantId of V1_P0_REQUIRED_INVARIANTS_V1) {
    const observations = invariantGroups.get(invariantId) ?? [];
    if (observations.length === 0) {
      blockers.push(
        blocker(
          "MISSING_INVARIANT",
          `${invariantId} has no explicit current release observation.`,
          [],
          "UNKNOWN",
          null,
          invariantId
        )
      );
      continue;
    }

    if (observations.length > 1) {
      const evidence = sanitizeEvidenceRefs(observations.flatMap((entry) => entry.evidenceRefs));
      blockers.push(
        blocker(
          "DUPLICATE_INVARIANT",
          `${invariantId} has multiple observations; the audit refuses to choose a convenient result.`,
          evidence.refs,
          "UNKNOWN",
          null,
          invariantId
        )
      );
      continue;
    }

    const observation = observations[0];
    const observationEvidence = sanitizeEvidenceRefs(observation.evidenceRefs);
    const observationAtMs = parsedTimestamp(observation.observedAt);

    if (!releaseShaValid || observation.releaseSha !== input.releaseSha) {
      blockers.push(
        blocker(
          "INVARIANT_SHA_MISMATCH",
          `${invariantId} is not bound to the exact audited release SHA.`,
          observationEvidence.refs,
          observation.actionRequirement,
          null,
          invariantId
        )
      );
    }

    if (observationAtMs == null) {
      blockers.push(
        blocker(
          "INVARIANT_INVALID_TIMESTAMP",
          `${invariantId} has an invalid observedAt timestamp.`,
          observationEvidence.refs,
          observation.actionRequirement,
          null,
          invariantId
        )
      );
    } else if (evaluatedAtMs != null && observationAtMs > evaluatedAtMs) {
      blockers.push(
        blocker(
          "INVARIANT_FUTURE_EVIDENCE",
          `${invariantId} is dated after the audit evaluation time.`,
          observationEvidence.refs,
          observation.actionRequirement,
          null,
          invariantId
        )
      );
    } else if (
      evaluatedAtMs != null &&
      freshnessPolicyValid &&
      !isFresh(observationAtMs, evaluatedAtMs, input.maxEvidenceAgeMs)
    ) {
      blockers.push(
        blocker(
          "INVARIANT_STALE_EVIDENCE",
          `${invariantId} is older than the caller-owned freshness policy.`,
          observationEvidence.refs,
          observation.actionRequirement,
          null,
          invariantId
        )
      );
    }

    if (observationEvidence.refs.length === 0 && !observationEvidence.unsafe) {
      blockers.push(
        blocker(
          "INVARIANT_MISSING_PROVENANCE",
          `${invariantId} requires provenance.`,
          [],
          observation.actionRequirement,
          null,
          invariantId
        )
      );
    }

    if (observationEvidence.unsafe) {
      blockers.push(
        blocker(
          "INVARIANT_UNSAFE_PROVENANCE",
          `${invariantId} contains secret/reference material that cannot enter release evidence.`,
          [],
          observation.actionRequirement,
          null,
          invariantId
        )
      );
    }

    if (observation.state !== "PASS") {
      blockers.push(
        blocker(
          "INVARIANT_NOT_PASS",
          `${invariantId} is ${observation.state}; only explicit PASS evidence can satisfy the P0 release audit.`,
          observationEvidence.refs,
          observation.actionRequirement,
          null,
          invariantId
        )
      );
    }
  }

  const allEvidenceRefs = sanitizeEvidenceRefs([
    ...input.issueManifest.evidenceRefs,
    ...input.issueAssessments.flatMap((entry) => entry.evidenceRefs),
    ...input.invariants.flatMap((entry) => entry.evidenceRefs)
  ]);
  const gateState = blockers.length === 0 ? "PASS" : "BLOCKED";
  const gateFreshness = freshnessFromBlockers(blockers);
  const actionRequirement = aggregateActionRequirement(blockers);

  return {
    contractVersion: "V1_P0_CORRECTNESS_SECURITY_AUDIT_V1",
    evaluatedAt: input.evaluatedAt,
    releaseSha: input.releaseSha,
    manifestIssueCount: uniqueManifestIssues.length,
    assessedIssueCount: input.issueAssessments.length,
    invariantCount: input.invariants.length,
    gateEvidence: {
      gateId: "P0_CORRECTNESS_SECURITY",
      state: gateState,
      freshness: gateFreshness,
      observedAt: input.evaluatedAt,
      evidenceRefs: allEvidenceRefs.unsafe ? [] : allEvidenceRefs.refs,
      releaseSha: releaseShaValid ? input.releaseSha : null,
      actionRequirement,
      detail:
        blockers.length === 0
          ? "Explicit open-P0 manifest and required V1 correctness/security/data-truth invariants passed."
          : `${blockers.length} P0 correctness/security audit blocker(s) require resolution or fresh evidence.`
    },
    blockers,
    authority: {
      canCloseIssue: false,
      canMerge: false,
      canDeploy: false,
      canMutateProduction: false,
      canBypassApproval: false
    }
  };
}
