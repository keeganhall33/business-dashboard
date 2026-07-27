import type { DashboardOverviewResponse, RangePreset, WebsiteConversionSnapshot } from "@/lib/types/dashboard";
import { normalizeWebsiteSnapshot } from "@/lib/dashboard/normalize-website-snapshot";

type RecentOrder = NonNullable<NonNullable<WebsiteConversionSnapshot["wooCommerce"]>["recentOrders"]>[number];

// Staging fixtures are sanitized and contain no real customer PII.
// They are intended only for keegan-dashboard-preview with explicit env flag.

type FixtureSet = {
  overview: DashboardOverviewResponse;
};

function isoDay(date: string) {
  return `${date}T00:00:00.000Z`;
}

function buildWebsiteSnapshot(range: { startDate: string; endDate: string }): WebsiteConversionSnapshot {
  return {
    generatedAt: isoDay("2026-07-01"),
    ga4: {
      totalUsers: 4200,
      sessions: 5589,
      ecommercePurchases: 7,
      purchaseRevenue: 1234,
      funnelRates: {
        sessionToPurchase: 7 / 5589
      }
    },
    wooCommerce: {
      observedPaidRange: { earliestPaid: range.startDate, latestPaid: range.endDate },
      netRevenue: 5000,
      grossOrderRevenue: 5100,
      paidOrdersInWindow: 7,
      averageOrderValue: 714.29,
      recentOrders: [
        {
          id: 111,
          number: "10001",
          status: "completed",
          total: 725,
          currency: "USD",
          date_paid: isoDay("2026-07-01"),
          customer: "Sample Customer"
        },
        {
          id: 112,
          number: "10002",
          status: "processing",
          total: 610,
          currency: "USD",
          date_paid: isoDay("2026-07-02"),
          customer: null,
          // Production-shaped variation: billing fields exist even when customer is missing.
          billing: { first_name: "Test", last_name: "Buyer" }
        } as unknown as RecentOrder & {
          billing: { first_name: string; last_name: string };
        },
        {
          id: 113,
          number: "10003",
          status: "completed",
          total: 499,
          currency: "USD",
          date_paid: isoDay("2026-07-03"),
          customer: null
        }
      ]
    }
  };
}

