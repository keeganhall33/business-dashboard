import assert from "node:assert/strict";
import test from "node:test";

import {
  reviewDecisionPortfolioDependencyEvidenceV1,
  type DecisionDependencyEvidenceRecordV1,
  type DecisionPortfolioDependencyEvidenceReviewV1
} from "../../src/lib/strategy-engine/decision-portfolio-dependency-evidence-v1";
import {
  compileEvidenceBoundDecisionPortfolioPreparationV1,
  type EvidenceBoundDecisionPortfolioPreparationInputV1
} from "../../src/lib/strategy-engine/evidence-bound-decision-portfolio-preparation-v1";
import type {
  DecisionCandidateV1,
  DecisionPortfolioItemV1,
  DecisionPortfolioV1
} from "../../src/lib/strategy-engine/decision-portfolio-v1";

const REVIEWED_AT = "2026-09-19T10:00:00.000Z";
const GENERATED_AT = "2026-09-19T10:10:00.000Z";
const MAX_AGE_MS = 60 * 60 * 1000;

function candidate(id: string, dependencyIds: readonly string[]): DecisionCandidateV1 {
  return {
    id,
    title: `Candidate ${id}`,
    candidateType: "DECISION",
    owner: "JEEVES",
    approvalClass: "NONE",
    evidenceState: "KNOWN",
    evidenceRefs: [`evidence:${id}`],
    sourceRefs: [`source:${id}`],
    monetaryCase: null,
    value: {
      strategicFit: 80,
      compoundingAdvantage: 70,
      relationshipAccess: 60,
      futureOptions: 75,
      learningValue: 70,
      urgency: 50,
      reversibility: 90
    },
    risk: { execution: 20, reputation: 10, rights: 5 },
    resources: { keeganHours: 0, ioanaHours: 0, jeevesHours: 1, cashCents: 0 },
    dependencyIds,
    conflictKeys: [],
    blockers: [],
    informationGainAction: null,
    safeNextStep: "Prepare the bounded next step",
    successMetric: "Evidence-backed completion",
    evaluationWindow: {
      start: "2026-09-19T00:00:00.000Z",
      end: "2026-09-30T00:00:00.000Z"
    }
  };
}

function item(value: DecisionCandidateV1): DecisionPortfolioItemV1 {
  return {
    candidate: value,
    disposition: "SELECTED",
    score: {
      monetaryExpectedCents: null,
      monetaryScore: 0,
      strategicScore: 70,
      riskPenalty: 10,
      totalScore: 60,
      components: {}
    },
    rank: 1,
    rationale: "Selected from current evidence.",
    exclusionReason: null,
    displacedBy: []
  };
}

function portfolio(
  dependencyIds: readonly string[] = ["dependency:ready"],
  candidateId = "decision:growth"
): DecisionPortfolioV1 {
  const selected = item(candidate(candidateId, dependencyIds));
  return {
    contractVersion: "DecisionPortfolioV1",
    policyVersion: "decision_portfolio_policy_v1.0.0",
    generatedAt: "2026-09-19T08:00:00.000Z",
    portfolioId: "portfolio:growth",
    items: [selected],
    selectedIds: [candidateId],
    ownerQueues: { KEEGAN: [], IOANA: [], JEEVES: [candidateId] },
    keeganDecisionIds: [],
    informationGainIds: [],
    usedCapacity: { keeganHours: 0, ioanaHours: 0, jeevesHours: 1, cashCents: 0 },
    remainingCapacity: { keeganHours: 1, ioanaHours: 1, jeevesHours: 9, cashCents: 0 },
    evidenceRefs: selected.candidate.evidenceRefs,
    sourceRefs: selected.candidate.sourceRefs,
    audit: {
      candidatesConsidered: 1,
      feasiblePortfoliosEvaluated: 1,
      duplicateCandidatesSuppressed: 0,
      exactOptimization: true
    }
  };
}

