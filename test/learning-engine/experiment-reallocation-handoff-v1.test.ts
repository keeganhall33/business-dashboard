import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExperimentPortfolioV1,
  type ExperimentCandidateV1,
  type ExperimentObservationV1
} from "../../src/lib/learning-engine/experiment-portfolio-v1";
import {
  prepareExperimentReallocationHandoffV1,
  type ExperimentOutcomeAssessmentV1
} from "../../src/lib/learning-engine/experiment-reallocation-handoff-v1";
import type { DecisionCandidateV1 } from "../../src/lib/strategy-engine/decision-portfolio-v1";

const generatedAt = "2026-09-28T00:00:00.000Z";
const windowStart = "2026-09-20T00:00:00.000Z";
const windowEnd = "2026-09-27T00:00:00.000Z";
const capacity = {
  keeganHours: 4,
  ioanaHours: 8,
  jeevesHours: 8,
  cashCents: 100_000,
  maxSelected: 3,
  maxKeeganDecisions: 1
};

function decisionCandidate(id: string, overrides: Partial<DecisionCandidateV1> = {}): DecisionCandidateV1 {
  return {
    id,
    title: id,
    candidateType: "EXPERIMENT",
    owner: "JEEVES",
    approvalClass: "REVIEW",
    evidenceState: "KNOWN",
    evidenceRefs: [`decision-evidence:${id}`],
    sourceRefs: [`decision-source:${id}`],
    monetaryCase: null,
    value: {
      strategicFit: 70,
      compoundingAdvantage: 65,
      relationshipAccess: 20,
      futureOptions: 60,
      learningValue: 90,
      urgency: 55,
      reversibility: 85
    },
    risk: { execution: 20, reputation: 10, rights: 5 },
    resources: { keeganHours: 0, ioanaHours: 0, jeevesHours: 2, cashCents: 0 },
    dependencyIds: [],
    conflictKeys: [],
    blockers: [],
    informationGainAction: "Verify the experiment design",
    safeNextStep: "Prepare the experiment brief for review",
    successMetric: "Qualified conversion rate",
    evaluationWindow: { start: windowStart, end: windowEnd },
    ...overrides
  };
}

function observation(overrides: Partial<ExperimentObservationV1> = {}): ExperimentObservationV1 {
  return {
    metric: "qualified_conversion_rate",
    unit: "PERCENT",
    value: 12,
    sampleSize: 200,
    observedAt: windowEnd,
    truthState: "KNOWN",
    evidenceRefs: ["outcome:exp-a"],
    attributionClass: "CORRELATIONAL",
    attributionEvidenceRefs: ["attribution:exp-a"],
    confounders: ["seasonality"],
    ...overrides
  };
}

function experiment(overrides: Partial<ExperimentCandidateV1> = {}): ExperimentCandidateV1 {
  const id = overrides.id ?? "exp-a";
  return {
    id,
    title: id,
    domain: "WEBSITE",
    decisionCandidate: decisionCandidate(id),
    registeredAt: "2026-09-19T00:00:00.000Z",
    causalHypothesis: "Reducing checkout ambiguity will improve qualified conversion rate.",
    comparisonDesign: {
      kind: "RANDOMIZED_HOLDOUT",
      assignmentUnit: "session",
      description: "Randomly hold out eligible sessions from the proposed treatment.",
      evidenceRefs: [`design:${id}`]
    },
    successRule: {
      id: `${id}:success`,
      kind: "SUCCESS",
      metric: "qualified_conversion_rate",
      unit: "PERCENT",
      comparator: "GTE",
      threshold: 10,
      notBeforeAt: windowEnd,
      minimumSampleSize: 100,
      evidenceRefs: [`success-rule:${id}`]
    },
    stopRule: {
      id: `${id}:stop`,
      kind: "STOP",
      metric: "qualified_conversion_rate",
      unit: "PERCENT",
      comparator: "LTE",
      threshold: 5,
      notBeforeAt: windowStart,
      minimumSampleSize: 100,
      evidenceRefs: [`stop-rule:${id}`]
    },
    scaleRule: {
      id: `${id}:scale`,
      kind: "SCALE",
      metric: "qualified_conversion_rate",
      unit: "PERCENT",
      comparator: "GTE",
      threshold: 15,
      notBeforeAt: windowEnd,
      minimumSampleSize: 100,
      evidenceRefs: [`scale-rule:${id}`]
    },
    prediction: {
      metric: "qualified_conversion_rate",
      unit: "PERCENT",
      low: 8,
      expected: 11,
      high: 14,
      evidenceRefs: [`prediction:${id}`]
    },
    knownConfounders: ["campaign_mix"],
    observation: observation({
      evidenceRefs: [`outcome:${id}`],
      attributionEvidenceRefs: [`attribution:${id}`]
    }),
    policyUpdateCandidate: null,
    ...overrides
  };
}

