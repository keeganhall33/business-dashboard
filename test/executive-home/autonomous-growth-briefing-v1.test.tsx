import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AutonomousGrowthBriefingV1 as AutonomousGrowthBriefingComponent } from "@/components/executive-home/AutonomousGrowthBriefingV1";
import { buildAutonomousGrowthBriefingV1 } from "@/lib/executive-home/autonomous-growth-briefing-v1";
import type { DecisionPortfolioChangeV1 } from "@/lib/strategy-engine/decision-portfolio-change-v1";
import type { DecisionPortfolioProjectionHistoryV1 } from "@/lib/strategy-engine/decision-portfolio-loader-v1";
import type { DecisionPortfolioItemV1, DecisionPortfolioV1 } from "@/lib/strategy-engine/decision-portfolio-v1";

function item(
  id: string,
  title: string,
  rank: number,
  disposition: DecisionPortfolioItemV1["disposition"],
  owner: DecisionPortfolioItemV1["candidate"]["owner"],
  approvalClass: DecisionPortfolioItemV1["candidate"]["approvalClass"],
  candidateType: DecisionPortfolioItemV1["candidate"]["candidateType"],
  overrides: Partial<DecisionPortfolioItemV1> = {},
): DecisionPortfolioItemV1 {
  return {
    candidate: {
      id,
      title,
      candidateType,
      owner,
      approvalClass,
      evidenceState: "KNOWN",
      evidenceRefs: [`evidence:${id}`],
      sourceRefs: [`source:${id}`],
      monetaryCase: null,
      value: {
        strategicFit: 80,
        compoundingAdvantage: 75,
        relationshipAccess: 60,
        futureOptions: 70,
        learningValue: 50,
        urgency: 65,
        reversibility: 80,
      },
      risk: { execution: 20, reputation: 10, rights: 10 },
      resources: { keeganHours: owner === "KEEGAN" ? 1 : 0, ioanaHours: owner === "IOANA" ? 1 : 0, jeevesHours: owner === "JEEVES" ? 2 : 0, cashCents: 0 },
      dependencyIds: [],
      conflictKeys: [],
      blockers: [],
      informationGainAction: disposition === "INFORMATION_GAIN" ? "Resolve the missing evidence." : null,
      safeNextStep: `Safe next step for ${title}`,
      successMetric: `Observed milestone for ${title}`,
      evaluationWindow: { start: "2026-09-18T00:00:00.000Z", end: "2026-10-18T00:00:00.000Z" },
    },
    disposition,
    score: {
      monetaryExpectedCents: null,
      monetaryScore: 0,
      strategicScore: 50,
      riskPenalty: 5,
      totalScore: 45,
      components: {},
    },
    rank,
    rationale: `Canonical rationale for ${title}`,
    exclusionReason: disposition === "SELECTED" ? null : `Canonical exclusion for ${title}`,
    displacedBy: disposition === "DEFERRED" ? ["campaign:selected"] : [],
    ...overrides,
  };
}

function portfolio(): DecisionPortfolioV1 {
  const items: DecisionPortfolioItemV1[] = [
    item("campaign:selected", "Partnership campaign", 1, "SELECTED", "JEEVES", "NONE", "CAMPAIGN"),
    item("decision:keegan", "Approve collector strategy", 2, "SELECTED", "KEEGAN", "KEEGAN", "DECISION"),
    item("experiment:selected", "Checkout experiment", 3, "SELECTED", "IOANA", "REVIEW", "EXPERIMENT"),
    item("opportunity:deferred", "Deferred partnership", 4, "DEFERRED", "JEEVES", "NONE", "OPPORTUNITY"),
    item("research:unknown", "Resolve rights evidence", 5, "INFORMATION_GAIN", "JEEVES", "NONE", "DECISION", {
      candidate: {
        ...item("research:unknown", "Resolve rights evidence", 5, "INFORMATION_GAIN", "JEEVES", "NONE", "DECISION").candidate,
        evidenceState: "UNKNOWN",
      },
    }),
  ];

  return {
    contractVersion: "DecisionPortfolioV1",
    policyVersion: "decision_portfolio_policy_v1.0.0",
    generatedAt: "2026-09-18T13:00:00.000Z",
    portfolioId: "decision_portfolio_0123456789abcdef0123",
    items,
    selectedIds: ["campaign:selected", "decision:keegan", "experiment:selected"],
    ownerQueues: {
      KEEGAN: ["decision:keegan"],
      IOANA: ["experiment:selected"],
      JEEVES: ["campaign:selected"],
    },
    keeganDecisionIds: ["decision:keegan"],
    informationGainIds: ["research:unknown"],
    usedCapacity: { keeganHours: 1, ioanaHours: 1, jeevesHours: 2, cashCents: 0 },
    remainingCapacity: { keeganHours: 9, ioanaHours: 9, jeevesHours: 18, cashCents: 100_000 },
    evidenceRefs: items.flatMap((value) => value.candidate.evidenceRefs).sort(),
    sourceRefs: items.flatMap((value) => value.candidate.sourceRefs).sort(),
    audit: {
      candidatesConsidered: items.length,
      feasiblePortfoliosEvaluated: 8,
      duplicateCandidatesSuppressed: 0,
      exactOptimization: true,
    },
  };
}

