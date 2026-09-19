import assert from "node:assert/strict";
import test from "node:test";

import type { CompanyBrainAssumptionReviewV1 } from "../../src/lib/intelligence/organizational-learning/company-brain-assumption-review-v1";
import type { CompanyBrainChiefOfStaffBriefV1 } from "../../src/lib/intelligence/organizational-learning/company-brain-chief-of-staff-brief-v1";
import type { ChiefOfStaffPortfolioBriefV1 } from "../../src/lib/strategy-engine/chief-of-staff-portfolio-brief-v1";
import {
  compileChiefOfStaffLearningOverlayV1,
  type ChiefOfStaffLearningOverlayInputV1
} from "../../src/lib/strategy-engine/chief-of-staff-learning-overlay-v1";

const generatedAt = "2026-09-19T01:45:00.000Z";
const sourceGeneratedAt = "2026-09-19T01:30:00.000Z";
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

const companyBrainAuthority = {
  analysisOnly: true,
  persistenceAuthorized: false,
  decisionMutationAuthorized: false,
  measurementExecutionAuthorized: false,
  evidenceCollectionAuthorized: false,
  learningPromotionAuthorized: false,
  policyPromotionAuthorized: false,
  capabilityPromotionAuthorized: false,
  portfolioMutationAuthorized: false,
  reallocationAuthorized: false,
  pricingChangeAuthorized: false,
  negotiationActionAuthorized: false,
  campaignExecutionAuthorized: false,
  experimentExecutionAuthorized: false,
  externalActionAuthorized: false,
  approvalBypassAuthorized: false
} as const;

const assumptionAuthority = {
  analysisOnly: true,
  persistenceAuthorized: false,
  decisionMutationAuthorized: false,
  assumptionMutationAuthorized: false,
  learningPromotionAuthorized: false,
  policyPromotionAuthorized: false,
  capabilityPromotionAuthorized: false,
  portfolioMutationAuthorized: false,
  reallocationAuthorized: false,
  pricingChangeAuthorized: false,
  negotiationActionAuthorized: false,
  campaignExecutionAuthorized: false,
  experimentExecutionAuthorized: false,
  externalActionAuthorized: false,
  approvalBypassAuthorized: false
} as const;

function action(candidateId: string, rank: number) {
  return {
    candidateId,
    title: `Decision ${candidateId}`,
    rank,
    candidateType: "DECISION",
    owner: "KEEGAN",
    approvalClass: "KEEGAN",
    safeNextStep: "Review the evidence before acting.",
    rationale: "Canonical portfolio rationale.",
    evidenceRefs: [`evidence:portfolio:${candidateId}`],
    sourceRefs: [`source:portfolio:${candidateId}`],
    measurement: {
      successMetric: "documented_metric",
      evaluationWindow: {
        start: "2026-09-19T00:00:00.000Z",
        end: "2026-09-20T00:00:00.000Z"
      }
    }
  };
}

function portfolioBrief(overrides: Record<string, unknown> = {}): ChiefOfStaffPortfolioBriefV1 {
  const current = action("decision:current", 1);
  const value = {
    contractVersion: "ChiefOfStaffPortfolioBriefV1",
    policyVersion: "chief_of_staff_portfolio_brief_v1.0.0",
    generatedAt: sourceGeneratedAt,
    sourceAgeMs: 15 * 60 * 1000,
    sourcePortfolio: {
      portfolioId: "portfolio:test",
      generatedAt: "2026-09-19T01:20:00.000Z",
      policyVersion: "decision_portfolio_policy_v1.0.0"
    },
    sourceExecution: {
      generatedAt: "2026-09-19T01:25:00.000Z",
      policyVersion: "decision_portfolio_execution_compiler_v1.0.0"
    },
    overview: {
      selected: 1,
      decisionsForKeegan: 1,
      jeevesPreparationReady: 0,
      internalReviewReady: 0,
      ownerActionReady: 0,
      blockedOrRevalidate: 0,
      duplicateNoops: 0,
      informationGain: 0,
      deferred: 0,
      rejected: 0,
      remainingCapacity: {
        timeHours: 1,
        cashBudget: 0,
        relationshipCapacity: 1,
        creativeCapacity: 1
      }
    },
    decisionsForKeegan: [current],
    jeevesPreparationReady: [],
    internalReviewReady: [],
    ownerActionReady: [],
    blockedWork: [],
    informationGain: [],
    tradeoffs: [],
    duplicateNoopCandidateIds: [],
    evidenceRefs: current.evidenceRefs,
    sourceRefs: current.sourceRefs,
    authority: portfolioAuthority,
    ...overrides
  };
  return value as unknown as ChiefOfStaffPortfolioBriefV1;
}