function assessment(overrides: Partial<ExperimentOutcomeAssessmentV1> = {}): ExperimentOutcomeAssessmentV1 {
  return {
    assessedAt: generatedAt,
    evidenceState: "KNOWN",
    freshness: "CURRENT",
    result: "POSITIVE",
    successCriterionState: "MET",
    materiality: "MATERIAL",
    classificationEvidenceRefs: ["assessment:classification"],
    materialityEvidenceRefs: ["assessment:materiality"],
    sourceRefs: ["assessment:source"],
    confounderRefs: ["confounder:campaign-mix", "confounder:seasonality"],
    assumptionUpdates: [],
    ...overrides
  };
}

function portfolioFor(candidate: ExperimentCandidateV1) {
  return buildExperimentPortfolioV1({
    experiments: [candidate],
    capacity,
    generatedAt
  });
}

test("closes a mature experiment into the existing reallocation review without granting mutation authority", () => {
  const candidate = experiment();
  const portfolio = portfolioFor(candidate);
  const result = prepareExperimentReallocationHandoffV1({
    portfolio,
    experiment: candidate,
    assessment: assessment(),
    generatedAt
  });

  assert.equal(portfolio.items[0]?.reviewState, "SUCCESS_REVIEW");
  assert.equal(result.status, "READY_FOR_REALLOCATION_REVIEW");
  assert.equal(result.outcome?.candidateId, "exp-a");
  assert.equal(result.outcome?.result, "POSITIVE");
  assert.equal(result.outcome?.successCriterionState, "MET");
  assert.equal(result.outcome?.attributionClass, "CORRELATIONAL");
  assert.equal(result.reallocationReview?.status, "NO_CHANGE");
  assert.equal(result.reallocationReview?.requiresPortfolioRebuild, false);
  assert.deepEqual(result.authority, {
    launchExperiment: false,
    mutatePortfolio: false,
    changeAllocation: false,
    changeSpend: false,
    changePrice: false,
    publish: false,
    sendOutreach: false,
    promotePolicy: false,
    inferCausality: false,
    approvalBypass: false
  });
});

test("routes an evidence-backed missed success criterion into portfolio reconsideration rather than reallocating directly", () => {
  const candidate = experiment({
    observation: observation({ value: 8 })
  });
  const portfolio = portfolioFor(candidate);
  const result = prepareExperimentReallocationHandoffV1({
    portfolio,
    experiment: candidate,
    assessment: assessment({ result: "NEGATIVE", successCriterionState: "NOT_MET" }),
    generatedAt
  });

  assert.equal(portfolio.items[0]?.reviewState, "INCONCLUSIVE");
  assert.equal(result.status, "READY_FOR_REALLOCATION_REVIEW");
  assert.equal(result.reallocationReview?.status, "REVIEW_REQUIRED");
  assert.equal(result.reallocationReview?.requiresPortfolioRebuild, true);
  assert.equal(result.reallocationReview?.candidateReviews[0]?.reviewState, "RECONSIDER");
  assert.ok(
    result.reallocationReview?.candidateReviews[0]?.reasons.includes("SELECTED_SUCCESS_CRITERION_NOT_MET")
  );
  assert.equal(result.authority.changeAllocation, false);
});

