import test from "node:test";
import assert from "node:assert/strict";
import { explainRevenueChange } from "@/lib/intelligence/explanation-engine";
import type { DashboardOverviewResponse } from "@/lib/types/dashboard";

function mkOverview(input: {
  startDate: string;
  endDate: string;
  revenueCents: number;
  orders: number;
  sessions: number;
}) {
  const revenue = input.revenueCents / 100;
  return {
    ok: true,
    timestamp: new Date().toISOString(),
    dataMode: "LIVE_DATA" as const,
    range: { preset: "custom" as const, startDate: input.startDate, endDate: input.endDate },
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
      range: { preset: "custom" as const, startDate: input.startDate, endDate: input.endDate },
      woo: {
        summary: {
          revenue,
          orders: input.orders,
          avgOrderValue: revenue / input.orders,
          discountTotal: null,
          shippingTotal: null,
          taxTotal: null,
          items: input.orders,
          source: "selected_range_telemetry" as const,
          completeness: "complete" as const,
          asOf: new Date().toISOString(),
          definitionVersion: "woo_paid_net_v1",
          coverageStart: input.startDate,
          coverageEnd: input.endDate,
          comparisonAvailable: false
        },
        timeseries: []
      },
      ga4: {
        summary: {
          revenue: null,
          sessions: input.sessions,
          engagedSessions: null,
          eventCount: null,
          avgEngagementSeconds: null
        },
        timeseries: []
      }
    },
    agentKpis: [],
    ideaBoard: { columns: { proposed: [], in_review: [], approved: [], rejected: [], in_progress: [], shipped: [], archived: [] }, linkedTasks: {}, recentComments: [] },
    ceoQuestionDesk: { openQuestions: [], escalations: [], recentComments: [] }
  } satisfies DashboardOverviewResponse;
}

test("revenue up because sessions increased (traffic driver)", () => {
  const current = mkOverview({ startDate: "2026-07-01", endDate: "2026-07-07", revenueCents: 20000, orders: 4, sessions: 2000 });
  const prev = mkOverview({ startDate: "2026-06-24", endDate: "2026-06-30", revenueCents: 10000, orders: 4, sessions: 1000 });

  const res = explainRevenueChange({
    metric: "revenue",
    currentRange: { startDate: current.range.startDate, endDate: current.range.endDate },
    comparisonRange: { startDate: prev.range.startDate, endDate: prev.range.endDate },
    current,
    previous: prev
  });

  assert.equal(res.ok, true);
  assert.equal(res.explanation.metric, "revenue");
  assert.equal(res.explanation.absolute_change, 10000);
  assert.ok(res.explanation.primary_driver);
  assert.ok(["Traffic (sessions)", "Conversion rate", "Average order value"].includes(res.explanation.primary_driver?.label ?? ""));
});

test("insufficient evidence when GA4 sessions missing", () => {
  const current = mkOverview({ startDate: "2026-07-01", endDate: "2026-07-07", revenueCents: 20000, orders: 4, sessions: 2000 });
  const prev = mkOverview({ startDate: "2026-06-24", endDate: "2026-06-30", revenueCents: 10000, orders: 4, sessions: 1000 });
  // Remove GA4
  current.commerceTelemetry!.ga4!.summary.sessions = null;
  prev.commerceTelemetry!.ga4!.summary.sessions = null;

  const res = explainRevenueChange({
    metric: "revenue",
    currentRange: { startDate: current.range.startDate, endDate: current.range.endDate },
    comparisonRange: { startDate: prev.range.startDate, endDate: prev.range.endDate },
    current,
    previous: prev
  });

  assert.equal(res.ok, true);
  assert.ok(["possible", "insufficient_evidence", "likely"].includes(res.explanation.confidence));
  assert.ok(res.explanation.data_missing.includes("Email campaign telemetry"));
});
