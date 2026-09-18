import assert from "node:assert/strict";
import test from "node:test";

import type {
  ExperimentPortfolioItemV1,
  ExperimentPortfolioV1
} from "@/lib/learning-engine/experiment-portfolio-v1";
import {
  buildExperimentReallocationReviewV1
} from "@/lib/strategy-engine/experiment-reallocation-review-v1";
import type {
  DecisionCandidateV1,
  DecisionPortfolioItemV1
} from "@/lib/strategy-engine/decision-portfolio-v1";

const GENERATED_AT = "2026-09-18T16:00:00.000Z";
const REVIEWED_AT = "2026-09-18T18:00:00.000Z";

function candidate(overrides: Partial<DecisionCandidateV1> = {}): DecisionCandidateV1 {
  return {
    id: "experiment:checkout-friction",
    title: "Checkout friction test",
    candidateType: "EXPERIMENT",
    owner: "JEEVES",
    approvalClass: "REVIEW",
    evidenceState: "KNOWN",
    evidenceRefs: ["evidence:experiment-definition"],
    sourceRefs: ["source:experiment-registry"],
    monetaryCase: null,
    value: {
      strategicFit: 70,
      compoundingAdvantage: 65,
      relationshipAccess: 0,
      futureOptions: 60,
      learningValue: 90,
      urgency: 55,
      reversibility: 90
    },
    risk: { execution: 20, reputation: 10, rights: 0 },
    resources: { keeganHours: 0.5, ioanaHours: 0, jeevesHours: 3, cashCents: 0 },
    dependencyIds: [],
    conflictKeys: [],
    blockers: [],
    informationGainAction: null,
    safeNextStep: "Review the pre-registered test plan.",
    successMetric: "checkout_completion_rate",
    evaluationWindow: {
      start: "2026-09-10T00:00:00.000Z",
      end: "2026-09-17T23:59:59.000Z"
    },
    ...overrides
  };
}

function decisionItem(overrides: Partial<DecisionPortfolioItemV1> = {}): DecisionPortfolioItemV1 {
  return {
    candidate: candidate(),
    disposition: "SELECTED",
    score: {
      monetaryExpectedCents: null,
      monetaryScore: 0,
      strategicScore: 72,
      riskPenalty: 3,
      totalScore: 69,
      components: {}
    },
    rank: 1,
    rationale: "Selected for bounded learning value.",
    exclusionReason: null,
    displacedBy: [],
    ...overrides
  };
}

function experimentItem(overrides: Partial<ExperimentPortfolioItemV1> = {}): ExperimentPortfolioItemV1 {
  return {
    experimentId: "experiment:checkout-friction",
    decisionCandidateId: "experiment:checkout-friction",
    portfolioDisposition: "SELECTED",
    preRegistrationState: "VALID",
    verificationReasons: [],
    reviewState: "STOP_REVIEW",
    attributionClass: "NOT_ESTABLISHED",
    causalClaimAllowed: false,
    calibration: "BELOW_PREDICTED_RANGE",
    confounders: [],
    policyUpdate: {
      mode: "NONE",
      statement: null,
      rollbackPlan: null,
      minimumIndependentReplications: null,
      evidencedIndependentReplications: 0,
      eligibleForIndependentReview: false,
      canPromoteAutomatically: false
    },
    ...overrides
  };
}

