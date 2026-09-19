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

function portfolio(generatedAt = "2026-09-19T10:00:00.000Z"): ExperimentPortfolioV1 {
  return {
    contractVersion: "ExperimentPortfolioV1",
    policyVersion: EXPERIMENT_PORTFOLIO_POLICY_VERSION_V1,
    generatedAt,
    portfolioId: "portfolio-policy-freshness",
    decisionPortfolio: {} as ExperimentPortfolioV1["decisionPortfolio"],
    items: [{
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
    }],
    evidenceRefs: ["replication:a", "replication:b", "replication:stale"],
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
    }
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

const freshReplications = [
  replication("experiment-a", "replication:a"),
  replication("experiment-b", "replication:b")
];

test("a stale source portfolio cannot become ready even when fresh replications meet the threshold", () => {
  const result = reviewExperimentPolicyReplicationReadinessV1({
    portfolio: portfolio("2026-09-17T10:00:00.000Z"),
    targetExperimentId: "target",
    replications: freshReplications,
    reviewedAt,
    maxEvidenceAgeMs: 24 * 60 * 60 * 1000
  });

  assert.equal(result.state, "WAIT_FOR_REPLICATIONS");
  assert.ok(result.reasonCodes.includes("SOURCE_STALE"));
  assert.equal(result.authority.policyPromotionAuthorized, false);
});

test("extra stale or non-KNOWN replication evidence prevents a READY result instead of being ignored", () => {
  const stale = reviewExperimentPolicyReplicationReadinessV1({
    portfolio: portfolio(),
    targetExperimentId: "target",
    replications: [
      ...freshReplications,
      replication("experiment-stale", "replication:stale", {
        observedAt: "2026-09-17T10:00:00.000Z"
      })
    ],
    reviewedAt,
    maxEvidenceAgeMs: 24 * 60 * 60 * 1000
  });
  assert.equal(stale.state, "WAIT_FOR_REPLICATIONS");
  assert.ok(stale.reasonCodes.includes("REPLICATION_STALE"));

  const unknown = reviewExperimentPolicyReplicationReadinessV1({
    portfolio: portfolio(),
    targetExperimentId: "target",
    replications: [
      ...freshReplications,
      replication("experiment-unknown", "replication:stale", {
        truthState: "UNKNOWN"
      })
    ],
    reviewedAt,
    maxEvidenceAgeMs: 24 * 60 * 60 * 1000
  });
  assert.equal(unknown.state, "WAIT_FOR_REPLICATIONS");
  assert.ok(unknown.reasonCodes.includes("REPLICATION_NOT_KNOWN"));
});
