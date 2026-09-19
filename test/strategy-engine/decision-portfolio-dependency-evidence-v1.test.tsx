import assert from "node:assert/strict";
import test from "node:test";

import {
  reviewDecisionPortfolioDependencyEvidenceV1,
  type DecisionDependencyEvidenceRecordV1
} from "@/lib/strategy-engine/decision-portfolio-dependency-evidence-v1";
import type {
  DecisionCandidateV1,
  DecisionPortfolioItemV1,
  DecisionPortfolioV1
} from "@/lib/strategy-engine/decision-portfolio-v1";

const REVIEWED_AT = "2026-09-19T10:00:00.000Z";
const MAX_AGE_MS = 48 * 60 * 60 * 1000;

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

function item(candidateValue: DecisionCandidateV1): DecisionPortfolioItemV1 {
  return {
    candidate: candidateValue,
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
    rationale: "Selected from current canonical evidence.",
    exclusionReason: null,
    displacedBy: []
  };
}

function portfolio(
  dependencyIds: readonly string[] = ["dependency:source-ready"],
  extraItems: readonly DecisionPortfolioItemV1[] = []
): DecisionPortfolioV1 {
  const first = item(candidate("decision:growth", dependencyIds));
  const items = [first, ...extraItems];
  return {
    contractVersion: "DecisionPortfolioV1",
    policyVersion: "decision_portfolio_policy_v1.0.0",
    generatedAt: "2026-09-19T08:00:00.000Z",
    portfolioId: "portfolio:growth",
    items,
    selectedIds: items.map((entry) => entry.candidate.id),
    ownerQueues: {
      KEEGAN: [],
      IOANA: [],
      JEEVES: items.map((entry) => entry.candidate.id)
    },
    keeganDecisionIds: [],
    informationGainIds: [],
    usedCapacity: { keeganHours: 0, ioanaHours: 0, jeevesHours: items.length, cashCents: 0 },
    remainingCapacity: { keeganHours: 1, ioanaHours: 1, jeevesHours: 9, cashCents: 0 },
    evidenceRefs: items.flatMap((entry) => entry.candidate.evidenceRefs),
    sourceRefs: items.flatMap((entry) => entry.candidate.sourceRefs),
    audit: {
      candidatesConsidered: items.length,
      feasiblePortfoliosEvaluated: 1,
      duplicateCandidatesSuppressed: 0,
      exactOptimization: true
    }
  };
}

function evidence(
  dependencyId = "dependency:source-ready",
  overrides: Partial<DecisionDependencyEvidenceRecordV1> = {}
): DecisionDependencyEvidenceRecordV1 {
  return {
    dependencyId,
    observedAt: "2026-09-19T09:00:00.000Z",
    evidenceState: "KNOWN",
    completionState: "SATISFIED",
    evidenceRefs: [`evidence:${dependencyId}:complete`],
    sourceRefs: [`source:${dependencyId}`],
    ...overrides
  };
}

test("emits only evidence-verified satisfied dependencies for the execution compiler", () => {
  const result = reviewDecisionPortfolioDependencyEvidenceV1({
    portfolio: portfolio(),
    dependencyEvidence: [evidence()],
    reviewedAt: REVIEWED_AT,
    maximumEvidenceAgeMs: MAX_AGE_MS
  });

  assert.equal(result.status, "READY_FOR_EXECUTION_COMPILER");
  assert.deepEqual(result.satisfiedDependencyIds, ["dependency:source-ready"]);
  assert.equal(result.candidateReviews[0]?.state, "READY");
  assert.equal(result.nextInternalStep, "PASS_VERIFIED_DEPENDENCIES_TO_EXECUTION_COMPILER");
  assert.equal(result.authority.preparationInputCompilation, true);
  assert.equal(result.authority.executionAuthorized, false);
  assert.equal(result.authority.portfolioMutationAuthorized, false);
  assert.equal(result.authority.externalActionAuthorized, false);
  assert.equal(result.confidence, "NOT_ESTABLISHED");
  assert.equal(result.monetaryValue, null);
  assert.equal(result.causalInterpretation, "NOT_ESTABLISHED");
});

test("missing dependency evidence waits and emits no satisfied ids", () => {
  const result = reviewDecisionPortfolioDependencyEvidenceV1({
    portfolio: portfolio(),
    dependencyEvidence: [],
    reviewedAt: REVIEWED_AT,
    maximumEvidenceAgeMs: MAX_AGE_MS
  });

  assert.equal(result.status, "WAIT_FOR_DEPENDENCIES");
  assert.deepEqual(result.satisfiedDependencyIds, []);
  assert.equal(result.candidateReviews[0]?.state, "WAITING");
  assert.ok(result.reasonCodes.includes("DEPENDENCY_EVIDENCE_MISSING"));
});

