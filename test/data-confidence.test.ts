import test from "node:test";
import assert from "node:assert/strict";

import { buildDataConfidenceModel } from "../src/lib/data-confidence.ts";
import { buildExecutiveActions, buildExecutiveDrivers } from "../src/lib/dashboard/executive-layout.ts";
import type {
  DashboardOverviewResponse,
  TelemetrySource,
  TelemetryHealth,
  TelemetryMetadata,
  CommerceTelemetry
} from "../src/lib/types/dashboard";

const BASE_RANGE = { preset: "7d", startDate: "2026-07-09", endDate: "2026-07-15" } as const;

const BASE_COMMERCE_TELEMETRY: CommerceTelemetry = {
  range: BASE_RANGE,
  woo: { summary: { revenue: 50000, orders: 150, avgOrderValue: 350, discountTotal: 0, shippingTotal: 0, taxTotal: 0, items: 0 }, timeseries: [] },
  ga4: { summary: { revenue: 52000, sessions: 2000, engagedSessions: 1500, eventCount: 0, avgEngagementSeconds: 0 }, timeseries: [] },
  funnel: { summary: { entries: 800, completions: 400, conversionRate: 0.5, upsellOffers: 50, upsellAccepts: 10, upsellTakeRate: 0.2 }, timeseries: [] }
};

const BASE_DASHBOARD: DashboardOverviewResponse = {
  ok: true,
  timestamp: "2026-07-16T15:00:00.000Z",
  range: BASE_RANGE,
  headerMetrics: [],
  executiveCommand: {
    weeklyDirective: "",
    topPriorities: [],
    biggestBottlenecks: [],
    ceoRecommendation: ""
  },
  warRoom: { mode: "normal", reason: null, lastUpdated: null, entries: [] },
  revenueEngine: { metrics: [], moneyLeaks: [], fastestPathToIncreaseRevenue: [], isDiagnosticEmpty: true },
  brandPower: { metrics: [], whatIsWorking: [], whatToDoNext: [] },
  opportunityRadar: { activeCount: 0, readyForOutreachCount: 0, topOpportunities: [], nextFiveMoves: [] },
  pipelinePanel: {
    collectors: [],
    deals: [
      {
        id: "deal-1",
        name: "Collector",
        organization: "Org",
      opportunityType: "Partnership",
      status: "pending",
      ownerAgent: "Pipeline",
      verificationStatus: "verified_active",
      valueEstimate: 50000,
      prestigeScore: null,
      probabilityScore: null,
      confidence: 0.9,
      nextStep: "Call",
      nextStepDueAt: "2026-07-15T12:00:00.000Z",
      lastVerifiedAt: "2026-07-15T12:00:00.000Z"
    }
  ],
    verificationSummary: {
      total: 10,
      verifiedActive: 8,
      onHold: 0,
      complete: 2,
      declined: 0,
      invalid: 0,
      stale: 0,
      unverified: 2
    }
  },
  survivalStrip: {
    configured: false,
    cashOnHand: null,
    survivalFloor: 0,
    monthlyBurn: null,
    projected30dRevenue: null,
    runwayDays: null
  },
  tasks: [],
  proofOfWork: [],
  schedulerJobs: [],
  schedulerSummary: {
    status: "LIVE",
    cronEnabled: true,
    jobCount: 3,
    failingCount: 0,
    missingTelemetryCount: 0,
    lastUpdatedAt: "2026-07-16T14:50:00.000Z"
  },
  agentSla: [],
  approvalBottlenecks: { pendingCount: 0, oldestPendingHours: null, tasks: [] },
  actionQueue: {
    needsApprovalTasks: { label: "Task approvals", count: 0, items: [] },
    pendingPlans: { label: "Plans", count: 0, items: [] },
    decisionsDue: { label: "Decisions", count: 0, items: [] },
    invoicesToSend: { label: "Invoices", count: 0, items: [] }
  },
  systemHealth: { dataFreshnessHours: 1, agentTaskCompletionRate: null, agents: [] },
  agentUpdateFeed: [],
  commerceTelemetry: BASE_COMMERCE_TELEMETRY,
  websiteConversion: {
    generatedAt: "2026-07-16T12:00:00.000Z",
    wooCommerce: {
      netRevenue: 50000,
      paidOrdersInWindow: 150,
      topProducts: [],
      recentOrders: []
    },
    ga4: {
      summary: {
        revenue: 52000,
        sessions: 2000,
        engagedSessions: 1500,
        eventCount: 0,
        avgEngagementSeconds: 0
      }
    }
  } as DashboardOverviewResponse["websiteConversion"],
  metaAds: {
    generatedAt: "2026-07-15T11:00:00.000Z",
    accountId: "abc",
    range: 7,
    campaigns: [],
    summary: { spend: 1000, impressions: 100000, clicks: 2000, purchases: 150, purchaseValue: 50000, roas: 5 },
    status: "LIVE"
  },
  executiveSummary: null,
  industryPulseSnapshot: {
    generatedAt: "2026-07-15T10:00:00.000Z",
    sources: [{ name: "Feed", url: "https://example.com", category: "sports" }],
    alerts: [
      {
        title: "Partnership",
        category: "sports",
        source: "Feed",
        sourceUrl: "https://example.com/a",
        date: "2026-07-15",
        summary: "Summary",
        whyItMatters: "Opportunity",
        opportunity: "Deal",
        recommendedAction: "Reach out",
        urgency: "high",
        confidence: "high",
        related: [],
        status: "open"
      }
    ]
  },
  socialIntelligence: null,
  cloudflare: null,
  collectorTelemetry: {
    status: "LIVE",
    statusLabel: "Live",
    statusDetail: "",
    freshnessCopy: "Fresh",
    totals: { totalRecords: 120, wooRecords: 40, manualRecords: 80, estimatedValueUsd: 250000 },
    wooSliceValueUsd: 120000,
    tiers: {},
    priorities: {},
    relationships: {},
    lastTouch: { newest: "2026-07-15T09:00:00.000Z", oldest: "2026-07-10T09:00:00.000Z", freshnessDays: 1, freshnessDaysRounded: 1 },
    lastImportedAt: "2026-07-15T09:00:00.000Z",
    sourceNote: "CRM"
  },
  executiveInsights: {
    brief: {
      pacificWindow: { startDate: "2026-07-09", endDate: "2026-07-15", includesPartialDay: false },
      warnings: [],
      topChanges: [],
      sourceFreshness: [],
      attention: null
    },
    trends: []
  },
  telemetryMetadata: {
    woo: baseMetadata("woo"),
    ga4: baseMetadata("ga4"),
    funnelkit: baseMetadata("funnelkit"),
    meta: baseMetadata("meta")
  } satisfies Partial<Record<TelemetrySource, TelemetryMetadata>>,
  telemetryHealth: {
    woo: healthySource("woo"),
    ga4: healthySource("ga4"),
    funnelkit: healthySource("funnelkit"),
    meta: healthySource("meta")
  } satisfies Partial<Record<TelemetrySource, TelemetryHealth>>,
  dataSourceAccess: [],
  topActions: [],
  blockedItems: [],
  agentKpis: [],
  ideaBoard: { columns: {}, linkedTasks: {}, recentComments: [] },
  ceoQuestionDesk: { openQuestions: [], escalations: [], recentComments: [] },
};

