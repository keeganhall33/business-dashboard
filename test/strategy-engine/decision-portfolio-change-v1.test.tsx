import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDecisionPortfolioV1,
  type DecisionCandidateV1,
  type DecisionPortfolioV1
} from "../../src/lib/strategy-engine/decision-portfolio-v1";
import {
  compareDecisionPortfoliosV1,
  DecisionPortfolioChangeError
} from "../../src/lib/strategy-engine/decision-portfolio-change-v1";

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
    evaluationWindow: { start: "2026-09-15", end: "2026-10-15" },
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

function build(candidates: readonly DecisionCandidateV1[], generatedAt: string): DecisionPortfolioV1 {
  return buildDecisionPortfolioV1({ candidates, capacity, generatedAt });
}

const firstAt = "2026-09-15T04:00:00.000Z";
const secondAt = "2026-09-16T04:00:00.000Z";
const comparedAt = "2026-09-16T05:00:00.000Z";

test("surfaces a selected-portfolio swap without inventing why it happened", () => {
  const previous = build([candidate("alpha", 90), candidate("beta", 20)], firstAt);
  const current = build([candidate("alpha", 20), candidate("beta", 90)], secondAt);
  const change = compareDecisionPortfoliosV1({ previous, current, comparedAt });

  assert.equal(change.status, "SELECTION_CHANGE");
  assert.deepEqual(change.selectedAddedIds, ["beta"]);
  assert.deepEqual(change.selectedRemovedIds, ["alpha"]);
  assert.equal(change.attribution.selectionCause, "NOT_ESTABLISHED");
  assert.equal(change.attribution.rankCause, "NOT_ESTABLISHED");
  assert.equal(change.attribution.outcomeCause, "NOT_ESTABLISHED");
  assert.equal(change.authority.portfolioMutation, false);
  assert.equal(change.authority.allocationMutation, false);
  assert.equal(change.authority.externalAction, false);
  assert.equal(change.authority.approvalBypass, false);

  const alpha = change.candidateChanges.find((item) => item.candidateId === "alpha");
  const beta = change.candidateChanges.find((item) => item.candidateId === "beta");
  assert.ok(alpha?.changeKinds.includes("DISPOSITION_CHANGED"));
  assert.ok(beta?.changeKinds.includes("DISPOSITION_CHANGED"));
  assert.equal(alpha?.causeAttribution, "NOT_ESTABLISHED");
  assert.equal(beta?.causeAttribution, "NOT_ESTABLISHED");
});

test("projects new and cleared Keegan decisions and owner-queue movement as facts only", () => {
  const previous = build([candidate("jeeves", 90), candidate("keegan", 20, {
    owner: "KEEGAN",
    approvalClass: "KEEGAN",
    resources: { keeganHours: 1, ioanaHours: 0, jeevesHours: 0, cashCents: 0 }
  })], firstAt);
  const current = build([candidate("jeeves", 20), candidate("keegan", 90, {
    owner: "KEEGAN",
    approvalClass: "KEEGAN",
    resources: { keeganHours: 1, ioanaHours: 0, jeevesHours: 0, cashCents: 0 }
  })], secondAt);
  const change = compareDecisionPortfoliosV1({ previous, current, comparedAt });

  assert.deepEqual(change.newKeeganDecisionIds, ["keegan"]);
  assert.deepEqual(change.clearedKeeganDecisionIds, []);
  const keeganQueue = change.ownerQueueChanges.find((queue) => queue.owner === "KEEGAN");
  const jeevesQueue = change.ownerQueueChanges.find((queue) => queue.owner === "JEEVES");
  assert.deepEqual(keeganQueue?.addedCandidateIds, ["keegan"]);
  assert.deepEqual(jeevesQueue?.removedCandidateIds, ["jeeves"]);
  assert.equal(change.usedCapacityDelta.keeganHours, 1);
  assert.equal(change.usedCapacityDelta.jeevesHours, -1);
});

test("returns NO_CHANGE when two later snapshots are semantically unchanged", () => {
  const inputs = [candidate("alpha", 80), candidate("beta", 70)];
  const previous = build(inputs, firstAt);
  const current = build(inputs.map((item) => structuredClone(item)), secondAt);
  const change = compareDecisionPortfoliosV1({ previous, current, comparedAt });

  assert.equal(change.status, "NO_CHANGE");
  assert.deepEqual(change.selectedAddedIds, []);
  assert.deepEqual(change.selectedRemovedIds, []);
  assert.deepEqual(change.candidateChanges, []);
  assert.deepEqual(change.evidenceRefsAdded, []);
  assert.deepEqual(change.evidenceRefsRemoved, []);
  assert.deepEqual(change.sourceRefsAdded, []);
  assert.deepEqual(change.sourceRefsRemoved, []);
});

