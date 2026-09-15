import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDecisionPortfolioV1,
  DecisionPortfolioError,
  type DecisionCandidateV1
} from "../../src/lib/strategy-engine/decision-portfolio-v1";

const now = "2026-09-15T04:00:00.000Z";

function candidate(id: string, overrides: Partial<DecisionCandidateV1> = {}): DecisionCandidateV1 {
  return {
    id,
    title: id,
    candidateType: "OPPORTUNITY",
    owner: "JEEVES",
    approvalClass: "NONE",
    evidenceState: "KNOWN",
    evidenceRefs: [`evidence:${id}`],
    sourceRefs: [`source:${id}`],
    monetaryCase: null,
    value: { strategicFit: 50, compoundingAdvantage: 50, relationshipAccess: 50, futureOptions: 50, learningValue: 50, urgency: 50, reversibility: 50 },
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

const capacity = { keeganHours: 4, ioanaHours: 8, jeevesHours: 8, cashCents: 100_000, maxSelected: 3, maxKeeganDecisions: 1 };

test("chooses the best exact capacity-feasible portfolio instead of independent top scores", () => {
  const expensive = candidate("expensive", { value: { strategicFit: 90, compoundingAdvantage: 90, relationshipAccess: 90, futureOptions: 90, learningValue: 90, urgency: 90, reversibility: 90 }, resources: { keeganHours: 0, ioanaHours: 0, jeevesHours: 8, cashCents: 0 } });
  const pairA = candidate("pair-a", { value: { strategicFit: 80, compoundingAdvantage: 80, relationshipAccess: 80, futureOptions: 80, learningValue: 80, urgency: 80, reversibility: 80 }, resources: { keeganHours: 0, ioanaHours: 0, jeevesHours: 4, cashCents: 0 } });
  const pairB = candidate("pair-b", { ...pairA, id: "pair-b", title: "pair-b", evidenceRefs: ["evidence:pair-b"], sourceRefs: ["source:pair-b"] });
  const result = buildDecisionPortfolioV1({ candidates: [expensive, pairB, pairA], capacity, generatedAt: now });
  assert.deepEqual(result.selectedIds, ["pair-a", "pair-b"]);
  assert.equal(result.usedCapacity.jeevesHours, 8);
  assert.equal(result.items.find((item) => item.candidate.id === "expensive")?.disposition, "DEFERRED");
  assert.ok(result.audit.feasiblePortfoliosEvaluated > 1);
});

test("keeps supported monetary EV separate from qualitative strategic value", () => {
  const item = candidate("supported", {
    monetaryCase: { currency: "USD", downsideCents: -10_000, baseCents: 100_000, upsideCents: 300_000, probabilityLow: 0.1, probabilityBase: 0.5, probabilityHigh: 0.8, calibrationClass: "REFERENCE_CLASS" },
    resources: { keeganHours: 0, ioanaHours: 0, jeevesHours: 1, cashCents: 5_000 }
  });
  const result = buildDecisionPortfolioV1({ candidates: [item], capacity, generatedAt: now });
  const score = result.items[0].score;
  assert.equal(score.monetaryExpectedCents, 79_750);
  assert.ok(score.strategicScore > 0);
  assert.ok(score.components.monetary > 0);

  const qualitative = buildDecisionPortfolioV1({ candidates: [candidate("prestige")], capacity, generatedAt: now });
  assert.equal(qualitative.items[0].score.monetaryExpectedCents, null);
  assert.equal(qualitative.items[0].score.monetaryScore, 0);
});

test("routes unknown, stale, conflicted, and explicitly blocked work to information gain or rejection", () => {
  const result = buildDecisionPortfolioV1({
    candidates: [
      candidate("unknown", { evidenceState: "UNKNOWN", informationGainAction: "Verify buyer authority" }),
      candidate("stale", { evidenceState: "STALE" }),
      candidate("rights", { blockers: ["Rights holder approval missing"], informationGainAction: "Confirm reproduction rights" })
    ], capacity, generatedAt: now
  });
  assert.deepEqual(result.selectedIds, []);
  assert.deepEqual(result.informationGainIds, ["rights", "unknown"]);
  assert.equal(result.items.find((item) => item.candidate.id === "stale")?.disposition, "REJECTED");
  assert.match(result.items.find((item) => item.candidate.id === "rights")!.exclusionReason!, /Rights holder/);
});

test("enforces dependency, conflict, and scarce Keegan-decision limits", () => {
  const high = { strategicFit: 95, compoundingAdvantage: 95, relationshipAccess: 95, futureOptions: 95, learningValue: 95, urgency: 95, reversibility: 95 };
  const result = buildDecisionPortfolioV1({
    candidates: [
      candidate("dependent", { value: high, dependencyIds: ["intro"] }),
      candidate("intro", { owner: "KEEGAN", approvalClass: "KEEGAN", resources: { keeganHours: 1, ioanaHours: 0, jeevesHours: 0, cashCents: 0 }, conflictKeys: ["outreach:target"] }),
      candidate("alternate", { owner: "KEEGAN", approvalClass: "KEEGAN", resources: { keeganHours: 1, ioanaHours: 0, jeevesHours: 0, cashCents: 0 }, conflictKeys: ["outreach:target"], value: high })
    ], capacity: { ...capacity, maxSelected: 3 }, generatedAt: now
  });
  assert.equal(result.keeganDecisionIds.length, 1);
  if (result.selectedIds.includes("dependent")) assert.ok(result.selectedIds.includes("intro"), "a selected dependency must be satisfied inside the portfolio");
  assert.ok(!(result.selectedIds.includes("intro") && result.selectedIds.includes("alternate")));
});

test("permits an externally satisfied dependency and assigns owner queues", () => {
  const result = buildDecisionPortfolioV1({
    candidates: [
      candidate("jeeves", { dependencyIds: ["approved-brief"] }),
      candidate("ioana", { owner: "IOANA", resources: { keeganHours: 0, ioanaHours: 1, jeevesHours: 0, cashCents: 0 } }),
      candidate("keegan", { owner: "KEEGAN", approvalClass: "KEEGAN", resources: { keeganHours: 1, ioanaHours: 0, jeevesHours: 0, cashCents: 0 } })
    ], capacity, generatedAt: now, satisfiedDependencyIds: ["approved-brief"]
  });
  assert.deepEqual(result.ownerQueues.JEEVES, ["jeeves"]);
  assert.deepEqual(result.ownerQueues.IOANA, ["ioana"]);
  assert.deepEqual(result.ownerQueues.KEEGAN, ["keegan"]);
  assert.deepEqual(result.keeganDecisionIds, ["keegan"]);
});

test("deduplicates candidates and refs deterministically without mutating input", () => {
  const source = candidate("same", { evidenceRefs: ["z", "a", "a"], sourceRefs: ["s2", "s1", "s1"] });
  const snapshot = structuredClone(source);
  const first = buildDecisionPortfolioV1({ candidates: [source, structuredClone(source)], capacity, generatedAt: now });
  const second = buildDecisionPortfolioV1({ candidates: [structuredClone(source), source], capacity, generatedAt: now });
  assert.equal(first.portfolioId, second.portfolioId);
  assert.equal(first.audit.duplicateCandidatesSuppressed, 1);
  assert.deepEqual(first.evidenceRefs, ["a", "z"]);
  assert.deepEqual(first.sourceRefs, ["s1", "s2"]);
  assert.deepEqual(source, snapshot);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.items[0].candidate));
});

test("refuses fake precision and unsafe or invalid inputs", () => {
  assert.throws(() => buildDecisionPortfolioV1({ candidates: [candidate("bad", { monetaryCase: { currency: "USD", downsideCents: 0, baseCents: 100, upsideCents: 50, probabilityLow: 0.1, probabilityBase: 0.5, probabilityHigh: 0.9, calibrationClass: "OBSERVED" } })], capacity, generatedAt: now }), (error: unknown) => error instanceof DecisionPortfolioError && error.code === "INVALID_RANGE");
  assert.throws(() => buildDecisionPortfolioV1({ candidates: [candidate("bad-probability", { monetaryCase: { currency: "USD", downsideCents: 0, baseCents: 100, upsideCents: 200, probabilityLow: 0.8, probabilityBase: 0.5, probabilityHigh: 0.9, calibrationClass: "EXPERT_ESTIMATE" } })], capacity, generatedAt: now }), /probability range is unordered/);
  assert.throws(() => buildDecisionPortfolioV1({ candidates: Array.from({ length: 19 }, (_, index) => candidate(`c${index}`)), capacity, generatedAt: now }), (error: unknown) => error instanceof DecisionPortfolioError && error.code === "CANDIDATE_BOUND");
});
