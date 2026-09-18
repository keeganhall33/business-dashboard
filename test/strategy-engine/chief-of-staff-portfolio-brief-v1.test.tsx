import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDecisionPortfolioV1,
  type DecisionCandidateV1,
  type DecisionPortfolioCapacityV1,
  type DecisionPortfolioV1
} from "../../src/lib/strategy-engine/decision-portfolio-v1";
import {
  compileDecisionPortfolioExecutionV1,
  type DecisionPortfolioExecutionCompilerV1
} from "../../src/lib/strategy-engine/decision-portfolio-execution-compiler-v1";
import {
  buildChiefOfStaffPortfolioBriefV1,
  ChiefOfStaffPortfolioBriefError
} from "../../src/lib/strategy-engine/chief-of-staff-portfolio-brief-v1";

const portfolioGeneratedAt = "2026-09-18T10:00:00.000Z";
const executionGeneratedAt = "2026-09-18T10:30:00.000Z";
const briefGeneratedAt = "2026-09-18T10:45:00.000Z";

function candidate(id: string, overrides: Partial<DecisionCandidateV1> = {}): DecisionCandidateV1 {
  return {
    id,
    title: `Title ${id}`,
    candidateType: "OPPORTUNITY",
    owner: "JEEVES",
    approvalClass: "NONE",
    evidenceState: "KNOWN",
    evidenceRefs: [`evidence:${id}`],
    sourceRefs: [`source:${id}`],
    monetaryCase: null,
    value: {
      strategicFit: 80,
      compoundingAdvantage: 80,
      relationshipAccess: 70,
      futureOptions: 70,
      learningValue: 60,
      urgency: 60,
      reversibility: 90
    },
    risk: { execution: 10, reputation: 10, rights: 10 },
    resources: { keeganHours: 0, ioanaHours: 0, jeevesHours: 1, cashCents: 0 },
    dependencyIds: [],
    conflictKeys: [],
    blockers: [],
    informationGainAction: null,
    safeNextStep: `Prepare ${id}`,
    successMetric: `Measure ${id}`,
    evaluationWindow: { start: "2026-09-18", end: "2026-10-18" },
    ...overrides
  };
}

const defaultCapacity: DecisionPortfolioCapacityV1 = {
  keeganHours: 8,
  ioanaHours: 8,
  jeevesHours: 20,
  cashCents: 1_000_000,
  maxSelected: 8,
  maxKeeganDecisions: 2
};

function portfolio(
  candidates: DecisionCandidateV1[],
  options: {
    capacity?: DecisionPortfolioCapacityV1;
    satisfiedDependencyIds?: readonly string[];
  } = {}
): DecisionPortfolioV1 {
  return buildDecisionPortfolioV1({
    candidates,
    capacity: options.capacity ?? defaultCapacity,
    generatedAt: portfolioGeneratedAt,
    satisfiedDependencyIds: options.satisfiedDependencyIds ?? []
  });
}

function execution(
  source: DecisionPortfolioV1,
  options: {
    satisfiedDependencyIds?: readonly string[];
    previousIdempotencyKeys?: readonly string[];
    generatedAt?: string;
  } = {}
): DecisionPortfolioExecutionCompilerV1 {
  return compileDecisionPortfolioExecutionV1({
    portfolio: source,
    generatedAt: options.generatedAt ?? executionGeneratedAt,
    maxPortfolioAgeMs: 60 * 60 * 1000,
    satisfiedDependencyIds: options.satisfiedDependencyIds ?? [],
    previousIdempotencyKeys: options.previousIdempotencyKeys ?? []
  });
}

function brief(source: DecisionPortfolioV1, compiled: DecisionPortfolioExecutionCompilerV1) {
  return buildChiefOfStaffPortfolioBriefV1({
    portfolio: source,
    execution: compiled,
    generatedAt: briefGeneratedAt,
    maxExecutionAgeMs: 60 * 60 * 1000
  });
}

