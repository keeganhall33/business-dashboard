import test from "node:test";
import assert from "node:assert/strict";

import { buildForwardActions, describeTrend } from "../src/lib/forward-strategy.ts";
import type { DashboardOverviewResponse, ExecutiveInsightsPayload } from "../src/lib/types/dashboard";

const BASE_DASHBOARD: DashboardOverviewResponse = {
  ok: true,
  timestamp: "2026-07-16T00:00:00Z",
  range: { preset: "7d", startDate: "2026-07-10", endDate: "2026-07-16" },
  headerMetrics: [],
  executiveCommand: { weeklyDirective: "", topPriorities: [], biggestBottlenecks: [], ceoRecommendation: "" },
  warRoom: { mode: "normal", reason: null, lastUpdated: null, entries: [] },
  revenueEngine: { metrics: [], moneyLeaks: [], fastestPathToIncreaseRevenue: [] },
  brandPower: { metrics: [], whatIsWorking: [], whatToDoNext: [] },
  opportunityRadar: { activeCount: 0, readyForOutreachCount: 0, topOpportunities: [], nextFiveMoves: [] },
  pipelinePanel: { collectors: [], deals: [], verificationSummary: { total: 0, verifiedActive: 0, onHold: 0, complete: 0, declined: 0, invalid: 0, stale: 0, unverified: 0 } },
  survivalStrip: { configured: false, cashOnHand: null, survivalFloor: 0, monthlyBurn: null, projected30dRevenue: null, runwayDays: null },
  tasks: [],
  proofOfWork: [],
  schedulerJobs: [],
  schedulerSummary: undefined,
  agentSla: [],
  approvalBottlenecks: { pendingCount: 0, oldestPendingHours: null, tasks: [] },
  actionQueue: {
    needsApprovalTasks: { label: "Approvals", count: 0, items: [] },
    pendingPlans: { label: "Plans", count: 0, items: [] },
    decisionsDue: { label: "Decisions", count: 0, items: [] },
    invoicesToSend: { label: "Invoices", count: 0, items: [] }
  },
  systemHealth: { dataFreshnessHours: null, agentTaskCompletionRate: null, agents: [] },
  agentUpdateFeed: [],
  commerceTelemetry: undefined,
  websiteConversion: {
    generatedAt: new Date().toISOString(),
    wooCommerce: { grossOrderRevenue: 10000, paidOrdersInWindow: 200 },
    ga4: undefined
  },
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
  luxuryCollectibles: undefined,
  agentKpis: [],
  ideaBoard: { columns: [], recentComments: [], linkedTasks: {} },
  ceoQuestionDesk: { openQuestions: [], escalations: [], recentComments: [] },
  industryPulse: undefined,
  telemetryMetadata: {},
  telemetryHealth: {},
  executiveInsights: null,
  telemetryHealthHistory: []
};

test("buildForwardActions returns revenue gap action when behind", () => {
  const dashboard = structuredClone(BASE_DASHBOARD);
  dashboard.headerMetrics = [
    {
      metricKey: "monthly_revenue",
      metricName: "Monthly Revenue",
      category: "revenue",
      currentValue: 10000,
      targetValue: 15000,
      deltaPercent: null,
      status: "warning",
      unit: "usd",
      ownerAgent: null,
      measuredAt: null,
      comparisonValue: null,
      comparisonLabel: null,
      targetLabel: null
    }
  ];
  const actions = buildForwardActions(dashboard, 7, 7);
  assert.ok(actions.some((action) => action.id === "forward-revenue"), "revenue gap action should exist");
});

test("buildForwardActions caps output at three actions", () => {
  const dashboard = structuredClone(BASE_DASHBOARD);
  dashboard.headerMetrics = [
    {
      metricKey: "monthly_revenue",
      metricName: "Monthly Revenue",
      category: "revenue",
      currentValue: 0,
      targetValue: 15000,
      deltaPercent: null,
      status: "warning",
      unit: "usd",
      ownerAgent: null,
      measuredAt: null,
      comparisonValue: null,
      comparisonLabel: null,
      targetLabel: null
    }
  ];
  dashboard.telemetryHealth = {
    woo: { source: "woo", status: "warning", reasons: ["stale"], warningCodes: ["stale"] }
  };
  dashboard.executiveInsights = {
    brief: null,
    trends: [
      {
        id: "trend1",
        source: "woo",
        metric: "woo_revenue",
        label: "Revenue",
        currentValue: 1000,
        previousValue: 2000,
        absoluteChange: -1000,
        percentChange: -50,
        direction: "down",
        magnitude: "major",
        anomaly: false,
        caveat: "cart issues"
      }
    ]
  } satisfies ExecutiveInsightsPayload;
  const actions = buildForwardActions(dashboard, 7, 4);
  assert.equal(actions.length <= 3, true, "should cap at three actions");
});

test("describeTrend summarizes trend direction", () => {
  const trend: NonNullable<ExecutiveInsightsPayload>["trends"][number] = {
    id: "trend2",
    source: "ga4",
    metric: "ga4_sessions",
    label: "Sessions",
    currentValue: 500,
    previousValue: 800,
    absoluteChange: -300,
    percentChange: -37.5,
    direction: "down",
    magnitude: "moderate",
    anomaly: false,
    caveat: null
  };
  const summary = describeTrend(trend);
  assert.match(summary.toLowerCase(), /sessions/);
  assert.match(summary.toLowerCase(), /declined/);
});
