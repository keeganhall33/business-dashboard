import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDecisionPortfolioV1,
  type DecisionCandidateV1,
  type DecisionPortfolioV1
} from "../../src/lib/strategy-engine/decision-portfolio-v1";
import {
  compareDecisionPortfoliosV1,
  type DecisionPortfolioChangeV1
} from "../../src/lib/strategy-engine/decision-portfolio-change-v1";
import {
  reviewDecisionPortfolioReallocationV1,
  type DecisionOutcomeObservationV1,
  type DecisionPortfolioReallocationReviewV1
} from "../../src/lib/strategy-engine/decision-portfolio-reallocation-v1";
import {
  certifyDecisionPortfolioReallocationLineageV1,
  DecisionPortfolioReallocationLineageError
} from "../../src/lib/strategy-engine/decision-portfolio-reallocation-lineage-v1";

function candidate(
  id: string,
  strategicFit: number,
  overrides: Partial<DecisionCandidateV1> = {}
): DecisionCandidateV1 {
  return {
    id,
    title: id,
    candidateType: "DECISION",
    owner: "JEEVES",
    approvalClass: "NONE",
    evidenceState: "KNOWN",
    evidenceRefs: [`evidence:${id}`],
    sourceRefs: [`source:${id}`],
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
    successMetric: `Measure ${id}`,
    evaluationWindow: { start: "2026-09-15T00:00:00.000Z", end: "2026-09-18T00:00:00.000Z" },
    ...overrides
  };
}

const capacity = {
  keeganHours: 4,
  ioanaHours: 4,
  jeevesHours: 1,
  cashCents: 100_000,
  maxSelected: 1,
  maxKeeganDecisions: 1
};

const firstAt = "2026-09-15T04:00:00.000Z";
const measuredAt = "2026-09-18T02:00:00.000Z";
const reviewedAt = "2026-09-18T04:00:00.000Z";
const currentAt = "2026-09-19T04:00:00.000Z";
const comparedAt = "2026-09-19T05:00:00.000Z";
const certifiedAt = "2026-09-19T06:00:00.000Z";

function build(candidates: readonly DecisionCandidateV1[], generatedAt: string): DecisionPortfolioV1 {
  return buildDecisionPortfolioV1({ candidates, capacity, generatedAt });
}

function alphaOutcome(overrides: Partial<DecisionOutcomeObservationV1> = {}): DecisionOutcomeObservationV1 {
  return {
    outcomeId: "outcome:alpha",
    candidateId: "alpha",
    measuredAt,
    evidenceState: "KNOWN",
    evidenceRefs: ["outcome-evidence:alpha"],
    sourceRefs: ["measurement-source:alpha"],
    result: "NEGATIVE",
    successCriterionState: "NOT_MET",
    materiality: "MATERIAL",
    materialityEvidenceRefs: ["outcome-evidence:alpha"],
    attributionClass: "NOT_ESTABLISHED",
    attributionEvidenceRefs: [],
    confounderRefs: [],
    assumptionUpdates: [],
    ...overrides
  };
}

function setup(options: {
  currentAlphaFit?: number;
  currentBetaFit?: number;
  bindReviewEvidence?: boolean;
  outcome?: DecisionOutcomeObservationV1;
  currentGeneratedAt?: string;
} = {}) {
  const previous = build([candidate("alpha", 90), candidate("beta", 20)], firstAt);
  const outcome = options.outcome ?? alphaOutcome();
  const reallocationReview = reviewDecisionPortfolioReallocationV1({
    portfolio: previous,
    outcomes: [outcome],
    reviewedAt
  });
  const bindReviewEvidence = options.bindReviewEvidence ?? true;
  const currentAlpha = candidate("alpha", options.currentAlphaFit ?? 20, bindReviewEvidence ? {
    evidenceRefs: ["evidence:alpha", "outcome-evidence:alpha"],
    sourceRefs: ["source:alpha", "measurement-source:alpha"]
  } : {});
  const current = build(
    [currentAlpha, candidate("beta", options.currentBetaFit ?? 90)],
    options.currentGeneratedAt ?? currentAt
  );
  const change = compareDecisionPortfoliosV1({ previous, current, comparedAt });
  return { previous, current, reallocationReview, change };
}