test("records candidate and provenance additions/removals without assigning a cause", () => {
  const previous = build([candidate("old", 90)], firstAt);
  const current = build([candidate("new", 90)], secondAt);
  const change = compareDecisionPortfoliosV1({ previous, current, comparedAt });

  const oldChange = change.candidateChanges.find((item) => item.candidateId === "old");
  const newChange = change.candidateChanges.find((item) => item.candidateId === "new");
  assert.deepEqual(oldChange?.changeKinds, ["REMOVED"]);
  assert.deepEqual(newChange?.changeKinds, ["ADDED"]);
  assert.equal(oldChange?.causeAttribution, "NOT_ESTABLISHED");
  assert.equal(newChange?.causeAttribution, "NOT_ESTABLISHED");
  assert.deepEqual(change.evidenceRefsRemoved, ["evidence:old"]);
  assert.deepEqual(change.evidenceRefsAdded, ["evidence:new"]);
  assert.deepEqual(change.sourceRefsRemoved, ["source:old"]);
  assert.deepEqual(change.sourceRefsAdded, ["source:new"]);
});

test("preserves evidence-state changes instead of upgrading UNKNOWN to truth", () => {
  const previous = build([candidate("uncertain", 90)], firstAt);
  const current = build([candidate("uncertain", 90, {
    evidenceState: "UNKNOWN",
    informationGainAction: "Resolve missing evidence"
  })], secondAt);
  const change = compareDecisionPortfoliosV1({ previous, current, comparedAt });

  const item = change.candidateChanges.find((candidateChange) => candidateChange.candidateId === "uncertain");
  assert.ok(item?.changeKinds.includes("EVIDENCE_STATE_CHANGED"));
  assert.equal(item?.previous?.evidenceState, "KNOWN");
  assert.equal(item?.current?.evidenceState, "UNKNOWN");
  assert.equal(item?.causeAttribution, "NOT_ESTABLISHED");
});

test("detects detail/rank changes even when the selected set is unchanged", () => {
  const broadCapacity = { ...capacity, jeevesHours: 2, maxSelected: 2 };
  const previous = buildDecisionPortfolioV1({
    candidates: [candidate("alpha", 90), candidate("beta", 80)],
    capacity: broadCapacity,
    generatedAt: firstAt
  });
  const current = buildDecisionPortfolioV1({
    candidates: [candidate("alpha", 70), candidate("beta", 95)],
    capacity: broadCapacity,
    generatedAt: secondAt
  });
  const change = compareDecisionPortfoliosV1({ previous, current, comparedAt });

  assert.equal(change.status, "PORTFOLIO_DETAIL_CHANGE");
  assert.deepEqual(change.selectedAddedIds, []);
  assert.deepEqual(change.selectedRemovedIds, []);
  assert.ok(change.candidateChanges.some((item) => item.changeKinds.includes("RANK_CHANGED")));
  assert.equal(change.attribution.rankCause, "NOT_ESTABLISHED");
});

test("rejects reversed chronology and comparison times that precede the current snapshot", () => {
  const previous = build([candidate("alpha", 90)], firstAt);
  const current = build([candidate("alpha", 90)], secondAt);

  assert.throws(
    () => compareDecisionPortfoliosV1({ previous: current, current: previous, comparedAt }),
    (error: unknown) => error instanceof DecisionPortfolioChangeError && error.code === "NON_MONOTONIC_PORTFOLIO"
  );

  assert.throws(
    () => compareDecisionPortfoliosV1({ previous, current, comparedAt: "2026-09-15T12:00:00.000Z" }),
    (error: unknown) => error instanceof DecisionPortfolioChangeError && error.code === "FUTURE_PORTFOLIO"
  );
});

test("is deterministic, immutable, and does not mutate either canonical portfolio", () => {
  const previous = build([candidate("alpha", 90), candidate("beta", 20)], firstAt);
  const current = build([candidate("alpha", 20), candidate("beta", 90)], secondAt);
  const previousSnapshot = structuredClone(previous);
  const currentSnapshot = structuredClone(current);

  const first = compareDecisionPortfoliosV1({ previous, current, comparedAt });
  const second = compareDecisionPortfoliosV1({ previous, current, comparedAt });

  assert.equal(first.changeId, second.changeId);
  assert.deepEqual(first, second);
  assert.deepEqual(previous, previousSnapshot);
  assert.deepEqual(current, currentSnapshot);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.candidateChanges));
  assert.ok(Object.isFrozen(first.ownerQueueChanges));
});