test("explicit not-satisfied and unknown states never become satisfied", () => {
  for (const completionState of ["NOT_SATISFIED", "UNKNOWN"] as const) {
    const result = reviewDecisionPortfolioDependencyEvidenceV1({
      portfolio: portfolio(),
      dependencyEvidence: [evidence("dependency:source-ready", { completionState })],
      reviewedAt: REVIEWED_AT,
      maximumEvidenceAgeMs: MAX_AGE_MS
    });

    assert.equal(result.status, "WAIT_FOR_DEPENDENCIES");
    assert.deepEqual(result.satisfiedDependencyIds, []);
    assert.equal(result.authority.preparationInputCompilation, false);
  }
});

test("partial or unknown evidence waits rather than satisfying a dependency", () => {
  for (const evidenceState of ["PARTIAL", "UNKNOWN"] as const) {
    const result = reviewDecisionPortfolioDependencyEvidenceV1({
      portfolio: portfolio(),
      dependencyEvidence: [evidence("dependency:source-ready", { evidenceState })],
      reviewedAt: REVIEWED_AT,
      maximumEvidenceAgeMs: MAX_AGE_MS
    });

    assert.equal(result.status, "WAIT_FOR_DEPENDENCIES");
    assert.deepEqual(result.satisfiedDependencyIds, []);
    assert.ok(result.reasonCodes.includes("DEPENDENCY_EVIDENCE_NOT_KNOWN"));
  }
});

test("conflicted dependency evidence requires verification", () => {
  const result = reviewDecisionPortfolioDependencyEvidenceV1({
    portfolio: portfolio(),
    dependencyEvidence: [evidence("dependency:source-ready", { evidenceState: "CONFLICTED" })],
    reviewedAt: REVIEWED_AT,
    maximumEvidenceAgeMs: MAX_AGE_MS
  });

  assert.equal(result.status, "VERIFY_DEPENDENCY_EVIDENCE");
  assert.deepEqual(result.satisfiedDependencyIds, []);
  assert.equal(result.candidateReviews[0]?.state, "VERIFY");
  assert.ok(result.reasonCodes.includes("DEPENDENCY_EVIDENCE_CONFLICTED"));
});

test("duplicate records for one dependency fail closed instead of selecting a convenient observation", () => {
  const result = reviewDecisionPortfolioDependencyEvidenceV1({
    portfolio: portfolio(),
    dependencyEvidence: [
      evidence(),
      evidence("dependency:source-ready", {
        observedAt: "2026-09-19T09:30:00.000Z",
        completionState: "NOT_SATISFIED",
        evidenceRefs: ["evidence:newer-not-satisfied"]
      })
    ],
    reviewedAt: REVIEWED_AT,
    maximumEvidenceAgeMs: MAX_AGE_MS
  });

  assert.equal(result.status, "VERIFY_DEPENDENCY_EVIDENCE");
  assert.deepEqual(result.satisfiedDependencyIds, []);
  assert.ok(result.reasonCodes.includes("DUPLICATE_DEPENDENCY_EVIDENCE"));
});

test("stale and future dependency observations require verification", () => {
  const stale = reviewDecisionPortfolioDependencyEvidenceV1({
    portfolio: portfolio(),
    dependencyEvidence: [evidence("dependency:source-ready", {
      observedAt: "2026-09-18T00:00:00.000Z"
    })],
    reviewedAt: REVIEWED_AT,
    maximumEvidenceAgeMs: 60 * 60 * 1000
  });
  assert.equal(stale.status, "VERIFY_DEPENDENCY_EVIDENCE");
  assert.deepEqual(stale.satisfiedDependencyIds, []);
  assert.ok(stale.reasonCodes.includes("DEPENDENCY_EVIDENCE_STALE"));

  const future = reviewDecisionPortfolioDependencyEvidenceV1({
    portfolio: portfolio(),
    dependencyEvidence: [evidence("dependency:source-ready", {
      observedAt: "2026-09-19T11:00:00.000Z"
    })],
    reviewedAt: REVIEWED_AT,
    maximumEvidenceAgeMs: MAX_AGE_MS
  });
  assert.equal(future.status, "VERIFY_DEPENDENCY_EVIDENCE");
  assert.deepEqual(future.satisfiedDependencyIds, []);
  assert.ok(future.reasonCodes.includes("DEPENDENCY_EVIDENCE_IN_FUTURE"));
});

