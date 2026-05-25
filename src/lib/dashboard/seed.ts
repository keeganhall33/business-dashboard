import type { DashboardOverviewResponse, HeaderMetric, CollectorRelationship } from "@/lib/types/dashboard";
import { readFile } from "node:fs/promises";
import path from "node:path";

type DashboardSeedPartial = {
  timestamp?: string;
  range?: DashboardOverviewResponse["range"];
  headerMetrics?: HeaderMetric[];
  pipelinePanel?: {
    collectors?: CollectorRelationship[];
  };
};

function defaultOverviewResponse(nowIso: string): DashboardOverviewResponse {
  const today = nowIso.slice(0, 10);
  return {
    ok: true,
    timestamp: nowIso,
    range: { preset: "30d", startDate: today, endDate: today },
    headerMetrics: [],
    executiveCommand: {
      weeklyDirective: "Seed mode",
      topPriorities: [],
      biggestBottlenecks: [],
      ceoRecommendation: "Seed mode"
    },
    warRoom: { mode: "normal", reason: null, lastUpdated: null, entries: [] },
    revenueEngine: { metrics: [], moneyLeaks: [], fastestPathToIncreaseRevenue: [] },
    brandPower: { metrics: [], whatIsWorking: [], whatToDoNext: [] },
    opportunityRadar: { activeCount: 0, readyForOutreachCount: 0, topOpportunities: [], nextFiveMoves: [] },
    pipelinePanel: { collectors: [], deals: [] },
    survivalStrip: {
      configured: false,
      cashOnHand: null,
      survivalFloor: 7000,
      monthlyBurn: null,
      projected30dRevenue: null,
      runwayDays: null
    },
    tasks: [],
    schedulerJobs: [],
    agentSla: [],
    approvalBottlenecks: { pendingCount: 0, oldestPendingHours: null, tasks: [] },
    actionQueue: {
      needsApprovalTasks: { label: "Task approvals", count: 0, items: [] },
      pendingPlans: { label: "Plans awaiting review", count: 0, items: [] },
      decisionsDue: { label: "Decisions to revisit", count: 0, items: [] },
      invoicesToSend: { label: "Invoices to send", count: 0, items: [] }
    },
    systemHealth: { dataFreshnessHours: null, agentTaskCompletionRate: null, agents: [] },
    agentUpdateFeed: [],
    agentKpis: [],
    ideaBoard: { columns: {}, recentComments: [], linkedTasks: {} },
    ceoQuestionDesk: { openQuestions: [], escalations: [], recentComments: [] }
  };
}

function isFullDashboardResponse(value: unknown): value is DashboardOverviewResponse {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.ok === true && typeof v.timestamp === "string" && typeof v.range === "object";
}

export async function loadDashboardOverviewFromSeed(options?: {
  /** Absolute path or repo-relative path. Defaults to business-dashboard/data/dashboard-seed.json */
  seedPath?: string;
}): Promise<DashboardOverviewResponse> {
  const nowIso = new Date().toISOString();
  const rawSeedPath =
    options?.seedPath ??
    process.env.DASHBOARD_SEED_PATH ??
    // NOTE: this file lives under business-dashboard/data/
    path.join(process.cwd(), "data", "dashboard-seed.json");

  // Turbopack / Next.js output file tracing: keep the seed loader from accidentally
  // pulling the entire repo into the server bundle when DASHBOARD_SEED_PATH is dynamic.
  // (This module is only executed when DASHBOARD_DATA_SOURCE=seed.)
  const resolved = path.isAbsolute(rawSeedPath)
    ? rawSeedPath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), rawSeedPath);
  const file = await readFile(resolved, "utf8");

  const json = JSON.parse(file) as unknown;
  if (isFullDashboardResponse(json)) {
    return json;
  }

  // Allow a smaller “snapshot” file coming from Prefect export (headerMetrics + collectors only).
  const partial = json as DashboardSeedPartial;
  const base = defaultOverviewResponse(nowIso);
  return {
    ...base,
    timestamp: partial.timestamp ?? base.timestamp,
    range: partial.range ?? base.range,
    headerMetrics: partial.headerMetrics ?? base.headerMetrics,
    pipelinePanel: {
      ...base.pipelinePanel,
      collectors: partial.pipelinePanel?.collectors ?? base.pipelinePanel.collectors
    }
  };
}
