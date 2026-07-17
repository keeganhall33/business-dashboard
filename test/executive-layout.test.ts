import test from "node:test";
import assert from "node:assert/strict";

import { buildExecutiveActions, buildExecutiveDrivers, summarizeExecutiveStatus } from "../src/lib/dashboard/executive-layout.ts";
import { buildDataConfidenceModel } from "../src/lib/data-confidence.ts";
import type { DashboardOverviewResponse, TelemetryMetadata, TrendComparison, ExecutiveInsightsPayload, TelemetrySource } from "../src/lib/types/dashboard";
import { buildForwardActions } from "../src/lib/forward-strategy.ts";

const BASE_DASHBOARD: DashboardOverviewResponse = {
  ok: true,
  timestamp: "2026-07-15T12:00:00Z",
  range: { preset: "7d", startDate: "2026-07-09", endDate: "2026-07-15" },
  headerMetrics: [],
  executiveCommand: { weeklyDirective: "", topPriorities: [], biggestBottlenecks: [], ceoRecommendation: "" },
  warRoom: { mode: "normal", reason: null, lastUpdated: null, entries: [] },
  revenueEngine: { metrics: [], moneyLeaks: [], fastestPathToIncreaseRevenue: [] },
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

test("buildExecutiveActions ranks pipeline, telemetry, and marketing issues", () => {
  const dashboard: DashboardOverviewResponse = structuredClone(BASE_DASHBOARD);
  dashboard.topActions = [
    { title: "Launch VIP drop", detail: "Drive premium cash", owner: "Keegan", status: "blocked", dueAt: "2026-07-16", tone: "danger" }
  ];
  dashboard.pipelinePanel = {
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
        name: "Nike capsule",
        organization: "Nike",
        opportunityType: "brand",
        status: "negotiation",
        valueEstimate: 75000,
        prestigeScore: null,
        probabilityScore: null,
        ownerAgent: "Pipeline",
        nextStep: "Send revised deck",
        nextStepDueAt: "2026-07-10",
        verificationStatus: "verified_active"
      }
    ]
  };
  dashboard.schedulerSummary = { status: "PARTIAL", cronEnabled: false, jobCount: 5, failingCount: 2, missingTelemetryCount: 0, lastUpdatedAt: null, source: "scheduler" };
  dashboard.telemetryHealth = {
    woo: { source: "woo", status: "warning", reasons: ["stale window"], warningCodes: ["stale"] }
  };
  dashboard.executiveInsights = {
    brief: null,
    trends: [
      buildTrend({ id: "meta_roas", metric: "meta_roas", label: "Meta ROAS", percentChange: -42.5, direction: "down", magnitude: "major" })
    ]
  } satisfies ExecutiveInsightsPayload;

  const actions = buildExecutiveActions(dashboard);
  assert.equal(actions.length > 0, true, "should produce actions");
  assert.equal(actions[0].priority, "P1", "top action inherits danger priority");
  assert.ok(actions.some((action) => action.id.startsWith("pipeline-")), "pipeline overdue action included");
  assert.ok(actions.some((action) => action.id === "scheduler"), "scheduler action included when cron disabled");
  assert.ok(actions.some((action) => action.id.startsWith("telemetry-woo")), "telemetry repair action included");
  assert.ok(actions.some((action) => action.id.startsWith("marketing-meta_roas")), "marketing inefficiency action included");
});

test("buildExecutiveDrivers clusters related metrics", () => {
  const drivers = buildExecutiveDrivers([
    buildTrend({ id: "rev", metric: "woo_revenue", label: "Revenue", percentChange: -20, direction: "down", magnitude: "major" }),
    buildTrend({ id: "conv", metric: "woo_conversion", label: "Conversion", percentChange: -10, direction: "down", magnitude: "moderate" }),
    buildTrend({ id: "orders", metric: "woo_orders", label: "Orders", percentChange: -15, direction: "down", magnitude: "moderate" }),
    buildTrend({ id: "traffic", metric: "ga4_sessions", label: "Sessions", percentChange: 5, direction: "up", magnitude: "minor" })
  ]);

  assert.equal(drivers.length >= 2, true, "produces grouped drivers");
  assert.match(drivers[0].title.toLowerCase(), /revenue/);
  assert.ok(drivers[0].supporting.some((text) => text.toLowerCase().includes("conversion")), "conversion grouped under revenue driver");
});