function brainAttention(
  id: string,
  decisionId: string | null,
  lane: string
) {
  return {
    attentionId: id,
    sourceKind: lane.includes("MEASUREMENT") ? "MEASUREMENT_ATTENTION" : "DECISION_HISTORY",
    sourceBriefId: "company-brain-source:test",
    sourceItemId: `source-item:${id}`,
    lane,
    decisionId,
    domain: "STRATEGY",
    patternKey: null,
    safeNextStep: lane,
    evidenceRefs: [`evidence:${id}`],
    sourceRefs: [`source:${id}`],
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null
  };
}

function companyBrain(overrides: Record<string, unknown> = {}): CompanyBrainChiefOfStaffBriefV1 {
  const revisit = brainAttention(
    "attention:revisit-current",
    "decision:current",
    "REVIEW_DECISION_REVISIT"
  );
  const measurement = brainAttention(
    "attention:measure-historical",
    "decision:historical",
    "PREPARE_MEASUREMENT_EVIDENCE_REVIEW"
  );
  const value = {
    contractVersion: "CompanyBrainChiefOfStaffBriefV1",
    policyVersion: "company_brain_chief_of_staff_brief_v1.0.0",
    briefId: "company-brain-chief:test",
    state: "READY",
    generatedAt: sourceGeneratedAt,
    maximumSourceAgeMs: oneHour,
    sourceHealth: [],
    verificationReasons: [],
    verification: [],
    decisionRevisit: [revisit],
    outcomeReview: [],
    measurementNow: [measurement],
    measurementPlanReview: [],
    recurringLessonReview: [],
    recurringEvidenceNeeded: [],
    summary: {
      attentionItems: 2,
      verification: 0,
      decisionRevisit: 1,
      outcomeReview: 0,
      measurementNow: 1,
      measurementOverdue: 0,
      measurementDue: 1,
      measurementPlanReview: 0,
      recurringLessonReview: 0,
      recurringEvidenceNeeded: 0,
      pricingPatternsForReview: 0,
      negotiationPatternsForReview: 0,
      decisionsWaitingForOutcome: 0,
      measurementsWaitingForWindow: 0,
      measurementsWaitingForAction: 0,
      measurementCoverageComplete: 0
    },
    evidenceRefs: ["evidence:attention:measure-historical", "evidence:attention:revisit-current"],
    sourceRefs: ["source:attention:measure-historical", "source:attention:revisit-current"],
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    inferredOutcome: null,
    limitations: ["Canonical Company Brain limitation."],
    authority: companyBrainAuthority,
    ...overrides
  };
  return value as unknown as CompanyBrainChiefOfStaffBriefV1;
}

function assumptionItem(
  itemId: string,
  decisionId: string,
  lane: string,
  assessment: string
) {
  return {
    itemId,
    sourceRecordId: `record:${decisionId}`,
    decisionId,
    decisionClass: "PRICING",
    decidedAt: "2026-09-18T18:00:00.000Z",
    assumptionId: `assumption:${itemId}`,
    statement: "A material recorded assumption.",
    statementTruthState: "KNOWN",
    revisitTrigger: "Review if direct evidence changes.",
    assessment,
    assessedAt: assessment === "NOT_OBSERVED" ? null : "2026-09-19T01:10:00.000Z",
    lane,
    reasonCodes: [assessment === "REFUTED" ? "ASSUMPTION_REFUTED" : "ASSUMPTION_UNRESOLVED"],
    evidenceRefs: [`evidence:${itemId}`],
    sourceRefs: [`source:${itemId}`],
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null
  };
}

