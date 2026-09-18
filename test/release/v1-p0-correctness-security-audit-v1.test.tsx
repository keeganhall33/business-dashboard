import assert from "node:assert/strict";
import test from "node:test";

import {
  V1_P0_REQUIRED_INVARIANTS_V1,
  compileV1P0CorrectnessSecurityAuditV1,
  type V1P0CorrectnessSecurityAuditInputV1,
  type V1P0InvariantObservationV1,
  type V1P0IssueAssessmentV1
} from "@/lib/release/v1-p0-correctness-security-audit-v1";
import {
  V1_RELEASE_REQUIRED_GATES_V1,
  compileV1ReleaseCertificateV1,
  type V1ReleaseGateEvidenceV1
} from "@/lib/release/v1-release-certificate-v1";

const RELEASE_SHA = "346b7ef39329c13d12b1ea4b95438f136d26a717";
const EVALUATED_AT = "2026-09-18T20:15:00.000Z";
const OBSERVED_AT = "2026-09-18T20:10:00.000Z";
const MAX_AGE_MS = 60 * 60 * 1000;

function assessment(
  issueNumber: number,
  overrides: Partial<V1P0IssueAssessmentV1> = {}
): V1P0IssueAssessmentV1 {
  return {
    issueNumber,
    releaseSha: RELEASE_SHA,
    observedAt: OBSERVED_AT,
    disposition: "NOT_V1_BLOCKER",
    category: "OTHER",
    evidenceRefs: [`github://issues/${issueNumber}#v1-scope-audit`],
    actionRequirement: "NONE",
    ...overrides
  };
}

function invariant(
  invariantId: V1P0InvariantObservationV1["invariantId"],
  overrides: Partial<V1P0InvariantObservationV1> = {}
): V1P0InvariantObservationV1 {
  return {
    invariantId,
    state: "PASS",
    releaseSha: RELEASE_SHA,
    observedAt: OBSERVED_AT,
    evidenceRefs: [`github://release-evidence/${invariantId.toLowerCase()}`],
    actionRequirement: "NONE",
    ...overrides
  };
}

function allInvariants(): V1P0InvariantObservationV1[] {
  return V1_P0_REQUIRED_INVARIANTS_V1.map((invariantId) => invariant(invariantId));
}

function input(
  overrides: Partial<V1P0CorrectnessSecurityAuditInputV1> = {}
): V1P0CorrectnessSecurityAuditInputV1 {
  return {
    releaseSha: RELEASE_SHA,
    evaluatedAt: EVALUATED_AT,
    maxEvidenceAgeMs: MAX_AGE_MS,
    issueManifest: {
      scope: "OPEN_P0_ISSUES",
      releaseSha: RELEASE_SHA,
      observedAt: OBSERVED_AT,
      issueNumbers: [9001, 9002],
      evidenceRefs: ["github://issues-search/open-p0-at-release-sha"]
    },
    issueAssessments: [assessment(9001), assessment(9002)],
    invariants: allInvariants(),
    ...overrides
  };
}

function blockerCodes(
  result: ReturnType<typeof compileV1P0CorrectnessSecurityAuditV1>
): string[] {
  return result.blockers.map((entry) => entry.code);
}

test("explicitly assessed nonblocking P0 inventory plus passing invariants emits canonical PASS evidence", () => {
  const result = compileV1P0CorrectnessSecurityAuditV1(input());

  assert.equal(result.blockers.length, 0);
  assert.equal(result.gateEvidence.gateId, "P0_CORRECTNESS_SECURITY");
  assert.equal(result.gateEvidence.state, "PASS");
  assert.equal(result.gateEvidence.freshness, "CURRENT");
  assert.equal(result.gateEvidence.releaseSha, RELEASE_SHA);
  assert.equal(result.gateEvidence.actionRequirement, "NONE");
  assert.equal(result.manifestIssueCount, 2);
  assert.equal(result.assessedIssueCount, 2);
  assert.deepEqual(result.authority, {
    canCloseIssue: false,
    canMerge: false,
    canDeploy: false,
    canMutateProduction: false,
    canBypassApproval: false
  });
});

