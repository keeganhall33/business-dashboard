import assert from "node:assert/strict";
import test from "node:test";

import { explainRevenueChange } from "@/lib/intelligence/explanation-engine";
import { buildRevenueExplanationWorkflowRunV1 } from "@/lib/intelligence/workflow-graph/revenue-explanation-graph-v1";
import type { ExplanationEvidenceItem } from "@/lib/intelligence/explanation-contract";
import type { DashboardOverviewResponse, TelemetryMetadata } from "@/lib/types/dashboard";

const NOW = "2026-09-11T04:30:00.000Z";

function metadata(source: "woo" | "ga4" | "meta", overrides: Partial<TelemetryMetadata> = {}): TelemetryMetadata {
  return {
    source,
    requestedStartDate: "2026-09-01",
    requestedEndDate: "2026-09-07",
    timezone: "America/Los_Angeles",
    generatedAt: NOW,
    freshnessStatus: "fresh",
    coverageStatus: "complete",
    includesPartialDay: false,
    includesFutureDates: false,
    latestCompletedBusinessDate: "2026-09-07",
    warningCodes: [],
    ...overrides
  };
}

function overview(input: {
  startDate: string;
  endDate: string;
  revenue: number;
  orders: number;
  sessions: number | null;
}): DashboardOverviewResponse {
  return {
    ok: true,
    timestamp: NOW,
    dataMode: "LIVE_DATA",
    range: { preset: "custom", startDate: input.startDate, endDate: input.endDate },
    headerMetrics: [],
    executiveCommand: { weeklyDirective: "", topPriorities: [], biggestBottlenecks: [], ceoRecommendation: "" },
    warRoom: { mode: "normal", reason: null, lastUpdated: null, entries: [] },
    revenueEngine: { metrics: [], moneyLeaks: [], fastestPathToIncreaseRevenue: [], isDiagnosticEmpty: true },
    brandPower: { metrics: [], whatIsWorking: [], whatToDoNext: [] },
    opportunityRadar: { activeCount: 0, readyForOutreachCount: 0, topOpportunities: [], nextFiveMoves: [] },
    pipelinePanel: { collectors: [], deals: [] },
    survivalStrip: { configured: false, cashOnHand: null, survivalFloor: 0, monthlyBurn: null, projected30dRevenue: null, runwayDays: null, lastUpdatedAt: null, isStale: true },
    tasks: [],
    proofOfWork: [],
    schedulerJobs: [],
    agentSla: [],
    approvalBottlenecks: { pendingCount: 0, oldestPendingHours: null, tasks: [] },
    actionQueue: {
      needsApprovalTasks: { label: "", count: 0, items: [] },
      pendingPlans: { label: "", count: 0, items: [] },
      decisionsDue: { label: "", count: 0, items: [] },
      invoicesToSend: { label: "", count: 0, items: [] }
    },
    systemHealth: { dataFreshnessHours: null, agentTaskCompletionRate: null, agents: [] },
    agentUpdateFeed: [],
    commerceTelemetry: {
      range: { preset: "custom", startDate: input.startDate, endDate: input.endDate },
      woo: {
        summary: {
          revenue: input.revenue,
          orders: input.orders,
          avgOrderValue: input.orders === 0 ? 0 : input.revenue / input.orders,
          discountTotal: null,
          shippingTotal: null,
          taxTotal: null,
          items: input.orders,
          source: "selected_range_telemetry",
          completeness: "complete",
          asOf: NOW,
          definitionVersion: "woo_paid_net_v1",
          coverageStart: input.startDate,
          coverageEnd: input.endDate,
          comparisonAvailable: true
        },
        timeseries: []
      },
      ga4: {
        summary: { revenue: null, sessions: input.sessions, engagedSessions: null, eventCount: null, avgEngagementSeconds: null },
        timeseries: []
      }
    },
    telemetryMetadata: { woo: metadata("woo"), ga4: metadata("ga4") },
    agentKpis: [],
    ideaBoard: { columns: { proposed: [], in_review: [], approved: [], rejected: [], in_progress: [], shipped: [], archived: [] }, linkedTasks: {}, recentComments: [] },
    ceoQuestionDesk: { openQuestions: [], escalations: [], recentComments: [] }
  };
}