test("certifies evidence lineage across a post-review selection change without inventing cause", () => {
  const input = setup();
  const lineage = certifyDecisionPortfolioReallocationLineageV1({
    ...input,
    certifiedAt
  });

  assert.equal(lineage.status, "LINEAGE_READY_SELECTION_CHANGE");
  assert.equal(lineage.lineageReady, true);
  assert.equal(lineage.rebuildObserved, true);
  assert.deepEqual(lineage.reconsiderCandidateIds, ["alpha"]);
  assert.deepEqual(lineage.verificationCandidateIds, []);
  assert.deepEqual(lineage.change.selectedRemovedIds, ["alpha"]);
  assert.deepEqual(lineage.change.selectedAddedIds, ["beta"]);
  assert.equal(lineage.evidenceBindings.length, 1);
  assert.equal(lineage.evidenceBindings[0]?.state, "BOUND");
  assert.deepEqual(lineage.evidenceBindings[0]?.missingEvidenceRefs, []);
  assert.deepEqual(lineage.evidenceBindings[0]?.missingSourceRefs, []);
  assert.equal(lineage.evidenceBindings[0]?.recordedAttributionClass, "NOT_ESTABLISHED");
  assert.equal(lineage.interpretation.reviewEvidenceBoundToCurrentCandidates, true);
  assert.equal(lineage.interpretation.selectionChangedAfterReview, true);
  assert.equal(lineage.interpretation.selectionChangeCause, "NOT_ESTABLISHED");
  assert.equal(lineage.interpretation.rankChangeCause, "NOT_ESTABLISHED");
  assert.equal(lineage.interpretation.outcomeCause, "NOT_ESTABLISHED");
  assert.equal(lineage.interpretation.associationOnly, true);
  assert.equal(lineage.authority.portfolioMutation, false);
  assert.equal(lineage.authority.allocationMutation, false);
  assert.equal(lineage.authority.externalAction, false);
  assert.equal(lineage.authority.approvalBypass, false);
});

test("certifies a completed rebuild even when the selected set stays the same", () => {
  const input = setup({ currentAlphaFit: 90, currentBetaFit: 20 });
  const lineage = certifyDecisionPortfolioReallocationLineageV1({ ...input, certifiedAt });

  assert.equal(input.change.status, "PORTFOLIO_DETAIL_CHANGE");
  assert.equal(lineage.status, "LINEAGE_READY_NO_SELECTION_CHANGE");
  assert.equal(lineage.lineageReady, true);
  assert.equal(lineage.interpretation.selectionChangedAfterReview, false);
  assert.deepEqual(lineage.change.selectedAddedIds, []);
  assert.deepEqual(lineage.change.selectedRemovedIds, []);
  assert.equal(lineage.audit.boundReconsiderCandidates, 1);
  assert.equal(lineage.audit.unresolvedBindings, 0);
});

test("withholds lineage readiness when the rebuilt candidate drops the outcome evidence", () => {
  const input = setup({ bindReviewEvidence: false });
  const lineage = certifyDecisionPortfolioReallocationLineageV1({ ...input, certifiedAt });

  assert.equal(lineage.status, "EVIDENCE_BINDING_REQUIRED");
  assert.equal(lineage.lineageReady, false);
  assert.equal(lineage.evidenceBindings[0]?.state, "VERIFY");
  assert.deepEqual(lineage.evidenceBindings[0]?.missingEvidenceRefs, ["outcome-evidence:alpha"]);
  assert.deepEqual(lineage.evidenceBindings[0]?.missingSourceRefs, ["measurement-source:alpha"]);
  assert.ok(lineage.evidenceBindings[0]?.bindingIssues.includes("REVIEW_EVIDENCE_NOT_BOUND"));
  assert.ok(lineage.evidenceBindings[0]?.bindingIssues.includes("REVIEW_SOURCE_NOT_BOUND"));
});

test("keeps verification-required outcome evidence out of the ready lineage path", () => {
  const input = setup({
    outcome: alphaOutcome({ evidenceState: "INFERRED" })
  });
  const lineage = certifyDecisionPortfolioReallocationLineageV1({ ...input, certifiedAt });

  assert.equal(input.reallocationReview.status, "VERIFICATION_REQUIRED");
  assert.equal(lineage.status, "VERIFICATION_REQUIRED");
  assert.equal(lineage.lineageReady, false);
  assert.equal(lineage.rebuildObserved, true);
  assert.deepEqual(lineage.verificationCandidateIds, ["alpha"]);
  assert.deepEqual(lineage.reconsiderCandidateIds, []);
  assert.equal(lineage.interpretation.selectionChangeCause, "NOT_ESTABLISHED");
});

