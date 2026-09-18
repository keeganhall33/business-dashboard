import assert from "node:assert/strict";
import test from "node:test";

import {
  V1_RELEASE_REVIEW_REQUIRED_CHECKS_V1,
  compileV1ReleaseReviewAuditV1,
  type V1ReleaseReviewAuditInputV1,
  type V1ReleaseReviewPullRequestAuditV1,
  type V1ReleaseReviewRequiredCheckIdV1
} from "@/lib/release/v1-release-review-audit-v1";
import {
  V1_RELEASE_REQUIRED_GATES_V1,
  compileV1ReleaseCertificateV1,
  type V1ReleaseGateEvidenceV1
} from "@/lib/release/v1-release-certificate-v1";

const RELEASE_SHA = "346b7ef39329c13d12b1ea4b95438f136d26a717";
const HEAD_SHA = "ecd566b7040368aa02e2084dd59bb45100fa1055";
const MERGE_SHA = "0635269bae88689aab09ecc5d1300450066a0b84";
const EVALUATED_AT = "2026-09-18T20:15:00.000Z";
const AUDITED_AT = "2026-09-18T20:10:00.000Z";
const MERGED_AT = "2026-09-18T20:00:00.000Z";

function check(checkId: V1ReleaseReviewRequiredCheckIdV1) {
  return {
    checkId,
    state: "PASS" as const,
    headSha: HEAD_SHA,
    observedAt: "2026-09-18T19:58:00.000Z",
    evidenceRefs: [`github://pull/1903/checks/${checkId.toLowerCase()}`]
  };
}

function prAudit(prNumber = 1903): V1ReleaseReviewPullRequestAuditV1 {
  return {
    prNumber,
    headSha: HEAD_SHA,
    merged: true,
    mergedAt: MERGED_AT,
    mergeCommitSha: MERGE_SHA,
    auditedAt: AUDITED_AT,
    requiredChecks: V1_RELEASE_REVIEW_REQUIRED_CHECKS_V1.map(check),
    approval: {
      state: "APPROVED",
      approvedHeadSha: HEAD_SHA,
      reviewerIndependent: true,
      observedAt: "2026-09-18T19:59:00.000Z",
      evidenceRefs: ["github://pull/1903/reviews/independent-exact-head"]
    },
    reviewThreads: {
      unresolvedCount: 0,
      observedAt: "2026-09-18T20:09:00.000Z",
      evidenceRefs: ["github://pull/1903/review-threads"]
    },
    diffIntegrity: "MEANINGFUL",
    ownershipIntegrity: "PASS",
    releaseInclusion: {
      state: "VERIFIED",
      releaseSha: RELEASE_SHA,
      evidenceRefs: ["github://compare/release/includes-pr-1903"]
    },
    evidenceRefs: ["github://pull/1903/audit"]
  };
}

function input(
  overrides: Partial<V1ReleaseReviewAuditInputV1> = {}
): V1ReleaseReviewAuditInputV1 {
  return {
    releaseSha: RELEASE_SHA,
    evaluatedAt: EVALUATED_AT,
    maxAuditAgeMs: 60 * 60 * 1000,
    requiredPullRequestNumbers: [1903],
    manifestEvidenceRefs: ["github://release/v1-blocking-pr-manifest"],
    pullRequests: [prAudit()],
    ...overrides
  };
}

function issueCodes(
  result: ReturnType<typeof compileV1ReleaseReviewAuditV1>
): string[] {
  return result.issues.map((entry) => entry.code);
}

test("fresh exact-head review evidence compiles into the canonical RELEASE_REVIEW_AUDIT gate", () => {
  const result = compileV1ReleaseReviewAuditV1(input());

  assert.equal(result.disposition, "PASS");
  assert.equal(result.issues.length, 0);
  assert.equal(result.evidence.gateId, "RELEASE_REVIEW_AUDIT");
  assert.equal(result.evidence.state, "PASS");
  assert.equal(result.evidence.freshness, "CURRENT");
  assert.equal(result.evidence.releaseSha, RELEASE_SHA);
  assert.deepEqual(result.auditedPullRequestNumbers, [1903]);
  assert.deepEqual(result.authority, {
    canMerge: false,
    canDeploy: false,
    canMutateProduction: false,
    canBypassApproval: false
  });

  const otherGates: V1ReleaseGateEvidenceV1[] = V1_RELEASE_REQUIRED_GATES_V1.filter(
    (gateId) => gateId !== "RELEASE_REVIEW_AUDIT"
  ).map((gateId) => ({
    gateId,
    state: "PASS",
    freshness: "CURRENT",
    observedAt: AUDITED_AT,
    evidenceRefs: [`github://release/${gateId.toLowerCase()}`],
    releaseSha: RELEASE_SHA,
    actionRequirement: "NONE"
  }));

  const certificate = compileV1ReleaseCertificateV1({
    releaseSha: RELEASE_SHA,
    generatedAt: EVALUATED_AT,
    gates: [...otherGates, result.evidence],
    finalAcceptance: { state: "PENDING" }
  });

  assert.equal(certificate.certifiedClaims.releaseReviewAudit, true);
  assert.equal(certificate.mechanicalState, "READY");
});