function pair() {
  return {
    current: overview({ startDate: "2026-09-01", endDate: "2026-09-07", revenue: 2_000, orders: 20, sessions: 2_000 }),
    previous: overview({ startDate: "2026-08-25", endDate: "2026-08-31", revenue: 1_500, orders: 15, sessions: 1_500 })
  };
}

function explain(current: DashboardOverviewResponse, previous: DashboardOverviewResponse) {
  return explainRevenueChange({
    metric: "revenue",
    currentRange: { startDate: current.range.startDate, endDate: current.range.endDate },
    comparisonRange: { startDate: previous.range.startDate, endDate: previous.range.endDate },
    current,
    previous
  });
}

test("full Woo and GA4 evidence produces an accounted graph without changing the explanation", () => {
  const { current, previous } = pair();
  const response = explain(current, previous);
  assert.equal(response.explanation.absolute_change, 50_000);
  assert.equal(response.workflowRun?.state, "COMPLETE");
  assert.equal(response.workflowRun?.acceptedNodeCount, response.workflowRun?.expectedNodeCount);
  assert.deepEqual(response.workflowRun?.missingBranches, []);
  assert.deepEqual(response.workflowRun?.evidenceCoverage.observedSources, ["woo", "ga4"]);
  assert.ok((response.workflowRun?.plannedWaves[0].nodeIds.length ?? 0) > 1);
  assert.deepEqual(response.workflowRun?.observedTiming, { state: "NOT_OBSERVED", elapsedMs: null });
});

test("missing GA4 is explicit and cannot report a complete run", () => {
  const { current, previous } = pair();
  current.commerceTelemetry!.ga4!.summary.sessions = null;
  previous.commerceTelemetry!.ga4!.summary.sessions = null;
  const response = explain(current, previous);
  assert.equal(response.workflowRun?.state, "PARTIAL");
  assert.ok(response.workflowRun?.missingBranches.includes("ga4-evidence"));
  assert.deepEqual(response.workflowRun?.evidenceCoverage.missingSources, ["ga4"]);
  assert.notEqual(response.explanation.confidence, "strongly_supported");
});

test("an unusable Meta snapshot remains missing instead of passing", () => {
  const { current, previous } = pair();
  current.metaAds = {
    generatedAt: NOW,
    accountId: "account-redacted",
    range: 7,
    campaigns: [],
    summary: { spend: null, impressions: null, clicks: null, purchases: null, purchaseValue: null, roas: null },
    status: "FALLBACK"
  };
  const response = explain(current, previous);
  assert.equal(response.workflowRun?.state, "PARTIAL");
  assert.ok(response.workflowRun?.missingBranches.includes("meta-evidence"));
  assert.ok(response.workflowRun?.evidenceCoverage.missingSources.includes("meta"));
});

test("usable Meta evidence is accounted without becoming a causal driver", () => {
  const { current, previous } = pair();
  current.metaAds = {
    generatedAt: NOW,
    accountId: "account-redacted",
    range: 7,
    campaigns: [],
    summary: { spend: 120, impressions: 1_000, clicks: 25, purchases: null, purchaseValue: null, roas: null },
    status: "LIVE"
  };
  current.telemetryMetadata!.meta = metadata("meta");
  const response = explain(current, previous);
  assert.equal(response.workflowRun?.state, "COMPLETE");
  assert.ok(response.workflowRun?.evidenceCoverage.observedSources.includes("meta"));
  assert.ok(response.explanation.evidence.some((item) => item.id === "meta:delivery"));
  assert.notEqual(response.explanation.primary_driver?.label, "Meta advertising");
  assert.match(response.explanation.limitations.join(" "), /Correlation does not prove causation/);
});

test("all-zero windows remain insufficient evidence and fail correctness verification", () => {
  const current = overview({ startDate: "2026-09-01", endDate: "2026-09-07", revenue: 0, orders: 0, sessions: 0 });
  const previous = overview({ startDate: "2026-08-25", endDate: "2026-08-31", revenue: 0, orders: 0, sessions: 0 });
  const response = explain(current, previous);
  assert.equal(response.explanation.confidence, "insufficient_evidence");
  assert.equal(response.explanation.primary_driver, null);
  assert.notEqual(response.workflowRun?.state, "COMPLETE");
  assert.ok(response.workflowRun?.verifier.failedLenses.includes("CORRECTNESS"));
});

