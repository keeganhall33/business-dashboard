import assert from "node:assert/strict";
import test from "node:test";

import {
  EXPERIMENT_POLICY_PROMOTION_REVIEW_POLICY_VERSION_V1,
  EXPERIMENT_POLICY_PROMOTION_REVIEW_VERSION_V1,
  reviewExperimentPolicyPromotionReadinessV1,
  type ExperimentPolicyIndependentReviewEvidenceV1,
  type ExperimentPolicyPromotionAuditEntryV1,
  type ExperimentPolicyPromotionReviewInputV1,
  type ExperimentPolicyShadowEvaluationEvidenceV1
} from "../../src/lib/learning-engine/experiment-policy-promotion-review-v1";
import {
  EXPERIMENT_POLICY_REPLICATION_READINESS_POLICY_VERSION_V1,
  EXPERIMENT_POLICY_REPLICATION_READINESS_VERSION_V1,
  type ExperimentPolicyReplicationReadinessV1
} from "../../src/lib/learning-engine/experiment-policy-replication-readiness-v1";

const SOURCE_REVIEWED_AT = "2026-09-18T10:00:00.000Z";
const REVIEWED_AT = "2026-09-19T10:00:00.000Z";
const PORTFOLIO_ID = "experiment-portfolio:2026-09-18";
const EXPERIMENT_ID = "experiment:checkout-proof";
const STATEMENT = "Use the evidence-backed checkout treatment only in the governed scope.";
const ROLLBACK = "Return to the prior checkout treatment after governed rollback review.";

const AUTHORITY = {
  analysisOnly: true,
  experimentLaunchAuthorized: false,
  policyPromotionAuthorized: false,
  policyMutationAuthorized: false,
  rollbackExecutionAuthorized: false,
  allocationChangeAuthorized: false,
  spendChangeAuthorized: false,
  priceChangeAuthorized: false,
  externalActionAuthorized: false,
  persistenceAuthorized: false,
  approvalBypassAuthorized: false
} as const;

function readiness(
  overrides: Partial<ExperimentPolicyReplicationReadinessV1> = {}
): ExperimentPolicyReplicationReadinessV1 {
  return {
    contractVersion: EXPERIMENT_POLICY_REPLICATION_READINESS_VERSION_V1,
    policyVersion: EXPERIMENT_POLICY_REPLICATION_READINESS_POLICY_VERSION_V1,
    reviewedAt: SOURCE_REVIEWED_AT,
    portfolioId: PORTFOLIO_ID,
    targetExperimentId: EXPERIMENT_ID,
    state: "READY_FOR_INDEPENDENT_REVIEW",
    reasonCodes: [],
    policyStatement: STATEMENT,
    rollbackPlan: ROLLBACK,
    minimumDistinctReplications: 2,
    distinctReplicationCount: 2,
    supportingReplicationCount: 2,
    contradictingReplicationCount: 0,
    inconclusiveReplicationCount: 0,
    causalSupportedReplicationCount: 0,
    consideredExperimentIds: ["experiment:replication-a", "experiment:replication-b"],
    evidenceRefs: ["evidence:replication-a", "evidence:replication-b"],
    sourceRefs: ["source:experiment-a", "source:experiment-b"],
    confounders: ["confounder:seasonality-reviewed"],
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    expectedOutcome: null,
    nextInternalStep: "INDEPENDENT_POLICY_REVIEW",
    limitations: ["Source readiness remains review-only."],
    authority: AUTHORITY,
    ...overrides
  };
}

function independentReview(
  overrides: Partial<ExperimentPolicyIndependentReviewEvidenceV1> = {}
): ExperimentPolicyIndependentReviewEvidenceV1 {
  return {
    reviewId: "policy-review:independent:1",
    reviewedAt: "2026-09-18T11:00:00.000Z",
    reviewerRef: "reviewer:independent:1",
    portfolioId: PORTFOLIO_ID,
    targetExperimentId: EXPERIMENT_ID,
    policyStatement: STATEMENT,
    rollbackPlan: ROLLBACK,
    disposition: "APPROVE_FOR_PROMOTION_DECISION",
    evidenceRefs: ["evidence:independent-review:1"],
    sourceRefs: ["source:review-record:1"],
    ...overrides
  };
}

