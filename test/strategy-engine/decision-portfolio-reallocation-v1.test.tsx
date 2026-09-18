import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDecisionPortfolioV1,
  type DecisionCandidateV1
} from "../../src/lib/strategy-engine/decision-portfolio-v1";
import {
  DecisionPortfolioReallocationError,
  reviewDecisionPortfolioReallocationV1,
  type DecisionOutcomeObservationV1
} from "../../src/lib/strategy-engine/decision-portfolio-reallocation-v1";

const portfolioGeneratedAt = "2026-09-15T04:00:00.000Z";
const reviewedAt = "2026-09-18T04:00:00.000Z";

function candidate(id: string, strategicFit: number): DecisionCandidateV1 {
  return {
    id,
    title: id,
    candidateType: "DECISION",
    owner: "JEEVES",
    approvalClass: "NONE",
    evidenceState: "KNOWN",
    evidenceRefs: [`portfolio-evidence:${id}`],
    sourceRefs: [`portfolio-source:${id}`],
    monetaryCase: null,
    value: {
      strategicFit,
      compoundingAdvantage: strategicFit,
      relationshipAccess: strategicFit,
      futureOptions: strategicFit,
      learningValue: strategicFit,
      urgency: strategicFit,
      reversibility: strategicFit
    },
    risk: { execution: 10, reputation: 10, rights: 10 },
    resources: { keeganHours: 0, ioanaHours: 0, jeevesHours: 1, cashCents: 0 },
    dependencyIds: [],
    conflictKeys: [],
    blockers: [],
    informationGainAction: null,
    safeNextStep: `Prepare ${id}`,
    successMetric: `Evaluate ${id}`,
    evaluationWindow: { start: "2026-09-15", end: "2026-09-16" }
  };
}

function portfolio() {
  return buildDecisionPortfolioV1({
    candidates: [candidate("selected", 90), candidate("deferred", 20)],
    capacity: {
      keeganHours: 4,
      ioanaHours: 4,
      jeevesHours: 1,
      cashCents: 0,
      maxSelected: 1,
      maxKeeganDecisions: 1
    },
    generatedAt: portfolioGeneratedAt
  });
}

function outcome(
  candidateId: string,
  overrides: Partial<DecisionOutcomeObservationV1> = {}
): DecisionOutcomeObservationV1 {
  return {
    outcomeId: `outcome:${candidateId}`,
    candidateId,
    measuredAt: "2026-09-17T04:00:00.000Z",
    evidenceState: "KNOWN",
    evidenceRefs: [`outcome-evidence:${candidateId}`],
    sourceRefs: [`outcome-source:${candidateId}`],
    result: "NEGATIVE",
    successCriterionState: "NOT_MET",
    materiality: "MATERIAL",
    materialityEvidenceRefs: [`materiality:${candidateId}`],
    attributionClass: "NOT_ESTABLISHED",
    attributionEvidenceRefs: [],
    confounderRefs: [],
    assumptionUpdates: [],
    ...overrides
  };
}

test("routes a material selected-candidate miss to reallocation review without mutating the portfolio", () => {
  const source = portfolio();
  const snapshot = structuredClone(source);
  const review = reviewDecisionPortfolioReallocationV1({
    portfolio: source,
    outcomes: [outcome("selected")],
    reviewedAt
  });

  assert.equal(review.status, "REVIEW_REQUIRED");
  assert.equal(review.requiresPortfolioRebuild, true);
  assert.equal(review.candidateReviews[0].previousDisposition, "SELECTED");
  assert.equal(review.candidateReviews[0].reviewState, "RECONSIDER");
  assert.ok(review.candidateReviews[0].reasons.includes("SELECTED_SUCCESS_CRITERION_NOT_MET"));
  assert.equal(review.candidateReviews[0].attributionClass, "NOT_ESTABLISHED");
  assert.deepEqual(source, snapshot);
  assert.ok(Object.isFrozen(review));
  assert.ok(Object.isFrozen(review.candidateReviews[0]));
  assert.deepEqual(review.authority, {
    portfolioMutation: false,
    scoreMutation: false,
    monetaryMutation: false,
    confidenceMutation: false,
    externalAction: false,
    approvalBypass: false
  });
});

test("reconsiders a non-selected candidate only from explicit material success evidence", () => {
  const review = reviewDecisionPortfolioReallocationV1({
    portfolio: portfolio(),
    outcomes: [outcome("deferred", {
      result: "POSITIVE",
      successCriterionState: "MET",
      attributionClass: "CORRELATIONAL"
    })],
    reviewedAt
  });

  assert.equal(review.status, "REVIEW_REQUIRED");
  assert.equal(review.candidateReviews[0].previousDisposition, "DEFERRED");
  assert.equal(review.candidateReviews[0].reviewState, "RECONSIDER");
  assert.ok(review.candidateReviews[0].reasons.includes("NONSELECTED_SUCCESS_CRITERION_MET"));
  assert.equal(review.candidateReviews[0].attributionClass, "CORRELATIONAL");
});

