/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { buildDataConfidenceModel } from "../src/lib/data-confidence.ts";
import { DataConfidencePanel } from "../src/components/dashboard/DataConfidencePanel";

import type { DashboardOverviewResponse } from "../src/lib/types/dashboard";

const BASE_RANGE = { preset: "7d", startDate: "2026-07-01", endDate: "2026-07-07" } as const;

function baseDashboard(): DashboardOverviewResponse {
  return {
    ok: true,
    timestamp: "2026-07-07T01:00:00.000Z",
    range: BASE_RANGE,
    headerMetrics: [],
    executiveCommand: { weeklyDirective: "", topPriorities: [], biggestBottlenecks: [], ceoRecommendation: "" },
    warRoom: { mode: "normal", reason: null, lastUpdated: null, entries: [] },
    revenueEngine: { metrics: [], moneyLeaks: [], fastestPathToIncreaseRevenue: [], isDiagnosticEmpty: true },
    brandPower: { metrics: [], whatIsWorking: [], whatToDoNext: [] },
    opportunityRadar: { activeCount: 0, readyForOutreachCount: 0, topOpportunities: [], nextFiveMoves: [] },
    pipelinePanel: {
      collectors: [],
      deals: [],
      verificationSummary: { total: 0, verifiedActive: 0, onHold: 0, complete: 0, declined: 0, invalid: 0, stale: 0, unverified: 0 }
    },
    survivalStrip: { configured: false, cashOnHand: null, survivalFloor: 0, monthlyBurn: null, projected30dRevenue: null, runwayDays: null },
    tasks: [],
    proofOfWork: [],
    schedulerJobs: [],
    schedulerSummary: { status: "PARTIAL", cronEnabled: true, jobCount: 0, failingCount: 0, missingTelemetryCount: 0, lastUpdatedAt: "2026-07-16T14:59:00.000Z" },
    agentSla: [],
    approvalBottlenecks: { pendingCount: 0, oldestPendingHours: null, tasks: [] },
    actionQueue: {
      needsApprovalTasks: { label: "Task approvals", count: 0, items: [] },
      pendingPlans: { label: "Plans", count: 0, items: [] },
      decisionsDue: { label: "Decisions", count: 0, items: [] },
      invoicesToSend: { label: "Invoices", count: 0, items: [] }
    },
    systemHealth: { dataFreshnessHours: null, agentTaskCompletionRate: null, agents: [] },
    agentUpdateFeed: [],
    commerceTelemetry: {
      range: BASE_RANGE,
      woo: { summary: { revenue: 100, orders: 2, completeness: "complete" } },
      ga4: { summary: { sessions: 100 } }
    } as any,
    websiteConversion: null,
    metaAds: null,
    executiveSummary: null,
    socialIntelligence: null,
    industryPulseSnapshot: null,
    cloudflare: null,
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
    executiveInsights: null,
    telemetryHealthHistory: []
  };
}

test("Data Confidence wording qualifies stale selected-range Woo telemetry with snapshot fallback", () => {
  const dashboard = baseDashboard();
  (dashboard.commerceTelemetry as any).woo = {
    summary: {
      revenue: 25,
      orders: 1,
      completeness: "partial",
      source: "snapshot_recent_orders"
    }
  };

  const summary = buildDataConfidenceModel(dashboard);
  const html = renderToStaticMarkup(<DataConfidencePanel summary={summary} />);

  assert.match(html, /Selected-range Woo telemetry is stale\./);
  assert.match(html, /Recent-order snapshot data is available, but revenue and order totals are partial and may be understated\./);
  assert.match(html, /Exact revenue, exact order count, AOV, target pacing, and period-over-period commerce comparison are unavailable\./);
});

test("Data Confidence does not imply GA4 is blocked when Woo is partial", () => {
  const dashboard = baseDashboard();
  (dashboard.commerceTelemetry as any).woo = {
    summary: { revenue: 25, orders: 1, completeness: "partial", source: "snapshot_recent_orders" }
  };

  const summary = buildDataConfidenceModel(dashboard);
  const ga4 = summary.entries.find((e) => e.id === "ga4");
  assert.ok(ga4);
  assert.equal(ga4.state, "trusted");
});
