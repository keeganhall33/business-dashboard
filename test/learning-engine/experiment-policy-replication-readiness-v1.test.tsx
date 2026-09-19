import assert from "node:assert/strict";
import test from "node:test";

import {
  reviewExperimentPolicyReplicationReadinessV1,
  type ExperimentPolicyReplicationEvidenceV1
} from "../../src/lib/learning-engine/experiment-policy-replication-readiness-v1";
import {
  EXPERIMENT_PORTFOLIO_POLICY_VERSION_V1,
  type ExperimentPortfolioV1
} from "../../src/lib/learning-engine/experiment-portfolio-v1";

const reviewedAt = "2026-09-19T12:00:00.000Z";
const statement = "Prefer the treatment only when the same eligibility rules hold.";
const rollbackPlan = "Restore the prior treatment when later governed evidence contradicts the pattern.";

function portfolio(
  overrides: Partial<ExperimentPortfolioV1> = {}
): ExperimentPortfolioV1 {
  return {
    contractVersion: "ExperimentPortfolioV1",
    policyVersion: EXPERIMENT_PORTFOLIO_POLICY_VERSION_V1,
    generatedAt: "2026-09-19T10:00:00.000Z",
    portfolioId: "portfolio-policy-review",
    decisionPortfolio: {} as ExperimentPortfolioV1["decisionPortfolio"],
    items: [
      {
        experimentId: "target",
        decisionCandidateId: "target",
        portfolioDisposition: "SELECTED",
        preRegistrationState: "VALID",
        verificationReasons: [],
        reviewState: "SUCCESS_REVIEW",
        attributionClass: "CORRELATIONAL",
        causalClaimAllowed: false,
        calibration: "WITHIN_PREDICTED_RANGE",
        confounders: [],
        policyUpdate: {
          mode: "SHADOW_ONLY",
          statement,
          rollbackPlan,
          minimumIndependentReplications: 2,
          evidencedIndependentReplications: 2,
          eligibleForIndependentReview: true,
          canPromoteAutomatically: false
        }
      }
    ],
    evidenceRefs: ["replication:a", "replication:b", "replication:c"],
    sourceRefs: ["source:portfolio"],
    audit: {
      experimentsConsidered: 1,
      preRegisteredValid: 1,
      verificationRequired: 0,
      observationsEvaluated: 1
    },
    authority: {
      launchExperiment: false,
      changeSpend: false,
      changePrice: false,
      publish: false,
      sendOutreach: false,
      promotePolicy: false
    },
    ...overrides
  };
}

function replication(
  experimentId: string,
  evidenceRef: string,
  overrides: Partial<ExperimentPolicyReplicationEvidenceV1> = {}
): ExperimentPolicyReplicationEvidenceV1 {
  return {
    experimentId,
    policyStatement: statement,
    rollbackPlan,
    assessment: "SUPPORTS_POLICY",
    truthState: "KNOWN",
    attributionClass: "CORRELATIONAL",
    observedAt: "2026-09-19T11:00:00.000Z",
    evidenceRefs: [evidenceRef],
    sourceRefs: [`source:${experimentId}`],
    confounders: [],
    ...overrides
  };
}

test("does not treat a legacy replication-reference count as proof of distinct replications", () => {
  const result = reviewExperimentPolicyReplicationReadinessV1({
    portfolio: portfolio(),
    targetExperimentId: "target",
    replications: [],
    reviewedAt,
    maxEvidenceAgeMs: 24 * 60 * 60 * 1000
  });

  assert.equal(result.state, "WAIT_FOR_REPLICATIONS");
  assert.equal(result.supportingReplicationCount, 0);
  assert.ok(result.reasonCodes.includes("MINIMUM_DISTINCT_SUPPORT_NOT_MET"));
  assert.equal(result.authority.policyPromotionAuthorized, false);
});

