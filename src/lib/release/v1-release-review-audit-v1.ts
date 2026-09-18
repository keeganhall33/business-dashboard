import type { V1ReleaseGateEvidenceV1 } from "@/lib/release/v1-release-certificate-v1";

export const V1_RELEASE_REVIEW_REQUIRED_CHECKS_V1 = [
  "TYPECHECK",
  "TEST",
  "BUILD",
  "DIFF_CHECK"
] as const;

export type V1ReleaseReviewRequiredCheckIdV1 =
  (typeof V1_RELEASE_REVIEW_REQUIRED_CHECKS_V1)[number];

export type V1ReleaseReviewCheckEvidenceV1 = {
  checkId: V1ReleaseReviewRequiredCheckIdV1;
  state: "PASS" | "FAIL" | "UNKNOWN";
  headSha: string | null;
  observedAt: string | null;
  evidenceRefs: readonly string[];
};

export type V1ReleaseReviewApprovalEvidenceV1 = {
  state: "APPROVED" | "PENDING" | "CHANGES_REQUESTED" | "UNKNOWN";
  approvedHeadSha: string | null;
  reviewerIndependent: boolean | null;
  observedAt: string | null;
  evidenceRefs: readonly string[];
};

export type V1ReleaseReviewThreadEvidenceV1 = {
  unresolvedCount: number | null;
  observedAt: string | null;
  evidenceRefs: readonly string[];
};

export type V1ReleaseReviewInclusionEvidenceV1 = {
  state: "VERIFIED" | "NOT_INCLUDED" | "UNKNOWN";
  releaseSha: string | null;
  evidenceRefs: readonly string[];
};

export type V1ReleaseReviewPullRequestAuditV1 = {
  prNumber: number;
  headSha: string;
  merged: boolean;
  mergedAt: string | null;
  mergeCommitSha: string | null;
  auditedAt: string;
  requiredChecks: readonly V1ReleaseReviewCheckEvidenceV1[];
  approval: V1ReleaseReviewApprovalEvidenceV1;
  reviewThreads: V1ReleaseReviewThreadEvidenceV1;
  diffIntegrity: "MEANINGFUL" | "EMPTY" | "SUSPICIOUS" | "UNKNOWN";
  ownershipIntegrity: "PASS" | "VIOLATION" | "UNKNOWN";
  releaseInclusion: V1ReleaseReviewInclusionEvidenceV1;
  evidenceRefs: readonly string[];
};

export type V1ReleaseReviewAuditInputV1 = {
  releaseSha: string;
  evaluatedAt: string;
  maxAuditAgeMs: number;
  requiredPullRequestNumbers: readonly number[];
  manifestEvidenceRefs: readonly string[];
  pullRequests: readonly V1ReleaseReviewPullRequestAuditV1[];
};

export type V1ReleaseReviewAuditIssueSeverityV1 = "FAIL" | "BLOCKED";

export type V1ReleaseReviewAuditIssueCodeV1 =
  | "INVALID_RELEASE_SHA"
  | "INVALID_EVALUATED_AT"
  | "INVALID_FRESHNESS_POLICY"
  | "MISSING_MANIFEST_PROVENANCE"
  | "UNSAFE_PROVENANCE"
  | "INVALID_REQUIRED_PR"
  | "DUPLICATE_REQUIRED_PR"
  | "MISSING_PR_AUDIT"
  | "UNEXPECTED_PR_AUDIT"
  | "DUPLICATE_PR_AUDIT"
  | "INVALID_PR_HEAD_SHA"
  | "INVALID_PR_AUDIT_TIMESTAMP"
  | "FUTURE_PR_AUDIT"
  | "STALE_PR_AUDIT"
  | "PR_NOT_MERGED"
  | "INVALID_MERGE_TIMESTAMP"
  | "MERGE_AFTER_AUDIT"
  | "INVALID_MERGE_COMMIT_SHA"
  | "RELEASE_INCLUSION_NOT_VERIFIED"
  | "RELEASE_INCLUSION_SHA_MISMATCH"
  | "REQUIRED_CHECK_MISSING"
  | "REQUIRED_CHECK_DUPLICATE"
  | "REQUIRED_CHECK_FAILED"
  | "REQUIRED_CHECK_UNKNOWN"
  | "CHECK_HEAD_MISMATCH"
  | "CHECK_TIMESTAMP_INVALID"
  | "CHECK_FUTURE_EVIDENCE"
  | "APPROVAL_NOT_APPROVED"
  | "APPROVAL_NOT_INDEPENDENT"
  | "APPROVAL_HEAD_MISMATCH"
  | "APPROVAL_TIMESTAMP_INVALID"
  | "APPROVAL_FUTURE_EVIDENCE"
  | "REVIEW_THREAD_STATE_UNKNOWN"
  | "REVIEW_THREAD_TIMESTAMP_INVALID"
  | "REVIEW_THREAD_FUTURE_EVIDENCE"
  | "UNRESOLVED_REVIEW_THREADS"
  | "DIFF_EMPTY"
  | "DIFF_SUSPICIOUS"
  | "DIFF_INTEGRITY_UNKNOWN"
  | "OWNERSHIP_VIOLATION"
  | "OWNERSHIP_INTEGRITY_UNKNOWN";