test("the manifest is authoritative: missing, duplicate, and unexpected PR audits fail closed", () => {
  const missing = compileV1ReleaseReviewAuditV1(
    input({ requiredPullRequestNumbers: [1903, 1911], pullRequests: [prAudit()] })
  );
  assert.equal(missing.disposition, "BLOCKED");
  assert.ok(issueCodes(missing).includes("MISSING_PR_AUDIT"));

  const duplicateAudit = compileV1ReleaseReviewAuditV1(
    input({ pullRequests: [prAudit(), prAudit()] })
  );
  assert.equal(duplicateAudit.disposition, "BLOCKED");
  assert.ok(issueCodes(duplicateAudit).includes("DUPLICATE_PR_AUDIT"));

  const unexpected = compileV1ReleaseReviewAuditV1(
    input({ pullRequests: [prAudit(), prAudit(1911)] })
  );
  assert.equal(unexpected.disposition, "BLOCKED");
  assert.ok(issueCodes(unexpected).includes("UNEXPECTED_PR_AUDIT"));
});

test("failed or unknown required checks cannot be laundered into release readiness", () => {
  const failedPr = prAudit();
  failedPr.requiredChecks = failedPr.requiredChecks.map((entry) =>
    entry.checkId === "BUILD" ? { ...entry, state: "FAIL" as const } : entry
  );
  const failed = compileV1ReleaseReviewAuditV1(input({ pullRequests: [failedPr] }));
  assert.equal(failed.disposition, "FAIL");
  assert.ok(issueCodes(failed).includes("REQUIRED_CHECK_FAILED"));

  const unknownPr = prAudit();
  unknownPr.requiredChecks = unknownPr.requiredChecks.map((entry) =>
    entry.checkId === "TEST" ? { ...entry, state: "UNKNOWN" as const } : entry
  );
  const unknown = compileV1ReleaseReviewAuditV1(input({ pullRequests: [unknownPr] }));
  assert.equal(unknown.disposition, "BLOCKED");
  assert.ok(issueCodes(unknown).includes("REQUIRED_CHECK_UNKNOWN"));
});