function baseMetadata(source: TelemetrySource): TelemetryMetadata {
  return {
    source,
    requestedStartDate: BASE_RANGE.startDate,
    requestedEndDate: BASE_RANGE.endDate,
    timezone: "America/Los_Angeles",
    generatedAt: "2026-07-16T12:00:00.000Z",
    freshnessStatus: "fresh",
    coverageStatus: "complete",
    includesPartialDay: false,
    includesFutureDates: false,
    warningCodes: []
  };
}

function healthySource(source: TelemetrySource): TelemetryHealth {
  return { source, status: "healthy", reasons: [], warningCodes: [] };
}

function cloneDashboard(overrides: Partial<DashboardOverviewResponse> = {}): DashboardOverviewResponse {
  return {
    ...structuredClone(BASE_DASHBOARD),
    ...overrides,
    telemetryMetadata: { ...(structuredClone(BASE_DASHBOARD.telemetryMetadata) ?? {}), ...(overrides.telemetryMetadata ?? {}) },
    telemetryHealth: { ...(structuredClone(BASE_DASHBOARD.telemetryHealth) ?? {}), ...(overrides.telemetryHealth ?? {}) },
    websiteConversion: overrides.websiteConversion ?? structuredClone(BASE_DASHBOARD.websiteConversion),
    commerceTelemetry: (overrides.commerceTelemetry ?? structuredClone(BASE_COMMERCE_TELEMETRY)) as CommerceTelemetry,
    metaAds: overrides.metaAds ?? structuredClone(BASE_DASHBOARD.metaAds),
    pipelinePanel: overrides.pipelinePanel ?? structuredClone(BASE_DASHBOARD.pipelinePanel),
    collectorTelemetry: overrides.collectorTelemetry ?? structuredClone(BASE_DASHBOARD.collectorTelemetry),
    executiveInsights: overrides.executiveInsights ?? structuredClone(BASE_DASHBOARD.executiveInsights),
    schedulerSummary: overrides.schedulerSummary ?? structuredClone(BASE_DASHBOARD.schedulerSummary)
  } as DashboardOverviewResponse;
}

function cloneCommerceTelemetry(): CommerceTelemetry {
  return structuredClone(BASE_COMMERCE_TELEMETRY);
}

function cloneExecutiveInsights() {
  return structuredClone(BASE_DASHBOARD.executiveInsights);
}

function clonePipelinePanel() {
  return structuredClone(BASE_DASHBOARD.pipelinePanel);
}