test("does not reopen allocation when current selected evidence met its criterion", () => {
  const review = reviewDecisionPortfolioReallocationV1({
    portfolio: portfolio(),
    outcomes: [outcome("selected", {
      result: "POSITIVE",
      successCriterionState: "MET"
    })],
    reviewedAt
  });

  assert.equal(review.status, "NO_CHANGE");
  assert.equal(review.requiresPortfolioRebuild, false);
  assert.equal(review.candidateReviews[0].reviewState, "HOLD");
  assert.ok(review.candidateReviews[0].reasons.includes("CURRENT_DISPOSITION_NOT_CONTRADICTED"));
});

test("material contradicted assumptions trigger review but unsupported or unknown assumptions fail closed", () => {
  const contradicted = reviewDecisionPortfolioReallocationV1({
    portfolio: portfolio(),
    outcomes: [outcome("selected", {
      result: "NEUTRAL",
      successCriterionState: "MET",
      assumptionUpdates: [{
        assumptionId: "assumption:capacity",
        status: "CONTRADICTED",
        relevance: "MATERIAL",
        evidenceRefs: ["evidence:capacity"]
      }]
    })],
    reviewedAt
  });
  assert.equal(contradicted.candidateReviews[0].reviewState, "RECONSIDER");
  assert.deepEqual(contradicted.candidateReviews[0].contradictedMaterialAssumptionIds, ["assumption:capacity"]);

  const unresolved = reviewDecisionPortfolioReallocationV1({
    portfolio: portfolio(),
    outcomes: [outcome("selected", {
      assumptionUpdates: [{
        assumptionId: "assumption:rights",
        status: "UNRESOLVED",
        relevance: "UNKNOWN",
        evidenceRefs: []
      }]
    })],
    reviewedAt
  });
  assert.equal(unresolved.status, "VERIFICATION_REQUIRED");
  assert.equal(unresolved.requiresPortfolioRebuild, false);
  assert.equal(unresolved.candidateReviews[0].reviewState, "VERIFY");
  assert.deepEqual(unresolved.candidateReviews[0].unresolvedAssumptionIds, ["assumption:rights"]);
});

test("fails closed on inferred, stale, unknown, conflicted, or unproven outcome evidence", () => {
  for (const evidenceState of ["INFERRED", "UNKNOWN", "STALE", "CONFLICTED"] as const) {
    const review = reviewDecisionPortfolioReallocationV1({
      portfolio: portfolio(),
      outcomes: [outcome("selected", { evidenceState })],
      reviewedAt
    });
    assert.equal(review.status, "VERIFICATION_REQUIRED");
    assert.equal(review.candidateReviews[0].reviewState, "VERIFY");
    assert.ok(review.candidateReviews[0].reasons.includes(`OUTCOME_EVIDENCE_${evidenceState}`));
  }

  const noProvenance = reviewDecisionPortfolioReallocationV1({
    portfolio: portfolio(),
    outcomes: [outcome("selected", { evidenceRefs: [], sourceRefs: [] })],
    reviewedAt
  });
  assert.equal(noProvenance.status, "VERIFICATION_REQUIRED");
  assert.ok(noProvenance.candidateReviews[0].reasons.includes("OUTCOME_PROVENANCE_REQUIRED"));
});

test("requires evidence for materiality and strong attribution while preserving correlation as correlation", () => {
  const missingMaterialityEvidence = reviewDecisionPortfolioReallocationV1({
    portfolio: portfolio(),
    outcomes: [outcome("selected", { materialityEvidenceRefs: [] })],
    reviewedAt
  });
  assert.equal(missingMaterialityEvidence.candidateReviews[0].reviewState, "VERIFY");

  const unsupportedCausal = reviewDecisionPortfolioReallocationV1({
    portfolio: portfolio(),
    outcomes: [outcome("selected", { attributionClass: "CAUSAL", attributionEvidenceRefs: [] })],
    reviewedAt
  });
  assert.equal(unsupportedCausal.candidateReviews[0].reviewState, "VERIFY");
  assert.ok(unsupportedCausal.candidateReviews[0].reasons.includes("ATTRIBUTION_EVIDENCE_REQUIRED"));

  const correlational = reviewDecisionPortfolioReallocationV1({
    portfolio: portfolio(),
    outcomes: [outcome("selected", { attributionClass: "CORRELATIONAL" })],
    reviewedAt
  });
  assert.equal(correlational.candidateReviews[0].attributionClass, "CORRELATIONAL");
});

