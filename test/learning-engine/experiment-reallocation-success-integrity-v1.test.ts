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
import { certifyExperimentReallocationSuccessIntegrityV1 } from "../../src/lib/learning-engine/experiment-reallocation-success-integrity-v1";
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

function decisionCandidate(id: string): DecisionCandidateV1 {
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
    evaluationWindow: { start: windowStart, end: windowEnd }
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

function experiment(observationOverrides: Partial<ExperimentObservationV1> = {}): ExperimentCandidateV1 {
  const id = "exp-a";
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
    observation: observation(observationOverrides),
    policyUpdateCandidate: null
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

function build(candidate: ExperimentCandidateV1, outcomeAssessment: ExperimentOutcomeAssessmentV1) {
  const portfolio = buildExperimentPortfolioV1({
    experiments: [candidate],
    capacity,
    generatedAt
  });
  const handoff = prepareExperimentReallocationHandoffV1({
    portfolio,
    experiment: candidate,
    assessment: outcomeAssessment,
    generatedAt
  });
  return { portfolio, handoff };
}

test("certifies a reallocation review only when the recorded success state matches the pre-registered rule", () => {
  const candidate = experiment();
  const { portfolio, handoff } = build(candidate, assessment());

  const result = certifyExperimentReallocationSuccessIntegrityV1({
    portfolio,
    experiment: candidate,
    handoff,
    generatedAt
  });

  assert.equal(handoff.status, "READY_FOR_REALLOCATION_REVIEW");
  assert.equal(result.status, "CERTIFIED_FOR_REALLOCATION_REVIEW");
  assert.equal(result.observedSuccessCriterionState, "MET");
  assert.equal(result.successRule?.metric, "qualified_conversion_rate");
  assert.equal(result.successRule?.threshold, 10);
  assert.equal(result.certifiedReallocationReviewId, handoff.reallocationReview?.reviewId);
  assert.ok(result.evidenceRefs.includes("outcome:exp-a"));
  assert.ok(result.evidenceRefs.includes("success-rule:exp-a"));
  assert.deepEqual(result.authority, {
    mutateExperiment: false,
    mutatePortfolio: false,
    changeAllocation: false,
    changeSpend: false,
    changePrice: false,
    publish: false,
    sendOutreach: false,
    promotePolicy: false,
    inferCausality: false,
    inferConfidence: false,
    inferMonetaryValue: false,
    externalAction: false,
    approvalBypass: false
  });
});

test("blocks a caller-supplied NOT_MET state when the canonical observation actually meets success", () => {
  const candidate = experiment();
  const { portfolio, handoff } = build(
    candidate,
    assessment({ result: "NEGATIVE", successCriterionState: "NOT_MET" })
  );

  assert.equal(handoff.status, "READY_FOR_REALLOCATION_REVIEW");
  assert.equal(handoff.reallocationReview?.requiresPortfolioRebuild, true);

  const result = certifyExperimentReallocationSuccessIntegrityV1({
    portfolio,
    experiment: candidate,
    handoff,
    generatedAt
  });

  assert.equal(result.status, "VERIFY_REQUIRED");
  assert.equal(result.observedSuccessCriterionState, "MET");
  assert.ok(result.reasons.includes("SUCCESS_CRITERION_STATE_MISMATCH"));
  assert.equal(result.certifiedReallocationReviewId, null);
  assert.equal(result.authority.changeAllocation, false);
});

test("certifies a mature evidence-backed NOT_MET state without treating it as causal", () => {
  const candidate = experiment({ value: 8 });
  const { portfolio, handoff } = build(
    candidate,
    assessment({ result: "NEGATIVE", successCriterionState: "NOT_MET" })
  );

  const result = certifyExperimentReallocationSuccessIntegrityV1({
    portfolio,
    experiment: candidate,
    handoff,
    generatedAt
  });

  assert.equal(result.status, "CERTIFIED_FOR_REALLOCATION_REVIEW");
  assert.equal(result.observedSuccessCriterionState, "NOT_MET");
  assert.equal(handoff.reallocationReview?.requiresPortfolioRebuild, true);
  assert.equal(result.authority.inferCausality, false);
  assert.equal(result.authority.inferConfidence, false);
  assert.equal(result.authority.inferMonetaryValue, false);
});

test("fails closed when the experiment evidence is changed after the canonical portfolio was built", () => {
  const original = experiment();
  const { portfolio, handoff } = build(original, assessment());
  const tampered = structuredClone(original);
  tampered.observation = observation({ evidenceRefs: ["outcome:not-in-portfolio"] });

  const result = certifyExperimentReallocationSuccessIntegrityV1({
    portfolio,
    experiment: tampered,
    handoff,
    generatedAt
  });

  assert.equal(result.status, "VERIFY_REQUIRED");
  assert.ok(result.reasons.includes("SUCCESS_EVIDENCE_NOT_IN_PORTFOLIO"));
  assert.equal(result.certifiedReallocationReviewId, null);
});

test("is deterministic and does not mutate canonical inputs", () => {
  const candidate = experiment();
  const { portfolio, handoff } = build(candidate, assessment());
  const candidateBefore = structuredClone(candidate);
  const portfolioBefore = structuredClone(portfolio);
  const handoffBefore = structuredClone(handoff);

  const first = certifyExperimentReallocationSuccessIntegrityV1({
    portfolio,
    experiment: candidate,
    handoff,
    generatedAt
  });
  const second = certifyExperimentReallocationSuccessIntegrityV1({
    portfolio,
    experiment: candidate,
    handoff,
    generatedAt
  });

  assert.equal(first.certificationId, second.certificationId);
  assert.deepEqual(candidate, candidateBefore);
  assert.deepEqual(portfolio, portfolioBefore);
  assert.deepEqual(handoff, handoffBefore);
});
