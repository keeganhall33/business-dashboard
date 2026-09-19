import assert from "node:assert/strict";
import test from "node:test";

import type { ChiefOfStaffLearningOverlayV1 } from "../../src/lib/strategy-engine/chief-of-staff-learning-overlay-v1";
import type { ChiefOfStaffPortfolioBriefV1 } from "../../src/lib/strategy-engine/chief-of-staff-portfolio-brief-v1";
import type { CounterfactualPortfolioReviewV1 } from "../../src/lib/strategy-engine/counterfactual-portfolio-review-v1";
import type { ExperimentReallocationReviewV1 } from "../../src/lib/strategy-engine/experiment-reallocation-review-v1";
import {
  compileChiefOfStaffStrategicReviewV1,
  type ChiefOfStaffStrategicReviewInputV1
} from "../../src/lib/strategy-engine/chief-of-staff-strategic-review-v1";

const generatedAt = "2026-09-19T02:40:00.000Z";
const sourceAt = "2026-09-19T02:30:00.000Z";
const oneHour = 60 * 60 * 1000;

const portfolioAuthority = {
  synthesisOnly: true,
  persistence: false,
  execution: false,
  externalAction: false,
  approvalBypass: false,
  spend: false,
  pricing: false,
  outreach: false,
  publish: false,
  contractCommitment: false,
  rightsCommitment: false
} as const;

const learningAuthority = {
  synthesisOnly: true,
  persistenceAuthorized: false,
  decisionMutationAuthorized: false,
  assumptionMutationAuthorized: false,
  portfolioMutationAuthorized: false,
  reallocationAuthorized: false,
  evidenceCollectionAuthorized: false,
  measurementExecutionAuthorized: false,
  learningPromotionAuthorized: false,
  policyPromotionAuthorized: false,
  pricingChangeAuthorized: false,
  negotiationActionAuthorized: false,
  campaignExecutionAuthorized: false,
  experimentExecutionAuthorized: false,
  externalActionAuthorized: false,
  approvalBypassAuthorized: false
} as const;

const experimentAuthority = {
  analysisOnly: true,
  portfolioMutationAuthorized: false,
  allocationChangeAuthorized: false,
  experimentExecutionAuthorized: false,
  experimentStopAuthorized: false,
  experimentScaleAuthorized: false,
  spendChangeAuthorized: false,
  priceChangeAuthorized: false,
  publishAuthorized: false,
  outreachAuthorized: false,
  policyPromotionAuthorized: false,
  confidenceMutationAuthorized: false,
  monetaryMutationAuthorized: false,
  persistenceAuthorized: false,
  externalActionAuthorized: false,
  approvalBypassAuthorized: false
} as const;

const counterfactualAuthority = {
  analysisOnly: true,
  scenarioSelectionAuthorized: false,
  portfolioMutationAuthorized: false,
  allocationChangeAuthorized: false,
  scoreMutationAuthorized: false,
  confidenceMutationAuthorized: false,
  monetaryMutationAuthorized: false,
  experimentExecutionAuthorized: false,
  campaignExecutionAuthorized: false,
  pricingChangeAuthorized: false,
  negotiationActionAuthorized: false,
  externalActionAuthorized: false,
  persistenceAuthorized: false,
  approvalBypassAuthorized: false,
  causalAttributionAuthorized: false
} as const;

function action(candidateId: string, rank: number, candidateType: "DECISION" | "EXPERIMENT") {
  return {
    candidateId,
    title: candidateType === "EXPERIMENT" ? "Landing page experiment" : "Pricing decision",
    rank,
    candidateType,
    owner: candidateType === "EXPERIMENT" ? "JEEVES" : "KEEGAN",
    approvalClass: candidateType === "EXPERIMENT" ? "NONE" : "KEEGAN",
    safeNextStep: "Review existing governed evidence.",
    rationale: "Canonical portfolio rationale.",
    evidenceRefs: [`evidence:portfolio:${candidateId}`],
    sourceRefs: [`source:portfolio:${candidateId}`],
    measurement: {
      successMetric: "observed_metric",
      evaluationWindow: {
        start: "2026-09-19T00:00:00.000Z",
        end: "2026-09-20T00:00:00.000Z"
      }
    }
  };
}