test("missing or unsafe provenance cannot satisfy a dependency", () => {
  const missing = reviewDecisionPortfolioDependencyEvidenceV1({
    portfolio: portfolio(),
    dependencyEvidence: [evidence("dependency:source-ready", { evidenceRefs: [] })],
    reviewedAt: REVIEWED_AT,
    maximumEvidenceAgeMs: MAX_AGE_MS
  });
  assert.equal(missing.status, "VERIFY_DEPENDENCY_EVIDENCE");
  assert.deepEqual(missing.satisfiedDependencyIds, []);
  assert.ok(missing.reasonCodes.includes("DEPENDENCY_EVIDENCE_PROVENANCE_MISSING"));

  const unsafe = reviewDecisionPortfolioDependencyEvidenceV1({
    portfolio: portfolio(),
    dependencyEvidence: [evidence("dependency:source-ready", {
      sourceRefs: ["token=do-not-store"]
    })],
    reviewedAt: REVIEWED_AT,
    maximumEvidenceAgeMs: MAX_AGE_MS
  });
  assert.equal(unsafe.status, "VERIFY_DEPENDENCY_EVIDENCE");
  assert.deepEqual(unsafe.satisfiedDependencyIds, []);
  assert.ok(unsafe.reasonCodes.includes("UNSAFE_PROVENANCE"));
  assert.equal(unsafe.sourceRefs.includes("token=do-not-store"), false);
});

test("all selected candidates must have every referenced dependency satisfied", () => {
  const second = item(candidate("decision:second", ["dependency:legal-ready"]));
  const result = reviewDecisionPortfolioDependencyEvidenceV1({
    portfolio: portfolio(["dependency:source-ready"], [second]),
    dependencyEvidence: [evidence("dependency:source-ready")],
    reviewedAt: REVIEWED_AT,
    maximumEvidenceAgeMs: MAX_AGE_MS
  });

  assert.equal(result.status, "WAIT_FOR_DEPENDENCIES");
  assert.deepEqual(result.satisfiedDependencyIds, []);
  assert.equal(result.candidateReviews.find((entry) => entry.candidateId === "decision:growth")?.state, "READY");
  assert.equal(result.candidateReviews.find((entry) => entry.candidateId === "decision:second")?.state, "WAITING");
});

test("a dependency-free selected portfolio is ready without invented evidence", () => {
  const result = reviewDecisionPortfolioDependencyEvidenceV1({
    portfolio: portfolio([]),
    dependencyEvidence: [],
    reviewedAt: REVIEWED_AT,
    maximumEvidenceAgeMs: MAX_AGE_MS
  });

  assert.equal(result.status, "READY_FOR_EXECUTION_COMPILER");
  assert.deepEqual(result.referencedDependencyIds, []);
  assert.deepEqual(result.satisfiedDependencyIds, []);
  assert.ok(result.reasonCodes.includes("NO_SELECTED_DEPENDENCIES"));
});

test("unreferenced evidence is retained as a review reason but never injected into compiler input", () => {
  const result = reviewDecisionPortfolioDependencyEvidenceV1({
    portfolio: portfolio([]),
    dependencyEvidence: [evidence("dependency:unrelated")],
    reviewedAt: REVIEWED_AT,
    maximumEvidenceAgeMs: MAX_AGE_MS
  });

  assert.equal(result.status, "READY_FOR_EXECUTION_COMPILER");
  assert.deepEqual(result.satisfiedDependencyIds, []);
  assert.ok(result.reasonCodes.includes("UNREFERENCED_DEPENDENCY_EVIDENCE"));
});

test("review is immutable and grants no execution or approval authority", () => {
  const sourcePortfolio = portfolio();
  const dependencyEvidence = [evidence()];
  const beforePortfolio = JSON.parse(JSON.stringify(sourcePortfolio));
  const beforeEvidence = JSON.parse(JSON.stringify(dependencyEvidence));

  const result = reviewDecisionPortfolioDependencyEvidenceV1({
    portfolio: sourcePortfolio,
    dependencyEvidence,
    reviewedAt: REVIEWED_AT,
    maximumEvidenceAgeMs: MAX_AGE_MS
  });

  assert.deepEqual(sourcePortfolio, beforePortfolio);
  assert.deepEqual(dependencyEvidence, beforeEvidence);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.candidateReviews), true);
  assert.equal(Object.isFrozen(result.authority), true);
  assert.equal(result.authority.executionAuthorized, false);
  assert.equal(result.authority.approvalBypassAuthorized, false);
});
