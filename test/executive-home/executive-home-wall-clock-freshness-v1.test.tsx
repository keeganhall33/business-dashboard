import assert from "node:assert/strict";
import test from "node:test";

import type { AgentFusionContext } from "@/lib/agents/fusion-context";
import { loadExecutiveHomeV3 } from "@/lib/executive-home/executive-home-v3-loader";
import type { DashboardOverviewResponse } from "@/lib/types/dashboard";

const OVERVIEW_AT = "2026-09-01T00:00:00.000Z";
const WALL_CLOCK_AT = "2026-10-01T00:00:00.000Z";

function dashboard(): DashboardOverviewResponse {
  return {
    ok: true,
    timestamp: OVERVIEW_AT,
    range: { preset: "7d", startDate: "2026-08-26", endDate: "2026-09-01" },
    headerMetrics: [],
    executiveCommand: { weeklyDirective: "", topPriorities: [], biggestBottlenecks: [], ceoRecommendation: "" },
    warRoom: { mode: "normal", reason: null, lastUpdated: null, entries: [] },
    revenueEngine: { metrics: [], moneyLeaks: [], fastestPathToIncreaseRevenue: [], isDiagnosticEmpty: true },
    brandPower: { metrics: [], whatIsWorking: [], whatToDoNext: [] },
    opportunityRadar: { activeCount: 0, readyForOutreachCount: 0, topOpportunities: [], nextFiveMoves: [] },
    pipelinePanel: { collectors: [], deals: [] },
    survivalStrip: { configured: false, cashOnHand: null, survivalFloor: 0, monthlyBurn: null, projected30dRevenue: null, runwayDays: null },
    tasks: [],
    proofOfWork: [],
    schedulerJobs: [],
    agentSla: [],
    approvalBottlenecks: { pendingCount: 0, oldestPendingHours: null, tasks: [] },
    actionQueue: {
      needsApprovalTasks: { label: "Approvals", count: 0, items: [] },
      pendingPlans: { label: "Plans", count: 0, items: [] },
      decisionsDue: { label: "Decisions", count: 0, items: [] },
      invoicesToSend: { label: "Invoices", count: 0, items: [] }
    },
    systemHealth: { dataFreshnessHours: null, agentTaskCompletionRate: null, agents: [] },
    agentUpdateFeed: [],
    agentKpis: [],
    ideaBoard: { columns: [], recentComments: [], linkedTasks: {} },
    ceoQuestionDesk: { openQuestions: [], escalations: [], recentComments: [] }
  } as DashboardOverviewResponse;
}

function fusion(): AgentFusionContext {
  return {
    runId: "fusion-stale",
    generatedAt: OVERVIEW_AT,
    selectedCandidateId: "candidate-stale",
    headline: "Historical recommendation",
    recommendedAction: "Do not treat this as current",
    why: "This evidence is intentionally old.",
    confidenceLevel: "HIGH",
    missingEvidence: [],
    reviewBy: null,
    isDecision: true
  };
}

test("uses the real wall clock, not the overview timestamp, for canonical freshness when now is omitted", async () => {
  let followUpNow: string | null = null;
  const result = await loadExecutiveHomeV3({
    overview: dashboard(),
    dependencies: {
      clock: () => new Date(WALL_CLOCK_AT),
      loadFusion: async () => fusion(),
      loadActions: async () => [],
      loadFollowUps: async ({ now }) => {
        followUpNow = now;
        return null;
      }
    }
  });

  assert.equal(followUpNow, WALL_CLOCK_AT);

  const fusionGlance = result.home.command_center.system_glance.find((item) => item.id === "canonical-fusion");
  assert.equal(fusionGlance?.truth_state, "STALE");
});