function cloneCollectorTelemetry() {
  return structuredClone(BASE_DASHBOARD.collectorTelemetry);
}

function getDomainState(summary: ReturnType<typeof buildDataConfidenceModel>, domain: string) {
  return summary.entries.find((entry) => entry.id === domain)?.state;
}

test("woo source trusted by default", () => {
  const summary = buildDataConfidenceModel(cloneDashboard());
  assert.equal(getDomainState(summary, "woo"), "trusted");
});

test("stale woo data lowers trust", () => {
  const dashboard = cloneDashboard({
    telemetryMetadata: {
      woo: { ...baseMetadata("woo"), generatedAt: "2026-07-10T00:00:00.000Z" }
    }
  });
  const summary = buildDataConfidenceModel(dashboard);
  assert.equal(getDomainState(summary, "woo"), "stale");
});

test("unavailable ga4 when data missing", () => {
  const commerceTelemetry = cloneCommerceTelemetry();
  commerceTelemetry.ga4 = undefined;
  const dashboard = cloneDashboard({ commerceTelemetry });
  if (dashboard.telemetryMetadata) {
    delete dashboard.telemetryMetadata.ga4;
  }
  if (dashboard.websiteConversion) {
    delete dashboard.websiteConversion.ga4;
  }
  const summary = buildDataConfidenceModel(dashboard);
  assert.equal(getDomainState(summary, "ga4"), "unavailable");
});

test("partial day flag surfaces once", () => {
  const baseInsights = cloneExecutiveInsights();
  const dashboard = cloneDashboard({
    executiveInsights: {
      brief: {
        ...baseInsights!.brief!,
        pacificWindow: { ...baseInsights!.brief!.pacificWindow, includesPartialDay: true }
      },
      trends: []
    }
  });
  const summary = buildDataConfidenceModel(dashboard);
  assert.equal(summary.partialDay, true);
  assert.equal(summary.caveatSources.includes("Woo"), false);
});

test("conflicting woo vs ga4 marks both", () => {
  const commerceTelemetry = cloneCommerceTelemetry();
  commerceTelemetry.ga4 = { summary: { revenue: 100000, sessions: 2000, engagedSessions: 1500, eventCount: 0, avgEngagementSeconds: 0 }, timeseries: [] };
  const dashboard = cloneDashboard({ commerceTelemetry });
  const summary = buildDataConfidenceModel(dashboard);
  assert.equal(getDomainState(summary, "woo"), "conflicting");
  assert.equal(getDomainState(summary, "ga4"), "conflicting");
});

test("range mismatch downgrades confidence", () => {
  const dashboard = cloneDashboard({
    telemetryMetadata: {
      woo: { ...baseMetadata("woo"), requestedStartDate: "2026-07-01" }
    }
  });
  const summary = buildDataConfidenceModel(dashboard);
  assert.equal(getDomainState(summary, "woo"), "usable_with_caveats");
});

test("pipeline insufficiency blocks actions", () => {
  const dashboard = cloneDashboard({
    pipelinePanel: {
      ...clonePipelinePanel()!,
      verificationSummary: { total: 10, verifiedActive: 1, onHold: 0, complete: 0, declined: 0, invalid: 0, stale: 0, unverified: 9 }
    }
  });
  const summary = buildDataConfidenceModel(dashboard);
  const actions = buildExecutiveActions(dashboard, 10, summary);
  assert.ok(actions.every((action) => action.sourceDomain !== "pipeline"));
});

test("customer partial history lowers state", () => {
  const dashboard = cloneDashboard({ collectorTelemetry: { ...cloneCollectorTelemetry()!, status: "PARTIAL" } });
  const summary = buildDataConfidenceModel(dashboard);
  assert.equal(getDomainState(summary, "customer"), "usable_with_caveats");
});

test("drivers suppressed when source unavailable", () => {
  const commerceTelemetry = cloneCommerceTelemetry();
  commerceTelemetry.ga4 = undefined;
  const dashboard = cloneDashboard({ commerceTelemetry });
  if (dashboard.telemetryMetadata) {
    delete dashboard.telemetryMetadata.ga4;
  }
  const summary = buildDataConfidenceModel(dashboard);
  const drivers = buildExecutiveDrivers([
    {
      id: "trend1",
      source: "ga4",
      metric: "Sessions",
      label: "Sessions",
      currentValue: 1000,
      previousValue: 1200,
      absoluteChange: -200,
      percentChange: -20,
      direction: "down",
      magnitude: "major",
      anomaly: false
    }
  ], 3, summary);
  assert.equal(drivers.length, 0);
});

test("missing diagnostics treated as insufficient evidence", () => {
  const dashboard = cloneDashboard();
  dashboard.schedulerSummary = undefined;
  dashboard.schedulerJobs = [];
  const summary = buildDataConfidenceModel(dashboard);
  assert.equal(getDomainState(summary, "operations"), "insufficient_evidence");
  assert.equal(summary.overall.label, "Moderate confidence");
});
