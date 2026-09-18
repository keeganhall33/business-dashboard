import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDecisionPortfolioV1,
  type DecisionCandidateV1,
  type DecisionPortfolioV1
} from "../../src/lib/strategy-engine/decision-portfolio-v1";
import {
  compileDecisionPortfolioExecutionV1,
  DecisionPortfolioExecutionCompilerError
} from "../../src/lib/strategy-engine/decision-portfolio-execution-compiler-v1";

const portfolioGeneratedAt = "2026-09-18T10:00:00.000Z";
const compilerGeneratedAt = "2026-09-18T10:30:00.000Z";

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

function portfolio(candidates: DecisionCandidateV1[], satisfiedDependencyIds: readonly string[] = []): DecisionPortfolioV1 {
  return buildDecisionPortfolioV1({
    candidates,
    capacity: {
      keeganHours: 8,
      ioanaHours: 8,
      jeevesHours: 20,
      cashCents: 1_000_000,
      maxSelected: 8,
      maxKeeganDecisions: 2
    },
    generatedAt: portfolioGeneratedAt,
    satisfiedDependencyIds
  });
}

test("compiles selected work into preparation-only handoffs and preserves approval gates", () => {
  const input = portfolio([
    candidate("internal"),
    candidate("review", { approvalClass: "REVIEW" }),
    candidate("keegan", { owner: "KEEGAN", approvalClass: "KEEGAN" }),
    candidate("ioana", { owner: "IOANA" })
  ]);

  const result = compileDecisionPortfolioExecutionV1({
    portfolio: input,
    generatedAt: compilerGeneratedAt,
    maxPortfolioAgeMs: 60 * 60 * 1000
  });

  assert.equal(result.summary.selected, 4);
  assert.equal(result.summary.prepared, 4);
  assert.equal(result.summary.keeganApproval, 1);
  assert.equal(result.handoffs.find((item) => item.candidateId === "internal")?.state, "PREPARED_INTERNAL");
  assert.equal(result.handoffs.find((item) => item.candidateId === "review")?.nextGate, "REVIEW_REQUIRED");
  assert.equal(result.handoffs.find((item) => item.candidateId === "keegan")?.actionLevel, "L3_READY_FOR_APPROVAL");
  assert.equal(result.handoffs.find((item) => item.candidateId === "ioana")?.nextGate, "OWNER_ACTION_REQUIRED");
  assert.ok(result.handoffs.every((item) => item.preparationOnly));
  assert.ok(result.handoffs.every((item) => item.executionAuthorized === false));
  assert.ok(result.handoffs.every((item) => item.externalActionAuthorized === false));
  assert.deepEqual(result.authority, {
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

test("never promotes prose that sounds external into execution authority", () => {
  const input = portfolio([
    candidate("external-prose", {
      safeNextStep: "Send the sponsor an email and publish the announcement now"
    })
  ]);

  const result = compileDecisionPortfolioExecutionV1({
    portfolio: input,
    generatedAt: compilerGeneratedAt,
    maxPortfolioAgeMs: 60 * 60 * 1000
  });
  const handoff = result.handoffs[0];

  assert.equal(handoff.state, "PREPARED_INTERNAL");
  assert.equal(handoff.actionLevel, "L2_DRAFT_PREPARED");
  assert.equal(handoff.nextGate, "ACTION_RUNTIME_POLICY_EVALUATION");
  assert.equal(handoff.executionAuthorized, false);
  assert.equal(handoff.externalActionAuthorized, false);
  assert.equal(result.authority.externalAction, false);
});

test("fails closed when a dependency has not been independently satisfied", () => {
  const input = portfolio(
    [candidate("dependent", { dependencyIds: ["external:approved-rights"] })],
    ["external:approved-rights"]
  );

  const blocked = compileDecisionPortfolioExecutionV1({
    portfolio: input,
    generatedAt: compilerGeneratedAt,
    maxPortfolioAgeMs: 60 * 60 * 1000
  });
  assert.equal(blocked.handoffs[0].state, "WAITING_DEPENDENCY");
  assert.deepEqual(blocked.handoffs[0].unsatisfiedDependencyIds, ["external:approved-rights"]);
  assert.equal(blocked.handoffs[0].actionLevel, null);

  const ready = compileDecisionPortfolioExecutionV1({
    portfolio: input,
    generatedAt: compilerGeneratedAt,
    maxPortfolioAgeMs: 60 * 60 * 1000,
    satisfiedDependencyIds: ["external:approved-rights"]
  });
  assert.equal(ready.handoffs[0].state, "PREPARED_INTERNAL");
});

test("requires revalidation when portfolio freshness exceeds the caller-supplied threshold", () => {
  const input = portfolio([candidate("stale-portfolio")]);
  const result = compileDecisionPortfolioExecutionV1({
    portfolio: input,
    generatedAt: "2026-09-18T12:00:00.000Z",
    maxPortfolioAgeMs: 60 * 60 * 1000
  });

  assert.equal(result.handoffs[0].state, "REVALIDATE");
  assert.equal(result.handoffs[0].nextGate, "EVIDENCE_REVALIDATION_REQUIRED");
  assert.match(result.handoffs[0].blockingReasons.join(" "), /freshness/i);
  assert.equal(result.handoffs[0].executionAuthorized, false);
});

test("revalidates tampered non-KNOWN or provenance-free selected evidence", () => {
  const input = structuredClone(portfolio([candidate("tampered")])) as DecisionPortfolioV1;
  const selected = input.items.find((item) => item.candidate.id === "tampered")!;
  (selected.candidate as DecisionCandidateV1).evidenceState = "INFERRED";
  (selected.candidate as DecisionCandidateV1).evidenceRefs = [];

  const result = compileDecisionPortfolioExecutionV1({
    portfolio: input,
    generatedAt: compilerGeneratedAt,
    maxPortfolioAgeMs: 60 * 60 * 1000
  });

  assert.equal(result.handoffs[0].state, "REVALIDATE");
  assert.match(result.handoffs[0].blockingReasons.join(" "), /INFERRED/);
  assert.match(result.handoffs[0].blockingReasons.join(" "), /no evidence refs/i);
});

test("suppresses replay using the exact portfolio/candidate/evidence idempotency key", () => {
  const input = portfolio([candidate("once")]);
  const first = compileDecisionPortfolioExecutionV1({
    portfolio: input,
    generatedAt: compilerGeneratedAt,
    maxPortfolioAgeMs: 60 * 60 * 1000
  });

  const replay = compileDecisionPortfolioExecutionV1({
    portfolio: input,
    generatedAt: compilerGeneratedAt,
    maxPortfolioAgeMs: 60 * 60 * 1000,
    previousIdempotencyKeys: [first.handoffs[0].idempotencyKey]
  });

  assert.equal(replay.handoffs[0].state, "DUPLICATE_NOOP");
  assert.equal(replay.handoffs[0].nextGate, "NO_ACTION");
  assert.equal(replay.summary.duplicateNoop, 1);
  assert.equal(replay.handoffs[0].actionLevel, null);
});

test("rejects future portfolios and selected-id integrity mismatches", () => {
  const input = portfolio([candidate("integrity")]);
  const mismatched = structuredClone(input) as DecisionPortfolioV1;
  (mismatched as { selectedIds: string[] }).selectedIds = [];

  assert.throws(
    () =>
      compileDecisionPortfolioExecutionV1({
        portfolio: mismatched,
        generatedAt: compilerGeneratedAt,
        maxPortfolioAgeMs: 60 * 60 * 1000
      }),
    (error: unknown) =>
      error instanceof DecisionPortfolioExecutionCompilerError && error.code === "SELECTED_ID_MISMATCH"
  );

  assert.throws(
    () =>
      compileDecisionPortfolioExecutionV1({
        portfolio: input,
        generatedAt: "2026-09-18T09:59:59.999Z",
        maxPortfolioAgeMs: 60 * 60 * 1000
      }),
    (error: unknown) =>
      error instanceof DecisionPortfolioExecutionCompilerError && error.code === "FUTURE_PORTFOLIO"
  );
});

test("is deterministic and does not mutate the canonical portfolio", () => {
  const input = portfolio([candidate("stable")]);
  const before = JSON.stringify(input);
  const args = {
    portfolio: input,
    generatedAt: compilerGeneratedAt,
    maxPortfolioAgeMs: 60 * 60 * 1000
  };

  const first = compileDecisionPortfolioExecutionV1(args);
  const second = compileDecisionPortfolioExecutionV1(args);

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(input), before);
});