function evidence(
  dependencyId = "dependency:ready",
  overrides: Partial<DecisionDependencyEvidenceRecordV1> = {}
): DecisionDependencyEvidenceRecordV1 {
  return {
    dependencyId,
    observedAt: "2026-09-19T09:30:00.000Z",
    evidenceState: "KNOWN",
    completionState: "SATISFIED",
    evidenceRefs: [`evidence:${dependencyId}:complete`],
    sourceRefs: [`source:${dependencyId}`],
    ...overrides
  };
}

function review(
  sourcePortfolio: DecisionPortfolioV1,
  dependencyEvidence: readonly DecisionDependencyEvidenceRecordV1[]
): DecisionPortfolioDependencyEvidenceReviewV1 {
  return reviewDecisionPortfolioDependencyEvidenceV1({
    portfolio: sourcePortfolio,
    dependencyEvidence,
    reviewedAt: REVIEWED_AT,
    maximumEvidenceAgeMs: MAX_AGE_MS
  });
}

function input(
  sourcePortfolio: DecisionPortfolioV1,
  dependencyReview: DecisionPortfolioDependencyEvidenceReviewV1,
  overrides: Partial<EvidenceBoundDecisionPortfolioPreparationInputV1> = {}
): EvidenceBoundDecisionPortfolioPreparationInputV1 {
  return {
    portfolio: sourcePortfolio,
    dependencyReview,
    generatedAt: GENERATED_AT,
    maximumDependencyReviewAgeMs: MAX_AGE_MS,
    maximumPortfolioAgeMs: 24 * 60 * 60 * 1000,
    ...overrides
  };
}

test("prepares the portfolio only from an exact current dependency review", () => {
  const sourcePortfolio = portfolio();
  const dependencyReview = review(sourcePortfolio, [evidence()]);
  const result = compileEvidenceBoundDecisionPortfolioPreparationV1(
    input(sourcePortfolio, dependencyReview)
  );

  assert.equal(result.state, "PREPARED");
  assert.deepEqual(result.reasonCodes, []);
  assert.deepEqual(result.verifiedSatisfiedDependencyIds, ["dependency:ready"]);
  assert.equal(result.executionCompiler?.handoffs[0]?.state, "PREPARED_INTERNAL");
  assert.equal(result.executionCompiler?.handoffs[0]?.nextGate, "ACTION_RUNTIME_POLICY_EVALUATION");
  assert.equal(result.executionCompiler?.handoffs[0]?.executionAuthorized, false);
  assert.equal(result.causality, "NOT_ESTABLISHED");
  assert.equal(result.confidence, "NOT_ESTABLISHED");
  assert.equal(result.monetaryValue, null);
  assert.equal(result.inferredOutcome, null);
  assert.equal(result.authority.preparationCompilation, true);
  assert.equal(result.authority.execution, false);
  assert.equal(result.authority.externalAction, false);
  assert.equal(result.authority.approvalBypass, false);
});

test("waits without invoking the execution compiler when dependency evidence is incomplete", () => {
  const sourcePortfolio = portfolio();
  const dependencyReview = review(sourcePortfolio, []);
  const result = compileEvidenceBoundDecisionPortfolioPreparationV1(
    input(sourcePortfolio, dependencyReview)
  );

  assert.equal(result.state, "WAITING_DEPENDENCIES");
  assert.deepEqual(result.reasonCodes, ["DEPENDENCIES_NOT_READY"]);
  assert.deepEqual(result.verifiedSatisfiedDependencyIds, []);
  assert.equal(result.executionCompiler, null);
  assert.equal(result.authority.preparationCompilation, false);
});

