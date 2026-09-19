import test from "node:test";
import assert from "node:assert/strict";

import { compileCrossEngineSynthesisV1 } from "../../src/lib/intelligence/cross-engine-synthesis-v1";
import {
  buildCrossEnginePortfolioOverlayV1,
} from "../../src/lib/strategy-engine/cross-engine-portfolio-overlay-v1";
import type {
  DecisionEvidenceStateV1,
  DecisionPortfolioV1,
} from "../../src/lib/strategy-engine/decision-portfolio-v1";

const GENERATED_AT = "2026-09-19T03:00:00.000Z";
const EVALUATED_AT = "2026-09-19T04:00:00.000Z";

function portfolio(evidenceState: DecisionEvidenceStateV1 = "KNOWN"): DecisionPortfolioV1 {
  return {
    contractVersion: "DecisionPortfolioV1",
    policyVersion: "decision_portfolio_policy_v1.0.0",
    generatedAt: GENERATED_AT,
    portfolioId: "portfolio:current",
    items: [
      {
        candidate: {
          id: "decision:seattle-campaign",
          title: "Seattle campaign timing",
          candidateType: "CAMPAIGN",
          owner: "KEEGAN",
          approvalClass: "KEEGAN",
          evidenceState,
          evidenceRefs: ["evidence:portfolio"],
          sourceRefs: ["source:portfolio"],
          monetaryCase: null,
          value: {
            strategicFit: 80,
            compoundingAdvantage: 70,
            relationshipAccess: 40,
            futureOptions: 65,
            learningValue: 50,
            urgency: 75,
            reversibility: 80,
          },
          risk: { execution: 20, reputation: 15, rights: 10 },
          resources: { keeganHours: 2, ioanaHours: 0, jeevesHours: 3, cashCents: 0 },
          dependencyIds: [],
          conflictKeys: [],
          blockers: [],
          informationGainAction: null,
          safeNextStep: "Review the evidence before approving any campaign preparation.",
          successMetric: "A decision is recorded with evidence.",
          evaluationWindow: {
            start: "2026-09-19T00:00:00.000Z",
            end: "2026-09-26T00:00:00.000Z",
          },
        },
        disposition: "SELECTED",
        score: {
          monetaryExpectedCents: null,
          monetaryScore: 0,
          strategicScore: 72,
          riskPenalty: 8,
          totalScore: 64,
          components: {},
        },
        rank: 1,
        rationale: "Selected from the canonical evidence-backed portfolio.",
        exclusionReason: null,
        displacedBy: [],
      },
    ],
    selectedIds: ["decision:seattle-campaign"],
    ownerQueues: {
      KEEGAN: ["decision:seattle-campaign"],
      IOANA: [],
      JEEVES: [],
    },
    keeganDecisionIds: ["decision:seattle-campaign"],
    informationGainIds: [],
    usedCapacity: { keeganHours: 2, ioanaHours: 0, jeevesHours: 3, cashCents: 0 },
    remainingCapacity: { keeganHours: 8, ioanaHours: 8, jeevesHours: 20, cashCents: 0 },
    evidenceRefs: ["evidence:portfolio"],
    sourceRefs: ["source:portfolio"],
    audit: {
      candidatesConsidered: 1,
      feasiblePortfoliosEvaluated: 1,
      duplicateCandidatesSuppressed: 0,
      exactOptimization: true,
    },
  };
}

function synthesis(decisionRef = "decision:seattle-campaign", generatedAt = GENERATED_AT) {
  return compileCrossEngineSynthesisV1({
    generatedAt,
    signals: [
      {
        signalId: "social:seattle",
        domain: "SOCIAL",
        kind: "OPPORTUNITY",
        summary: "First-party social signal",
        observedAt: "2026-09-19T02:30:00.000Z",
        truthState: "KNOWN",
        freshness: "FRESH",
        materiality: "HIGH",
        entityRefs: ["project:seattle"],
        evidenceRefs: ["evidence:social"],
        sourceRefs: ["source:social"],
        independenceKey: "social:first-party",
        synthesisKeys: ["project:seattle"],
      },
      {
        signalId: "revenue:seattle",
        domain: "REVENUE",
        kind: "OPPORTUNITY",
        summary: "First-party commerce signal",
        observedAt: "2026-09-19T02:40:00.000Z",
        truthState: "KNOWN",
        freshness: "FRESH",
        materiality: "HIGH",
        entityRefs: ["project:seattle"],
        evidenceRefs: ["evidence:revenue"],
        sourceRefs: ["source:revenue"],
        independenceKey: "commerce:first-party",
        synthesisKeys: ["project:seattle"],
      },
    ],
    hypotheses: [
      {
        hypothesisId: "hypothesis:seattle",
        signalIds: ["social:seattle", "revenue:seattle"],
        classification: "OPPORTUNITY",
        connection: "Independent current social and revenue evidence point to the same canonical project.",
        whyItMatters: "The linked portfolio decision may deserve review while the evidence is current.",
        expectedImpact: {
          state: "UNKNOWN",
          unit: null,
          low: null,
          high: null,
          evidenceRefs: [],
        },
        decisiveUnknowns: ["Inventory is not established by these signals."],
        timingWindow: null,
        affectedDecisionRefs: [decisionRef],
        affectedActionRefs: [],
        nextSafeAction: {
          kind: "REVIEW",
          summary: "Review the linked evidence before changing the campaign plan.",
        },
      },
    ],
  });
}