test("prepares independent review only from distinct fresh KNOWN experiments with bound evidence", () => {
  const result = reviewExperimentPolicyReplicationReadinessV1({
    portfolio: portfolio(),
    targetExperimentId: "target",
    replications: [
      replication("replication-experiment-a", "replication:a"),
      replication("replication-experiment-b", "replication:b", {
        attributionClass: "CAUSAL_SUPPORTED",
        confounders: ["seasonality"]
      })
    ],
    reviewedAt,
    maxEvidenceAgeMs: 24 * 60 * 60 * 1000
  });

  assert.equal(result.state, "READY_FOR_INDEPENDENT_REVIEW");
  assert.equal(result.distinctReplicationCount, 2);
  assert.equal(result.supportingReplicationCount, 2);
  assert.equal(result.causalSupportedReplicationCount, 1);
  assert.equal(result.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(result.confidence, "NOT_ESTABLISHED");
  assert.equal(result.monetaryValue, null);
  assert.equal(result.expectedOutcome, null);
  assert.deepEqual(result.confounders, ["seasonality"]);
  assert.equal(result.nextInternalStep, "INDEPENDENT_POLICY_REVIEW");
  assert.equal(result.authority.policyPromotionAuthorized, false);
  assert.equal(result.authority.rollbackExecutionAuthorized, false);
  assert.equal(result.authority.externalActionAuthorized, false);
});

test("fails closed when duplicate experiment identity or evidence could inflate replication count", () => {
  const duplicateExperiment = reviewExperimentPolicyReplicationReadinessV1({
    portfolio: portfolio(),
    targetExperimentId: "target",
    replications: [
      replication("same-experiment", "replication:a"),
      replication("same-experiment", "replication:b")
    ],
    reviewedAt,
    maxEvidenceAgeMs: 24 * 60 * 60 * 1000
  });
  assert.equal(duplicateExperiment.state, "VERIFY_REQUIRED");
  assert.ok(duplicateExperiment.reasonCodes.includes("DUPLICATE_REPLICATION_EXPERIMENT"));

  const duplicateEvidence = reviewExperimentPolicyReplicationReadinessV1({
    portfolio: portfolio(),
    targetExperimentId: "target",
    replications: [
      replication("experiment-a", "replication:a"),
      replication("experiment-b", "replication:a")
    ],
    reviewedAt,
    maxEvidenceAgeMs: 24 * 60 * 60 * 1000
  });
  assert.equal(duplicateEvidence.state, "VERIFY_REQUIRED");
  assert.ok(duplicateEvidence.reasonCodes.includes("DUPLICATE_REPLICATION_EVIDENCE"));
});

test("routes contradictory observed evidence to review without declaring the policy false or causal", () => {
  const result = reviewExperimentPolicyReplicationReadinessV1({
    portfolio: portfolio(),
    targetExperimentId: "target",
    replications: [
      replication("experiment-a", "replication:a"),
      replication("experiment-b", "replication:b", {
        assessment: "CONTRADICTS_POLICY",
        attributionClass: "NOT_ESTABLISHED"
      })
    ],
    reviewedAt,
    maxEvidenceAgeMs: 24 * 60 * 60 * 1000
  });

  assert.equal(result.state, "CONTRADICTION_REVIEW");
  assert.equal(result.contradictingReplicationCount, 1);
  assert.ok(result.reasonCodes.includes("CONTRADICTORY_REPLICATION_OBSERVED"));
  assert.equal(result.nextInternalStep, "REVIEW_CONTRADICTORY_REPLICATIONS");
  assert.equal(result.causalInterpretation, "NOT_ESTABLISHED");
});

test("fails closed on future, conflicted, mismatched, or unbound replication evidence", () => {
  const result = reviewExperimentPolicyReplicationReadinessV1({
    portfolio: portfolio(),
    targetExperimentId: "target",
    replications: [
      replication("experiment-a", "not-in-source", {
        truthState: "CONFLICTED",
        observedAt: "2026-09-20T00:00:00.000Z",
        policyStatement: "A different policy statement."
      }),
      replication("experiment-b", "replication:b", {
        rollbackPlan: "A different rollback plan."
      })
    ],
    reviewedAt,
    maxEvidenceAgeMs: 24 * 60 * 60 * 1000
  });

  assert.equal(result.state, "VERIFY_REQUIRED");
  assert.ok(result.reasonCodes.includes("REPLICATION_CONFLICTED"));
  assert.ok(result.reasonCodes.includes("REPLICATION_FROM_FUTURE"));
  assert.ok(result.reasonCodes.includes("REPLICATION_EVIDENCE_NOT_BOUND_TO_PORTFOLIO"));
  assert.ok(result.reasonCodes.includes("POLICY_STATEMENT_MISMATCH"));
  assert.ok(result.reasonCodes.includes("ROLLBACK_PLAN_MISMATCH"));
});

test("returns NOT_APPLICABLE when the target has no shadow policy candidate", () => {
  const noPolicy = portfolio({
    items: [
      {
        ...portfolio().items[0],
        policyUpdate: {
          mode: "NONE",
          statement: null,
          rollbackPlan: null,
          minimumIndependentReplications: null,
          evidencedIndependentReplications: 0,
          eligibleForIndependentReview: false,
          canPromoteAutomatically: false
        }
      }
    ]
  });

  const result = reviewExperimentPolicyReplicationReadinessV1({
    portfolio: noPolicy,
    targetExperimentId: "target",
    replications: [],
    reviewedAt,
    maxEvidenceAgeMs: 24 * 60 * 60 * 1000
  });

  assert.equal(result.state, "NOT_APPLICABLE");
  assert.ok(result.reasonCodes.includes("NO_SHADOW_POLICY_CANDIDATE"));
  assert.equal(result.nextInternalStep, null);
});