function portfolioBrief(overrides: Record<string, unknown> = {}): ChiefOfStaffPortfolioBriefV1 {
  const decision = action("decision:price", 1, "DECISION");
  const experiment = action("experiment:landing", 2, "EXPERIMENT");
  return {
    contractVersion: "ChiefOfStaffPortfolioBriefV1",
    policyVersion: "chief_of_staff_portfolio_brief_v1.0.0",
    generatedAt: sourceAt,
    sourceAgeMs: 10 * 60 * 1000,
    sourcePortfolio: {
      portfolioId: "portfolio:test",
      generatedAt: "2026-09-19T02:20:00.000Z",
      policyVersion: "decision_portfolio_policy_v1.0.0"
    },
    sourceExecution: {
      generatedAt: "2026-09-19T02:25:00.000Z",
      policyVersion: "decision_portfolio_execution_compiler_v1.0.0"
    },
    overview: {
      selected: 2,
      decisionsForKeegan: 1,
      jeevesPreparationReady: 1,
      internalReviewReady: 0,
      ownerActionReady: 0,
      blockedOrRevalidate: 0,
      duplicateNoops: 0,
      informationGain: 0,
      deferred: 0,
      rejected: 0,
      remainingCapacity: { timeHours: 1, cashBudget: 0, relationshipCapacity: 1, creativeCapacity: 1 }
    },
    decisionsForKeegan: [decision],
    jeevesPreparationReady: [experiment],
    internalReviewReady: [],
    ownerActionReady: [],
    blockedWork: [],
    informationGain: [],
    tradeoffs: [],
    duplicateNoopCandidateIds: [],
    evidenceRefs: ["evidence:portfolio:decision:price", "evidence:portfolio:experiment:landing"],
    sourceRefs: ["source:portfolio:decision:price", "source:portfolio:experiment:landing"],
    authority: portfolioAuthority,
    ...overrides
  } as unknown as ChiefOfStaffPortfolioBriefV1;
}

function learningSignal() {
  return {
    signalId: "assumption-review:price",
    origin: "ASSUMPTION_REVIEW",
    sourceItemId: "assumption:price",
    decisionId: "decision:price",
    signalType: "REVISIT_DECISION",
    safeNextStep: "REVISIT_DECISION",
    evidenceRefs: ["evidence:learning:price"],
    sourceRefs: ["source:learning:price"],
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null
  };
}

function learningOverlay(overrides: Record<string, unknown> = {}): ChiefOfStaffLearningOverlayV1 {
  const signal = learningSignal();
  return {
    contractVersion: "ChiefOfStaffLearningOverlayV1",
    policyVersion: "chief_of_staff_learning_overlay_v1.0.0",
    generatedAt: sourceAt,
    maximumSourceAgeMs: oneHour,
    state: "READY",
    sourceHealth: [
      {
        source: "PORTFOLIO_BRIEF",
        sourceId: "portfolio:test",
        generatedAt: sourceAt,
        ageMs: 10 * 60 * 1000,
        accepted: true
      }
    ],
    verificationReasons: [],
    currentDecisionContext: [
      {
        candidateId: "decision:price",
        title: "Pricing decision",
        rank: 1,
        owner: "KEEGAN",
        approvalClass: "KEEGAN",
        portfolioQueue: "KEEGAN_DECISION",
        signals: [signal],
        causalInterpretation: "NOT_ESTABLISHED",
        confidence: "NOT_ESTABLISHED",
        monetaryValue: null
      }
    ],
    unmatchedKnowledgeSignals: [],
    summary: {
      currentPortfolioItems: 2,
      currentItemsWithKnowledgeSignals: 1,
      matchedKnowledgeSignals: 1,
      unmatchedKnowledgeSignals: 0,
      decisionRevisitSignals: 1,
      assumptionEvidenceNeededSignals: 0,
      measurementAttentionSignals: 0,
      recurringLessonSignals: 0,
      verificationSignals: 0,
      pricingAssumptionRevisits: 1,
      negotiationAssumptionRevisits: 0
    },
    evidenceRefs: ["evidence:learning:price"],
    sourceRefs: ["source:learning:price"],
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    inferredOutcome: null,
    limitations: ["Canonical learning limitation."],
    authority: learningAuthority,
    ...overrides
  } as unknown as ChiefOfStaffLearningOverlayV1;
}