test("buildDataConfidence collapses partial-day warnings", () => {
  const dashboard = structuredClone(BASE_DASHBOARD);
  dashboard.telemetryMetadata = {
    woo: {
      source: "woo",
      requestedStartDate: "2026-07-09",
      requestedEndDate: "2026-07-15",
      timezone: "UTC",
      freshnessStatus: "fresh",
      coverageStatus: "complete",
      includesPartialDay: true,
      includesFutureDates: false,
      warningCodes: ["partial_day"],
      generatedAt: "2026-07-15T10:00:00Z",
      latestCompletedBusinessDate: "2026-07-15"
    }
  } satisfies Partial<Record<TelemetrySource, TelemetryMetadata>>;
  dashboard.executiveInsights = {
    brief: {
      pacificWindow: { startDate: "2026-07-09", endDate: "2026-07-15", includesPartialDay: true },
      warnings: [],
      topChanges: [],
      sourceFreshness: [],
      attention: null
    },
    trends: []
  } satisfies ExecutiveInsightsPayload;
  dashboard.websiteConversion = {
    generatedAt: "2026-07-15T10:00:00Z",
    wooCommerce: { netRevenue: 1000, paidOrdersInWindow: 20, topProducts: [], recentOrders: [] }
  } as DashboardOverviewResponse["websiteConversion"];
  dashboard.commerceTelemetry = {
    range: dashboard.range,
    woo: { summary: { revenue: 1000, orders: 20, avgOrderValue: 50, discountTotal: 0, shippingTotal: 0, taxTotal: 0, items: 0 }, timeseries: [] }
  } as DashboardOverviewResponse["commerceTelemetry"];

  const summary = buildDataConfidenceModel(dashboard);
  const woo = summary.entries.find((entry) => entry.id === "woo");
  assert.equal(summary.partialDay, true, "partial-day rolls up globally");
  assert.equal(woo?.state, "trusted", "Woo confidence stays trusted despite partial day");
  assert.equal(summary.overall.label.length > 0, true);
});

test("summarizeExecutiveStatus falls back when brief missing", () => {
  const summary = summarizeExecutiveStatus(null, { startDate: "2026-07-09", endDate: "2026-07-15" });
  assert.match(summary.sentence, /Business steady/);
  assert.equal(summary.rangeLabel, "Jul 9 – Jul 15 PT");
  assert.equal(summary.confidence, "medium");
});

test("buildExecutiveActions honors limit and skips positive marketing trends", () => {
  const dashboard: DashboardOverviewResponse = structuredClone(BASE_DASHBOARD);
  dashboard.executiveInsights = {
    brief: null,
    trends: [
      buildTrend({ id: "meta_roas", metric: "meta_roas", label: "Meta ROAS", percentChange: 12.5, direction: "up", magnitude: "major" })
    ]
  } satisfies ExecutiveInsightsPayload;
  const actions = buildExecutiveActions(dashboard, 5);
  assert(actions.length <= 5, "caps results to at most five");
  assert.equal(actions.some((action) => action.id.startsWith("marketing-")), false, "positive trend does not create correction action");
});

test("executive actions expose why now and next steps", () => {
  const dashboard: DashboardOverviewResponse = structuredClone(BASE_DASHBOARD);
  dashboard.topActions = [{ title: "Audit spend", detail: "Shift to ROAS", owner: "Marketing", status: "urgent", dueAt: "2026-07-18", tone: "warning" }];
  const actions = buildExecutiveActions(dashboard, 3);
  assert.ok(actions.every((action) => Boolean(action.whyNow) && Boolean(action.nextStep)), "actions include why now and next step fields");
});

test("forward strategy reacts to pacing window", () => {
  const dashboard: DashboardOverviewResponse = structuredClone(BASE_DASHBOARD);
  dashboard.headerMetrics = [
    {
      metricKey: "revenue",
      metricName: "Revenue",
      category: "Finance",
      currentValue: 40000,
      targetValue: 100000,
      deltaPercent: null,
      status: "warning",
      unit: "usd"
    }
  ];
  const shortWindow = buildForwardActions(dashboard, 7, 7, []);
  const longWindow = buildForwardActions(dashboard, 14, 7, []);
  assert.notEqual(shortWindow[0]?.reason, longWindow[0]?.reason, "pace adjusts when window length changes");
});

function buildTrend(overrides: Partial<TrendComparison>): TrendComparison {
  return {
    id: "trend",
    source: "woo",
    metric: "woo_metric",
    label: "Metric",
    currentValue: 100,
    previousValue: 120,
    absoluteChange: -20,
    percentChange: -16.7,
    direction: "down",
    magnitude: "moderate",
    anomaly: false,
    caveat: null,
    ...overrides
  } as TrendComparison;
}