test("required checks and independent approval must be bound to the exact audited head", () => {
  const pr = prAudit();
  pr.requiredChecks = pr.requiredChecks.map((entry) =>
    entry.checkId === "TYPECHECK"
      ? { ...entry, headSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
      : entry
  );
  pr.approval = {
    ...pr.approval,
    approvedHeadSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  };

  const result = compileV1ReleaseReviewAuditV1(input({ pullRequests: [pr] }));

  assert.equal(result.disposition, "BLOCKED");
  assert.ok(issueCodes(result).includes("CHECK_HEAD_MISMATCH"));
  assert.ok(issueCodes(result).includes("APPROVAL_HEAD_MISMATCH"));
});

test("non-independent approval and unresolved review threads are known release failures", () => {
  const pr = prAudit();
  pr.approval = { ...pr.approval, reviewerIndependent: false };
  pr.reviewThreads = { ...pr.reviewThreads, unresolvedCount: 2 };

  const result = compileV1ReleaseReviewAuditV1(input({ pullRequests: [pr] }));

  assert.equal(result.disposition, "FAIL");
  assert.ok(issueCodes(result).includes("APPROVAL_NOT_INDEPENDENT"));
  assert.ok(issueCodes(result).includes("UNRESOLVED_REVIEW_THREADS"));
});

test("stale audit evidence remains explicitly stale instead of CURRENT", () => {
  const pr = prAudit();
  pr.auditedAt = "2026-09-18T18:00:00.000Z";

  const result = compileV1ReleaseReviewAuditV1(
    input({ maxAuditAgeMs: 30 * 60 * 1000, pullRequests: [pr] })
  );

  assert.equal(result.disposition, "BLOCKED");
  assert.equal(result.evidence.freshness, "STALE");
  assert.ok(issueCodes(result).includes("STALE_PR_AUDIT"));
});

test("release inclusion must be explicitly verified against the exact release SHA", () => {
  const pr = prAudit();
  pr.releaseInclusion = {
    ...pr.releaseInclusion,
    state: "UNKNOWN",
    releaseSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  };

  const result = compileV1ReleaseReviewAuditV1(input({ pullRequests: [pr] }));

  assert.equal(result.disposition, "BLOCKED");
  assert.ok(issueCodes(result).includes("RELEASE_INCLUSION_NOT_VERIFIED"));
  assert.ok(issueCodes(result).includes("RELEASE_INCLUSION_SHA_MISMATCH"));
});

test("empty or suspicious diffs and ownership violations are explicit failures", () => {
  const empty = prAudit();
  empty.diffIntegrity = "EMPTY";
  const emptyResult = compileV1ReleaseReviewAuditV1(input({ pullRequests: [empty] }));
  assert.equal(emptyResult.disposition, "FAIL");
  assert.ok(issueCodes(emptyResult).includes("DIFF_EMPTY"));

  const suspicious = prAudit();
  suspicious.diffIntegrity = "SUSPICIOUS";
  suspicious.ownershipIntegrity = "VIOLATION";
  const suspiciousResult = compileV1ReleaseReviewAuditV1(
    input({ pullRequests: [suspicious] })
  );
  assert.equal(suspiciousResult.disposition, "FAIL");
  assert.ok(issueCodes(suspiciousResult).includes("DIFF_SUSPICIOUS"));
  assert.ok(issueCodes(suspiciousResult).includes("OWNERSHIP_VIOLATION"));
});

test("unmerged or explicitly excluded PRs cannot satisfy a release-blocking manifest", () => {
  const pr = prAudit();
  pr.merged = false;
  pr.mergedAt = null;
  pr.mergeCommitSha = null;
  pr.releaseInclusion = { ...pr.releaseInclusion, state: "NOT_INCLUDED" };

  const result = compileV1ReleaseReviewAuditV1(input({ pullRequests: [pr] }));

  assert.equal(result.disposition, "FAIL");
  assert.ok(issueCodes(result).includes("PR_NOT_MERGED"));
  assert.ok(issueCodes(result).includes("RELEASE_INCLUSION_NOT_VERIFIED"));
});

test("secret-like provenance is removed and blocks the review audit", () => {
  const pr = prAudit();
  pr.approval = {
    ...pr.approval,
    evidenceRefs: ["token=do-not-emit-this-value"]
  };

  const result = compileV1ReleaseReviewAuditV1(input({ pullRequests: [pr] }));
  const serialized = JSON.stringify(result);

  assert.equal(result.disposition, "BLOCKED");
  assert.ok(issueCodes(result).includes("UNSAFE_PROVENANCE"));
  assert.equal(serialized.includes("do-not-emit-this-value"), false);
});

test("invalid or duplicate required check evidence fails closed", () => {
  const missingPr = prAudit();
  missingPr.requiredChecks = missingPr.requiredChecks.filter(
    (entry) => entry.checkId !== "DIFF_CHECK"
  );
  const missing = compileV1ReleaseReviewAuditV1(input({ pullRequests: [missingPr] }));
  assert.equal(missing.disposition, "BLOCKED");
  assert.ok(issueCodes(missing).includes("REQUIRED_CHECK_MISSING"));

  const duplicatePr = prAudit();
  duplicatePr.requiredChecks = [
    ...duplicatePr.requiredChecks,
    check("BUILD")
  ];
  const duplicate = compileV1ReleaseReviewAuditV1(
    input({ pullRequests: [duplicatePr] })
  );
  assert.equal(duplicate.disposition, "BLOCKED");
  assert.ok(issueCodes(duplicate).includes("REQUIRED_CHECK_DUPLICATE"));
});

test("compiler does not mutate caller-owned review evidence", () => {
  const value = input();
  const before = JSON.stringify(value);

  compileV1ReleaseReviewAuditV1(value);

  assert.equal(JSON.stringify(value), before);
});