function experimentReview(overrides: Record<string, unknown> = {}): ExperimentReallocationReviewV1 {
  return {
    contractVersion: "ExperimentReallocationReviewV1",
    policyVersion: "experiment_reallocation_review_v1.0.0",
    reviewId: "experiment-reallocation:test",
    reviewedAt: sourceAt,
    sourceExperimentPortfolioId: "experiment-portfolio:test",
    sourceDecisionPortfolioId: "portfolio:test",
    signals: [
      {
        experimentId: "experiment:landing",
        candidateId: "experiment:landing",
        title: "Landing page experiment",
        owner: "JEEVES",
        currentDisposition: "SELECTED",
        upstreamReviewState: "STOP_REVIEW",
        upstreamAttributionClass: "CORRELATIONAL",
        upstreamCausalClaimAllowed: false,
        confounders: ["seasonality"],
        state: "READY_FOR_REVIEW",
        reasonCodes: ["STOP_RULE_TRIGGERED"],
        nextInternalStep: "REVIEW_REDUCE_OR_STOP_ALLOCATION",
        candidateEvidenceRefs: ["evidence:experiment:landing"],
        candidateSourceRefs: ["source:experiment:landing"],
        causalInterpretation: "NOT_INFERRED_HERE",
        confidence: "NOT_ESTABLISHED",
        monetaryValue: null,
        predictedOutcome: null
      }
    ],
    readyExperimentIds: ["experiment:landing"],
    waitingExperimentIds: [],
    verificationExperimentIds: [],
    portfolioEvidenceRefs: ["evidence:experiment:landing"],
    portfolioSourceRefs: ["source:experiment-portfolio:test"],
    limitations: ["Canonical experiment review limitation."],
    authority: experimentAuthority,
    ...overrides
  } as unknown as ExperimentReallocationReviewV1;
}

function counterfactualReview(overrides: Record<string, unknown> = {}): CounterfactualPortfolioReviewV1 {
  return {
    contractVersion: "CounterfactualPortfolioReviewV1",
    policyVersion: "counterfactual_portfolio_review_v1.0.0",
    reviewId: "counterfactual-portfolio:test",
    generatedAt: sourceAt,
    sourcePortfolioId: "portfolio:test",
    sourceCounterfactualReviewId: "counterfactual-source:test",
    candidateId: "decision:price",
    previousDisposition: "SELECTED",
    state: "KEEGAN_REVIEW_REQUIRED",
    reasonCodes: ["KEEGAN_APPROVAL_REQUIRED"],
    sourceStatus: "READY",
    sourceEvaluatedAt: "2026-09-19T02:25:00.000Z",
    reviewAgeMs: 5 * 60 * 1000,
    scenarioIds: ["scenario:do", "scenario:delay"],
    comparisonDimensionRefs: ["dimension:capacity"],
    sourceVerificationReasons: [],
    sourceBlockerReasons: [],
    evidenceRefs: ["evidence:counterfactual:price"],
    sourceRefs: ["source:counterfactual:price"],
    nextInternalStep: "PRESENT_COMPARISON_FOR_KEEGAN_REVIEW",
    scenarioWinner: null,
    recommendedDisposition: null,
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    outcomePrediction: null,
    causalInterpretation: "NOT_ESTABLISHED",
    limitations: ["Canonical counterfactual review limitation."],
    authority: counterfactualAuthority,
    ...overrides
  } as unknown as CounterfactualPortfolioReviewV1;
}

function input(overrides: Partial<ChiefOfStaffStrategicReviewInputV1> = {}): ChiefOfStaffStrategicReviewInputV1 {
  return {
    portfolioBrief: portfolioBrief(),
    learningOverlay: learningOverlay(),
    experimentReviews: [experimentReview()],
    counterfactualReviews: [counterfactualReview()],
    generatedAt,
    maximumSourceAgeMs: oneHour,
    ...overrides
  };
}

