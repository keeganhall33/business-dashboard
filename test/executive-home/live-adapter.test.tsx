import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";

import { ExecutiveHomeShell } from "@/components/executive-home/ExecutiveHomeShell";
import { buildExecutiveHomeFromDashboardOverviewV1 } from "@/lib/executive-home/live-adapter";
import type { DashboardOverviewResponse } from "@/lib/types/dashboard";

const BASE_DASHBOARD = {
  ok: true,
  timestamp: "2026-08-21T12:00:00.000Z",
  range: { preset: "7d", startDate: "2026-08-15", endDate: "2026-08-21" },
  headerMetrics: [],
  executiveCommand: { weeklyDirective: "", topPriorities: [], biggestBottlenecks: [], ceoRecommendation: "" },
  warRoom: { mode: "normal", reason: null, lastUpdated: null, entries: [] },
  revenueEngine: { metrics: [], moneyLeaks: [], fastestPathToIncreaseRevenue: [], isDiagnosticEmpty: true },
  brandPower: { metrics: [], whatIsWorking: [], whatToDoNext: [] },
  opportunityRadar: { activeCount: 0, readyForOutreachCount: 0, topOpportunities: [], nextFiveMoves: [] },
  pipelinePanel: { collectors: [], deals: [], verificationSummary: { total: 0, verifiedActive: 0, onHold: 0, complete: 0, declined: 0, invalid: 0, stale: 0, unverified: 0 } },
  survivalStrip: { configured: false, cashOnHand: null, survivalFloor: 0, monthlyBurn: null, projected30dRevenue: null, runwayDays: null },
  tasks: [],
  proofOfWork: [],
  schedulerJobs: [],
  schedulerSummary: { status: "LIVE", cronEnabled: true, jobCount: 1, failingCount: 0, missingTelemetryCount: 0, lastUpdatedAt: "2026-08-21T11:50:00.000Z" },
  agentSla: [],
  approvalBottlenecks: { pendingCount: 0, oldestPendingHours: null, tasks: [] },
  actionQueue: {
    needsApprovalTasks: { label: "Approvals", count: 0, items: [] },
    pendingPlans: { label: "Plans", count: 0, items: [] },
    decisionsDue: { label: "Decisions", count: 0, items: [] },
    invoicesToSend: { label: "Invoices", count: 0, items: [] }
  },
  systemHealth: { dataFreshnessHours: 1, agentTaskCompletionRate: null, agents: [] },
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
} as unknown as DashboardOverviewResponse;

test("/dashboard page is wired to Executive Home instead of the legacy Operator Command client", () => {
  const dashboardPage = fs.readFileSync("src/app/(app)/dashboard/page.tsx", "utf8");
  const rootPage = fs.readFileSync("src/app/page.tsx", "utf8");
  const rootLayout = fs.readFileSync("src/app/layout.tsx", "utf8");
  assert.match(dashboardPage, /ExecutiveHomeShell/);
  assert.match(dashboardPage, /buildExecutiveHomeFromDashboardOverviewV1/);
  assert.doesNotMatch(dashboardPage, /DashboardPageClient/);
  assert.match(rootPage, /redirect\("\/dashboard"\)/);
  assert.doesNotMatch(rootPage, /\/executive-home/);
  assert.match(rootLayout, /title: "Executive Home"/);
  assert.doesNotMatch(rootLayout, /Operator Command/);
});

test("live adapter preserves unavailable evidence instead of fixture-only conclusions", () => {
  const { home, decisionRoom } = buildExecutiveHomeFromDashboardOverviewV1(BASE_DASHBOARD);
  const html = renderToString(<ExecutiveHomeShell data={home} decisionRoom={decisionRoom} />);
  assert.equal(home.cards.some((card) => card.state === "UNKNOWN"), true);
  assert.equal(home.cards.some((card) => card.evidence.some((item) => /fixture/i.test(item))), false);
  assert.match(html, /Executive Home/);
  assert.match(html, /UNKNOWN|unavailable|No verified live/);
  assert.doesNotMatch(html, /Protect premium scarcity while choosing the next move/);
  assert.doesNotMatch(html, /Private collector room access validation/);
  assert.equal(decisionRoom.source_mode, "LIVE_DASHBOARD_OVERVIEW");
  assert.equal(decisionRoom.source_card_id, "matters-now-live-top-priority");
});