function history(
  truthState: DecisionPortfolioProjectionHistoryV1["truthState"] = "LIVE",
): DecisionPortfolioProjectionHistoryV1 {
  const latestPortfolio = portfolio();
  return {
    truthState,
    decisionGrade: truthState === "LIVE",
    latestPortfolio,
    entries: [],
    issues: truthState === "STALE" ? ["PORTFOLIO_STALE"] : [],
  };
}

function change(): DecisionPortfolioChangeV1 {
  return {
    contractVersion: "DecisionPortfolioChangeV1",
    policyVersion: "decision_portfolio_change_policy_v1.0.0",
    changeId: "change_1",
    comparedAt: "2026-09-18T13:05:00.000Z",
    previousPortfolioId: "decision_portfolio_aaaaaaaaaaaaaaaaaaaa",
    currentPortfolioId: portfolio().portfolioId,
    status: "SELECTION_CHANGE",
    selectedAddedIds: ["decision:keegan"],
    selectedRemovedIds: ["old:selected"],
    newKeeganDecisionIds: ["decision:keegan"],
    clearedKeeganDecisionIds: [],
    candidateChanges: [],
    ownerQueueChanges: [],
    usedCapacityDelta: { keeganHours: 1, ioanaHours: 0, jeevesHours: 0, cashCents: 0 },
    remainingCapacityDelta: { keeganHours: -1, ioanaHours: 0, jeevesHours: 0, cashCents: 0 },
    evidenceRefsAdded: ["evidence:decision:keegan"],
    evidenceRefsRemoved: [],
    sourceRefsAdded: ["source:decision:keegan"],
    sourceRefsRemoved: [],
    attribution: {
      selectionCause: "NOT_ESTABLISHED",
      rankCause: "NOT_ESTABLISHED",
      outcomeCause: "NOT_ESTABLISHED",
    },
    authority: {
      portfolioMutation: false,
      allocationMutation: false,
      externalAction: false,
      approvalBypass: false,
    },
  };
}

test("projects a live canonical portfolio into a compact owner and decision briefing without execution claims", () => {
  const result = buildAutonomousGrowthBriefingV1({ history: history(), change: change() });

  assert.equal(result.status, "LIVE");
  assert.equal(result.decisionGrade, true);
  assert.deepEqual(result.needsKeegan.map((value) => value.id), ["decision:keegan"]);
  assert.deepEqual(result.delegated.JEEVES.map((value) => value.id), ["campaign:selected"]);
  assert.deepEqual(result.delegated.IOANA.map((value) => value.id), ["experiment:selected"]);
  assert.deepEqual(result.campaigns.map((value) => value.id), ["campaign:selected"]);
  assert.deepEqual(result.experiments.map((value) => value.id), ["experiment:selected"]);
  assert.deepEqual(result.informationGain.map((value) => value.id), ["research:unknown"]);
  assert.ok(result.selectedPortfolio.every((value) => value.executionState === "SELECTED_NOT_EXECUTION_PROOF"));
  assert.equal(result.northStarTrajectory.state, "UNKNOWN");
  assert.equal(result.authority.externalActionAllowed, false);
  assert.equal(result.authority.outcomeClaimAllowed, false);
  assert.equal(result.authority.causalClaimAllowed, false);
});