test("unifies current learning, experiment reallocation, and counterfactual review by exact candidate id", () => {
  const result = compileChiefOfStaffStrategicReviewV1(input());

  assert.equal(result.state, "READY");
  assert.deepEqual(result.verificationReasons, []);
  assert.equal(result.currentDecisionContext.length, 2);
  assert.equal(result.currentDecisionContext[0]?.candidateId, "decision:price");
  assert.equal(result.currentDecisionContext[0]?.learningSignals.length, 1);
  assert.equal(result.currentDecisionContext[0]?.strategicSignals[0]?.origin, "COUNTERFACTUAL_REVIEW");
  assert.equal(result.currentDecisionContext[0]?.strategicSignals[0]?.state, "KEEGAN_REVIEW_REQUIRED");
  assert.equal(result.currentDecisionContext[1]?.candidateId, "experiment:landing");
  assert.equal(result.currentDecisionContext[1]?.learningSignals.length, 0);
  assert.equal(result.currentDecisionContext[1]?.strategicSignals[0]?.origin, "EXPERIMENT_REALLOCATION");
  assert.equal(result.currentDecisionContext[1]?.strategicSignals[0]?.state, "READY_FOR_REVIEW");
  assert.deepEqual(result.summary, {
    currentPortfolioItems: 2,
    currentItemsWithLearningSignals: 1,
    currentItemsWithStrategicSignals: 2,
    experimentSignals: 1,
    counterfactualSignals: 1,
    reallocationReviewSignals: 1,
    attributionEvidenceNeededSignals: 0,
    counterfactualKeeganReviewSignals: 1,
    verificationSignals: 0,
    unmatchedStrategicSignals: 0
  });
  assert.equal(result.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(result.confidence, "NOT_ESTABLISHED");
  assert.equal(result.monetaryValue, null);
  assert.equal(result.inferredOutcome, null);
  assert.equal(result.authority.portfolioMutationAuthorized, false);
  assert.equal(result.authority.allocationChangeAuthorized, false);
  assert.equal(result.authority.scenarioSelectionAuthorized, false);
  assert.equal(result.authority.experimentExecutionAuthorized, false);
  assert.equal(result.authority.externalActionAuthorized, false);
  assert.equal(result.authority.approvalBypassAuthorized, false);
});

test("keeps exact unmatched review signals visible and never fuzzy-matches candidate identity", () => {
  const review = experimentReview();
  const changed = structuredClone(review) as unknown as Record<string, unknown>;
  const signals = structuredClone((review as unknown as { signals: unknown[] }).signals) as Array<Record<string, unknown>>;
  signals[0] = { ...signals[0], candidateId: "experiment:landing-extra" };
  changed.signals = signals;

  const result = compileChiefOfStaffStrategicReviewV1(input({
    experimentReviews: [changed as unknown as ExperimentReallocationReviewV1]
  }));

  assert.equal(result.state, "READY");
  assert.equal(result.currentDecisionContext.find((item) => item.candidateId === "experiment:landing"), undefined);
  assert.deepEqual(result.unmatchedStrategicSignals.map((item) => item.candidateId), ["experiment:landing-extra"]);
});

test("fails a stale experiment review closed while preserving independent current counterfactual truth", () => {
  const stale = experimentReview({ reviewedAt: "2026-09-18T22:00:00.000Z" });
  const result = compileChiefOfStaffStrategicReviewV1(input({ experimentReviews: [stale] }));

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(result.verificationReasons.some((reason) => reason.includes("SOURCE_STALE")));
  assert.equal(result.summary.experimentSignals, 0);
  assert.equal(result.summary.counterfactualSignals, 1);
  assert.equal(result.currentDecisionContext.some((item) => item.candidateId === "decision:price"), true);
  assert.equal(result.currentDecisionContext.some((item) => item.candidateId === "experiment:landing"), false);
});

test("rejects review sources that point at a different decision portfolio", () => {
  const wrongPortfolio = counterfactualReview({ sourcePortfolioId: "portfolio:other" });
  const result = compileChiefOfStaffStrategicReviewV1(input({ counterfactualReviews: [wrongPortfolio] }));

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(result.verificationReasons.some((reason) => reason.includes("PORTFOLIO_IDENTITY_MISMATCH")));
  assert.equal(result.summary.counterfactualSignals, 0);
  assert.equal(result.summary.experimentSignals, 1);
});

test("rejects widened upstream authority instead of laundering it into chief-of-staff review", () => {
  const review = experimentReview();
  const changed = structuredClone(review) as unknown as Record<string, unknown>;
  changed.authority = { ...experimentAuthority, experimentStopAuthorized: true };

  const result = compileChiefOfStaffStrategicReviewV1(input({
    experimentReviews: [changed as unknown as ExperimentReallocationReviewV1]
  }));

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(result.verificationReasons.some((reason) => reason.includes("AUTHORITY_WIDENED")));
  assert.equal(result.summary.experimentSignals, 0);
  assert.equal(result.authority.experimentExecutionAuthorized, false);
});

test("does not turn correlational experiment evidence or scenario comparison into causality, money, or outcomes", () => {
  const result = compileChiefOfStaffStrategicReviewV1(input());
  const signals = result.currentDecisionContext.flatMap((item) => item.strategicSignals);

  assert.ok(signals.length > 0);
  for (const signal of signals) {
    assert.equal(signal.causalInterpretation, "NOT_ESTABLISHED");
    assert.equal(signal.confidence, "NOT_ESTABLISHED");
    assert.equal(signal.monetaryValue, null);
    assert.equal(signal.inferredOutcome, null);
  }
  assert.equal(result.authority.causalAttributionAuthorized, false);
  assert.equal(result.authority.learningPromotionAuthorized, false);
  assert.equal(result.authority.policyPromotionAuthorized, false);
});

test("is deterministic, deeply immutable, and preserves caller-owned source objects", () => {
  const source = input();
  const before = structuredClone(source);
  const first = compileChiefOfStaffStrategicReviewV1(source);
  const second = compileChiefOfStaffStrategicReviewV1(source);

  assert.deepEqual(first, second);
  assert.deepEqual(source, before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.currentDecisionContext), true);
  assert.equal(Object.isFrozen(first.currentDecisionContext[0]), true);
  assert.equal(Object.isFrozen(first.currentDecisionContext[0]?.strategicSignals), true);
});