test("live adapter exposes a Decision Room drill-down from production-shaped action data", () => {
  const dashboard = structuredClone(BASE_DASHBOARD) as DashboardOverviewResponse;
  dashboard.topActions = [
    { title: "Repair Woo evidence feed", detail: "Revenue confidence is blocked until Woo evidence is available.", owner: "Telemetry", status: "critical", dueAt: "2026-08-21", tone: "danger" }
  ];
  dashboard.telemetryHealth = {
    woo: { source: "woo", status: "critical", reasons: ["Woo unavailable"], warningCodes: ["WOO_UNAVAILABLE"] }
  };
  const { home, decisionRoom } = buildExecutiveHomeFromDashboardOverviewV1(dashboard);
  const html = renderToString(<ExecutiveHomeShell data={home} decisionRoom={decisionRoom} />);
  assert.match(html, /Repair WOO feed/);
  assert.match(html, /Open Decision Room/);
  assert.match(html, /href="#decision-live-dashboard-top-priority"/);
  assert.equal(decisionRoom.current_recommendation.title, "Repair WOO feed");
  assert.equal(decisionRoom.evidence_refs.some((ref) => ref.provenance === "DASHBOARD_OVERVIEW"), true);
  assert.equal(decisionRoom.evidence_refs.some((ref) => ref.provenance === "DATA_CONFIDENCE"), true);
});

test("live adapter promotes real commerce and marketing values without inventing missing comparisons", () => {
  const dashboard = structuredClone(BASE_DASHBOARD) as DashboardOverviewResponse;
  dashboard.commerceTelemetry = {
    range: dashboard.range,
    woo: { summary: { revenue: 12500, orders: 8, avgOrderValue: 1562.5, discountTotal: 0, shippingTotal: 0, taxTotal: 0, items: 8 }, timeseries: [{ date: "2026-08-20", revenue: 5000, orders: 3 }, { date: "2026-08-21", revenue: 7500, orders: 5 }] },
    ga4: { summary: { revenue: 0, sessions: 4200, engagedSessions: 3100, eventCount: 9000, avgEngagementSeconds: 42 }, timeseries: [{ date: "2026-08-20", revenue: 0, sessions: 1900, engagedSessions: 1400 }, { date: "2026-08-21", revenue: 0, sessions: 2300, engagedSessions: 1700 }] }
  };
  dashboard.metaAds = { generatedAt: dashboard.timestamp, accountId: "act_test", range: 7, campaigns: [], status: "PARTIAL", summary: { spend: 900, impressions: 10000, clicks: 300, purchases: null, purchaseValue: null, roas: null } };

  const { home } = buildExecutiveHomeFromDashboardOverviewV1(dashboard);
  const pulse = Object.fromEntries(home.command_center.business_pulse.map((metric) => [metric.id, metric]));

  assert.equal(pulse.revenue.value, "$12,500");
  assert.equal(pulse.sessions.value, "4,200");
  assert.equal(pulse.meta.value, "$900 spent");
  assert.equal(pulse.meta.comparison, "ROAS unavailable");
  assert.equal(pulse.meta.truth_state, "INFERRED");
  assert.equal(pulse.revenue.comparison, "No verified comparison");
  assert.deepEqual(pulse.revenue.trend, [5000, 7500]);
});

test("business pulse hides a Meta snapshot that does not match the selected range", () => {
  const dashboard = structuredClone(BASE_DASHBOARD) as DashboardOverviewResponse;
  dashboard.range = { preset: "90d", startDate: "2026-05-24", endDate: "2026-08-21" };
  dashboard.metaAds = { generatedAt: dashboard.timestamp, accountId: "act_test", range: 30, campaigns: [], status: "LIVE", summary: { spend: 900, impressions: 10000, clicks: 300, purchases: 2, purchaseValue: 1800, roas: 2 } };

  const { home } = buildExecutiveHomeFromDashboardOverviewV1(dashboard);
  const meta = home.command_center.business_pulse.find((metric) => metric.id === "meta");

  assert.equal(meta?.value, "Unavailable");
  assert.equal(meta?.truth_state, "UNKNOWN");
  assert.equal(meta?.comparison, "Only a 30-day Meta snapshot is available");
});

test("Executive Home production-shaped render is mobile-safe and light-first", () => {
  const dashboard = structuredClone(BASE_DASHBOARD) as DashboardOverviewResponse;
  dashboard.topActions = [
    { title: "Repair Woo evidence feed", detail: "Revenue confidence is blocked until Woo evidence is available.", owner: "Telemetry", status: "critical", dueAt: "2026-08-21", tone: "danger" }
  ];
  const { home, decisionRoom } = buildExecutiveHomeFromDashboardOverviewV1(dashboard);
  const html = renderToString(<ExecutiveHomeShell data={home} decisionRoom={decisionRoom} />);

  assert.match(html, /bg-\[#f4f7fb\]/);
  assert.match(html, /grid grid-cols-2 gap-3 lg:grid-cols-4/);
  assert.match(html, /flex w-full max-w-full flex-wrap/);
  assert.match(html, /grid gap-4 lg:grid-cols-2/);
  assert.match(html, /Executive Home visual scan/);
  assert.match(html, /The numbers that matter/);
  assert.match(html, /See why/);
  assert.doesNotMatch(html, /Operator Command/);
  assert.doesNotMatch(html, /Protect premium scarcity while choosing the next move/);
});