test("the compiled gate is directly compatible with the canonical V1 release certificate", () => {
  const audit = compileV1P0CorrectnessSecurityAuditV1(input());
  const gates: V1ReleaseGateEvidenceV1[] = V1_RELEASE_REQUIRED_GATES_V1.map((gateId) =>
    gateId === "P0_CORRECTNESS_SECURITY"
      ? audit.gateEvidence
      : {
          gateId,
          state: "PASS",
          freshness: "CURRENT",
          observedAt: OBSERVED_AT,
          evidenceRefs: [`github://release-evidence/${gateId.toLowerCase()}`],
          releaseSha: RELEASE_SHA,
          actionRequirement: "NONE"
        }
  );

  const certificate = compileV1ReleaseCertificateV1({
    releaseSha: RELEASE_SHA,
    generatedAt: EVALUATED_AT,
    gates,
    finalAcceptance: { state: "PENDING" }
  });

  assert.equal(certificate.mechanicalState, "READY");
  assert.equal(certificate.certifiedClaims.p0CorrectnessSecurity, true);
});

test("an explicitly open V1 P0 blocker keeps the release gate blocked without inferring resolution", () => {
  const result = compileV1P0CorrectnessSecurityAuditV1(
    input({
      issueAssessments: [
        assessment(9001, {
          disposition: "V1_BLOCKER",
          category: "SECURITY",
          actionRequirement: "KEEGAN"
        }),
        assessment(9002)
      ]
    })
  );

  assert.equal(result.gateEvidence.state, "BLOCKED");
  assert.equal(result.gateEvidence.freshness, "CURRENT");
  assert.equal(result.gateEvidence.actionRequirement, "KEEGAN");
  assert.ok(blockerCodes(result).includes("OPEN_V1_P0_BLOCKER"));
  assert.ok(
    result.blockers.some(
      (entry) => entry.issueNumber === 9001 && entry.code === "OPEN_V1_P0_BLOCKER"
    )
  );
});

test("unknown issue scope or category fails closed instead of being treated as nonblocking", () => {
  const result = compileV1P0CorrectnessSecurityAuditV1(
    input({
      issueAssessments: [
        assessment(9001, { disposition: "UNKNOWN", category: "UNKNOWN" }),
        assessment(9002)
      ]
    })
  );

  assert.equal(result.gateEvidence.state, "BLOCKED");
  assert.equal(result.gateEvidence.freshness, "UNKNOWN");
  assert.ok(blockerCodes(result).includes("ISSUE_SCOPE_UNKNOWN"));
});

test("manifest and assessments must describe the exact same open-P0 issue set", () => {
  const result = compileV1P0CorrectnessSecurityAuditV1(
    input({
      issueAssessments: [assessment(9001), assessment(9999)]
    })
  );

  assert.equal(result.gateEvidence.state, "BLOCKED");
  assert.ok(blockerCodes(result).includes("MISSING_ISSUE_ASSESSMENT"));
  assert.ok(blockerCodes(result).includes("UNEXPECTED_ISSUE_ASSESSMENT"));
});

test("duplicate manifest issues, assessments, or invariant observations cannot be reconciled opportunistically", () => {
  const result = compileV1P0CorrectnessSecurityAuditV1(
    input({
      issueManifest: {
        scope: "OPEN_P0_ISSUES",
        releaseSha: RELEASE_SHA,
        observedAt: OBSERVED_AT,
        issueNumbers: [9001, 9001, 9002],
        evidenceRefs: ["github://issues-search/open-p0-at-release-sha"]
      },
      issueAssessments: [assessment(9001), assessment(9001), assessment(9002)],
      invariants: [...allInvariants(), invariant("PRIVACY_SECRET_BOUNDARY")]
    })
  );

  assert.equal(result.gateEvidence.state, "BLOCKED");
  assert.ok(blockerCodes(result).includes("DUPLICATE_MANIFEST_ISSUE"));
  assert.ok(blockerCodes(result).includes("DUPLICATE_ISSUE_ASSESSMENT"));
  assert.ok(blockerCodes(result).includes("DUPLICATE_INVARIANT"));
});

