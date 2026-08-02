import { ok, serverError } from "@/lib/api/responses";
import { enforceDashboardAuth } from "@/lib/auth/dashboard";
import { resolveRange } from "@/lib/date/resolve-range";
import { computePreviousInclusiveDateRange } from "@/lib/dashboard/performance-baseline";
import { getCommerceTelemetry } from "@/lib/supabase/queries";
import { explainRevenueChange } from "@/lib/intelligence/explanation-engine";
import { detectOpportunities } from "@/lib/intelligence/opportunity-detection";
import type { OpportunitiesResponse } from "@/lib/intelligence/recommendation-contract";
import type { DashboardOverviewResponse, RangePreset } from "@/lib/types/dashboard";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authResponse = enforceDashboardAuth(request);
  if (authResponse) return authResponse;

  try {
    const url = new URL(request.url);
    const metric = (url.searchParams.get("metric") ?? "revenue").toLowerCase();
    const range = resolveRange(url.searchParams.get("range"), url.searchParams.get("start"), url.searchParams.get("end"));
    const comparisonRange = computePreviousInclusiveDateRange({ startDate: range.startDate, endDate: range.endDate });

    const missingSources = ["email", "matchback"]; // explicit known missing until connected.

    if (!comparisonRange) {
      const payload: OpportunitiesResponse = {
        ok: true,
        generatedAt: new Date().toISOString(),
        dataMode: "LIVE_DATA",
        window: { startDate: range.startDate, endDate: range.endDate },
        opportunities: [],
        warnings: ["Invalid comparison range"]
      };
      return ok(payload);
    }

    const [currentTelemetry, prevTelemetry] = await Promise.all([
      getCommerceTelemetry({ startDate: range.startDate, endDate: range.endDate }),
      getCommerceTelemetry({ startDate: comparisonRange.startDate, endDate: comparisonRange.endDate })
    ]);

    // Minimal shells for explanation input.
    const current = {
      ok: true,
      timestamp: new Date().toISOString(),
      dataMode: "LIVE_DATA",
      range,
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
      commerceTelemetry: { range, woo: currentTelemetry.woo ?? undefined, ga4: currentTelemetry.ga4 ?? undefined, funnel: currentTelemetry.funnel ?? undefined },
      agentKpis: [],
      ideaBoard: { columns: { proposed: [], in_review: [], approved: [], rejected: [], in_progress: [], shipped: [], archived: [] }, linkedTasks: {}, recentComments: [] },
      ceoQuestionDesk: { openQuestions: [], escalations: [], recentComments: [] }
    } satisfies DashboardOverviewResponse;

    const prev = {
      ...current,
      range: { preset: "custom" as RangePreset, startDate: comparisonRange.startDate, endDate: comparisonRange.endDate },
      commerceTelemetry: {
        range: { preset: "custom" as RangePreset, startDate: comparisonRange.startDate, endDate: comparisonRange.endDate },
        woo: prevTelemetry.woo ?? undefined,
        ga4: prevTelemetry.ga4 ?? undefined,
        funnel: prevTelemetry.funnel ?? undefined
      }
    } satisfies DashboardOverviewResponse;

    const explanation = explainRevenueChange({
      metric,
      currentRange: { startDate: range.startDate, endDate: range.endDate },
      comparisonRange,
      current,
      previous: prev
    });

    const opportunities = detectOpportunities({ explanation: explanation.explanation, missingSources });

    const payload: OpportunitiesResponse = {
      ok: true,
      generatedAt: new Date().toISOString(),
      dataMode: explanation.dataMode,
      window: { startDate: range.startDate, endDate: range.endDate },
      opportunities,
      warnings: []
    };

    return ok(payload);
  } catch (error) {
    return serverError("Failed to detect opportunities", { message: error instanceof Error ? error.message : String(error) });
  }
}