test("waits rather than inventing an outcome when measurement or explicit outcome assessment is missing", () => {
  const unmeasured = experiment({ observation: null });
  const unmeasuredPortfolio = portfolioFor(unmeasured);
  const waitingForMeasurement = prepareExperimentReallocationHandoffV1({
    portfolio: unmeasuredPortfolio,
    experiment: unmeasured,
    assessment: null,
    generatedAt
  });

  assert.equal(waitingForMeasurement.status, "WAIT");
  assert.ok(waitingForMeasurement.reasons.includes("OBSERVATION_NOT_AVAILABLE"));
  assert.ok(waitingForMeasurement.reasons.includes("OUTCOME_ASSESSMENT_REQUIRED"));
  assert.equal(waitingForMeasurement.outcome, null);
  assert.equal(waitingForMeasurement.reallocationReview, null);

  const measured = experiment();
  const measuredPortfolio = portfolioFor(measured);
  const waitingForAssessment = prepareExperimentReallocationHandoffV1({
    portfolio: measuredPortfolio,
    experiment: measured,
    assessment: null,
    generatedAt
  });

  assert.equal(waitingForAssessment.status, "WAIT");
  assert.deepEqual(waitingForAssessment.reasons, ["OUTCOME_ASSESSMENT_REQUIRED"]);
  assert.equal(waitingForAssessment.outcome, null);
});

test("fails closed on stale assessment or observation provenance that does not belong to the source portfolio", () => {
  const candidate = experiment();
  const portfolio = portfolioFor(candidate);

  const stale = prepareExperimentReallocationHandoffV1({
    portfolio,
    experiment: candidate,
    assessment: assessment({ freshness: "STALE" }),
    generatedAt
  });
  assert.equal(stale.status, "VERIFY_REQUIRED");
  assert.ok(stale.reasons.includes("ASSESSMENT_STALE"));
  assert.equal(stale.outcome, null);

  const tampered = structuredClone(candidate);
  tampered.observation = observation({ evidenceRefs: ["outcome:not-in-source-portfolio"] });
  const mismatched = prepareExperimentReallocationHandoffV1({
    portfolio,
    experiment: tampered,
    assessment: assessment(),
    generatedAt
  });
  assert.equal(mismatched.status, "VERIFY_REQUIRED");
  assert.ok(mismatched.reasons.includes("OBSERVATION_PROVENANCE_NOT_IN_PORTFOLIO"));
  assert.equal(mismatched.reallocationReview, null);
});

test("preserves causal support only when the experiment portfolio already granted it", () => {
  const candidate = experiment({
    observation: observation({
      attributionClass: "CAUSAL_SUPPORTED",
      attributionEvidenceRefs: ["randomization-analysis:exp-a"]
    })
  });
  const portfolio = portfolioFor(candidate);
  const result = prepareExperimentReallocationHandoffV1({
    portfolio,
    experiment: candidate,
    assessment: assessment(),
    generatedAt
  });

  assert.equal(portfolio.items[0]?.causalClaimAllowed, true);
  assert.equal(result.status, "READY_FOR_REALLOCATION_REVIEW");
  assert.equal(result.outcome?.attributionClass, "CAUSAL");
  assert.deepEqual(result.outcome?.attributionEvidenceRefs, ["randomization-analysis:exp-a"]);
  assert.equal(result.authority.inferCausality, false);
});

test("is deterministic and does not mutate experiment, portfolio, or assessment inputs", () => {
  const candidate = experiment();
  const portfolio = portfolioFor(candidate);
  const outcomeAssessment = assessment();
  const candidateBefore = structuredClone(candidate);
  const portfolioBefore = structuredClone(portfolio);
  const assessmentBefore = structuredClone(outcomeAssessment);

  const first = prepareExperimentReallocationHandoffV1({
    portfolio,
    experiment: candidate,
    assessment: outcomeAssessment,
    generatedAt
  });
  const second = prepareExperimentReallocationHandoffV1({
    portfolio,
    experiment: candidate,
    assessment: outcomeAssessment,
    generatedAt
  });

  assert.equal(first.handoffId, second.handoffId);
  assert.equal(first.outcome?.outcomeId, second.outcome?.outcomeId);
  assert.deepEqual(candidate, candidateBefore);
  assert.deepEqual(portfolio, portfolioBefore);
  assert.deepEqual(outcomeAssessment, assessmentBefore);
});