test("requires verification without invoking preparation when dependency evidence conflicts", () => {
  const sourcePortfolio = portfolio();
  const dependencyReview = review(sourcePortfolio, [
    evidence("dependency:ready", { evidenceState: "CONFLICTED" })
  ]);
  const result = compileEvidenceBoundDecisionPortfolioPreparationV1(
    input(sourcePortfolio, dependencyReview)
  );

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.deepEqual(result.reasonCodes, ["DEPENDENCY_REVIEW_REQUIRES_VERIFICATION"]);
  assert.equal(result.executionCompiler, null);
});

test("rejects replaying a valid dependency review against a changed portfolio with the same portfolio id", () => {
  const originalPortfolio = portfolio(["dependency:ready"]);
  const dependencyReview = review(originalPortfolio, [evidence("dependency:ready")]);
  const changedPortfolio = portfolio(["dependency:different"]);
  const result = compileEvidenceBoundDecisionPortfolioPreparationV1(
    input(changedPortfolio, dependencyReview)
  );

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(result.reasonCodes.includes("DEPENDENCY_SET_MISMATCH"));
  assert.ok(result.reasonCodes.includes("CANDIDATE_DEPENDENCY_BINDING_MISMATCH"));
  assert.ok(result.reasonCodes.includes("SATISFIED_DEPENDENCY_SET_MISMATCH"));
  assert.equal(result.executionCompiler, null);
});

test("rejects replaying a valid review against a different selected candidate even when dependencies match", () => {
  const originalPortfolio = portfolio(["dependency:ready"], "decision:original");
  const dependencyReview = review(originalPortfolio, [evidence()]);
  const changedPortfolio = portfolio(["dependency:ready"], "decision:different");
  const result = compileEvidenceBoundDecisionPortfolioPreparationV1(
    input(changedPortfolio, dependencyReview)
  );

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(result.reasonCodes.includes("CANDIDATE_REVIEW_SET_MISMATCH"));
  assert.equal(result.executionCompiler, null);
});

test("rejects stale dependency review snapshots instead of carrying satisfaction forward", () => {
  const sourcePortfolio = portfolio();
  const dependencyReview = review(sourcePortfolio, [evidence()]);
  const result = compileEvidenceBoundDecisionPortfolioPreparationV1(
    input(sourcePortfolio, dependencyReview, {
      generatedAt: "2026-09-19T12:30:00.000Z",
      maximumDependencyReviewAgeMs: MAX_AGE_MS
    })
  );

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(result.reasonCodes.includes("DEPENDENCY_REVIEW_STALE"));
  assert.equal(result.executionCompiler, null);
});

test("rejects tampered satisfied dependency ids even when a review claims readiness", () => {
  const sourcePortfolio = portfolio();
  const dependencyReview = review(sourcePortfolio, [evidence()]);
  const tampered = {
    ...dependencyReview,
    satisfiedDependencyIds: ["dependency:invented"]
  } as unknown as DecisionPortfolioDependencyEvidenceReviewV1;
  const result = compileEvidenceBoundDecisionPortfolioPreparationV1(
    input(sourcePortfolio, tampered)
  );

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(result.reasonCodes.includes("SATISFIED_DEPENDENCY_SET_MISMATCH"));
  assert.equal(result.executionCompiler, null);
});

test("allows a selected candidate with no dependencies while preserving all execution boundaries", () => {
  const sourcePortfolio = portfolio([]);
  const dependencyReview = review(sourcePortfolio, []);
  const result = compileEvidenceBoundDecisionPortfolioPreparationV1(
    input(sourcePortfolio, dependencyReview)
  );

  assert.equal(dependencyReview.status, "READY_FOR_EXECUTION_COMPILER");
  assert.equal(result.state, "PREPARED");
  assert.deepEqual(result.verifiedSatisfiedDependencyIds, []);
  assert.equal(result.executionCompiler?.handoffs[0]?.state, "PREPARED_INTERNAL");
  assert.equal(result.executionCompiler?.authority.execution, false);
  assert.equal(result.executionCompiler?.authority.externalAction, false);
  assert.equal(result.authority.execution, false);
  assert.equal(result.authority.persistence, false);
});
