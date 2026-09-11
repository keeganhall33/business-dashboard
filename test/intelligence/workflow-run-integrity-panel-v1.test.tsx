import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ExplainVerticalSlice } from "@/components/vertical-slice/ExplainVerticalSlice";
import { WorkflowRunIntegrityPanelV1 } from "@/components/vertical-slice/WorkflowRunIntegrityPanelV1";
import type { ExplainResponse, ExplainWorkflowRunSummary } from "@/lib/intelligence/explanation-contract";
import type { DashboardOverviewResponse } from "@/lib/types/dashboard";

function makeSummary(overrides: Partial<ExplainWorkflowRunSummary> = {}): ExplainWorkflowRunSummary {
  return {
    version: "REVENUE_EXPLANATION_WORKFLOW_RUN_V1",
    graphId: "revenue-explain-v1",
    runId: "run-1",
    state: "COMPLETE",
    expectedNodeCount: 3,
    acceptedNodeCount: 3,
    missingBranches: [],
    failedBranches: [],
    plannedWaves: [
      { index: 0, nodeIds: ["woo", "ga4"] },
      { index: 1, nodeIds: ["verify"] }
    ],
    observedTiming: { state: "OBSERVED", elapsedMs: 1250 },
    verifier: { state: "PASSED", failedLenses: [] },
    anchors: {
      requiredCount: 2,
      passedCount: 2,
      rejectedCanonicalRefs: [],
      uniqueEvidenceIdentityCount: 2
    },
    evidenceCoverage: {
      expectedSources: ["woo", "ga4"],
      observedSources: ["woo", "ga4"],
      missingSources: [],
      duplicateEvidenceCount: 0
    },
    budget: { state: "WITHIN_BUDGET", elapsedMs: 1250, costUsd: null },
    nodes: [
      { nodeId: "woo", state: "ACCEPTED", truthState: "CURRENT", evidenceCount: 2 },
      { nodeId: "ga4", state: "ACCEPTED", truthState: "CURRENT", evidenceCount: 2 },
      { nodeId: "verify", state: "ACCEPTED", truthState: "CURRENT", evidenceCount: 1 }
    ],
    ...overrides
  };
}

function render(summary: ExplainWorkflowRunSummary | null) {
  return renderToStaticMarkup(<WorkflowRunIntegrityPanelV1 summary={summary} />);
}

test("complete run shows full coverage and healthy verification and anchors", () => {
  const html = render(makeSummary());
  assert.match(html, /Run status: COMPLETE/);
  assert.match(html, /3 \/ 3/);
  assert.match(html, /Verifier: PASSED/);
  assert.match(html, /2 \/ 2 passed/);
  assert.match(html, /All expected branches, independent verification, and mandatory anchors passed/);
});

test("missing branch stays PARTIAL and names the gap", () => {
  const html = render(makeSummary({
    state: "PARTIAL",
    acceptedNodeCount: 2,
    missingBranches: ["meta"],
    evidenceCoverage: {
      expectedSources: ["woo", "ga4", "meta"],
      observedSources: ["woo", "ga4"],
      missingSources: ["meta"],
      duplicateEvidenceCount: 0
    }
  }));
  assert.match(html, /Run status: PARTIAL/);
  assert.match(html, /Missing branch: meta/);
  assert.doesNotMatch(html, /No material workflow-integrity limitation reported/);
});

test("failed mandatory anchor cannot appear healthy", () => {
  const html = render(makeSummary({
    state: "DEGRADED",
    anchors: {
      requiredCount: 2,
      passedCount: 1,
      rejectedCanonicalRefs: ["canonical:orders"],
      uniqueEvidenceIdentityCount: 1
    }
  }));
  assert.match(html, /Run status: DEGRADED/);
  assert.match(html, /1 \/ 2 passed/);
  assert.match(html, /1 mandatory anchor reference\(s\) were rejected/);
  assert.doesNotMatch(html, /All expected branches/);
});

test("absent cost and provider remain UNKNOWN rather than zero or free", () => {
  const html = render(makeSummary({ budget: { state: "UNKNOWN", elapsedMs: null, costUsd: null } }));
  assert.match(html, /Cost[\s\S]*UNKNOWN/);
  assert.match(html, /Provider[\s\S]*UNKNOWN \(not supplied\)/);
  assert.doesNotMatch(html, /\$0(?:\.0+)?/);
  assert.doesNotMatch(html, /free/i);
});

