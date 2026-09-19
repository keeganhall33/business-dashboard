import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCompanyBrainDecisionApprovalAuditV1
} from "../../../src/lib/intelligence/organizational-learning/company-brain-decision-approval-audit-v1";
import {
  DECISION_MEMORY_BRIEF_POLICY_VERSION_V1,
  type DecisionMemoryBriefV1
} from "../../../src/lib/intelligence/organizational-learning/decision-memory-brief-v1";

function sourceBrief(
  overrides: Partial<DecisionMemoryBriefV1> = {}
): DecisionMemoryBriefV1 {
  return {
    contractVersion: "DecisionMemoryBriefV1",
    policyVersion: DECISION_MEMORY_BRIEF_POLICY_VERSION_V1,
    briefId: "decision-memory-brief:strategy-1",
    generatedAt: "2026-09-19T00:10:00.000Z",
    state: "READY",
    lineageState: "NO_PRIOR",
    freshnessState: "CURRENT",
    decisionId: "decision:strategy-1",
    decisionClass: "STRATEGY",
    decidedAt: "2026-09-18T18:00:00.000Z",
    selectedAlternativeId: "alt:focus-a",
    selectedAlternativeLabel: "Focus on the documented priority",
    rationale: {
      state: "KNOWN",
      value: "Use the documented evidence and preserve optionality while the decision remains reversible.",
      evidenceRefs: ["evidence:rationale:strategy-1"]
    },
    confidence: {
      state: "KNOWN",
      value: "MEDIUM",
      evidenceRefs: ["evidence:confidence:strategy-1"]
    },
    approval: {
      authorityClass: "KEEGAN_BUSINESS_JUDGMENT",
      approvalState: "APPROVED",
      approvedByRef: "person:keegan",
      approvedAt: "2026-09-18T18:05:00.000Z",
      evidenceRefs: ["evidence:approval:strategy-1"]
    },
    actionState: "TAKEN",
    outcome: {
      state: "NOT_OBSERVED",
      observedAt: null,
      assessment: null,
      attributionClass: "UNKNOWN",
      attributionEvidenceRefs: [],
      confounderCount: 0,
      lessonCandidateReviewRequired: false,
      causalityClaimedByBrief: false
    },
    changesSincePrior: [],
    revisitSignals: [],
    provenanceRefs: [
      "evidence:approval:strategy-1",
      "evidence:confidence:strategy-1",
      "evidence:rationale:strategy-1",
      "source:strategy:strategy-1"
    ],
    integrityFlags: [],
    limitations: ["Source brief limitation."],
    actionAuthority: {
      analysisOnly: true,
      persistenceAuthorized: false,
      externalActionAuthorized: false,
      pricingChangeAuthorized: false,
      negotiationAuthorized: false,
      spendAuthorized: false,
      publishAuthorized: false,
      approvalBypassAuthorized: false
    },
    ...overrides
  };
}

function compile(briefs: readonly DecisionMemoryBriefV1[]) {
  return compileCompanyBrainDecisionApprovalAuditV1({
    briefs,
    generatedAt: "2026-09-19T00:20:00.000Z",
    maximumSourceAgeMs: 60 * 60 * 1000
  });
}

