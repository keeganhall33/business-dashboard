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
  assert.match(dashboardPage, /ExecutiveHomeShell/);
  assert.match(dashboardPage, /buildExecutiveHomeFromDashboardOverviewV1/);
  assert.doesNotMatch(dashboardPage, /DashboardPageClient/);
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

test("Executive Home production-shaped render is mobile-safe and light-first", () => {
  const dashboard = structuredClone(BASE_DASHBOARD) as DashboardOverviewResponse;
  dashboard.topActions = [
    { title: "Repair Woo evidence feed", detail: "Revenue confidence is blocked until Woo evidence is available.", owner: "Telemetry", status: "critical", dueAt: "2026-08-21", tone: "danger" }
  ];
  const { home, decisionRoom } = buildExecutiveHomeFromDashboardOverviewV1(dashboard);
  const html = renderToString(<ExecutiveHomeShell data={home} decisionRoom={decisionRoom} />);

  assert.match(html, /bg-\[#f7f2ea\]/);
  assert.match(html, /px-4 sm:px-6 lg:px-8/);
  assert.match(html, /flex w-full max-w-full flex-wrap/);
  assert.match(html, /grid gap-4 lg:grid-cols-2/);
  assert.match(html, /Open Decision Room/);
  assert.doesNotMatch(html, /Operator Command/);
  assert.doesNotMatch(html, /Protect premium scarcity while choosing the next move/);
});
