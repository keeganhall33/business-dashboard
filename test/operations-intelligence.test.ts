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
  const audit = intel.automationAudits.find((entry) => entry.id === "noah");
  assert.ok(audit, "Noah audit should exist for diagnostics");
  assert.equal(audit?.shouldDisplay, false, "Noah should not be surfaced on the executive panel when no outputs exist");
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

test("classifies overdue workflow as stale instead of low value", () => {
  const originalNow = Date.now;
  Date.now = () => Date.parse("2026-07-16T15:00:00.000Z");
  const staleJob: SchedulerJobHealth = {
    jobKey: "proof-enforcement",
    jobName: "Proof enforcement",
    cronExpression: "0 * * * *",
    routePath: "/api/scheduler/proof-enforcement",
    timezone: "America/Los_Angeles",
    isActive: true,
    lastRunAt: "2026-07-12T00:00:00.000Z",
    lastStatus: "completed",
    lastDurationSeconds: 12,
    lastSummary: "ok",
    lastError: null,
    nextRunAt: "2026-07-13T00:00:00.000Z",
    source: "supabase"
  };

  const dashboard = withDashboard({ schedulerJobs: [staleJob] });
  const intel = buildOperationsIntel(dashboard);
  Date.now = originalNow;
  const audit = intel.automationAudits.find((entry) => entry.id === "proof-enforcement");
  assert.equal(audit?.classification, "stale");
  assert.ok(intel.staleWorkflows.some((workflow) => workflow.id === "proof-enforcement"));
});

test("recent run without evidence is low value", () => {
  const originalNow = Date.now;
  Date.now = () => Date.parse("2026-07-16T15:00:00.000Z");
  const lowValueJob: SchedulerJobHealth = {
    jobKey: "deliverable-harvest",
    jobName: "Deliverable harvest",
    cronExpression: "0 * * * *",
    routePath: "/api/scheduler/deliverable-harvest",
    timezone: "America/Los_Angeles",
    isActive: true,
    lastRunAt: "2026-07-16T11:00:00.000Z",
    lastStatus: "completed",
    lastDurationSeconds: 5,
    lastSummary: "",
    lastError: null,
    nextRunAt: "2026-07-16T12:00:00.000Z",
    source: "supabase"
  };
  const dashboard = withDashboard({ schedulerJobs: [lowValueJob] });
  const intel = buildOperationsIntel(dashboard);
  Date.now = originalNow;
  const audit = intel.automationAudits.find((entry) => entry.id === "deliverable-harvest");
  assert.equal(audit?.classification, "low_value");
  assert.ok(intel.staleWorkflows.length === 0);
});

test("missing diagnostics yields telemetry unknown state", () => {
  const dashboard = withDashboard({ schedulerJobs: [], schedulerSummary: undefined });
  const intel = buildOperationsIntel(dashboard);
  assert.equal(intel.telemetryStatus, "unknown");
  assert.ok(intel.actions.some((action) => action.id === "verify-telemetry"));
  assert.ok(!intel.actions.some((action) => action.id === "scheduler-action"));
  assert.equal(intel.overall.label, "Operations visibility unknown");
});

test("affirmed scheduler failure still reports broken", () => {
  const dashboard = withDashboard({
    schedulerSummary: {
      status: "BROKEN",
      cronEnabled: false,
      jobCount: 5,
      failingCount: 2,
      missingTelemetryCount: 0,
      lastUpdatedAt: "2026-07-16T14:59:00.000Z"
    },
    schedulerJobs: [
      {
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
      }
    ]
  });
  const intel = buildOperationsIntel(dashboard);
  assert.equal(intel.telemetryStatus, "healthy");
  assert.ok(intel.actions.some((action) => action.id === "scheduler-action"));
});

test("war room hides when entries lack directives", () => {
  const dashboard = withDashboard({ warRoom: { mode: "war_room", reason: "incident", lastUpdated: "2026-07-15T10:00:00.000Z", entries: [] } });
  const intel = buildOperationsIntel(dashboard);
  assert.ok(!intel.incidents.some((incident) => incident.id === "war-room"));
});

test("war room surfaces only when directive present", () => {
  const dashboard = withDashboard({
    warRoom: {
      mode: "war_room",
      reason: "Major outage",
      lastUpdated: "2026-07-16T10:00:00.000Z",
      entries: [
        {
          id: "entry-1",
          title: "Mitigation",
          summary: "Switch to backup cluster",
          detailMd: "Directive: fail over",
          createdAt: "2026-07-16T09:45:00.000Z"
        }
      ]
    }
  });
  const intel = buildOperationsIntel(dashboard);
  assert.ok(intel.incidents.some((incident) => incident.id === "war-room"));
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