test("surfaces material portfolio deltas without inventing why they changed", () => {
  const result = buildAutonomousGrowthBriefingV1({ history: history(), change: change() });

  assert.ok(result.materialChanges.some((value) => value.kind === "SELECTED_ADDED" && value.candidateId === "decision:keegan"));
  assert.ok(result.materialChanges.some((value) => value.kind === "SELECTED_REMOVED" && value.candidateId === "old:selected"));
  assert.ok(result.materialChanges.every((value) => value.causeAttribution === "NOT_ESTABLISHED"));
  assert.match(result.limitations.join(" "), /do not establish why/i);
});

test("withholds current actions when the persisted portfolio is stale", () => {
  const result = buildAutonomousGrowthBriefingV1({ history: history("STALE"), change: change() });

  assert.equal(result.status, "STALE");
  assert.equal(result.decisionGrade, false);
  assert.equal(result.selectedPortfolio.length, 0);
  assert.equal(result.needsKeegan.length, 0);
  assert.equal(result.materialChanges.length, 0);
  assert.ok(result.issues.includes("PORTFOLIO_STALE"));
});

test("fails closed when canonical portfolio history is unavailable or unverified", () => {
  const unavailable = buildAutonomousGrowthBriefingV1({ history: null });
  assert.equal(unavailable.status, "UNAVAILABLE");
  assert.equal(unavailable.selectedPortfolio.length, 0);
  assert.ok(unavailable.issues.includes("DECISION_PORTFOLIO_UNAVAILABLE"));

  const unverified: DecisionPortfolioProjectionHistoryV1 = {
    truthState: "UNVERIFIED",
    decisionGrade: false,
    latestPortfolio: null,
    entries: [],
    issues: ["ROW_PAYLOAD_MISMATCH"],
  };
  const blocked = buildAutonomousGrowthBriefingV1({ history: unverified });
  assert.equal(blocked.status, "UNAVAILABLE");
  assert.ok(blocked.issues.includes("ROW_PAYLOAD_MISMATCH"));
});

test("renders decision-first mobile-safe content with a real Strategy destination and explicit uncertainty", () => {
  const briefing = buildAutonomousGrowthBriefingV1({ history: history(), change: change() });
  const html = renderToStaticMarkup(<AutonomousGrowthBriefingComponent briefing={briefing} />);

  assert.match(html, /Chief of staff briefing/);
  assert.match(html, /Needs you now/);
  assert.match(html, /Approve collector strategy/);
  assert.match(html, /Selected portfolio/);
  assert.match(html, /Delegated safely/);
  assert.match(html, /Opportunity cost/);
  assert.match(html, /Cause attribution is not established/i);
  assert.match(html, /North Star trajectory/);
  assert.match(html, /Not enough evidence yet to show a reliable trajectory/);
  assert.match(html, /href="\/strategy"/);
  assert.doesNotMatch(html, /work completed/i);
});

test("renders stale state without leaking stale next actions", () => {
  const briefing = buildAutonomousGrowthBriefingV1({ history: history("STALE") });
  const html = renderToStaticMarkup(<AutonomousGrowthBriefingComponent briefing={briefing} />);

  assert.match(html, /STALE/);
  assert.match(html, /needs fresher data before it can confidently recommend what to do next/i);
  assert.doesNotMatch(html, /Safe next step for/);
});

test("is deterministic, bounded, immutable, and does not mutate canonical input", () => {
  const sourceHistory = history();
  const sourceChange = change();
  const beforeHistory = structuredClone(sourceHistory);
  const beforeChange = structuredClone(sourceChange);
  const first = buildAutonomousGrowthBriefingV1({ history: sourceHistory, change: sourceChange, maxSelected: 3, maxChanges: 4 });
  const second = buildAutonomousGrowthBriefingV1({ history: sourceHistory, change: sourceChange, maxSelected: 3, maxChanges: 4 });

  assert.deepEqual(first, second);
  assert.deepEqual(sourceHistory, beforeHistory);
  assert.deepEqual(sourceChange, beforeChange);
  assert.equal(first.selectedPortfolio.length, 3);
  assert.ok(first.materialChanges.length <= 4);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.selectedPortfolio), true);
  assert.equal(Object.isFrozen(first.authority), true);
});