function portfolio(overrides: Partial<ExperimentPortfolioV1> = {}): ExperimentPortfolioV1 {
  const item = decisionItem();
  return {
    contractVersion: "ExperimentPortfolioV1",
    policyVersion: "experiment_portfolio_policy_v1.0.0",
    generatedAt: GENERATED_AT,
    portfolioId: "experiment_portfolio:test",
    decisionPortfolio: {
      contractVersion: "DecisionPortfolioV1",
      policyVersion: "decision_portfolio_policy_v1.0.0",
      generatedAt: GENERATED_AT,
      portfolioId: "decision_portfolio:test",
      items: [item],
      selectedIds: [item.candidate.id],
      ownerQueues: {
        KEEGAN: [],
        IOANA: [],
        JEEVES: [item.candidate.id]
      },
      keeganDecisionIds: [],
      informationGainIds: [],
      usedCapacity: {
        keeganHours: 0.5,
        ioanaHours: 0,
        jeevesHours: 3,
        cashCents: 0
      },
      remainingCapacity: {
        keeganHours: 9.5,
        ioanaHours: 10,
        jeevesHours: 37,
        cashCents: 100000
      },
      evidenceRefs: ["evidence:decision-portfolio"],
      sourceRefs: ["source:decision-portfolio"],
      audit: {
        candidatesConsidered: 1,
        feasiblePortfoliosEvaluated: 1,
        duplicateCandidatesSuppressed: 0,
        exactOptimization: true
      }
    },
    items: [experimentItem()],
    evidenceRefs: ["evidence:experiment-definition", "evidence:observation"],
    sourceRefs: ["source:experiment-registry", "source:measurement"],
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

test("pre-registered stop review requests internal allocation reassessment without causal claims", () => {
  const result = buildExperimentReallocationReviewV1({
    portfolio: portfolio(),
    reviewedAt: REVIEWED_AT
  });

  assert.deepEqual(result.readyExperimentIds, ["experiment:checkout-friction"]);
  assert.deepEqual(result.waitingExperimentIds, []);
  assert.deepEqual(result.verificationExperimentIds, []);
  assert.equal(result.signals[0]?.state, "READY_FOR_REVIEW");
  assert.deepEqual(result.signals[0]?.reasonCodes, ["STOP_RULE_TRIGGERED"]);
  assert.equal(result.signals[0]?.nextInternalStep, "REVIEW_REDUCE_OR_STOP_ALLOCATION");
  assert.equal(result.signals[0]?.causalInterpretation, "NOT_INFERRED_HERE");
  assert.equal(result.signals[0]?.confidence, "NOT_ESTABLISHED");
  assert.equal(result.signals[0]?.monetaryValue, null);
  assert.equal(result.authority.allocationChangeAuthorized, false);
  assert.equal(result.authority.experimentStopAuthorized, false);
  assert.equal(result.authority.externalActionAuthorized, false);
});

test("scale review waits for upstream causal support before surfacing an allocation review", () => {
  const result = buildExperimentReallocationReviewV1({
    portfolio: portfolio({
      items: [experimentItem({ reviewState: "SCALE_REVIEW" })]
    }),
    reviewedAt: REVIEWED_AT
  });

  assert.deepEqual(result.readyExperimentIds, []);
  assert.deepEqual(result.waitingExperimentIds, ["experiment:checkout-friction"]);
  assert.equal(result.signals[0]?.state, "WAIT_FOR_ATTRIBUTION");
  assert.deepEqual(result.signals[0]?.reasonCodes, [
    "SCALE_ATTRIBUTION_NOT_ESTABLISHED",
    "SCALE_RULE_TRIGGERED"
  ]);
  assert.equal(
    result.signals[0]?.nextInternalStep,
    "COLLECT_ATTRIBUTION_EVIDENCE_BEFORE_SCALE_REVIEW"
  );
});

test("causally supported scale result becomes review-ready but still cannot mutate allocation", () => {
  const result = buildExperimentReallocationReviewV1({
    portfolio: portfolio({
      items: [
        experimentItem({
          reviewState: "SCALE_REVIEW",
          attributionClass: "CAUSAL_SUPPORTED",
          causalClaimAllowed: true,
          confounders: ["seasonality reviewed"]
        })
      ]
    }),
    reviewedAt: REVIEWED_AT
  });

  assert.deepEqual(result.readyExperimentIds, ["experiment:checkout-friction"]);
  assert.equal(result.signals[0]?.state, "READY_FOR_REVIEW");
  assert.deepEqual(result.signals[0]?.reasonCodes, ["SCALE_RULE_TRIGGERED"]);
  assert.equal(result.signals[0]?.nextInternalStep, "REVIEW_SCALE_ALLOCATION");
  assert.equal(result.signals[0]?.upstreamAttributionClass, "CAUSAL_SUPPORTED");
  assert.equal(result.signals[0]?.upstreamCausalClaimAllowed, true);
  assert.deepEqual(result.signals[0]?.confounders, ["seasonality reviewed"]);
  assert.equal(result.authority.experimentScaleAuthorized, false);
  assert.equal(result.authority.portfolioMutationAuthorized, false);
});

test("ordinary success does not silently create a resource reallocation instruction", () => {
  const result = buildExperimentReallocationReviewV1({
    portfolio: portfolio({
      items: [experimentItem({ reviewState: "SUCCESS_REVIEW" })]
    }),
    reviewedAt: REVIEWED_AT
  });

  assert.equal(result.signals[0]?.state, "NO_REALLOCATION_SIGNAL");
  assert.deepEqual(result.signals[0]?.reasonCodes, ["OUTCOME_DOES_NOT_REQUIRE_REALLOCATION"]);
  assert.equal(result.signals[0]?.nextInternalStep, null);
});

test("verification-required experiment state fails closed", () => {
  const result = buildExperimentReallocationReviewV1({
    portfolio: portfolio({
      items: [
        experimentItem({
          preRegistrationState: "VERIFY_REQUIRED",
          verificationReasons: ["OBSERVATION_STALE"],
          reviewState: "VERIFY_REQUIRED"
        })
      ]
    }),
    reviewedAt: REVIEWED_AT
  });

  assert.equal(result.signals[0]?.state, "VERIFY");
  assert.ok(result.signals[0]?.reasonCodes.includes("EXPERIMENT_VERIFY_REQUIRED"));
  assert.deepEqual(result.verificationExperimentIds, ["experiment:checkout-friction"]);
  assert.equal(result.signals[0]?.nextInternalStep, "VERIFY_EXPERIMENT_AND_PORTFOLIO_EVIDENCE");
});

test("missing or mismatched decision candidate fails closed", () => {
  const missing = buildExperimentReallocationReviewV1({
    portfolio: portfolio({
      decisionPortfolio: {
        ...portfolio().decisionPortfolio,
        items: [],
        selectedIds: [],
        ownerQueues: { KEEGAN: [], IOANA: [], JEEVES: [] }
      }
    }),
    reviewedAt: REVIEWED_AT
  });
  assert.equal(missing.signals[0]?.state, "VERIFY");
  assert.ok(missing.signals[0]?.reasonCodes.includes("DECISION_CANDIDATE_MISSING"));

  const mismatchedItem = decisionItem({
    candidate: candidate({ id: "experiment:other" })
  });
  const mismatched = buildExperimentReallocationReviewV1({
    portfolio: portfolio({
      decisionPortfolio: {
        ...portfolio().decisionPortfolio,
        items: [mismatchedItem]
      }
    }),
    reviewedAt: REVIEWED_AT
  });
  assert.equal(mismatched.signals[0]?.state, "VERIFY");
  assert.ok(mismatched.signals[0]?.reasonCodes.includes("DECISION_CANDIDATE_MISSING"));
});

test("weak candidate evidence or missing provenance cannot drive reallocation review", () => {
  const weakDecision = decisionItem({
    candidate: candidate({
      evidenceState: "INFERRED",
      evidenceRefs: [],
      sourceRefs: []
    })
  });
  const result = buildExperimentReallocationReviewV1({
    portfolio: portfolio({
      decisionPortfolio: {
        ...portfolio().decisionPortfolio,
        items: [weakDecision]
      }
    }),
    reviewedAt: REVIEWED_AT
  });

  assert.equal(result.signals[0]?.state, "VERIFY");
  assert.ok(result.signals[0]?.reasonCodes.includes("DECISION_EVIDENCE_NOT_KNOWN"));
  assert.ok(result.signals[0]?.reasonCodes.includes("DECISION_PROVENANCE_MISSING"));
});

test("future generated portfolio and widened upstream authority fail closed", () => {
  const future = buildExperimentReallocationReviewV1({
    portfolio: portfolio({ generatedAt: "2026-09-19T16:00:00.000Z" }),
    reviewedAt: REVIEWED_AT
  });
  assert.equal(future.signals[0]?.state, "VERIFY");
  assert.ok(future.signals[0]?.reasonCodes.includes("INVALID_CHRONOLOGY"));

  const widened = buildExperimentReallocationReviewV1({
    portfolio: portfolio({
      authority: {
        launchExperiment: true as false,
        changeSpend: false,
        changePrice: false,
        publish: false,
        sendOutreach: false,
        promotePolicy: false
      }
    }),
    reviewedAt: REVIEWED_AT
  });
  assert.equal(widened.signals[0]?.state, "VERIFY");
  assert.ok(widened.signals[0]?.reasonCodes.includes("UPSTREAM_AUTHORITY_WIDENED"));
});

test("duplicate experiment items fail closed rather than double-counting a signal", () => {
  const duplicate = experimentItem();
  const result = buildExperimentReallocationReviewV1({
    portfolio: portfolio({ items: [duplicate, structuredClone(duplicate)] }),
    reviewedAt: REVIEWED_AT
  });

  assert.equal(result.signals.length, 2);
  assert.equal(result.signals[0]?.state, "VERIFY");
  assert.equal(result.signals[1]?.state, "VERIFY");
  assert.ok(result.signals[0]?.reasonCodes.includes("DUPLICATE_EXPERIMENT_ITEM"));
  assert.deepEqual(result.verificationExperimentIds, ["experiment:checkout-friction"]);
});

test("output is deterministic, deeply frozen, and preserves source inputs", () => {
  const source = portfolio();
  const snapshot = structuredClone(source);
  const first = buildExperimentReallocationReviewV1({ portfolio: source, reviewedAt: REVIEWED_AT });
  const second = buildExperimentReallocationReviewV1({ portfolio: source, reviewedAt: REVIEWED_AT });

  assert.deepEqual(first, second);
  assert.deepEqual(source, snapshot);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.signals));
  assert.ok(Object.isFrozen(first.signals[0]));
  assert.ok(Object.isFrozen(first.authority));
  assert.throws(() => {
    (first.readyExperimentIds as string[]).push("experiment:mutation");
  });
});