test("missing workflow summary renders the honest unavailable state", () => {
  const html = render(null);
  assert.match(html, /Workflow integrity unavailable for this explanation/);
  assert.doesNotMatch(html, /Run status: COMPLETE/);
});

test("UNKNOWN, STALE, CONFLICTED, and ABSENT remain visibly distinct", () => {
  const nodes: ExplainWorkflowRunSummary["nodes"] = [
    { nodeId: "unknown-node", state: "MISSING", truthState: "UNKNOWN", evidenceCount: 0 },
    { nodeId: "stale-node", state: "REJECTED", truthState: "STALE", evidenceCount: 1 },
    { nodeId: "conflicted-node", state: "REJECTED", truthState: "CONFLICTED", evidenceCount: 2 },
    { nodeId: "absent-node", state: "MISSING", truthState: "ABSENT", evidenceCount: 0 }
  ];
  const html = render(makeSummary({
    state: "DEGRADED",
    expectedNodeCount: 4,
    acceptedNodeCount: 0,
    nodes,
    plannedWaves: [{ index: 0, nodeIds: nodes.map((node) => node.nodeId) }]
  }));
  for (const state of ["UNKNOWN", "STALE", "CONFLICTED", "ABSENT"]) assert.match(html, new RegExp(state));
});

test("progressive detail is bounded and excludes raw or secret-bearing fields", () => {
  const nodes = Array.from({ length: 30 }, (_, index) => ({
    nodeId: "node-" + index,
    state: "ACCEPTED" as const,
    truthState: "CURRENT" as const,
    evidenceCount: 1,
    rawConnectorPayload: "PRIVATE_PAYLOAD",
    transcript: "PRIVATE_TRANSCRIPT",
    tokenSecret: "PRIVATE_SECRET"
  }));
  const html = render(makeSummary({
    expectedNodeCount: 30,
    acceptedNodeCount: 30,
    nodes,
    plannedWaves: [{ index: 0, nodeIds: nodes.map((node) => node.nodeId) }]
  }));
  assert.match(html, /node-23/);
  assert.doesNotMatch(html, /node-24/);
  assert.match(html, /Additional workflow detail omitted/);
  assert.doesNotMatch(html, /PRIVATE_PAYLOAD|PRIVATE_TRANSCRIPT|PRIVATE_SECRET/);
});

test("panel has semantic headings, native keyboard disclosure, and responsive structure", () => {
  const html = render(makeSummary());
  assert.match(html, /<h2[^>]*>Workflow integrity<\/h2>/);
  assert.match(html, /<details/);
  assert.match(html, /<summary/);
  assert.match(html, /sm:grid-cols-2/);
  assert.match(html, /Planned stages show dependency eligibility only/);
});

test("Explain keeps causal content and places canonical workflow trust context beside it", () => {
  const explanation: ExplainResponse = {
    ok: true,
    generatedAt: "2026-09-11T00:00:00.000Z",
    dataMode: "LIVE_DATA",
    explanation: {
      metric: "revenue",
      current_period: { startDate: "2026-08-01", endDate: "2026-08-30" },
      comparison_period: { startDate: "2026-07-02", endDate: "2026-07-31" },
      absolute_change: null,
      percentage_change: null,
      baseline: { currentValue: null, previousValue: null },
      primary_driver: null,
      contributing_drivers: [],
      counteracting_drivers: [],
      possible_external_events: [],
      alternative_explanations: [],
      confidence: "insufficient_evidence",
      confidence_reasons: ["No supported primary driver"],
      data_used: [],
      data_missing: ["email"],
      assumptions: [],
      limitations: ["coverage incomplete"],
      recommended_follow_up: ["Collect matched evidence"],
      evidence: []
    },
    timeline: {
      window: { startDate: "2026-08-01", endDate: "2026-08-30" },
      sources: [],
      events: []
    },
    workflowRun: makeSummary()
  };
  const html = renderToStaticMarkup(
    <ExplainVerticalSlice data={{} as DashboardOverviewResponse} explanation={explanation} />
  );
  assert.match(html, /Causal explanation engine/);
  assert.match(html, /Workflow integrity/);
  assert.match(html, /Summary → Explanation/);
});

test("unavailable workflow state never promotes invented live graph truth", () => {
  const html = render(null);
  assert.match(html, /No workflow summary was supplied/);
  assert.doesNotMatch(html, /accepted \/ expected branches/);
  assert.doesNotMatch(html, /Verifier: PASSED/);
});
