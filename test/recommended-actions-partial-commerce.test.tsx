/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { buildDataConfidenceModel } from "../src/lib/data-confidence.ts";
import { ExecutiveActionsPanel } from "../src/components/dashboard/ExecutiveActionsPanel";

import type { DashboardOverviewResponse } from "../src/lib/types/dashboard";

function baseDashboard(): DashboardOverviewResponse {
  return {
    ok: true,
    timestamp: "2026-07-07T01:00:00.000Z",
    range: { preset: "7d", startDate: "2026-07-01", endDate: "2026-07-07" },
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
    schedulerSummary: { status: "LIVE", cronEnabled: true, jobCount: 0, failingCount: 0, missingTelemetryCount: 0, lastUpdatedAt: "2026-07-07T00:59:00.000Z" },
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
      range: { preset: "7d", startDate: "2026-07-01", endDate: "2026-07-07" },
      woo: { summary: { revenue: 25, orders: 1, completeness: "partial", source: "snapshot_recent_orders" } },
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
    topActions: [
      { title: "Close the revenue gap", detail: "Need $5k/day to hit target", tone: "warning", status: "Behind target", owner: "Ops", dueAt: null }
    ] as any,
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

test("Recommended Actions suppresses top actions when Woo totals are partial", () => {
  const dashboard = baseDashboard();
  const confidence = buildDataConfidenceModel(dashboard);

  const html = renderToStaticMarkup(<ExecutiveActionsPanel data={dashboard} confidence={confidence} />);
  assert.match(html, /No evidence-backed recommendation is available for this period\./);
});