function shadowEvaluation(
  overrides: Partial<ExperimentPolicyShadowEvaluationEvidenceV1> = {}
): ExperimentPolicyShadowEvaluationEvidenceV1 {
  return {
    evaluationId: "shadow-evaluation:1",
    evaluatedAt: "2026-09-18T12:00:00.000Z",
    mode: "SHADOW_ONLY",
    portfolioId: PORTFOLIO_ID,
    targetExperimentId: EXPERIMENT_ID,
    policyStatement: STATEMENT,
    rollbackPlan: ROLLBACK,
    result: "PASS",
    evidenceRefs: ["evidence:shadow-evaluation:1"],
    sourceRefs: ["source:shadow-run:1"],
    confounders: ["confounder:shadow-traffic-mix"],
    ...overrides
  };
}

function auditHistory(
  review = independentReview(),
  shadow = shadowEvaluation()
): ExperimentPolicyPromotionAuditEntryV1[] {
  const identity = {
    portfolioId: PORTFOLIO_ID,
    targetExperimentId: EXPERIMENT_ID,
    policyStatement: STATEMENT,
    rollbackPlan: ROLLBACK
  };
  return [
    {
      eventId: "audit:replication-readiness",
      eventType: "REPLICATION_READINESS",
      occurredAt: SOURCE_REVIEWED_AT,
      artifactRef: `replication-readiness:${PORTFOLIO_ID}:${EXPERIMENT_ID}:${SOURCE_REVIEWED_AT}`,
      ...identity,
      evidenceRefs: ["audit-evidence:replication"],
      sourceRefs: ["audit-source:replication"]
    },
    {
      eventId: "audit:independent-review",
      eventType: "INDEPENDENT_REVIEW",
      occurredAt: review.reviewedAt,
      artifactRef: review.reviewId,
      ...identity,
      evidenceRefs: ["audit-evidence:review"],
      sourceRefs: ["audit-source:review"]
    },
    {
      eventId: "audit:shadow-evaluation",
      eventType: "SHADOW_EVALUATION",
      occurredAt: shadow.evaluatedAt,
      artifactRef: shadow.evaluationId,
      ...identity,
      evidenceRefs: ["audit-evidence:shadow"],
      sourceRefs: ["audit-source:shadow"]
    }
  ];
}

function input(
  overrides: Partial<ExperimentPolicyPromotionReviewInputV1> = {}
): ExperimentPolicyPromotionReviewInputV1 {
  const review = overrides.independentReview === undefined
    ? independentReview()
    : overrides.independentReview;
  const shadow = overrides.shadowEvaluation === undefined
    ? shadowEvaluation()
    : overrides.shadowEvaluation;
  return {
    replicationReadiness: readiness(),
    independentReview: review,
    shadowEvaluation: shadow,
    auditHistory: overrides.auditHistory ?? auditHistory(review ?? independentReview(), shadow ?? shadowEvaluation()),
    reviewedAt: REVIEWED_AT,
    maximumSourceAgeMs: 7 * 24 * 60 * 60 * 1000,
    maximumGovernanceEvidenceAgeMs: 7 * 24 * 60 * 60 * 1000,
    ...overrides
  };
}