export function buildStagingFixtureOverview(params: { range: { preset: RangePreset; startDate: string; endDate: string } }): FixtureSet {
  const range = params.range;

  // Range-distinguishable values for interaction proof.
  const revenueByPreset: Record<RangePreset, number> = {
    today: 120,
    yesterday: 90,
    "7d": 700,
    "30d": 5000,
    month_to_date: 2300,
    previous_month: 4800,
    "90d": 12000,
    year_to_date: 42000,
    custom: 3333
  };

  const ordersByPreset: Record<RangePreset, number> = {
    today: 1,
    yesterday: 0,
    "7d": 7,
    "30d": 7,
    month_to_date: 5,
    previous_month: 8,
    "90d": 20,
    year_to_date: 60,
    custom: 3
  };

  const sessionsByPreset: Record<RangePreset, number> = {
    today: 300,
    yesterday: 280,
    "7d": 2000,
    "30d": 5589,
    month_to_date: 3100,
    previous_month: 6000,
    "90d": 18000,
    year_to_date: 60000,
    custom: 1500
  };

  const revenue = revenueByPreset[range.preset];
  const orders = ordersByPreset[range.preset];
  const sessions = sessionsByPreset[range.preset];

  const partialCommerce = range.preset !== "today" && range.preset !== "yesterday";

  const aov = !partialCommerce && orders > 0 ? revenue / orders : null;
  const purchaseConversion = sessions > 0 ? (orders / sessions) * 100 : null;

  const overview: DashboardOverviewResponse = {
    ok: true,
    timestamp: isoDay("2026-07-04"),
    range,
    headerMetrics: [],
    executiveCommand: {
      weeklyDirective: "Staging fixture",
      topPriorities: [],
      biggestBottlenecks: [],
      ceoRecommendation: "Staging fixture"
    },
    warRoom: { mode: "normal", reason: null, lastUpdated: null, entries: [] },
    revenueEngine: { metrics: [], moneyLeaks: [], fastestPathToIncreaseRevenue: [] },
    commerceTelemetry: {
      range,
      woo: {
        summary: {
          revenue,
          orders,
          avgOrderValue: aov,
          completeness: partialCommerce ? "partial" : "complete",
          source: partialCommerce ? "snapshot_recent_orders" : "telemetry",
          note: partialCommerce
            ? "Recent-order snapshot data is available, but revenue and order totals are partial and may be understated."
            : null,
          discountTotal: 0,
          shippingTotal: 0,
          taxTotal: 0,
          items: 0
        },
        timeseries: []
      },
      ga4: {
        summary: {
          revenue: 1234,
          sessions,
          engagedSessions: Math.round(sessions * 0.6),
          eventCount: 0,
          avgEngagementSeconds: null
        },
        timeseries: []
      },
      funnel: {
        summary: {
          entries: 100,
          completions: 27,
          conversionRate: 27.3,
          upsellOffers: 0,
          upsellAccepts: 0,
          upsellTakeRate: null
        },
        timeseries: []
      }
    },
    performanceBaseline: {
      range,
      previousRange: { startDate: "2026-06-01", endDate: "2026-06-30" },
      metrics: {
        revenue: {
          id: "revenue",
          unit: "currency",
          current: revenue,
          previous: revenue * 1.2,
          delta: partialCommerce ? null : revenue - revenue * 1.2,
          deltaPercent: partialCommerce ? null : revenue / (revenue * 1.2) - 1,
          ...(partialCommerce ? { currentQualifier: "at_least", currentCompleteness: "partial", previousCompleteness: "partial" } : null)
        },
        orders: {
          id: "orders",
          unit: "count",
          current: orders,
          previous: orders + 2,
          delta: partialCommerce ? null : orders - (orders + 2),
          deltaPercent: partialCommerce ? null : orders == null ? null : (orders - (orders + 2)) / (orders + 2),
          ...(partialCommerce ? { currentQualifier: "at_least", currentCompleteness: "partial", previousCompleteness: "partial" } : null)
        },
        avgOrderValue: {
          id: "avg_order_value",
          unit: "currency",
          current: aov,
          previous: partialCommerce ? null : aov == null ? null : aov * 1.05,
          delta: partialCommerce ? null : aov == null ? null : aov - aov * 1.05,
          deltaPercent: partialCommerce ? null : aov == null ? null : aov / (aov * 1.05) - 1,
          ...(partialCommerce ? { currentCompleteness: "partial", previousCompleteness: "partial" } : null)
        },
        sessions: { id: "sessions", unit: "count", current: sessions, previous: Math.round(sessions * 1.1), delta: sessions - Math.round(sessions * 1.1), deltaPercent: sessions / Math.round(sessions * 1.1) - 1 },
        purchaseConversionRate: { id: "purchase_conversion_rate", unit: "percent", current: purchaseConversion, previous: purchaseConversion == null ? null : purchaseConversion * 0.9, delta: purchaseConversion == null ? null : purchaseConversion - purchaseConversion * 0.9, deltaPercent: purchaseConversion == null ? null : purchaseConversion / (purchaseConversion * 0.9) - 1 },
        funnelCompletionRate: { id: "funnel_completion_rate", unit: "percent", current: 27.3, previous: 25.0, delta: 2.3, deltaPercent: 2.3 / 25.0 }
      }
    },
    websiteConversion: normalizeWebsiteSnapshot(buildWebsiteSnapshot(range)),
    metaAds: null,
    brandPower: { metrics: [], whatIsWorking: [], whatToDoNext: [] },
    opportunityRadar: { activeCount: 0, readyForOutreachCount: 0, topOpportunities: [], nextFiveMoves: [] },
    pipelinePanel: { collectors: [], deals: [] },
    survivalStrip: { configured: false, cashOnHand: null, survivalFloor: 0, monthlyBurn: null, projected30dRevenue: null, runwayDays: null },
    changeInsights: null,
    dataSourceAccess: undefined,
    tasks: [],
    proofOfWork: [],
    schedulerJobs: [],
    agentKpis: [],
    ideaBoard: { columns: {}, recentComments: [] },
    ceoQuestionDesk: { openQuestions: [], escalations: [], recentComments: [] },
    agentSla: [],
    approvalBottlenecks: { pendingCount: 0, oldestPendingHours: null, tasks: [] },
    actionQueue: {
      needsApprovalTasks: { label: "Needs approval", count: 0, items: [] },
      pendingPlans: { label: "Plans", count: 0, items: [] },
      decisionsDue: { label: "Decisions", count: 0, items: [] },
      invoicesToSend: { label: "Invoices", count: 0, items: [] }
    },
    systemHealth: { dataFreshnessHours: null, agentTaskCompletionRate: null, agents: [] },
    agentUpdateFeed: [],
    topActions: [],
    executiveInsights: null,
    industryPulseSnapshot: null
  };

  return { overview };
}
