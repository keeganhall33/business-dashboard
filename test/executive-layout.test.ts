import test from "node:test";
import assert from "node:assert/strict";

import { buildExecutiveDrivers, buildExecutiveActions } from "../src/lib/dashboard/executive-layout.ts";
import type { ConfidenceEntry, ConfidenceSummary } from "../src/lib/data-confidence.ts";
import type { DashboardOverviewResponse, TrendComparison } from "../src/lib/types/dashboard.ts";

function makeConfidenceEntry(overrides: Partial<ConfidenceEntry>): ConfidenceEntry {
  return {
    id: "woo",
    label: "Woo",
    state: "trusted",
    freshnessHours: 0,
    coverage: "Complete",
    completeness: "Verified",
    provenance: "test",
    lastSuccess: null,
    lastVerified: null,
    warningCodes: [],
    confidenceScore: 1,
    executiveImpact: "",
    recommendedAction: undefined,
    decisionImpact: "",
    ...overrides
  };
}

function makeConfidenceSummary(entries: ConfidenceEntry[], overallState: ConfidenceEntry["state"] = "trusted"): ConfidenceSummary {
  return {
    entries,
    partialDay: false,
    overall: { label: "", tone: "emerald", rationale: "", state: overallState, lastRefresh: null },
    trustedSources: [],
    caveatSources: [],
    insufficientSources: [],
    conflictingSources: [],
    topRisk: entries[0] ?? null,
    decisionsAffected: [],
    recommendedActions: []
  };
}

function makeTrend(overrides: Partial<TrendComparison> = {}): TrendComparison {
  return {
    id: "trend-1",
    source: "woo",
    metric: "monthly_revenue",
    label: "Revenue",
    currentValue: 100,
    previousValue: 120,
    absoluteChange: -20,
    percentChange: -16.7,
    direction: "down",
    magnitude: "major",
    anomaly: false,
    caveat: null,
    ...overrides
  };
}

function makeDashboardResponse(overrides: Partial<DashboardOverviewResponse>): DashboardOverviewResponse {
  const base: DashboardOverviewResponse = {
    ok: true,
    timestamp: new Date().toISOString(),
    range: { preset: "30d", startDate: "2026-06-01", endDate: "2026-06-30" },
    headerMetrics: [],
    executiveCommand: { weeklyDirective: "", topPriorities: [], biggestBottlenecks: [], ceoRecommendation: "" },
    warRoom: { mode: "normal", reason: null, lastUpdated: null, entries: [] },
    revenueEngine: { metrics: [], moneyLeaks: [], fastestPathToIncreaseRevenue: [], isDiagnosticEmpty: true },
    brandPower: { metrics: [], whatIsWorking: [], whatToDoNext: [] },
    opportunityRadar: { activeCount: 0, readyForOutreachCount: 0, topOpportunities: [], nextFiveMoves: [] },
    pipelinePanel: {
      collectors: [],
      deals: [],
      verificationSummary: {
        total: 0,
        verifiedActive: 0,
        onHold: 0,
        complete: 0,
        declined: 0,
        invalid: 0,
        stale: 0,
        unverified: 0
      }
    },
    survivalStrip: {
      configured: false,
      cashOnHand: null,
      survivalFloor: null,
      monthlyBurn: null,
      projected30dRevenue: null,
      runwayDays: null,
      lastUpdatedAt: null,
      isStale: false
    },
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
    commerceTelemetry: undefined,
    websiteConversion: null,
    metaAds: null,
    executiveSummary: null,
    socialIntelligence: null,
    industryPulseSnapshot: null,
    cloudflare: null,
    collectorTelemetry: null,
    agentStatusPanel: [],
    automationStatusPanel: [],
    dataSourceAccess: [],
    topActions: [],
    blockedItems: [],
    agentKpis: [],
    ideaBoard: { columns: {}, linkedTasks: {}, recentComments: [] },
    ceoQuestionDesk: { openQuestions: [], escalations: [], recentComments: [] },
    telemetryMetadata: {},
    telemetryHealth: {},
    executiveInsights: { brief: null, trends: [] }
  };

  return { ...base, ...overrides };
}

test("executive drivers drop when source domain is stale", () => {
  const trends = [makeTrend()];
  const allowedSummary = makeConfidenceSummary([makeConfidenceEntry({ id: "woo", state: "trusted" })]);
  const baseline = buildExecutiveDrivers(trends, 3, allowedSummary);
  assert.equal(baseline.length, 1);

  const blockedSummary = makeConfidenceSummary([makeConfidenceEntry({ id: "woo", state: "stale" })]);
  const gated = buildExecutiveDrivers(trends, 3, blockedSummary);
  assert.equal(gated.length, 0);
});

test("drivers drop when range mismatch warning is present", () => {
  const trends = [makeTrend()];
  const summary = makeConfidenceSummary([
    makeConfidenceEntry({ id: "woo", state: "usable_with_caveats", warningCodes: ["Range mismatch"] })
  ]);
  const drivers = buildExecutiveDrivers(trends, 3, summary);
  assert.equal(drivers.length, 0);
});

test("pipeline actions drop when pipeline confidence is blocked", () => {
  const overdueDate = new Date(Date.now() - 86400000).toISOString();
  const data = makeDashboardResponse({
    pipelinePanel: {
      collectors: [],
      verificationSummary: {
        total: 1,
        verifiedActive: 1,
        onHold: 0,
        complete: 0,
        declined: 0,
        invalid: 0,
        stale: 0,
        unverified: 0
      },
      deals: [
        {
          id: "deal-1",
          name: "Deal",
          organization: "Org",
          opportunityType: "licensing",
          status: "ready_for_outreach",
          valueEstimate: 10000,
          prestigeScore: 9,
          probabilityScore: 0.6,
          ownerAgent: "avery",
          nextStep: "Send deck",
          nextStepDueAt: overdueDate,
          verificationStatus: "verified_active",
          supportingDocs: null
        }
      ]
    }
  });

  const allowed = makeConfidenceSummary([makeConfidenceEntry({ id: "pipeline", state: "trusted" })]);
  const baseline = buildExecutiveActions(data, 5, allowed);
  assert.ok(baseline.some((action) => action.id.startsWith("pipeline-")));

  const blocked = makeConfidenceSummary([makeConfidenceEntry({ id: "pipeline", state: "stale" })]);
  const gated = buildExecutiveActions(data, 5, blocked);
  assert.equal(gated.some((action) => action.id.startsWith("pipeline-")), false);
});

test("top actions drop when overall range confidence is stale", () => {
  const data = makeDashboardResponse({
    topActions: [
      {
        title: "Fix conversion",
        detail: "",
        owner: "avery",
        status: "urgent",
        tone: "danger",
        dueAt: null
      }
    ]
  });

  const okSummary = makeConfidenceSummary([makeConfidenceEntry({ id: "woo", state: "trusted" })], "trusted");
  const baseline = buildExecutiveActions(data, 5, okSummary);
  assert.ok(baseline.some((action) => action.id.startsWith("top-")));

  const blockedSummary = makeConfidenceSummary([makeConfidenceEntry({ id: "woo", state: "trusted" })], "stale");
  const gated = buildExecutiveActions(data, 5, blockedSummary);
  assert.equal(gated.some((action) => action.id.startsWith("top-")), false);
});