function assumptionReview(overrides: Record<string, unknown> = {}): CompanyBrainAssumptionReviewV1 {
  const revisit = assumptionItem(
    "assumption-review:current",
    "decision:current",
    "REVISIT_DECISION",
    "REFUTED"
  );
  const evidenceNeeded = assumptionItem(
    "assumption-review:historical",
    "decision:historical",
    "GATHER_ASSUMPTION_EVIDENCE",
    "UNRESOLVED"
  );
  const value = {
    contractVersion: "CompanyBrainAssumptionReviewV1",
    policyVersion: "company_brain_assumption_review_v1.0.0",
    reviewId: "company-brain-assumption-review:test",
    state: "READY",
    generatedAt: sourceGeneratedAt,
    sourceHealth: [],
    verificationReasons: [],
    verificationRequired: [],
    decisionRevisit: [revisit],
    evidenceNeeded: [evidenceNeeded],
    supportedReview: [],
    waitingOutcome: [],
    summary: {
      suppliedRecords: 2,
      acceptedRecords: 2,
      rejectedRecords: 0,
      materialAssumptions: 2,
      supported: 0,
      refuted: 1,
      unresolved: 1,
      notObserved: 0,
      verificationRequired: 0,
      decisionRevisit: 1,
      evidenceNeeded: 1,
      supportedReview: 0,
      waitingOutcome: 0,
      pricingAssumptionsRequiringRevisit: 1,
      negotiationAssumptionsRequiringRevisit: 0
    },
    evidenceRefs: ["evidence:assumption-review:current", "evidence:assumption-review:historical"],
    sourceRefs: ["source:assumption-review:current", "source:assumption-review:historical"],
    sourceDecisionIds: ["decision:current", "decision:historical"],
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    inferredOutcome: null,
    limitations: ["Canonical assumption review limitation."],
    authority: assumptionAuthority,
    ...overrides
  };
  return value as unknown as CompanyBrainAssumptionReviewV1;
}

function input(overrides: Partial<ChiefOfStaffLearningOverlayInputV1> = {}): ChiefOfStaffLearningOverlayInputV1 {
  return {
    portfolioBrief: portfolioBrief(),
    companyBrain: companyBrain(),
    assumptionReview: assumptionReview(),
    generatedAt,
    maximumSourceAgeMs: oneHour,
    ...overrides
  };
}