test("duplicate evidence identities are counted once and raw details never leak", () => {
  const { current, previous } = pair();
  const evidence: ExplanationEvidenceItem = { id: "woo:revenue", label: "Woo revenue", source: "woo", kind: "metric", details: { secret: "DO_NOT_EXPOSE" } };
  const summary = buildRevenueExplanationWorkflowRunV1({
    metric: "revenue",
    currentRange: { startDate: current.range.startDate, endDate: current.range.endDate },
    comparisonRange: { startDate: previous.range.startDate, endDate: previous.range.endDate },
    current,
    previous,
    evidence: [evidence, structuredClone(evidence)],
    allZeroWindow: false
  });
  assert.equal(summary.evidenceCoverage.duplicateEvidenceCount, 1);
  assert.equal(summary.anchors.uniqueEvidenceIdentityCount, summary.anchors.passedCount);
  assert.doesNotMatch(JSON.stringify(summary), /DO_NOT_EXPOSE|secret|details/);
});

test("stale and conflicted source evidence reject the affected anchor", () => {
  for (const state of ["stale-current", "stale-comparison", "conflicted"] as const) {
    const { current, previous } = pair();
    if (state === "stale-comparison") {
      previous.telemetryMetadata!.ga4 = metadata("ga4", { freshnessStatus: "stale" });
    } else {
      current.telemetryMetadata!.ga4 = metadata("ga4", state === "stale-current"
        ? { freshnessStatus: "stale" }
        : { warningCodes: ["SOURCE_EVIDENCE_CONFLICTED"] });
    }
    const response = explain(current, previous);
    assert.equal(response.workflowRun?.state, "BLOCKED");
    assert.ok(response.workflowRun?.anchors.rejectedCanonicalRefs.includes("ga4:selected-range"));
    assert.ok(response.workflowRun?.failedBranches.includes("ga4-evidence"));
  }
});

test("a deterministic AOV conflict fails verification and cannot strengthen the primary driver", () => {
  const { current, previous } = pair();
  const baseline = explain(current, previous);
  current.commerceTelemetry!.woo!.summary.avgOrderValue = 999;
  const conflicted = explain(current, previous);
  assert.equal(conflicted.workflowRun?.state, "BLOCKED");
  assert.equal(conflicted.workflowRun?.verifier.state, "FAILED");
  assert.ok(conflicted.workflowRun?.verifier.failedLenses.includes("CORRECTNESS"));
  assert.equal(conflicted.explanation.primary_driver?.id, baseline.explanation.primary_driver?.id);
  assert.equal(conflicted.explanation.primary_driver?.confidence, baseline.explanation.primary_driver?.confidence);
  assert.equal(conflicted.explanation.confidence, "possible");
});

test("the optional workflow summary preserves existing consumer access", () => {
  const { current, previous } = pair();
  const response = explain(current, previous);
  const existingConsumer = ({ ok, generatedAt, explanation, timeline }: typeof response) => ({ ok, generatedAt, explanation, timeline });
  const projected = existingConsumer(response);
  assert.equal(projected.ok, true);
  assert.equal(projected.explanation.metric, "revenue");
  assert.deepEqual(projected.timeline.window, response.timeline.window);
});

test("workflow IDs, ordering, and bounded output are deterministic", () => {
  const firstPair = pair();
  const secondPair = structuredClone(firstPair);
  const first = explain(firstPair.current, firstPair.previous).workflowRun;
  const second = explain(secondPair.current, secondPair.previous).workflowRun;
  assert.deepEqual(first, second);
  assert.match(first?.runId ?? "", /^run:revenue-explanation:[a-f0-9]{8}$/);
  assert.ok((first?.nodes.length ?? 99) <= 7);
  assert.doesNotMatch(JSON.stringify(first), /prompt|transcript|chain.of.thought|account-redacted/i);
});
