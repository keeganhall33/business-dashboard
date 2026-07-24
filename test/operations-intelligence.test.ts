import test from "node:test";
import assert from "node:assert/strict";

import { buildOperationsIntel } from "../src/lib/operations-intelligence.ts";
import type { DashboardOverviewResponse, ActionQueue, SchedulerJobHealth, ProofOfWorkEntry } from "../src/lib/types/dashboard";

const BASE_RANGE = { preset: "7d", startDate: "2026-07-01", endDate: "2026-07-07" } as const;

const BASE_ACTION_QUEUE: ActionQueue = {
  needsApprovalTasks: { label: "Task approvals", count: 0, items: [] },
  pendingPlans: { label: "Plans", count: 0, items: [] },
  decisionsDue: { label: "Decisions", count: 0, items: [] },
  invoicesToSend: { label: "Invoices", count: 0, items: [] }
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
    deals: [],
    verificationSummary: {
      total: 0,
      verifiedActive: 0,
      onHold: 0,
      complete: 0,
      declined: 0,
      invalid: 0,
      stale: 0,
      unverified: 0
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
    status: "PARTIAL",
    cronEnabled: true,
    jobCount: 0,
    failingCount: 0,
    missingTelemetryCount: 0,
    lastUpdatedAt: "2026-07-16T14:59:00.000Z"
  },
  agentSla: [],
  approvalBottlenecks: { pendingCount: 0, oldestPendingHours: null, tasks: [] },
  actionQueue: BASE_ACTION_QUEUE,
  systemHealth: { dataFreshnessHours: null, agentTaskCompletionRate: null, agents: [] },
  agentUpdateFeed: [],
  commerceTelemetry: { range: BASE_RANGE },
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

test("marks failing automation as broken and surfaces a repair action", () => {
  const failingJob: SchedulerJobHealth = {
    jobKey: "proof-enforcement",
    jobName: "Proof enforcement",
    cronExpression: "0 * * * *",
    routePath: "/api/scheduler/proof-enforcement",
    timezone: "America/Los_Angeles",
    isActive: true,
    lastRunAt: "2026-07-16T14:30:00.000Z",
    lastStatus: "failed",
    lastDurationSeconds: 12,
    lastSummary: "",
    lastError: "missing supabase credentials",
    nextRunAt: "2026-07-16T15:30:00.000Z",
    source: "supabase"
  };

  const dashboard = withDashboard({
    schedulerJobs: [failingJob],
    schedulerSummary: {
      status: "BROKEN",
      cronEnabled: true,
      jobCount: 1,
      failingCount: 1,
      missingTelemetryCount: 0,
      lastUpdatedAt: "2026-07-16T14:59:00.000Z"
    }
  });

  const intel = buildOperationsIntel(dashboard);
  const repairAction = intel.actions.find((action) => action.title.includes("Proof"));
  assert.ok(repairAction, "repair action missing");
  assert.equal(repairAction?.urgency, "today");
  assert.ok(intel.incidents.some((incident) => incident.id === "scheduler"));
});

test("suppresses unsupported agents from automation audit", () => {
  const dashboard = withDashboard({
    agentStatusPanel: [],
    agentUpdateFeed: []
  });

  const intel = buildOperationsIntel(dashboard);
  assert.ok(
    !intel.automationAudits.some((audit) => audit.id === "noah"),
    "Noah should be hidden when no outputs exist"
  );
});

test("filters action queue items without execution detail", () => {
  const dashboard = withDashboard({
    actionQueue: {
      ...BASE_ACTION_QUEUE,
      needsApprovalTasks: {
        label: "Task approvals",
        count: 2,
        items: [
          { id: "a", itemType: "task", title: "Approve A", summary: "Tighten drop plan", createdAt: "2026-07-16T12:00:00.000Z", dueAt: null, actor: "noah" },
          { id: "ignored", itemType: "task", title: "Missing", summary: null, createdAt: null, dueAt: null, actor: "noah" }
        ]
      }
    }
  });

  const intel = buildOperationsIntel(dashboard);
  assert.equal(intel.humanIntervention.length, 1);
  assert.equal(intel.humanIntervention[0]?.title, "Approve A");
});

test("reports latest deliverables", () => {
  const deliverables: ProofOfWorkEntry[] = [
    {
      taskId: "t1",
      taskTitle: "Ship collector update",
      agentKey: "lyra",
      completedAt: "2026-07-16T10:00:00.000Z",
      summary: "Collector briefing published.",
      deliverableLinks: []
    }
  ];

  const dashboard = withDashboard({ proofOfWork: deliverables });
  const intel = buildOperationsIntel(dashboard);
  assert.equal(intel.deliverables[0]?.title, "Ship collector update");
});

function withDashboard(overrides: Partial<DashboardOverviewResponse>): DashboardOverviewResponse {
  const clone = structuredClone(BASE_DASHBOARD);
  return {
    ...clone,
    ...overrides,
    range: { ...clone.range, ...(overrides.range ?? {}) },
    executiveCommand: { ...clone.executiveCommand, ...(overrides.executiveCommand ?? {}) },
    warRoom: { ...clone.warRoom, ...(overrides.warRoom ?? {}) },
    actionQueue: overrides.actionQueue ?? clone.actionQueue,
    schedulerSummary: overrides.schedulerSummary ?? clone.schedulerSummary,
    schedulerJobs: overrides.schedulerJobs ?? clone.schedulerJobs,
    proofOfWork: overrides.proofOfWork ?? clone.proofOfWork,
    agentStatusPanel: overrides.agentStatusPanel ?? clone.agentStatusPanel,
    agentUpdateFeed: overrides.agentUpdateFeed ?? clone.agentUpdateFeed
  };
}
