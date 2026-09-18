import assert from "node:assert/strict";
import test from "node:test";

import { loadAutonomousGrowthLiveBriefingV1 } from "@/lib/executive-home/autonomous-growth-live-briefing-loader-v1";
import type {
  DecisionPortfolioProjectionHistoryV1,
  VerifiedDecisionPortfolioProjectionV1,
} from "@/lib/strategy-engine/decision-portfolio-loader-v1";
import type {
  DecisionPortfolioItemV1,
  DecisionPortfolioV1,
} from "@/lib/strategy-engine/decision-portfolio-v1";

function selectedItem(id: string, title: string, rank: number): DecisionPortfolioItemV1 {
  return {
    candidate: {
      id,
      title,
      candidateType: "DECISION",
      owner: "KEEGAN",
      approvalClass: "KEEGAN",
      evidenceState: "KNOWN",
      evidenceRefs: [`evidence:${id}`],
      sourceRefs: [`source:${id}`],
      monetaryCase: null,
      value: {
        strategicFit: 80,
        compoundingAdvantage: 70,
        relationshipAccess: 50,
        futureOptions: 60,
        learningValue: 40,
        urgency: 60,
        reversibility: 70,
      },
      risk: { execution: 10, reputation: 10, rights: 10 },
      resources: { keeganHours: 1, ioanaHours: 0, jeevesHours: 0, cashCents: 0 },
      dependencyIds: [],
      conflictKeys: [],
      blockers: [],
      informationGainAction: null,
      safeNextStep: `Review ${title}`,
      successMetric: `Decision recorded for ${title}`,
      evaluationWindow: {
        start: "2026-09-18T00:00:00.000Z",
        end: "2026-10-18T00:00:00.000Z",
      },
    },
    disposition: "SELECTED",
    score: {
      monetaryExpectedCents: null,
      monetaryScore: 0,
      strategicScore: 50,
      riskPenalty: 3,
      totalScore: 47,
      components: {},
    },
    rank,
    rationale: `Canonical rationale for ${title}`,
    exclusionReason: null,
    displacedBy: [],
  };
}

function portfolio(
  portfolioId: string,
  generatedAt: string,
  ids: readonly string[],
): DecisionPortfolioV1 {
  const items = ids.map((id, index) => selectedItem(id, `Decision ${id}`, index + 1));
  return {
    contractVersion: "DecisionPortfolioV1",
    policyVersion: "decision_portfolio_policy_v1.0.0",
    generatedAt,
    portfolioId,
    items,
    selectedIds: [...ids],
    ownerQueues: { KEEGAN: [...ids], IOANA: [], JEEVES: [] },
    keeganDecisionIds: [...ids],
    informationGainIds: [],
    usedCapacity: { keeganHours: ids.length, ioanaHours: 0, jeevesHours: 0, cashCents: 0 },
    remainingCapacity: { keeganHours: Math.max(0, 10 - ids.length), ioanaHours: 10, jeevesHours: 20, cashCents: 100_000 },
    evidenceRefs: items.flatMap((item) => item.candidate.evidenceRefs).sort(),
    sourceRefs: items.flatMap((item) => item.candidate.sourceRefs).sort(),
    audit: {
      candidatesConsidered: items.length,
      feasiblePortfoliosEvaluated: 1,
      duplicateCandidatesSuppressed: 0,
      exactOptimization: true,
    },
  };
}

function entry(
  value: DecisionPortfolioV1,
  truthState: VerifiedDecisionPortfolioProjectionV1["truthState"] = "LIVE",
): VerifiedDecisionPortfolioProjectionV1 {
  return {
    portfolioId: value.portfolioId,
    truthState,
    decisionGrade: truthState === "LIVE",
    portfolio: value,
    issues: truthState === "STALE" ? ["PORTFOLIO_STALE"] : [],
    generatedAt: value.generatedAt,
    persistedAt: value.generatedAt,
  };
}

function liveHistory(): DecisionPortfolioProjectionHistoryV1 {
  const previous = portfolio(
    "decision_portfolio_aaaaaaaaaaaaaaaaaaaa",
    "2026-09-18T10:00:00.000Z",
    ["decision:a"],
  );
  const current = portfolio(
    "decision_portfolio_bbbbbbbbbbbbbbbbbbbb",
    "2026-09-18T12:00:00.000Z",
    ["decision:a", "decision:b"],
  );
  return {
    truthState: "LIVE",
    decisionGrade: true,
    latestPortfolio: current,
    entries: [entry(current), entry(previous, "STALE")],
    issues: [],
  };
}