test("synthesizes the selected portfolio into concise Keegan, Jeeves, review, and owner queues", () => {
  const source = portfolio([
    candidate("jeeves"),
    candidate("review", { approvalClass: "REVIEW" }),
    candidate("keegan", {
      owner: "KEEGAN",
      approvalClass: "KEEGAN",
      resources: { keeganHours: 1, ioanaHours: 0, jeevesHours: 0, cashCents: 0 }
    }),
    candidate("ioana", {
      owner: "IOANA",
      resources: { keeganHours: 0, ioanaHours: 1, jeevesHours: 0, cashCents: 0 }
    })
  ]);
  const compiled = execution(source);
  const result = brief(source, compiled);

  assert.equal(result.overview.selected, 4);
  assert.equal(result.overview.decisionsForKeegan, 1);
  assert.equal(result.overview.jeevesPreparationReady, 1);
  assert.equal(result.overview.internalReviewReady, 1);
  assert.equal(result.overview.ownerActionReady, 1);
  assert.equal(result.decisionsForKeegan[0].candidateId, "keegan");
  assert.equal(result.jeevesPreparationReady[0].candidateId, "jeeves");
  assert.equal(result.internalReviewReady[0].candidateId, "review");
  assert.equal(result.ownerActionReady[0].candidateId, "ioana");
  assert.equal(result.decisionsForKeegan[0].measurement.successMetric, "Measure keegan");
  assert.equal(result.sourcePortfolio.portfolioId, source.portfolioId);
  assert.equal(result.sourceExecution.generatedAt, compiled.generatedAt);
});

test("keeps synthesis preparation-only and never upgrades a handoff into execution authority", () => {
  const source = portfolio([
    candidate("external-sounding", {
      safeNextStep: "Send the sponsor email, change spend, publish the launch, and sign the deal"
    })
  ]);
  const result = brief(source, execution(source));

  assert.equal(result.jeevesPreparationReady.length, 1);
  assert.match(result.jeevesPreparationReady[0].safeNextStep, /Send the sponsor email/);
  assert.deepEqual(result.authority, {
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
  });
});

test("surfaces information-gain work and explicit portfolio tradeoffs without inventing value", () => {
  const capacity: DecisionPortfolioCapacityV1 = {
    ...defaultCapacity,
    maxSelected: 1
  };
  const source = portfolio(
    [
      candidate("selected", {
        value: {
          strategicFit: 95,
          compoundingAdvantage: 95,
          relationshipAccess: 90,
          futureOptions: 90,
          learningValue: 90,
          urgency: 90,
          reversibility: 90
        }
      }),
      candidate("deferred", {
        value: {
          strategicFit: 20,
          compoundingAdvantage: 20,
          relationshipAccess: 20,
          futureOptions: 20,
          learningValue: 20,
          urgency: 20,
          reversibility: 20
        }
      }),
      candidate("research-first", {
        evidenceState: "UNKNOWN",
        informationGainAction: "Verify rights and current sponsor timing before allocation"
      })
    ],
    { capacity }
  );
  const result = brief(source, execution(source));

  assert.deepEqual(result.informationGain.map((item) => item.candidateId), ["research-first"]);
  assert.equal(result.informationGain[0].informationGainAction, "Verify rights and current sponsor timing before allocation");
  assert.ok(result.tradeoffs.some((item) => item.candidateId === "deferred" && item.disposition === "DEFERRED"));
  assert.equal(result.overview.informationGain, 1);
  assert.equal(result.overview.deferred, 1);
  assert.equal(result.informationGain[0].evidenceState, "UNKNOWN");
});

test("keeps revalidation and dependency failures in blocked work rather than actionable queues", () => {
  const source = portfolio(
    [
      candidate("inferred", { evidenceState: "INFERRED" }),
      candidate("dependent", { dependencyIds: ["external:rights-approved"] })
    ],
    { satisfiedDependencyIds: ["external:rights-approved"] }
  );
  const compiled = execution(source);
  const result = brief(source, compiled);

  assert.equal(result.jeevesPreparationReady.length, 0);
  assert.equal(result.decisionsForKeegan.length, 0);
  assert.deepEqual(
    result.blockedWork.map((item) => [item.candidateId, item.state]).sort(),
    [
      ["dependent", "WAITING_DEPENDENCY"],
      ["inferred", "REVALIDATE"]
    ]
  );
  assert.equal(result.overview.blockedOrRevalidate, 2);
});