test("does not claim a downstream rebuild when the current portfolio is not after the review", () => {
  const input = setup({ currentGeneratedAt: reviewedAt });
  const lineage = certifyDecisionPortfolioReallocationLineageV1({ ...input, certifiedAt });

  assert.equal(input.reallocationReview.requiresPortfolioRebuild, true);
  assert.equal(lineage.rebuildObserved, false);
  assert.equal(lineage.status, "WAITING_FOR_REBUILD");
  assert.equal(lineage.lineageReady, false);
});

test("returns no rebuild required when the observed selected outcome does not contradict its disposition", () => {
  const input = setup({
    currentAlphaFit: 90,
    currentBetaFit: 20,
    outcome: alphaOutcome({
      result: "POSITIVE",
      successCriterionState: "MET"
    })
  });
  const lineage = certifyDecisionPortfolioReallocationLineageV1({ ...input, certifiedAt });

  assert.equal(input.reallocationReview.status, "NO_CHANGE");
  assert.equal(input.reallocationReview.requiresPortfolioRebuild, false);
  assert.equal(lineage.status, "NO_REBUILD_REQUIRED");
  assert.equal(lineage.lineageReady, false);
  assert.deepEqual(lineage.reconsiderCandidateIds, []);
});

test("rejects a tampered portfolio-change projection instead of trusting caller claims", () => {
  const input = setup();
  const tampered = structuredClone(input.change) as DecisionPortfolioChangeV1;
  tampered.selectedAddedIds = ["alpha"];

  assert.throws(
    () => certifyDecisionPortfolioReallocationLineageV1({
      ...input,
      change: tampered,
      certifiedAt
    }),
    (error: unknown) =>
      error instanceof DecisionPortfolioReallocationLineageError &&
      error.code === "CHANGE_PROJECTION_MISMATCH"
  );
});

test("rejects source reviews that widen authority or drift from their own audit", () => {
  const input = setup();
  const widened = structuredClone(input.reallocationReview) as DecisionPortfolioReallocationReviewV1;
  widened.authority.portfolioMutation = true as false;

  assert.throws(
    () => certifyDecisionPortfolioReallocationLineageV1({
      ...input,
      reallocationReview: widened,
      certifiedAt
    }),
    (error: unknown) =>
      error instanceof DecisionPortfolioReallocationLineageError &&
      error.code === "REALLOCATION_AUTHORITY_WIDENED"
  );

  const auditDrift = structuredClone(input.reallocationReview) as DecisionPortfolioReallocationReviewV1;
  auditDrift.audit.reconsiderCount = 0;
  assert.throws(
    () => certifyDecisionPortfolioReallocationLineageV1({
      ...input,
      reallocationReview: auditDrift,
      certifiedAt
    }),
    (error: unknown) =>
      error instanceof DecisionPortfolioReallocationLineageError &&
      error.code === "REALLOCATION_REVIEW_INTEGRITY_MISMATCH"
  );
});

test("is deterministic, immutable, and does not mutate canonical inputs", () => {
  const input = setup();
  const previousSnapshot = structuredClone(input.previous);
  const currentSnapshot = structuredClone(input.current);
  const reviewSnapshot = structuredClone(input.reallocationReview);
  const changeSnapshot = structuredClone(input.change);

  const first = certifyDecisionPortfolioReallocationLineageV1({ ...input, certifiedAt });
  const second = certifyDecisionPortfolioReallocationLineageV1({ ...input, certifiedAt });

  assert.equal(first.lineageId, second.lineageId);
  assert.deepEqual(first, second);
  assert.deepEqual(input.previous, previousSnapshot);
  assert.deepEqual(input.current, currentSnapshot);
  assert.deepEqual(input.reallocationReview, reviewSnapshot);
  assert.deepEqual(input.change, changeSnapshot);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.evidenceBindings));
  assert.ok(Object.isFrozen(first.evidenceBindings[0]));
  assert.ok(Object.isFrozen(first.authority));
});