test("loads live canonical history with the caller freshness policy and synthesizes observed portfolio changes", async () => {
  let observedOptions: { now: string; maxAgeMs: number; limit?: number } | null = null;
  const result = await loadAutonomousGrowthLiveBriefingV1({
    now: "2026-09-18T12:30:00.000Z",
    maxAgeMs: 3_600_000,
    historyLimit: 4,
    loadHistory: async (options) => {
      observedOptions = options;
      return liveHistory();
    },
  });

  assert.deepEqual(observedOptions, {
    now: "2026-09-18T12:30:00.000Z",
    maxAgeMs: 3_600_000,
    limit: 4,
  });
  assert.equal(result.status, "LIVE");
  assert.deepEqual(result.needsKeegan.map((item) => item.id), ["decision:a", "decision:b"]);
  assert.ok(
    result.materialChanges.some(
      (change) => change.kind === "SELECTED_ADDED" && change.candidateId === "decision:b",
    ),
  );
  assert.ok(result.materialChanges.every((change) => change.causeAttribution === "NOT_ESTABLISHED"));
  assert.equal(result.authority.portfolioMutationAllowed, false);
  assert.equal(result.authority.externalActionAllowed, false);
});

test("fails closed when the live store cannot be read and does not expose remembered or fixture actions", async () => {
  const result = await loadAutonomousGrowthLiveBriefingV1({
    now: "2026-09-18T12:30:00.000Z",
    maxAgeMs: 3_600_000,
    loadHistory: async () => {
      throw new Error("provider detail must not escape");
    },
  });

  assert.equal(result.status, "UNAVAILABLE");
  assert.equal(result.decisionGrade, false);
  assert.equal(result.selectedPortfolio.length, 0);
  assert.equal(result.needsKeegan.length, 0);
  assert.deepEqual(result.issues, ["DECISION_PORTFOLIO_LIVE_LOAD_FAILED"]);
  assert.doesNotMatch(JSON.stringify(result), /provider detail/i);
});

test("preserves canonical stale truth and withholds current decisions", async () => {
  const value = liveHistory();
  const stale: DecisionPortfolioProjectionHistoryV1 = {
    ...value,
    truthState: "STALE",
    decisionGrade: false,
    issues: ["PORTFOLIO_STALE"],
  };
  const result = await loadAutonomousGrowthLiveBriefingV1({
    now: "2026-09-18T14:30:00.000Z",
    maxAgeMs: 3_600_000,
    loadHistory: async () => stale,
  });

  assert.equal(result.status, "STALE");
  assert.equal(result.selectedPortfolio.length, 0);
  assert.equal(result.needsKeegan.length, 0);
  assert.ok(result.issues.includes("PORTFOLIO_STALE"));
});

test("rejects missing or non-finite freshness policy before touching the live loader", async () => {
  let calls = 0;
  const result = await loadAutonomousGrowthLiveBriefingV1({
    now: "2026-09-18T12:30:00.000Z",
    maxAgeMs: Number.POSITIVE_INFINITY,
    loadHistory: async () => {
      calls += 1;
      return liveHistory();
    },
  });

  assert.equal(calls, 0);
  assert.equal(result.status, "UNAVAILABLE");
  assert.deepEqual(result.issues, ["AUTONOMOUS_GROWTH_INVALID_LIVE_POLICY"]);
});

test("rejects a live history whose verified head does not match latestPortfolio", async () => {
  const history = liveHistory();
  const mismatched: DecisionPortfolioProjectionHistoryV1 = {
    ...history,
    entries: history.entries.slice(1),
  };
  const result = await loadAutonomousGrowthLiveBriefingV1({
    now: "2026-09-18T12:30:00.000Z",
    maxAgeMs: 3_600_000,
    loadHistory: async () => mismatched,
  });

  assert.equal(result.status, "UNAVAILABLE");
  assert.equal(result.selectedPortfolio.length, 0);
  assert.deepEqual(result.issues, ["DECISION_PORTFOLIO_HISTORY_HEAD_MISMATCH"]);
});