test("fails closed on stale or future execution evidence", () => {
  const source = portfolio([candidate("freshness")]);
  const compiled = execution(source);

  assert.throws(
    () =>
      buildChiefOfStaffPortfolioBriefV1({
        portfolio: source,
        execution: compiled,
        generatedAt: "2026-09-18T12:30:00.001Z",
        maxExecutionAgeMs: 2 * 60 * 60 * 1000
      }),
    (error: unknown) =>
      error instanceof ChiefOfStaffPortfolioBriefError && error.code === "STALE_EXECUTION"
  );

  assert.throws(
    () =>
      buildChiefOfStaffPortfolioBriefV1({
        portfolio: source,
        execution: compiled,
        generatedAt: "2026-09-18T10:29:59.999Z",
        maxExecutionAgeMs: 60 * 60 * 1000
      }),
    (error: unknown) =>
      error instanceof ChiefOfStaffPortfolioBriefError && error.code === "FUTURE_EXECUTION"
  );
});

test("fails closed when execution evidence is rebound, incomplete, or authority-widened", () => {
  const source = portfolio([candidate("integrity")]);
  const compiled = execution(source);

  const rebound = structuredClone(compiled) as DecisionPortfolioExecutionCompilerV1;
  (rebound.sourcePortfolio as { portfolioId: string }).portfolioId = "different-portfolio";
  assert.throws(
    () => brief(source, rebound),
    (error: unknown) =>
      error instanceof ChiefOfStaffPortfolioBriefError && error.code === "SOURCE_PORTFOLIO_MISMATCH"
  );

  const incomplete = structuredClone(compiled) as DecisionPortfolioExecutionCompilerV1;
  (incomplete as { handoffs: DecisionPortfolioExecutionCompilerV1["handoffs"] }).handoffs = [];
  assert.throws(
    () => brief(source, incomplete),
    (error: unknown) =>
      error instanceof ChiefOfStaffPortfolioBriefError && error.code === "HANDOFF_COVERAGE_MISMATCH"
  );

  const widened = structuredClone(compiled) as DecisionPortfolioExecutionCompilerV1;
  (widened.authority as { externalAction: boolean }).externalAction = true;
  assert.throws(
    () => brief(source, widened),
    (error: unknown) =>
      error instanceof ChiefOfStaffPortfolioBriefError && error.code === "WIDENED_EXECUTION_AUTHORITY"
  );
});

test("preserves duplicate-noop suppression instead of resurfacing already prepared work", () => {
  const source = portfolio([candidate("once")]);
  const first = execution(source);
  const replay = execution(source, {
    previousIdempotencyKeys: [first.handoffs[0].idempotencyKey]
  });
  const result = brief(source, replay);

  assert.deepEqual(result.duplicateNoopCandidateIds, ["once"]);
  assert.equal(result.overview.duplicateNoops, 1);
  assert.equal(result.jeevesPreparationReady.length, 0);
  assert.equal(result.blockedWork.length, 0);
});

test("is deterministic, deeply immutable, and does not mutate canonical source objects", () => {
  const source = portfolio([
    candidate("stable"),
    candidate("approval", {
      owner: "KEEGAN",
      approvalClass: "KEEGAN",
      resources: { keeganHours: 1, ioanaHours: 0, jeevesHours: 0, cashCents: 0 }
    })
  ]);
  const compiled = execution(source);
  const sourceBefore = JSON.stringify(source);
  const executionBefore = JSON.stringify(compiled);

  const first = brief(source, compiled);
  const second = brief(source, compiled);

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(source), sourceBefore);
  assert.equal(JSON.stringify(compiled), executionBefore);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.overview), true);
  assert.equal(Object.isFrozen(first.decisionsForKeegan), true);
  assert.equal(Object.isFrozen(first.decisionsForKeegan[0].measurement), true);
  assert.equal(Object.isFrozen(first.overview.remainingCapacity), true);
});