test("preserves exact approver, approval timing, authority class, and evidence without inventing business meaning", () => {
  const result = compile([sourceBrief()]);

  assert.equal(result.state, "READY");
  assert.equal(result.summary.accepted, 1);
  assert.equal(result.summary.approved, 1);
  assert.equal(result.timeline[0]?.decisionId, "decision:strategy-1");
  assert.equal(result.timeline[0]?.authorityClass, "KEEGAN_BUSINESS_JUDGMENT");
  assert.equal(result.timeline[0]?.approvalState, "APPROVED");
  assert.equal(result.timeline[0]?.approvalRecordState, "APPROVED");
  assert.equal(result.timeline[0]?.approvedByRef, "person:keegan");
  assert.equal(result.timeline[0]?.approvedAt, "2026-09-18T18:05:00.000Z");
  assert.deepEqual(result.timeline[0]?.approvalEvidenceRefs, ["evidence:approval:strategy-1"]);
  assert.deepEqual(result.evidenceRefs, ["evidence:approval:strategy-1"]);
  assert.equal(result.timeline[0]?.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(result.timeline[0]?.confidence, "NOT_ESTABLISHED");
  assert.equal(result.timeline[0]?.monetaryValue, null);
  assert.equal(result.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(result.inferredOutcome, null);
  assert.equal(result.authority.approvalMutationAuthorized, false);
  assert.equal(result.authority.approvalBypassAuthorized, false);
  assert.equal(result.authority.externalActionAuthorized, false);
});

test("keeps not-required, pending, and unknown approvals explicit without manufacturing an approver", () => {
  const notRequired = sourceBrief({
    briefId: "decision-memory-brief:not-required",
    decisionId: "decision:not-required",
    decidedAt: "2026-09-18T17:00:00.000Z",
    approval: {
      authorityClass: "NO_APPROVAL_REQUIRED",
      approvalState: "NOT_REQUIRED",
      approvedByRef: null,
      approvedAt: null,
      evidenceRefs: ["evidence:approval:not-required"]
    },
    provenanceRefs: ["evidence:approval:not-required"]
  });
  const pending = sourceBrief({
    briefId: "decision-memory-brief:pending",
    decisionId: "decision:pending",
    decidedAt: "2026-09-18T16:00:00.000Z",
    approval: {
      authorityClass: "KEEGAN_BUSINESS_JUDGMENT",
      approvalState: "REQUIRED",
      approvedByRef: null,
      approvedAt: null,
      evidenceRefs: ["evidence:approval:pending"]
    },
    provenanceRefs: ["evidence:approval:pending"]
  });
  const unknown = sourceBrief({
    briefId: "decision-memory-brief:unknown",
    decisionId: "decision:unknown",
    decidedAt: "2026-09-18T15:00:00.000Z",
    approval: {
      authorityClass: "UNKNOWN_AUTHORITY",
      approvalState: "UNKNOWN",
      approvedByRef: null,
      approvedAt: null,
      evidenceRefs: []
    },
    provenanceRefs: []
  });

  const result = compile([unknown, pending, notRequired]);

  assert.equal(result.state, "READY");
  assert.equal(result.summary.notRequired, 1);
  assert.equal(result.summary.pending, 1);
  assert.equal(result.summary.unknown, 1);
  assert.equal(result.notRequired[0]?.approvedByRef, null);
  assert.equal(result.pending[0]?.approvedByRef, null);
  assert.equal(result.unknown[0]?.approvedByRef, null);
  assert.equal(result.pending[0]?.approvalRecordState, "PENDING");
  assert.equal(result.unknown[0]?.approvalRecordState, "UNKNOWN");
});

test("preserves a recorded rejection as approval history rather than an outcome judgment", () => {
  const rejected = sourceBrief({
    approval: {
      authorityClass: "KEEGAN_BUSINESS_JUDGMENT",
      approvalState: "REJECTED",
      approvedByRef: "person:keegan",
      approvedAt: "2026-09-18T18:06:00.000Z",
      evidenceRefs: ["evidence:approval:strategy-1"]
    },
    actionState: "REJECTED"
  });

  const result = compile([rejected]);

  assert.equal(result.state, "READY");
  assert.equal(result.summary.rejected, 1);
  assert.equal(result.rejected[0]?.approvalRecordState, "REJECTED");
  assert.equal(result.rejected[0]?.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(result.inferredOutcome, null);
});

test("fails closed when a final approval lacks actor, timestamp, or evidence provenance", () => {
  const missingActor = sourceBrief({
    briefId: "decision-memory-brief:missing-actor",
    decisionId: "decision:missing-actor",
    approval: {
      authorityClass: "KEEGAN_BUSINESS_JUDGMENT",
      approvalState: "APPROVED",
      approvedByRef: null,
      approvedAt: "2026-09-18T18:05:00.000Z",
      evidenceRefs: ["evidence:approval:strategy-1"]
    }
  });
  const missingEvidence = sourceBrief({
    briefId: "decision-memory-brief:missing-evidence",
    decisionId: "decision:missing-evidence",
    approval: {
      authorityClass: "KEEGAN_BUSINESS_JUDGMENT",
      approvalState: "APPROVED",
      approvedByRef: "person:keegan",
      approvedAt: "2026-09-18T18:05:00.000Z",
      evidenceRefs: []
    }
  });

  const result = compile([missingActor, missingEvidence]);

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.equal(result.summary.accepted, 0);
  assert.equal(result.summary.rejectedSources, 2);
  assert.ok(result.verificationReasons.includes("FINAL_APPROVAL_PROVENANCE_INCOMPLETE:decision:missing-actor"));
  assert.ok(result.verificationReasons.includes("FINAL_APPROVAL_PROVENANCE_INCOMPLETE:decision:missing-evidence"));
});

test("rejects approval evidence that is not bound into canonical source provenance", () => {
  const result = compile([sourceBrief({
    provenanceRefs: ["source:strategy:strategy-1"]
  })]);

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.equal(result.summary.accepted, 0);
  assert.ok(
    result.verificationReasons.includes(
      "APPROVAL_EVIDENCE_NOT_IN_PROVENANCE:decision:strategy-1"
    )
  );
});

test("rejects impossible approval chronology and nonfinal states carrying an approver", () => {
  const beforeDecision = sourceBrief({
    briefId: "decision-memory-brief:before-decision",
    decisionId: "decision:before-decision",
    approval: {
      authorityClass: "KEEGAN_BUSINESS_JUDGMENT",
      approvalState: "APPROVED",
      approvedByRef: "person:keegan",
      approvedAt: "2026-09-18T17:59:59.000Z",
      evidenceRefs: ["evidence:approval:strategy-1"]
    }
  });
  const fakePendingApprover = sourceBrief({
    briefId: "decision-memory-brief:fake-pending-approver",
    decisionId: "decision:fake-pending-approver",
    approval: {
      authorityClass: "KEEGAN_BUSINESS_JUDGMENT",
      approvalState: "REQUIRED",
      approvedByRef: "person:keegan",
      approvedAt: null,
      evidenceRefs: ["evidence:approval:strategy-1"]
    }
  });

  const result = compile([beforeDecision, fakePendingApprover]);

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.equal(result.summary.accepted, 0);
  assert.ok(result.verificationReasons.includes("APPROVAL_CHRONOLOGY_INVALID:decision:before-decision"));
  assert.ok(result.verificationReasons.includes("NONFINAL_APPROVAL_HAS_APPROVER:decision:fake-pending-approver"));
});

test("rejects stale, unverified-memory, approval-integrity-flagged, and widened-authority sources", () => {
  const stale = sourceBrief({
    briefId: "decision-memory-brief:stale",
    decisionId: "decision:stale",
    generatedAt: "2026-09-18T20:00:00.000Z"
  });
  const unverified = sourceBrief({
    briefId: "decision-memory-brief:unverified",
    decisionId: "decision:unverified",
    state: "VERIFY_LINEAGE"
  });
  const flagged = sourceBrief({
    briefId: "decision-memory-brief:flagged",
    decisionId: "decision:flagged",
    integrityFlags: ["APPROVAL_EVIDENCE_MISSING"]
  });
  const widened = sourceBrief({
    briefId: "decision-memory-brief:widened",
    decisionId: "decision:widened",
    actionAuthority: {
      analysisOnly: true,
      persistenceAuthorized: false,
      externalActionAuthorized: true,
      pricingChangeAuthorized: false,
      negotiationAuthorized: false,
      spendAuthorized: false,
      publishAuthorized: false,
      approvalBypassAuthorized: false
    }
  });

  const result = compile([stale, unverified, flagged, widened]);

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.equal(result.summary.accepted, 0);
  assert.ok(result.verificationReasons.includes("SOURCE_BRIEF_STALE:decision:stale"));
  assert.ok(result.verificationReasons.includes("SOURCE_DECISION_MEMORY_UNVERIFIED:decision:unverified"));
  assert.ok(result.verificationReasons.includes("SOURCE_APPROVAL_INTEGRITY_FLAG:decision:flagged"));
  assert.ok(result.verificationReasons.includes("SOURCE_AUTHORITY_WIDENED:decision:widened"));
});

test("suppresses duplicate decision or source brief identity instead of choosing one", () => {
  const duplicateDecisionA = sourceBrief({
    briefId: "decision-memory-brief:duplicate-a",
    decisionId: "decision:duplicate"
  });
  const duplicateDecisionB = sourceBrief({
    briefId: "decision-memory-brief:duplicate-b",
    decisionId: "decision:duplicate"
  });
  const duplicateBriefA = sourceBrief({
    briefId: "decision-memory-brief:same",
    decisionId: "decision:first"
  });
  const duplicateBriefB = sourceBrief({
    briefId: "decision-memory-brief:same",
    decisionId: "decision:second"
  });

  const result = compile([
    duplicateDecisionA,
    duplicateDecisionB,
    duplicateBriefA,
    duplicateBriefB
  ]);

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.equal(result.summary.accepted, 0);
  assert.ok(result.verificationReasons.includes("DUPLICATE_DECISION_ID:decision:duplicate"));
  assert.ok(result.verificationReasons.includes("DUPLICATE_SOURCE_BRIEF_ID:decision-memory-brief:same"));
});

test("is deterministic, deeply immutable, and leaves source briefs untouched", () => {
  const input = sourceBrief();
  const before = structuredClone(input);

  const first = compile([input]);
  const second = compile([input]);

  assert.equal(first.auditId, second.auditId);
  assert.deepEqual(first, second);
  assert.deepEqual(input, before);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.timeline));
  assert.ok(Object.isFrozen(first.timeline[0]));
  assert.ok(Object.isFrozen(first.timeline[0]?.approvalEvidenceRefs));
  assert.ok(Object.isFrozen(first.authority));
});