test("prepares a governed promotion decision only after exact replication, review, shadow, rollback, and audit evidence", () => {
  const result = reviewExperimentPolicyPromotionReadinessV1(input());

  assert.equal(result.contractVersion, EXPERIMENT_POLICY_PROMOTION_REVIEW_VERSION_V1);
  assert.equal(result.policyVersion, EXPERIMENT_POLICY_PROMOTION_REVIEW_POLICY_VERSION_V1);
  assert.equal(result.state, "READY_FOR_PROMOTION_DECISION");
  assert.ok(result.reasonCodes.includes("GOVERNANCE_REQUIREMENTS_SATISFIED"));
  assert.equal(result.nextInternalStep, "HUMAN_OR_GOVERNED_PROMOTION_DECISION");
  assert.equal(result.policyPromotionAuthorized, false);
  assert.equal(result.policyMutationAuthorized, false);
  assert.equal(result.experimentLaunchAuthorized, false);
  assert.equal(result.rollbackExecutionAuthorized, false);
  assert.equal(result.externalActionAuthorized, false);
  assert.equal(result.approvalBypassAuthorized, false);
  assert.equal(result.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(result.confidence, "NOT_ESTABLISHED");
  assert.equal(result.monetaryValue, null);
  assert.equal(result.expectedOutcome, null);
});

test("contradictory canonical replication evidence routes back to experiment review", () => {
  const result = reviewExperimentPolicyPromotionReadinessV1(input({
    replicationReadiness: readiness({
      state: "CONTRADICTION_REVIEW",
      reasonCodes: ["CONTRADICTORY_REPLICATION_OBSERVED"],
      supportingReplicationCount: 2,
      contradictingReplicationCount: 1,
      distinctReplicationCount: 3,
      nextInternalStep: "REVIEW_CONTRADICTORY_REPLICATIONS"
    })
  }));

  assert.equal(result.state, "RETURN_TO_EXPERIMENT_REVIEW");
  assert.ok(result.reasonCodes.includes("SOURCE_CONTRADICTION_REVIEW"));
  assert.equal(result.policyPromotionAuthorized, false);
});

test("canonical replication evidence still waiting cannot be promoted by later caller claims", () => {
  const result = reviewExperimentPolicyPromotionReadinessV1(input({
    replicationReadiness: readiness({
      state: "WAIT_FOR_REPLICATIONS",
      supportingReplicationCount: 1,
      distinctReplicationCount: 1,
      nextInternalStep: "COLLECT_DISTINCT_REPLICATION_EVIDENCE"
    })
  }));

  assert.equal(result.state, "WAIT_FOR_GOVERNANCE_EVIDENCE");
  assert.ok(result.reasonCodes.includes("SOURCE_WAITING_FOR_REPLICATIONS"));
});

test("tampered READY source counts fail closed instead of laundering readiness", () => {
  const result = reviewExperimentPolicyPromotionReadinessV1(input({
    replicationReadiness: readiness({
      supportingReplicationCount: 1,
      minimumDistinctReplications: 2
    })
  }));

  assert.equal(result.state, "VERIFY_REQUIRED");
  assert.ok(result.reasonCodes.includes("SOURCE_STATE_INCONSISTENT"));
});

test("missing canonical replication provenance fails closed", () => {
  const result = reviewExperimentPolicyPromotionReadinessV1(input({
    replicationReadiness: readiness({ evidenceRefs: [] })
  }));

  assert.equal(result.state, "VERIFY_REQUIRED");
  assert.ok(result.reasonCodes.includes("SOURCE_STATE_INCONSISTENT"));
});

test("widened source authority fails closed", () => {
  const result = reviewExperimentPolicyPromotionReadinessV1(input({
    replicationReadiness: readiness({
      authority: { ...AUTHORITY, policyPromotionAuthorized: true } as never
    })
  }));

  assert.equal(result.state, "VERIFY_REQUIRED");
  assert.ok(result.reasonCodes.includes("SOURCE_AUTHORITY_WIDENED"));
});

test("independent reviewer rejection returns the candidate to experiments without demoting policy automatically", () => {
  const review = independentReview({ disposition: "REJECT_RETURN_TO_EXPERIMENTS" });
  const result = reviewExperimentPolicyPromotionReadinessV1(input({
    independentReview: review,
    auditHistory: auditHistory(review, shadowEvaluation())
  }));

  assert.equal(result.state, "RETURN_TO_EXPERIMENT_REVIEW");
  assert.ok(result.reasonCodes.includes("INDEPENDENT_REVIEW_REJECTED"));
  assert.equal(result.policyMutationAuthorized, false);
});

test("a failed shadow evaluation returns to experiments and never executes rollback", () => {
  const shadow = shadowEvaluation({ result: "FAIL" });
  const result = reviewExperimentPolicyPromotionReadinessV1(input({
    shadowEvaluation: shadow,
    auditHistory: auditHistory(independentReview(), shadow)
  }));

  assert.equal(result.state, "RETURN_TO_EXPERIMENT_REVIEW");
  assert.ok(result.reasonCodes.includes("SHADOW_EVALUATION_FAILED"));
  assert.equal(result.rollbackExecutionAuthorized, false);
});

test("inconclusive shadow evidence waits rather than inventing a pass", () => {
  const shadow = shadowEvaluation({ result: "INCONCLUSIVE" });
  const result = reviewExperimentPolicyPromotionReadinessV1(input({
    shadowEvaluation: shadow,
    auditHistory: auditHistory(independentReview(), shadow)
  }));

  assert.equal(result.state, "WAIT_FOR_GOVERNANCE_EVIDENCE");
  assert.ok(result.reasonCodes.includes("SHADOW_EVALUATION_INCONCLUSIVE"));
});

test("policy or rollback identity drift in governance evidence fails closed", () => {
  const result = reviewExperimentPolicyPromotionReadinessV1(input({
    independentReview: independentReview({ rollbackPlan: "Different rollback." })
  }));

  assert.equal(result.state, "VERIFY_REQUIRED");
  assert.ok(result.reasonCodes.includes("INDEPENDENT_REVIEW_IDENTITY_MISMATCH"));
});

test("missing or mismatched audit stages cannot produce fake promotion readiness", () => {
  const history = auditHistory().filter((entry) => entry.eventType !== "SHADOW_EVALUATION");
  const missing = reviewExperimentPolicyPromotionReadinessV1(input({ auditHistory: history }));
  assert.equal(missing.state, "WAIT_FOR_GOVERNANCE_EVIDENCE");
  assert.ok(missing.reasonCodes.includes("AUDIT_SHADOW_EVALUATION_EVENT_MISSING"));

  const mismatchedHistory = auditHistory().map((entry) =>
    entry.eventType === "INDEPENDENT_REVIEW"
      ? { ...entry, artifactRef: "review:wrong" }
      : entry
  );
  const mismatched = reviewExperimentPolicyPromotionReadinessV1(input({ auditHistory: mismatchedHistory }));
  assert.equal(mismatched.state, "VERIFY_REQUIRED");
  assert.ok(mismatched.reasonCodes.includes("AUDIT_ARTIFACT_MISMATCH"));
});

test("stale governance evidence waits, while future evidence fails verification", () => {
  const staleReview = independentReview({ reviewedAt: "2026-09-18T11:00:00.000Z" });
  const stale = reviewExperimentPolicyPromotionReadinessV1(input({
    independentReview: staleReview,
    maximumGovernanceEvidenceAgeMs: 60 * 60 * 1000,
    auditHistory: auditHistory(staleReview, shadowEvaluation())
  }));
  assert.equal(stale.state, "WAIT_FOR_GOVERNANCE_EVIDENCE");
  assert.ok(stale.reasonCodes.includes("INDEPENDENT_REVIEW_STALE"));

  const futureShadow = shadowEvaluation({ evaluatedAt: "2026-09-20T12:00:00.000Z" });
  const future = reviewExperimentPolicyPromotionReadinessV1(input({
    shadowEvaluation: futureShadow,
    auditHistory: auditHistory(independentReview(), futureShadow)
  }));
  assert.equal(future.state, "VERIFY_REQUIRED");
  assert.ok(future.reasonCodes.includes("SHADOW_EVALUATION_FROM_FUTURE"));
});

test("duplicate audit event identities fail closed", () => {
  const history = auditHistory();
  const duplicated = [...history, { ...history[2], eventType: "CANDIDATE_CREATED" as const }];
  const result = reviewExperimentPolicyPromotionReadinessV1(input({ auditHistory: duplicated }));

  assert.equal(result.state, "VERIFY_REQUIRED");
  assert.ok(result.reasonCodes.includes("AUDIT_ENTRY_DUPLICATE"));
});

test("preserves caller inputs and deeply freezes the review output", () => {
  const request = input();
  const before = JSON.stringify(request);
  const result = reviewExperimentPolicyPromotionReadinessV1(request);

  assert.equal(JSON.stringify(request), before);
  assert.equal(Object.isFrozen(request), false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.reasonCodes), true);
  assert.equal(Object.isFrozen(result.limitations), true);
});