test("joins ready cross-engine synthesis to an exact known portfolio candidate without reallocating it", () => {
  const sourcePortfolio = portfolio();
  const sourceSynthesis = synthesis();
  const result = buildCrossEnginePortfolioOverlayV1({
    portfolio: sourcePortfolio,
    synthesis: sourceSynthesis,
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.status, "LIVE");
  assert.equal(result.connections.length, 1);
  assert.equal(result.connections[0].candidateId, "decision:seattle-campaign");
  assert.deepEqual(result.connections[0].domains, ["REVENUE", "SOCIAL"]);
  assert.equal(result.connections[0].candidateDisposition, "SELECTED");
  assert.equal(result.connections[0].allocationEffect, "NONE_REVIEW_ONLY");
  assert.equal(result.connections[0].causalAttribution, "NOT_ESTABLISHED");
  assert.equal(result.connections[0].expectedImpact.state, "UNKNOWN");
  assert.equal(result.authority.allocationMutationAllowed, false);
  assert.equal(result.authority.externalActionAllowed, false);
  assert.deepEqual(sourcePortfolio.selectedIds, ["decision:seattle-campaign"]);
  assert.equal(sourceSynthesis.items[0].causalAttribution, "NOT_ESTABLISHED");
});

test("does not fuzzy-match an unrelated decision reference", () => {
  const result = buildCrossEnginePortfolioOverlayV1({
    portfolio: portfolio(),
    synthesis: synthesis("decision:seattle-campaign-v2"),
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.status, "NO_MATCHES");
  assert.deepEqual(result.connections, []);
  assert.deepEqual(result.unmatchedReadyHypothesisIds, ["hypothesis:seattle"]);
  assert.deepEqual(result.withheldHypothesisIds, []);
});

test("withholds a matched portfolio candidate whose evidence is not KNOWN", () => {
  const result = buildCrossEnginePortfolioOverlayV1({
    portfolio: portfolio("INFERRED"),
    synthesis: synthesis(),
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.status, "NO_MATCHES");
  assert.deepEqual(result.connections, []);
  assert.deepEqual(result.withheldHypothesisIds, ["hypothesis:seattle"]);
  assert.deepEqual(result.unmatchedReadyHypothesisIds, []);
});

test("fails closed when portfolio or synthesis falls outside the decision-time freshness bound", () => {
  const oldSynthesis = synthesis("decision:seattle-campaign", "2026-09-17T00:00:00.000Z");
  const result = buildCrossEnginePortfolioOverlayV1({
    portfolio: portfolio(),
    synthesis: oldSynthesis,
    evaluatedAt: EVALUATED_AT,
    maxAgeMs: 24 * 60 * 60 * 1_000,
  });

  assert.equal(result.status, "STALE");
  assert.deepEqual(result.connections, []);
  assert.deepEqual(result.issues, ["PORTFOLIO_OR_SYNTHESIS_OUTSIDE_FRESHNESS_BOUND"]);
});

test("fails closed when either canonical input is unavailable", () => {
  const result = buildCrossEnginePortfolioOverlayV1({
    portfolio: null,
    synthesis: null,
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.status, "UNAVAILABLE");
  assert.deepEqual(result.issues, [
    "CROSS_ENGINE_SYNTHESIS_UNAVAILABLE",
    "DECISION_PORTFOLIO_UNAVAILABLE",
  ]);
  assert.deepEqual(result.connections, []);
});
