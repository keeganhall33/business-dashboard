import assert from "node:assert/strict";
import test from "node:test";

import { buildOperationsIntel } from "../src/lib/operations-intelligence.ts";

import type { DashboardOverviewResponse } from "../src/lib/types/dashboard";

function baseDashboard(): DashboardOverviewResponse {
  return {
    ok: true,
    timestamp: "2026-07-16T15:00:00.000Z",
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
    schedulerSummary: { status: "LIVE", cronEnabled: true, jobCount: 0, failingCount: 0, missingTelemetryCount: 0, lastUpdatedAt: "2026-07-16T14:59:00.000Z" },
    agentSla: [],
    approvalBottlenecks: { pendingCount: 0, oldestPendingHours: null, tasks: [] },
    actionQueue: {
      needsApprovalTasks: {
        label: "Task approvals",
        count: 1,
        items: [{ id: "a", itemType: "task", title: "Approve A", summary: "Routine", createdAt: "2026-07-10T12:00:00.000Z", dueAt: null, actor: "noah" }]
      },
      pendingPlans: { label: "Plans", count: 0, items: [] },
      decisionsDue: { label: "Decisions", count: 0, items: [] },
      invoicesToSend: { label: "Invoices", count: 0, items: [] }
    },
    systemHealth: { dataFreshnessHours: null, agentTaskCompletionRate: null, agents: [] },
    agentUpdateFeed: [],
    commerceTelemetry: { range: { preset: "7d", startDate: "2026-07-01", endDate: "2026-07-07" } },
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

test("Operations actions do not include routine approval queues", () => {
  const intel = buildOperationsIntel(baseDashboard());
  assert.equal(intel.actions.length, 0);
});

test("Operations actions include scheduler restore when BROKEN", () => {
  const dash = baseDashboard();
  dash.schedulerSummary = { ...dash.schedulerSummary!, status: "BROKEN", failingCount: 2 };
  const intel = buildOperationsIntel(dash);
  assert.ok(intel.actions.some((a) => a.id === "scheduler-action"));
  assert.ok(intel.incidents.some((i) => i.id === "scheduler"));
});
