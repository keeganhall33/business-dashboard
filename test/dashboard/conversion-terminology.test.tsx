import test from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";

import { __test__ as dashboardShellTest } from "@/components/dashboard/DashboardShell";
import type { DashboardOverviewResponse } from "@/lib/types/dashboard";

function baseDashboard(overrides: Partial<DashboardOverviewResponse> = {}) {
  return {
    range: { preset: "year_to_date", startDate: "2026-01-01", endDate: "2026-08-03" },
    dataMode: "LIVE_DATA",
    executiveInsights: null,
    executiveCommand: null,
    warRoom: null,
    headerMetrics: [],
    commerceTelemetry: {
      range: { preset: "year_to_date", startDate: "2026-01-01", endDate: "2026-08-03" },
      woo: { summary: { revenue: 1000, orders: 10 } },
      ga4: { summary: { sessions: 1000 } },
      funnel: { summary: { conversionRate: 12.3 } }
    },
    telemetryMetadata: null,
    commerceSnapshots: null,
    websiteConversion: null,
    metaAds: {
      generatedAt: new Date().toISOString(),
      range: 7,
      accountId: "act_123",
      status: "LIVE",
      summary: { spend: 10, impressions: 100, clicks: 1, purchases: 4, purchaseValue: 400, roas: 2.0 },
      campaigns: [
        {
          campaignId: "cmp_1",
          campaignName: "Test",
          spend: 10,
          impressions: 100,
          clicks: 1,
          ctr: null,
          cpc: null,
          cpm: null,
          purchases: 4,
          purchaseValue: 400,
          roas: 2.0
        }
      ]
    },
    performanceBaseline: {
      range: { preset: "year_to_date", startDate: "2026-01-01", endDate: "2026-08-03" },
      previousRange: { startDate: "2025-01-01", endDate: "2025-08-03" },
      metrics: {
        revenue: { id: "revenue", unit: "currency", current: 1000, previous: null, delta: null, deltaPercent: null },
        orders: { id: "orders", unit: "count", current: 10, previous: null, delta: null, deltaPercent: null },
        avgOrderValue: { id: "avg_order_value", unit: "currency", current: 100, previous: null, delta: null, deltaPercent: null },
        sessions: { id: "sessions", unit: "count", current: 1000, previous: null, delta: null, deltaPercent: null },
        purchaseConversionRate: { id: "purchase_conversion_rate", unit: "percent", current: 1.2, previous: null, delta: null, deltaPercent: null },
        funnelCompletionRate: { id: "funnel_completion_rate", unit: "percent", current: 12.3, previous: null, delta: null, deltaPercent: null }
      }
    },
    changeInsights: null,
    performanceBaselineV2: null,
    schedulerSummary: null,
    systemHealth: null,
    approvalBottlenecks: null,
    actionQueue: {
      needsApprovalTasks: { label: "Task approvals", count: 0, items: [] },
      pendingPlans: { label: "Plans awaiting review", count: 0, items: [] },
      decisionsDue: { label: "Decisions to revisit", count: 0, items: [] },
      invoicesToSend: { label: "Invoices to send", count: 0, items: [] }
    },
    agents: [],
    ...overrides
  } as DashboardOverviewResponse;
}

test("Commerce summary uses purchase conversion label when purchase conversion is available", () => {
  const summary = dashboardShellTest.buildCommerceSummary(baseDashboard(), []);
  const metrics = summary.metrics.join(" • ");
  assert.match(metrics, /Purchase conversion\s*1\.2%/);
  assert.ok(!/\bConv\b/.test(metrics));
});

test("Commerce summary uses funnel completion label when purchase conversion is unavailable", () => {
  const data = baseDashboard({
    performanceBaseline: {
      ...baseDashboard().performanceBaseline,
      metrics: {
        ...baseDashboard().performanceBaseline.metrics,
        purchaseConversionRate: { ...baseDashboard().performanceBaseline.metrics.purchaseConversionRate, current: null }
      }
    }
  });
  const summary = dashboardShellTest.buildCommerceSummary(data, []);
  const metrics = summary.metrics.join(" • ");
  assert.match(metrics, /Funnel completion\s*12\.3%/);
  assert.ok(!/Purchase conversion\s*12\.3%/.test(metrics));
});

test("No executive-facing bare 'Conv' or generic 'Conversion rate' strings remain in inventoried sources", () => {
  const files = [
    "src/components/dashboard/DashboardShell.tsx",
    "src/components/dashboard/PerformanceBaselinePanel.tsx",
    "src/lib/scheduler/warRoom.ts",
    "src/lib/agents/avery.ts",
    "src/lib/agents/sloan.ts",
    "src/lib/agents/lyra.ts"
  ];

  const text = files.map((f) => fs.readFileSync(f, "utf8")).join("\n\n");

  assert.ok(!/\bConv\b/.test(text), "should not include bare 'Conv' label");
  assert.ok(!/Conversion rate is below/i.test(text), "should not include generic 'Conversion rate' phrasing");
});