test("does not treat non-material or inconclusive outcomes as allocation proof", () => {
  const nonMaterial = reviewDecisionPortfolioReallocationV1({
    portfolio: portfolio(),
    outcomes: [outcome("selected", { materiality: "NON_MATERIAL", materialityEvidenceRefs: [] })],
    reviewedAt
  });
  assert.equal(nonMaterial.status, "NO_CHANGE");
  assert.equal(nonMaterial.candidateReviews[0].reviewState, "HOLD");
  assert.ok(nonMaterial.candidateReviews[0].reasons.includes("NON_MATERIAL_OUTCOME"));

  const inconclusive = reviewDecisionPortfolioReallocationV1({
    portfolio: portfolio(),
    outcomes: [outcome("selected", {
      result: "INCONCLUSIVE",
      successCriterionState: "INCONCLUSIVE"
    })],
    reviewedAt
  });
  assert.equal(inconclusive.status, "VERIFICATION_REQUIRED");
  assert.equal(inconclusive.candidateReviews[0].reviewState, "VERIFY");
  assert.ok(inconclusive.candidateReviews[0].reasons.includes("SUCCESS_CRITERION_UNRESOLVED"));
});

test("rejects future, orphaned, duplicate, ambiguous, and unsupported resolved-assumption input", () => {
  assert.throws(
    () => reviewDecisionPortfolioReallocationV1({
      portfolio: portfolio(),
      outcomes: [outcome("selected", { measuredAt: "2026-09-19T04:00:00.000Z" })],
      reviewedAt
    }),
    (error: unknown) => error instanceof DecisionPortfolioReallocationError && error.code === "FUTURE_OUTCOME"
  );

  assert.throws(
    () => reviewDecisionPortfolioReallocationV1({
      portfolio: portfolio(),
      outcomes: [outcome("missing")],
      reviewedAt
    }),
    (error: unknown) => error instanceof DecisionPortfolioReallocationError && error.code === "UNKNOWN_CANDIDATE"
  );

  const same = outcome("selected");
  assert.throws(
    () => reviewDecisionPortfolioReallocationV1({
      portfolio: portfolio(),
      outcomes: [same, structuredClone(same)],
      reviewedAt
    }),
    (error: unknown) => error instanceof DecisionPortfolioReallocationError && error.code === "DUPLICATE_OUTCOME"
  );

  assert.throws(
    () => reviewDecisionPortfolioReallocationV1({
      portfolio: portfolio(),
      outcomes: [same, { ...outcome("selected"), outcomeId: "outcome:selected:2" }],
      reviewedAt
    }),
    (error: unknown) => error instanceof DecisionPortfolioReallocationError && error.code === "AMBIGUOUS_CANDIDATE_OUTCOME"
  );

  assert.throws(
    () => reviewDecisionPortfolioReallocationV1({
      portfolio: portfolio(),
      outcomes: [outcome("selected", {
        assumptionUpdates: [{
          assumptionId: "assumption:no-proof",
          status: "CONTRADICTED",
          relevance: "MATERIAL",
          evidenceRefs: []
        }]
      })],
      reviewedAt
    }),
    (error: unknown) => error instanceof DecisionPortfolioReallocationError && error.code === "ASSUMPTION_EVIDENCE_REQUIRED"
  );
});

test("fails closed when final criterion evidence arrives before the evaluation window is complete", () => {
  const review = reviewDecisionPortfolioReallocationV1({
    portfolio: portfolio(),
    outcomes: [outcome("selected", { measuredAt: "2026-09-15T12:00:00.000Z" })],
    reviewedAt
  });
  assert.equal(review.status, "VERIFICATION_REQUIRED");
  assert.ok(review.candidateReviews[0].reasons.includes("SUCCESS_CRITERION_EVALUATED_EARLY"));
});

test("is deterministic and never rewrites score, economics, confidence, approval, or action authority", () => {
  const source = portfolio();
  const inputOutcome = outcome("selected", {
    attributionClass: "CONTRIBUTORY",
    attributionEvidenceRefs: ["evidence:attribution"],
    confounderRefs: ["confounder:seasonality"]
  });
  const first = reviewDecisionPortfolioReallocationV1({ portfolio: source, outcomes: [inputOutcome], reviewedAt });
  const second = reviewDecisionPortfolioReallocationV1({ portfolio: source, outcomes: [structuredClone(inputOutcome)], reviewedAt });

  assert.equal(first.reviewId, second.reviewId);
  assert.deepEqual(first, second);
  assert.equal(first.candidateReviews[0].attributionClass, "CONTRIBUTORY");
  assert.deepEqual(first.candidateReviews[0].confounderRefs, ["confounder:seasonality"]);
  assert.equal(first.authority.portfolioMutation, false);
  assert.equal(first.authority.scoreMutation, false);
  assert.equal(first.authority.monetaryMutation, false);
  assert.equal(first.authority.confidenceMutation, false);
  assert.equal(first.authority.externalAction, false);
  assert.equal(first.authority.approvalBypass, false);
  assert.equal(source.items.find((item) => item.candidate.id === "selected")?.candidate.approvalClass, "NONE");
});