export type V1ReleaseReviewAuditIssueV1 = {
  code: V1ReleaseReviewAuditIssueCodeV1;
  severity: V1ReleaseReviewAuditIssueSeverityV1;
  prNumber: number | null;
  detail: string;
  evidenceRefs: readonly string[];
};

export type V1ReleaseReviewAuditResultV1 = {
  contractVersion: "V1_RELEASE_REVIEW_AUDIT_V1";
  disposition: "PASS" | "FAIL" | "BLOCKED";
  evidence: V1ReleaseGateEvidenceV1;
  auditedPullRequestNumbers: readonly number[];
  issues: readonly V1ReleaseReviewAuditIssueV1[];
  authority: {
    canMerge: false;
    canDeploy: false;
    canMutateProduction: false;
    canBypassApproval: false;
  };
};

const SHA_40 = /^[0-9a-f]{40}$/;
const UNSAFE_EVIDENCE_REF =
  /(?:op:\/\/|begin\s+(?:rsa\s+)?private\s+key|(?:password|passwd|secret|token|api[_-]?key)\s*[=:])/i;

function parsedTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeRefs(refs: readonly string[] | undefined): {
  refs: string[];
  unsafe: boolean;
} {
  const cleaned = [
    ...new Set((refs ?? []).map((entry) => entry.trim()).filter(Boolean))
  ].sort();
  const unsafe = cleaned.some((entry) => UNSAFE_EVIDENCE_REF.test(entry));
  return { refs: unsafe ? [] : cleaned, unsafe };
}

function issue(
  code: V1ReleaseReviewAuditIssueCodeV1,
  severity: V1ReleaseReviewAuditIssueSeverityV1,
  prNumber: number | null,
  detail: string,
  evidenceRefs: readonly string[] = []
): V1ReleaseReviewAuditIssueV1 {
  return {
    code,
    severity,
    prNumber,
    detail,
    evidenceRefs: [...evidenceRefs]
  };
}

function collectSafeRefs(
  target: string[],
  issues: V1ReleaseReviewAuditIssueV1[],
  refs: readonly string[] | undefined,
  prNumber: number | null,
  context: string
): string[] {
  const sanitized = sanitizeRefs(refs);
  if (sanitized.unsafe) {
    issues.push(
      issue(
        "UNSAFE_PROVENANCE",
        "BLOCKED",
        prNumber,
        `${context} contains secret-like provenance and was removed from release evidence.`
      )
    );
    return [];
  }
  target.push(...sanitized.refs);
  return sanitized.refs;
}

function hasKnownFailure(issues: readonly V1ReleaseReviewAuditIssueV1[]): boolean {
  return issues.some((entry) => entry.severity === "FAIL");
}

/**
 * Compiles explicit GitHub/review observations into the existing
 * RELEASE_REVIEW_AUDIT release gate.
 *
 * This compiler does not call GitHub, merge pull requests, approve reviews, or
 * infer release membership. The caller must provide an explicit manifest and
 * already-collected evidence for every release-blocking PR. Missing, stale,
 * partial, or conflicting proof fails closed.
 */