test("cross-references current portfolio work with exact durable learning signals", () => {
  const result = compileChiefOfStaffLearningOverlayV1(input());

  assert.equal(result.state, "READY");
  assert.deepEqual(result.verificationReasons, []);
  assert.equal(result.currentDecisionContext.length, 1);
  assert.equal(result.currentDecisionContext[0]?.candidateId, "decision:current");
  assert.equal(result.currentDecisionContext[0]?.portfolioQueue, "KEEGAN_DECISION");
  assert.deepEqual(
    result.currentDecisionContext[0]?.signals.map((item) => [item.origin, item.signalType]),
    [
      ["ASSUMPTION_REVIEW", "REVISIT_DECISION"],
      ["COMPANY_BRAIN", "REVIEW_DECISION_REVISIT"]
    ]
  );
  assert.deepEqual(
    result.unmatchedKnowledgeSignals.map((item) => [item.decisionId, item.signalType]),
    [
      ["decision:historical", "GATHER_ASSUMPTION_EVIDENCE"],
      ["decision:historical", "PREPARE_MEASUREMENT_EVIDENCE_REVIEW"]
    ]
  );
  assert.deepEqual(result.summary, {
    currentPortfolioItems: 1,
    currentItemsWithKnowledgeSignals: 1,
    matchedKnowledgeSignals: 2,
    unmatchedKnowledgeSignals: 2,
    decisionRevisitSignals: 2,
    assumptionEvidenceNeededSignals: 1,
    measurementAttentionSignals: 1,
    recurringLessonSignals: 0,
    verificationSignals: 0,
    pricingAssumptionRevisits: 1,
    negotiationAssumptionRevisits: 0
  });
  assert.equal(result.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(result.confidence, "NOT_ESTABLISHED");
  assert.equal(result.monetaryValue, null);
  assert.equal(result.inferredOutcome, null);
  assert.equal(result.authority.portfolioMutationAuthorized, false);
  assert.equal(result.authority.reallocationAuthorized, false);
  assert.equal(result.authority.pricingChangeAuthorized, false);
  assert.equal(result.authority.externalActionAuthorized, false);
  assert.equal(result.authority.approvalBypassAuthorized, false);
});

test("uses exact decision identity and never fuzzy-matches nearby ids", () => {
  const assumptions = assumptionReview();
  const changed = structuredClone(assumptions) as unknown as Record<string, unknown>;
  const decisionRevisit = structuredClone((assumptions as unknown as { decisionRevisit: unknown[] }).decisionRevisit) as Array<Record<string, unknown>>;
  decisionRevisit[0] = { ...decisionRevisit[0], decisionId: "decision:current-extra" };
  changed.decisionRevisit = decisionRevisit;
  changed.sourceDecisionIds = ["decision:current-extra", "decision:historical"];

  const result = compileChiefOfStaffLearningOverlayV1(input({
    assumptionReview: changed as unknown as CompanyBrainAssumptionReviewV1
  }));

  assert.equal(result.state, "READY");
  assert.equal(result.currentDecisionContext[0]?.signals.length, 1);
  assert.equal(result.currentDecisionContext[0]?.signals[0]?.origin, "COMPANY_BRAIN");
  assert.ok(result.unmatchedKnowledgeSignals.some((item) => item.decisionId === "decision:current-extra"));
});

test("fails a stale Company Brain source closed while preserving independent current sources", () => {
  const staleBrain = companyBrain({ generatedAt: "2026-09-18T20:00:00.000Z" });
  const result = compileChiefOfStaffLearningOverlayV1(input({ companyBrain: staleBrain }));

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(result.verificationReasons.includes("COMPANY_BRAIN_SOURCE_STALE"));
  assert.equal(result.sourceHealth.find((item) => item.source === "COMPANY_BRAIN")?.accepted, false);
  assert.equal(result.sourceHealth.find((item) => item.source === "PORTFOLIO_BRIEF")?.accepted, true);
  assert.equal(result.sourceHealth.find((item) => item.source === "ASSUMPTION_REVIEW")?.accepted, true);
  assert.equal(result.currentDecisionContext.length, 1);
  assert.deepEqual(result.currentDecisionContext[0]?.signals.map((item) => item.origin), ["ASSUMPTION_REVIEW"]);
});

test("rejects widened assumption authority without mutating the portfolio or Company Brain lanes", () => {
  const canonical = assumptionReview();
  const widened = {
    ...structuredClone(canonical),
    authority: {
      ...structuredClone(canonical.authority),
      pricingChangeAuthorized: true
    }
  } as unknown as CompanyBrainAssumptionReviewV1;

  const result = compileChiefOfStaffLearningOverlayV1(input({ assumptionReview: widened }));

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(result.verificationReasons.includes("ASSUMPTION_REVIEW_AUTHORITY_WIDENED"));
  assert.equal(result.sourceHealth.find((item) => item.source === "ASSUMPTION_REVIEW")?.accepted, false);
  assert.equal(result.currentDecisionContext.length, 1);
  assert.deepEqual(result.currentDecisionContext[0]?.signals.map((item) => item.origin), ["COMPANY_BRAIN"]);
  assert.equal(result.summary.pricingAssumptionRevisits, 0);
});

test("fails portfolio truth closed but still exposes unmatched governed knowledge for review", () => {
  const stalePortfolio = portfolioBrief({ generatedAt: "2026-09-18T20:00:00.000Z" });
  const result = compileChiefOfStaffLearningOverlayV1(input({ portfolioBrief: stalePortfolio }));

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(result.verificationReasons.includes("PORTFOLIO_BRIEF_SOURCE_STALE"));
  assert.equal(result.summary.currentPortfolioItems, 0);
  assert.equal(result.currentDecisionContext.length, 0);
  assert.equal(result.unmatchedKnowledgeSignals.length, 4);
  assert.equal(result.summary.matchedKnowledgeSignals, 0);
});

test("is deterministic, deeply immutable, and preserves caller-owned projections", () => {
  const value = input();
  const before = structuredClone(value);
  const first = compileChiefOfStaffLearningOverlayV1(value);
  const second = compileChiefOfStaffLearningOverlayV1(value);

  assert.deepEqual(first, second);
  assert.deepEqual(value, before);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.summary));
  assert.ok(Object.isFrozen(first.currentDecisionContext));
  assert.ok(Object.isFrozen(first.currentDecisionContext[0]));
  assert.ok(Object.isFrozen(first.currentDecisionContext[0]?.signals));
  assert.ok(first.evidenceRefs.includes("evidence:assumption-review:current"));
  assert.ok(first.sourceRefs.includes("source:attention:revisit-current"));
});
