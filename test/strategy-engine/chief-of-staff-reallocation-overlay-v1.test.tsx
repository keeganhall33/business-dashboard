import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDecisionPortfolioV1,
  type DecisionCandidateV1,
  type DecisionPortfolioV1
} from "../../src/lib/strategy-engine/decision-portfolio-v1";
import { compareDecisionPortfoliosV1 } from "../../src/lib/strategy-engine/decision-portfolio-change-v1";
import {
  reviewDecisionPortfolioReallocationV1,
  type DecisionOutcomeObservationV1
} from "../../src/lib/strategy-engine/decision-portfolio-reallocation-v1";
import {
  certifyDecisionPortfolioReallocationLineageV1,
  type DecisionPortfolioReallocationLineageV1
} from "../../src/lib/strategy-engine/decision-portfolio-reallocation-lineage-v1";
import {
  ChiefOfStaffReallocationOverlayError,
  compileChiefOfStaffReallocationOverlayV1
} from "../../src/lib/strategy-engine/chief-of-staff-reallocation-overlay-v1";

function candidate(
  id: string,
  strategicFit: number,
  overrides: Partial<DecisionCandidateV1> = {}
): DecisionCandidateV1 {
  return {
    id,
    title: id === "alpha" ? "Alpha decision" : "Beta decision",
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
    evaluationWindow: {
      start: "2026-09-15T00:00:00.000Z",
      end: "2026-09-18T00:00:00.000Z"
    },
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
const generatedAt = "2026-09-19T07:00:00.000Z";

function build(candidates: readonly DecisionCandidateV1[], at: string): DecisionPortfolioV1 {
  return buildDecisionPortfolioV1({ candidates, capacity, generatedAt: at });
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
  const lineage = certifyDecisionPortfolioReallocationLineageV1({
    previous,
    current,
    reallocationReview,
    change,
    certifiedAt
  });
  return { previous, current, lineage };
}

function compile(input = setup(), overrides: {
  generatedAt?: string;
  maximumLineageAgeMs?: number;
} = {}) {
  return compileChiefOfStaffReallocationOverlayV1({
    ...input,
    generatedAt: overrides.generatedAt ?? generatedAt,
    maximumLineageAgeMs: overrides.maximumLineageAgeMs ?? 2 * 60 * 60 * 1000
  });
}

test("surfaces a certified post-outcome portfolio change without inventing why it changed", () => {
  const overlay = compile();

  assert.equal(overlay.state, "READY_SELECTION_CHANGE");
  assert.equal(overlay.sourceAgeMs, 60 * 60 * 1000);
  assert.deepEqual(overlay.portfolioChanges.selectedRemoved, [
    { candidateId: "alpha", title: "Alpha decision" }
  ]);
  assert.deepEqual(overlay.portfolioChanges.selectedAdded, [
    { candidateId: "beta", title: "Beta decision" }
  ]);
  assert.equal(overlay.reviewSignals.length, 1);
  assert.equal(overlay.reviewSignals[0]?.candidateId, "alpha");
  assert.equal(overlay.reviewSignals[0]?.outcomeId, "outcome:alpha");
  assert.equal(overlay.reviewSignals[0]?.state, "BOUND");
  assert.equal(overlay.reviewSignals[0]?.recordedAttributionClass, "NOT_ESTABLISHED");
  assert.deepEqual(overlay.evidenceRefs, ["outcome-evidence:alpha"]);
  assert.deepEqual(overlay.sourceRefs, ["measurement-source:alpha"]);
  assert.equal(overlay.interpretation.selectionChangedAfterReview, true);
  assert.equal(overlay.interpretation.selectionChangeCause, "NOT_ESTABLISHED");
  assert.equal(overlay.interpretation.rankChangeCause, "NOT_ESTABLISHED");
  assert.equal(overlay.interpretation.outcomeCause, "NOT_ESTABLISHED");
  assert.equal(overlay.interpretation.associationOnly, true);
  assert.equal(overlay.authority.reallocationAuthorized, false);
  assert.equal(overlay.authority.externalActionAuthorized, false);
  assert.equal(overlay.authority.approvalBypassAuthorized, false);
});

test("reports a completed evidence-backed rebuild with no selection change as context, not success", () => {
  const overlay = compile(setup({ currentAlphaFit: 90, currentBetaFit: 20 }));

  assert.equal(overlay.state, "READY_NO_SELECTION_CHANGE");
  assert.equal(overlay.summary.reconsiderCandidates, 1);
  assert.equal(overlay.summary.boundReconsiderCandidates, 1);
  assert.equal(overlay.summary.selectedAdded, 0);
  assert.equal(overlay.summary.selectedRemoved, 0);
  assert.deepEqual(overlay.portfolioChanges.selectedAdded, []);
  assert.deepEqual(overlay.portfolioChanges.selectedRemoved, []);
  assert.equal(overlay.reviewSignals[0]?.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(overlay.reviewSignals[0]?.confidence, "NOT_ESTABLISHED");
  assert.equal(overlay.reviewSignals[0]?.monetaryValue, null);
});

test("keeps missing outcome binding in verification instead of presenting reallocation as ready", () => {
  const overlay = compile(setup({ bindReviewEvidence: false }));

  assert.equal(overlay.state, "VERIFY_EVIDENCE_BINDING");
  assert.equal(overlay.summary.unresolvedBindings, 1);
  assert.equal(overlay.reviewSignals[0]?.state, "VERIFY");
  assert.deepEqual(overlay.reviewSignals[0]?.missingEvidenceRefs, ["outcome-evidence:alpha"]);
  assert.deepEqual(overlay.reviewSignals[0]?.missingSourceRefs, ["measurement-source:alpha"]);
  assert.ok(overlay.reviewSignals[0]?.bindingIssues.includes("REVIEW_EVIDENCE_NOT_BOUND"));
  assert.ok(overlay.reviewSignals[0]?.bindingIssues.includes("REVIEW_SOURCE_NOT_BOUND"));
});

test("preserves upstream verification when outcome evidence is inferred", () => {
  const overlay = compile(setup({ outcome: alphaOutcome({ evidenceState: "INFERRED" }) }));

  assert.equal(overlay.state, "VERIFY_SOURCE");
  assert.equal(overlay.summary.verificationCandidates, 1);
  assert.equal(overlay.summary.reconsiderCandidates, 0);
  assert.equal(overlay.reviewSignals.length, 0);
  assert.equal(overlay.interpretation.selectionChangeCause, "NOT_ESTABLISHED");
});

test("preserves waiting state until a post-review portfolio rebuild is actually observed", () => {
  const overlay = compile(setup({ currentGeneratedAt: reviewedAt }));

  assert.equal(overlay.state, "WAITING_FOR_REBUILD");
  assert.equal(overlay.summary.reconsiderCandidates, 1);
  assert.equal(overlay.interpretation.selectionChangedAfterReview, false);
});

test("preserves no-rebuild state when observed outcome does not contradict the selected disposition", () => {
  const overlay = compile(setup({
    currentAlphaFit: 90,
    currentBetaFit: 20,
    outcome: alphaOutcome({ result: "POSITIVE", successCriterionState: "MET" })
  }));

  assert.equal(overlay.state, "NO_REBUILD_REQUIRED");
  assert.equal(overlay.summary.reconsiderCandidates, 0);
  assert.equal(overlay.summary.verificationCandidates, 0);
  assert.equal(overlay.reviewSignals.length, 0);
  assert.equal(overlay.authority.portfolioMutationAuthorized, false);
});

test("fails closed when certified lineage is stale or future-dated for the executive decision time", () => {
  const input = setup();

  assert.throws(
    () => compile(input, {
      generatedAt: "2026-09-19T09:00:00.000Z",
      maximumLineageAgeMs: 60 * 60 * 1000
    }),
    (error: unknown) =>
      error instanceof ChiefOfStaffReallocationOverlayError && error.code === "STALE_LINEAGE"
  );

  assert.throws(
    () => compile(input, { generatedAt: "2026-09-19T05:59:59.000Z" }),
    (error: unknown) =>
      error instanceof ChiefOfStaffReallocationOverlayError && error.code === "LINEAGE_FROM_FUTURE"
  );
});

test("rejects a tampered lineage change summary instead of surfacing false portfolio movement", () => {
  const input = setup();
  const lineage = structuredClone(input.lineage) as DecisionPortfolioReallocationLineageV1;
  lineage.change.selectedAddedIds = ["alpha"];

  assert.throws(
    () => compile({ ...input, lineage }),
    (error: unknown) =>
      error instanceof ChiefOfStaffReallocationOverlayError && error.code === "LINEAGE_CHANGE_MISMATCH"
  );
});

test("rejects widened lineage authority", () => {
  const input = setup();
  const lineage = structuredClone(input.lineage) as DecisionPortfolioReallocationLineageV1;
  lineage.authority.allocationMutation = true as false;

  assert.throws(
    () => compile({ ...input, lineage }),
    (error: unknown) =>
      error instanceof ChiefOfStaffReallocationOverlayError && error.code === "LINEAGE_AUTHORITY_WIDENED"
  );
});

test("rejects a claimed bound outcome when the current candidate no longer carries its evidence", () => {
  const input = setup();
  const current = structuredClone(input.current) as DecisionPortfolioV1;
  const alpha = current.items.find((item) => item.candidate.id === "alpha");
  assert.ok(alpha);
  alpha.candidate.evidenceRefs = ["evidence:alpha"];

  assert.throws(
    () => compile({ ...input, current }),
    (error: unknown) =>
      error instanceof ChiefOfStaffReallocationOverlayError && error.code === "BOUND_EVIDENCE_DRIFT"
  );
});

test("is deterministic, immutable, and leaves canonical inputs untouched", () => {
  const input = setup();
  const previousSnapshot = structuredClone(input.previous);
  const currentSnapshot = structuredClone(input.current);
  const lineageSnapshot = structuredClone(input.lineage);

  const first = compile(input);
  const second = compile(input);

  assert.deepEqual(first, second);
  assert.deepEqual(input.previous, previousSnapshot);
  assert.deepEqual(input.current, currentSnapshot);
  assert.deepEqual(input.lineage, lineageSnapshot);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.reviewSignals));
  assert.ok(Object.isFrozen(first.reviewSignals[0]));
  assert.ok(Object.isFrozen(first.portfolioChanges));
  assert.ok(Object.isFrozen(first.authority));
});
