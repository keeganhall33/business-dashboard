import test from "node:test";
import assert from "node:assert/strict";

import { __test__ as dashboardShellTest } from "@/components/dashboard/DashboardShell";
import type { DashboardOverviewResponse } from "@/lib/types/dashboard";

function baseData(overrides: Partial<DashboardOverviewResponse> = {}): DashboardOverviewResponse {
  return {
    range: { preset: "year_to_date", startDate: "2026-01-01", endDate: "2026-08-03" },
    dataMode: "LIVE_DATA",
    dataModeReason: null,
    timestamp: new Date().toISOString(),
    headerMetrics: [],
    executiveCommand: null,
    warRoom: null,
    revenueEngine: null,
    brandPower: null,
    opportunityRadar: null,
    pipelinePanel: null,
    collectorTelemetry: null,
    survivalStrip: null,
    tasks: [],
    proofOfWork: [],
    schedulerJobs: [],
    schedulerSummary: null,
    agentSla: null,
    approvalBottlenecks: null,
    actionQueue: {
      needsApprovalTasks: { label: "Task approvals", count: 0, items: [] },
      pendingPlans: { label: "Plans awaiting review", count: 0, items: [] },
      decisionsDue: { label: "Decisions to revisit", count: 0, items: [] },
      invoicesToSend: { label: "Invoices to send", count: 0, items: [] }
    },
    systemHealth: null,
    agentUpdateFeed: null,
    commerceTelemetry: {
      range: { preset: "year_to_date", startDate: "2026-01-01", endDate: "2026-08-03" },
      woo: { summary: { revenue: 1000, orders: 10, avgOrderValue: null, discountTotal: null, shippingTotal: null, taxTotal: null, items: null }, timeseries: [] },
      ga4: { summary: { revenue: null, sessions: 1000, engagedSessions: null, eventCount: null, avgEngagementSeconds: null }, timeseries: [] },
      funnel: { summary: { entries: null, completions: null, conversionRate: 12.3, upsellOffers: null, upsellAccepts: null, upsellTakeRate: null }, timeseries: [] }
    },
    performanceBaseline: null,
    performanceBaselineV2: null,
    changeInsights: null,
    websiteConversion: {
      // Website snapshot timestamp must NOT be used for commerce selected-range freshness.
      generatedAt: "2026-08-03T16:00:00Z",
      ga4: {},
      wooCommerce: {}
    },
    metaAds: {
      generatedAt: null,
      accountId: "act_123",
      range: 7,
      campaigns: [],
      summary: { spend: 10, impressions: 100, clicks: 1, purchases: null, purchaseValue: null, roas: null },
      status: "LIVE"
    },
    industryPulseSnapshot: null,
    executiveInsights: null,
    agents: [],
    telemetryMetadata: null,
    ...overrides
  } as unknown as DashboardOverviewResponse;
}

test("Commerce asOf present: commerce summary renders compact Updated … line", () => {
  const data = baseData({
    commerceTelemetry: {
      ...baseData().commerceTelemetry,
      woo: {
        ...baseData().commerceTelemetry!.woo,
        summary: { ...baseData().commerceTelemetry!.woo!.summary, asOf: new Date(Date.now() - 60 * 60 * 1000).toISOString() }
      }
    }
  });

  const summary = dashboardShellTest.buildCommerceSummary(data, []);
  assert.ok(summary.freshness?.startsWith("Updated "));
});

test("Commerce asOf null: commerce summary omits freshness (no fabrication; does not use website snapshot)", () => {
  const data = baseData({
    commerceTelemetry: {
      ...baseData().commerceTelemetry,
      woo: {
        ...baseData().commerceTelemetry!.woo,
        summary: { ...baseData().commerceTelemetry!.woo!.summary, asOf: null }
      }
    }
  });

  const summary = dashboardShellTest.buildCommerceSummary(data, []);
  assert.equal(summary.freshness ?? null, null);
});

test("Marketing generatedAt present: marketing summary renders Updated … line", () => {
  const data = baseData({
    metaAds: { ...baseData().metaAds!, generatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() }
  });

  const summary = dashboardShellTest.buildMarketingSummary(data, []);
  assert.ok(summary.freshness?.startsWith("Updated "));
});

test("Marketing generatedAt null: marketing summary omits freshness (no fabrication)", () => {
  const data = baseData({
    metaAds: { ...baseData().metaAds!, generatedAt: null }
  });

  const summary = dashboardShellTest.buildMarketingSummary(data, []);
  assert.equal(summary.freshness ?? null, null);
});