test("missing or non-passing required invariants block the gate", () => {
  const invariants = allInvariants()
    .filter((entry) => entry.invariantId !== "VISIBLE_V1_ROUTE_ACTION_INTEGRITY")
    .map((entry) =>
      entry.invariantId === "FAIL_CLOSED_TRUTH_STATES"
        ? invariant("FAIL_CLOSED_TRUTH_STATES", { state: "CONFLICTED" })
        : entry
    );
  const result = compileV1P0CorrectnessSecurityAuditV1(input({ invariants }));

  assert.equal(result.gateEvidence.state, "BLOCKED");
  assert.ok(blockerCodes(result).includes("MISSING_INVARIANT"));
  assert.ok(blockerCodes(result).includes("INVARIANT_NOT_PASS"));
});

test("stale, future, and release-SHA-mismatched evidence cannot certify current P0 safety", () => {
  const result = compileV1P0CorrectnessSecurityAuditV1(
    input({
      issueManifest: {
        scope: "OPEN_P0_ISSUES",
        releaseSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        observedAt: "2026-09-18T18:00:00.000Z",
        issueNumbers: [9001, 9002],
        evidenceRefs: ["github://issues-search/stale-open-p0"]
      },
      issueAssessments: [
        assessment(9001, { observedAt: "2026-09-18T20:16:00.000Z" }),
        assessment(9002)
      ],
      invariants: allInvariants().map((entry) =>
        entry.invariantId === "PRIVACY_SECRET_BOUNDARY"
          ? invariant("PRIVACY_SECRET_BOUNDARY", {
              releaseSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
            })
          : entry
      )
    })
  );

  assert.equal(result.gateEvidence.state, "BLOCKED");
  assert.equal(result.gateEvidence.freshness, "STALE");
  assert.ok(blockerCodes(result).includes("MANIFEST_SHA_MISMATCH"));
  assert.ok(blockerCodes(result).includes("MANIFEST_STALE_EVIDENCE"));
  assert.ok(blockerCodes(result).includes("ISSUE_FUTURE_EVIDENCE"));
  assert.ok(blockerCodes(result).includes("INVARIANT_SHA_MISMATCH"));
});

test("unsafe provenance is rejected and secret-like text is never echoed into release output", () => {
  const secretRef = "token=do-not-echo-this-secret";
  const result = compileV1P0CorrectnessSecurityAuditV1(
    input({
      invariants: allInvariants().map((entry) =>
        entry.invariantId === "PRIVACY_SECRET_BOUNDARY"
          ? invariant("PRIVACY_SECRET_BOUNDARY", { evidenceRefs: [secretRef] })
          : entry
      )
    })
  );

  assert.equal(result.gateEvidence.state, "BLOCKED");
  assert.ok(blockerCodes(result).includes("INVARIANT_UNSAFE_PROVENANCE"));
  assert.equal(JSON.stringify(result).includes("do-not-echo-this-secret"), false);
  assert.deepEqual(result.gateEvidence.evidenceRefs, []);
});

test("an evidence-backed empty open-P0 manifest can pass without manufacturing issue records", () => {
  const result = compileV1P0CorrectnessSecurityAuditV1(
    input({
      issueManifest: {
        scope: "OPEN_P0_ISSUES",
        releaseSha: RELEASE_SHA,
        observedAt: OBSERVED_AT,
        issueNumbers: [],
        evidenceRefs: ["github://issues-search/open-p0-none"]
      },
      issueAssessments: []
    })
  );

  assert.equal(result.gateEvidence.state, "PASS");
  assert.equal(result.manifestIssueCount, 0);
  assert.equal(result.assessedIssueCount, 0);
});

test("the compiler does not mutate caller-owned audit evidence", () => {
  const value = input();
  const before = JSON.stringify(value);

  compileV1P0CorrectnessSecurityAuditV1(value);

  assert.equal(JSON.stringify(value), before);
});