export function compileV1ReleaseReviewAuditV1(
  input: V1ReleaseReviewAuditInputV1
): V1ReleaseReviewAuditResultV1 {
  const issues: V1ReleaseReviewAuditIssueV1[] = [];
  const evidenceRefs: string[] = [];
  const releaseShaValid = SHA_40.test(input.releaseSha);
  const evaluatedAtMs = parsedTimestamp(input.evaluatedAt);
  const freshnessPolicyValid =
    Number.isFinite(input.maxAuditAgeMs) && input.maxAuditAgeMs > 0;

  if (!releaseShaValid) {
    issues.push(
      issue(
        "INVALID_RELEASE_SHA",
        "BLOCKED",
        null,
        "Release-review audit requires an exact lowercase 40-character release SHA."
      )
    );
  }

  if (evaluatedAtMs == null) {
    issues.push(
      issue(
        "INVALID_EVALUATED_AT",
        "BLOCKED",
        null,
        "Release-review audit evaluatedAt must be a valid timestamp."
      )
    );
  }

  if (!freshnessPolicyValid) {
    issues.push(
      issue(
        "INVALID_FRESHNESS_POLICY",
        "BLOCKED",
        null,
        "maxAuditAgeMs must be a positive finite caller-owned freshness limit."
      )
    );
  }

  const manifestRefs = collectSafeRefs(
    evidenceRefs,
    issues,
    input.manifestEvidenceRefs,
    null,
    "Release-blocking PR manifest provenance"
  );
  if (manifestRefs.length === 0) {
    issues.push(
      issue(
        "MISSING_MANIFEST_PROVENANCE",
        "BLOCKED",
        null,
        "The release-blocking PR manifest requires explicit provenance."
      )
    );
  }

  const requiredCounts = new Map<number, number>();
  for (const prNumber of input.requiredPullRequestNumbers) {
    if (!Number.isInteger(prNumber) || prNumber <= 0) {
      issues.push(
        issue(
          "INVALID_REQUIRED_PR",
          "BLOCKED",
          Number.isInteger(prNumber) ? prNumber : null,
          "Required pull request numbers must be positive integers."
        )
      );
      continue;
    }
    requiredCounts.set(prNumber, (requiredCounts.get(prNumber) ?? 0) + 1);
  }

  for (const [prNumber, count] of requiredCounts) {
    if (count > 1) {
      issues.push(
        issue(
          "DUPLICATE_REQUIRED_PR",
          "BLOCKED",
          prNumber,
          `PR #${prNumber} appears more than once in the release-blocking manifest.`
        )
      );
    }
  }

  const auditCounts = new Map<number, number>();
  for (const audit of input.pullRequests) {
    auditCounts.set(audit.prNumber, (auditCounts.get(audit.prNumber) ?? 0) + 1);
  }

  for (const prNumber of requiredCounts.keys()) {
    const count = auditCounts.get(prNumber) ?? 0;
    if (count === 0) {
      issues.push(
        issue(
          "MISSING_PR_AUDIT",
          "BLOCKED",
          prNumber,
          `PR #${prNumber} is required by the release manifest but has no review-audit evidence.`
        )
      );
    } else if (count > 1) {
      issues.push(
        issue(
          "DUPLICATE_PR_AUDIT",
          "BLOCKED",
          prNumber,
          `PR #${prNumber} has multiple audit records; the compiler refuses to choose one.`
        )
      );
    }
  }

  for (const prNumber of auditCounts.keys()) {
    if (!requiredCounts.has(prNumber)) {
      issues.push(
        issue(
          "UNEXPECTED_PR_AUDIT",
          "BLOCKED",
          prNumber,
          `PR #${prNumber} is audited but is not present in the explicit release-blocking manifest.`
        )
      );
    }
  }

  const uniqueAudits = input.pullRequests.filter(
    (audit) =>
      requiredCounts.get(audit.prNumber) === 1 &&
      auditCounts.get(audit.prNumber) === 1
  );

  for (const audit of uniqueAudits) {
    const pr = audit.prNumber;
    const prRefs = collectSafeRefs(
      evidenceRefs,
      issues,
      audit.evidenceRefs,
      pr,
      `PR #${pr} audit provenance`
    );

    if (!SHA_40.test(audit.headSha)) {
      issues.push(
        issue(
          "INVALID_PR_HEAD_SHA",
          "BLOCKED",
          pr,
          `PR #${pr} head SHA is not an exact lowercase 40-character commit SHA.`,
          prRefs
        )
      );
    }

    const auditedAtMs = parsedTimestamp(audit.auditedAt);
    if (auditedAtMs == null) {
      issues.push(
        issue(
          "INVALID_PR_AUDIT_TIMESTAMP",
          "BLOCKED",
          pr,
          `PR #${pr} auditedAt is invalid.`,
          prRefs
        )
      );
    } else if (evaluatedAtMs != null) {
      if (auditedAtMs > evaluatedAtMs) {
        issues.push(
          issue(
            "FUTURE_PR_AUDIT",
            "BLOCKED",
            pr,
            `PR #${pr} audit is dated after the release-review evaluation instant.`,
            prRefs
          )
        );
      } else if (
        freshnessPolicyValid &&
        evaluatedAtMs - auditedAtMs > input.maxAuditAgeMs
      ) {
        issues.push(
          issue(
            "STALE_PR_AUDIT",
            "BLOCKED",
            pr,
            `PR #${pr} audit is older than the caller-owned freshness limit.`,
            prRefs
          )
        );
      }
    }

    if (!audit.merged) {
      issues.push(
        issue(
          "PR_NOT_MERGED",
          "FAIL",
          pr,
          `PR #${pr} is in the release-blocking manifest but is not explicitly observed as merged.`,
          prRefs
        )
      );
    }

    const mergedAtMs = parsedTimestamp(audit.mergedAt);
    if (audit.merged && mergedAtMs == null) {
      issues.push(
        issue(
          "INVALID_MERGE_TIMESTAMP",
          "BLOCKED",
          pr,
          `PR #${pr} is marked merged without a valid mergedAt timestamp.`,
          prRefs
        )
      );
    } else if (
      audit.merged &&
      mergedAtMs != null &&
      auditedAtMs != null &&
      mergedAtMs > auditedAtMs
    ) {
      issues.push(
        issue(
          "MERGE_AFTER_AUDIT",
          "BLOCKED",
          pr,
          `PR #${pr} audit predates the observed merge and cannot certify post-merge review state.`,
          prRefs
        )
      );
    }

    if (audit.merged && (!audit.mergeCommitSha || !SHA_40.test(audit.mergeCommitSha))) {
      issues.push(
        issue(
          "INVALID_MERGE_COMMIT_SHA",
          "BLOCKED",
          pr,
          `PR #${pr} requires an exact merge commit SHA.`,
          prRefs
        )
      );
    }

    const inclusionRefs = collectSafeRefs(
      evidenceRefs,
      issues,
      audit.releaseInclusion.evidenceRefs,
      pr,
      `PR #${pr} release-inclusion provenance`
    );
    if (audit.releaseInclusion.state !== "VERIFIED") {
      issues.push(
        issue(
          "RELEASE_INCLUSION_NOT_VERIFIED",
          audit.releaseInclusion.state === "NOT_INCLUDED" ? "FAIL" : "BLOCKED",
          pr,
          `PR #${pr} release inclusion is ${audit.releaseInclusion.state}; exact inclusion must be verified.`,
          inclusionRefs
        )
      );
    }
    if (
      !releaseShaValid ||
      audit.releaseInclusion.releaseSha !== input.releaseSha
    ) {
      issues.push(
        issue(
          "RELEASE_INCLUSION_SHA_MISMATCH",
          "BLOCKED",
          pr,
          `PR #${pr} inclusion evidence is not bound to the exact release SHA.`,
          inclusionRefs
        )
      );
    }

    const checksById = new Map<
      V1ReleaseReviewRequiredCheckIdV1,
      V1ReleaseReviewCheckEvidenceV1[]
    >();
    for (const check of audit.requiredChecks) {
      const current = checksById.get(check.checkId) ?? [];
      current.push(check);
      checksById.set(check.checkId, current);
    }

    for (const checkId of V1_RELEASE_REVIEW_REQUIRED_CHECKS_V1) {
      const checks = checksById.get(checkId) ?? [];
      if (checks.length === 0) {
        issues.push(
          issue(
            "REQUIRED_CHECK_MISSING",
            "BLOCKED",
            pr,
            `PR #${pr} is missing required ${checkId} evidence.`,
            prRefs
          )
        );
        continue;
      }
      if (checks.length > 1) {
        const duplicateRefs = collectSafeRefs(
          evidenceRefs,
          issues,
          checks.flatMap((entry) => entry.evidenceRefs),
          pr,
          `PR #${pr} duplicate ${checkId} provenance`
        );
        issues.push(
          issue(
            "REQUIRED_CHECK_DUPLICATE",
            "BLOCKED",
            pr,
            `PR #${pr} has multiple ${checkId} records; the compiler refuses to choose one.`,
            duplicateRefs
          )
        );
        continue;
      }

      const check = checks[0];
      const checkRefs = collectSafeRefs(
        evidenceRefs,
        issues,
        check.evidenceRefs,
        pr,
        `PR #${pr} ${checkId} provenance`
      );
      if (check.state === "FAIL") {
        issues.push(
          issue(
            "REQUIRED_CHECK_FAILED",
            "FAIL",
            pr,
            `PR #${pr} required ${checkId} check failed.`,
            checkRefs
          )
        );
      } else if (check.state === "UNKNOWN") {
        issues.push(
          issue(
            "REQUIRED_CHECK_UNKNOWN",
            "BLOCKED",
            pr,
            `PR #${pr} required ${checkId} check state is unknown.`,
            checkRefs
          )
        );
      }

      if (check.headSha !== audit.headSha) {
        issues.push(
          issue(
            "CHECK_HEAD_MISMATCH",
            "BLOCKED",
            pr,
            `PR #${pr} ${checkId} evidence is not bound to the exact audited head SHA.`,
            checkRefs
          )
        );
      }

      const checkAtMs = parsedTimestamp(check.observedAt);
      if (checkAtMs == null) {
        issues.push(
          issue(
            "CHECK_TIMESTAMP_INVALID",
            "BLOCKED",
            pr,
            `PR #${pr} ${checkId} evidence has an invalid observedAt timestamp.`,
            checkRefs
          )
        );
      } else if (
        evaluatedAtMs != null &&
        checkAtMs > evaluatedAtMs
      ) {
        issues.push(
          issue(
            "CHECK_FUTURE_EVIDENCE",
            "BLOCKED",
            pr,
            `PR #${pr} ${checkId} evidence is dated after the release-review evaluation instant.`,
            checkRefs
          )
        );
      }
    }

    const approvalRefs = collectSafeRefs(
      evidenceRefs,
      issues,
      audit.approval.evidenceRefs,
      pr,
      `PR #${pr} approval provenance`
    );
    if (audit.approval.state !== "APPROVED") {
      issues.push(
        issue(
          "APPROVAL_NOT_APPROVED",
          audit.approval.state === "CHANGES_REQUESTED" ? "FAIL" : "BLOCKED",
          pr,
          `PR #${pr} exact-head independent approval state is ${audit.approval.state}.`,
          approvalRefs
        )
      );
    }
    if (audit.approval.reviewerIndependent !== true) {
      issues.push(
        issue(
          "APPROVAL_NOT_INDEPENDENT",
          audit.approval.reviewerIndependent === false ? "FAIL" : "BLOCKED",
          pr,
          `PR #${pr} does not have explicit evidence of an independent reviewer.`,
          approvalRefs
        )
      );
    }
    if (audit.approval.approvedHeadSha !== audit.headSha) {
      issues.push(
        issue(
          "APPROVAL_HEAD_MISMATCH",
          "BLOCKED",
          pr,
          `PR #${pr} approval is not bound to the exact audited head SHA.`,
          approvalRefs
        )
      );
    }
    const approvalAtMs = parsedTimestamp(audit.approval.observedAt);
    if (approvalAtMs == null) {
      issues.push(
        issue(
          "APPROVAL_TIMESTAMP_INVALID",
          "BLOCKED",
          pr,
          `PR #${pr} approval evidence has an invalid observedAt timestamp.`,
          approvalRefs
        )
      );
    } else if (evaluatedAtMs != null && approvalAtMs > evaluatedAtMs) {
      issues.push(
        issue(
          "APPROVAL_FUTURE_EVIDENCE",
          "BLOCKED",
          pr,
          `PR #${pr} approval evidence is dated after the release-review evaluation instant.`,
          approvalRefs
        )
      );
    }

    const threadRefs = collectSafeRefs(
      evidenceRefs,
      issues,
      audit.reviewThreads.evidenceRefs,
      pr,
      `PR #${pr} review-thread provenance`
    );
    if (
      audit.reviewThreads.unresolvedCount == null ||
      !Number.isInteger(audit.reviewThreads.unresolvedCount) ||
      audit.reviewThreads.unresolvedCount < 0
    ) {
      issues.push(
        issue(
          "REVIEW_THREAD_STATE_UNKNOWN",
          "BLOCKED",
          pr,
          `PR #${pr} unresolved review-thread count is not explicitly known.`,
          threadRefs
        )
      );
    } else if (audit.reviewThreads.unresolvedCount > 0) {
      issues.push(
        issue(
          "UNRESOLVED_REVIEW_THREADS",
          "FAIL",
          pr,
          `PR #${pr} has ${audit.reviewThreads.unresolvedCount} unresolved review thread(s).`,
          threadRefs
        )
      );
    }
    const threadAtMs = parsedTimestamp(audit.reviewThreads.observedAt);
    if (threadAtMs == null) {
      issues.push(
        issue(
          "REVIEW_THREAD_TIMESTAMP_INVALID",
          "BLOCKED",
          pr,
          `PR #${pr} review-thread evidence has an invalid observedAt timestamp.`,
          threadRefs
        )
      );
    } else if (evaluatedAtMs != null && threadAtMs > evaluatedAtMs) {
      issues.push(
        issue(
          "REVIEW_THREAD_FUTURE_EVIDENCE",
          "BLOCKED",
          pr,
          `PR #${pr} review-thread evidence is dated after the release-review evaluation instant.`,
          threadRefs
        )
      );
    }

    if (audit.diffIntegrity === "EMPTY") {
      issues.push(
        issue(
          "DIFF_EMPTY",
          "FAIL",
          pr,
          `PR #${pr} has an empty diff and cannot satisfy the release review audit.`,
          prRefs
        )
      );
    } else if (audit.diffIntegrity === "SUSPICIOUS") {
      issues.push(
        issue(
          "DIFF_SUSPICIOUS",
          "FAIL",
          pr,
          `PR #${pr} diff integrity is explicitly suspicious.`,
          prRefs
        )
      );
    } else if (audit.diffIntegrity === "UNKNOWN") {
      issues.push(
        issue(
          "DIFF_INTEGRITY_UNKNOWN",
          "BLOCKED",
          pr,
          `PR #${pr} diff integrity is unknown.`,
          prRefs
        )
      );
    }

    if (audit.ownershipIntegrity === "VIOLATION") {
      issues.push(
        issue(
          "OWNERSHIP_VIOLATION",
          "FAIL",
          pr,
          `PR #${pr} has an explicit file-ownership violation.`,
          prRefs
        )
      );
    } else if (audit.ownershipIntegrity === "UNKNOWN") {
      issues.push(
        issue(
          "OWNERSHIP_INTEGRITY_UNKNOWN",
          "BLOCKED",
          pr,
          `PR #${pr} file-ownership integrity is unknown.`,
          prRefs
        )
      );
    }
  }

  const uniqueEvidenceRefs = [...new Set(evidenceRefs)].sort();
  const disposition: V1ReleaseReviewAuditResultV1["disposition"] =
    issues.length === 0 ? "PASS" : hasKnownFailure(issues) ? "FAIL" : "BLOCKED";

  let freshness: V1ReleaseGateEvidenceV1["freshness"] = "CURRENT";
  if (
    issues.some((entry) => entry.code === "STALE_PR_AUDIT")
  ) {
    freshness = "STALE";
  } else if (evaluatedAtMs == null || !freshnessPolicyValid) {
    freshness = "UNKNOWN";
  }

  return {
    contractVersion: "V1_RELEASE_REVIEW_AUDIT_V1",
    disposition,
    evidence: {
      gateId: "RELEASE_REVIEW_AUDIT",
      state:
        disposition === "PASS"
          ? "PASS"
          : disposition === "FAIL"
            ? "FAIL"
            : "BLOCKED",
      freshness,
      observedAt: input.evaluatedAt,
      evidenceRefs: uniqueEvidenceRefs,
      releaseSha: releaseShaValid ? input.releaseSha : null,
      actionRequirement: "NONE",
      detail:
        disposition === "PASS"
          ? `${uniqueAudits.length} release-blocking pull request(s) passed exact-head CI, independent review, thread, diff, ownership, and release-inclusion audit.`
          : `Release review audit is ${disposition.toLowerCase()} with ${issues.length} issue(s); missing or conflicting evidence was not promoted to PASS.`
    },
    auditedPullRequestNumbers: uniqueAudits
      .map((entry) => entry.prNumber)
      .sort((left, right) => left - right),
    issues: issues.map((entry) => ({ ...entry, evidenceRefs: [...entry.evidenceRefs] })),
    authority: {
      canMerge: false,
      canDeploy: false,
      canMutateProduction: false,
      canBypassApproval: false
    }
  };
}
