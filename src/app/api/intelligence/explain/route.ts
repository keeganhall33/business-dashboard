import { ok, serverError, badRequest } from "@/lib/api/responses";
import { enforceDashboardAuth } from "@/lib/auth/dashboard";
import { resolveRange } from "@/lib/date/resolve-range";
import { computePreviousInclusiveDateRange } from "@/lib/dashboard/performance-baseline";
import { getCommerceTelemetry, getDashboardSnapshots } from "@/lib/supabase/queries";
import { explainRevenueChange } from "@/lib/intelligence/explanation-engine";
import type { DashboardOverviewResponse } from "@/lib/types/dashboard";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authResponse = enforceDashboardAuth(request);
  if (authResponse) return authResponse;

  try {
    const url = new URL(request.url);
    const metric = (url.searchParams.get("metric") ?? "revenue").toLowerCase();
    const range = resolveRange(url.searchParams.get("range"), url.searchParams.get("start"), url.searchParams.get("end"));
    const comparisonOverride =
      url.searchParams.get("compareStart") && url.searchParams.get("compareEnd")
        ? { startDate: String(url.searchParams.get("compareStart")), endDate: String(url.searchParams.get("compareEnd")) }
        : null;
    const comparisonRange =
      comparisonOverride ??
      computePreviousInclusiveDateRange({ startDate: range.startDate, endDate: range.endDate });

    if (!comparisonRange) {
      return badRequest("Comparison range invalid");
    }

    const [currentTelemetry, prevTelemetry, snapshots] = await Promise.all([
      getCommerceTelemetry({ startDate: range.startDate, endDate: range.endDate }),
      getCommerceTelemetry({ startDate: comparisonRange.startDate, endDate: comparisonRange.endDate }),
      getDashboardSnapshots(["meta"]) // best-effort; meta snapshot may be global
    ]);

    const metaSnapshot = (snapshots as Array<{ key: string; payload: unknown }>).find((s) => s.key === "meta")?.payload ?? null;

    const current: DashboardOverviewResponse = {
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
      commerceTelemetry: {
        range,
        woo: currentTelemetry.woo ?? undefined,
        ga4: currentTelemetry.ga4 ?? undefined,
        funnel: currentTelemetry.funnel ?? undefined
      },
      metaAds: metaSnapshot as unknown as DashboardOverviewResponse["metaAds"],
      agentKpis: [],
      ideaBoard: { columns: { proposed: [], in_review: [], approved: [], rejected: [], in_progress: [], shipped: [], archived: [] }, linkedTasks: {}, recentComments: [] },
      ceoQuestionDesk: { openQuestions: [], escalations: [], recentComments: [] }
    };

    const previous: DashboardOverviewResponse = {
      ...current,
      range: { preset: "custom", startDate: comparisonRange.startDate, endDate: comparisonRange.endDate },
      commerceTelemetry: {
        range: { preset: "custom", startDate: comparisonRange.startDate, endDate: comparisonRange.endDate },
        woo: prevTelemetry.woo ?? undefined,
        ga4: prevTelemetry.ga4 ?? undefined,
        funnel: prevTelemetry.funnel ?? undefined
      }
    };

    if (metric !== "revenue") {
      // For now the vertical slice ships revenue-focused explanations.
      // Other metrics can be added iteratively.
    }

    const payload = explainRevenueChange({
      metric,
      currentRange: { startDate: range.startDate, endDate: range.endDate },
      comparisonRange,
      current,
      previous
    });

    return ok(payload);
  } catch (error) {
    return serverError("Failed to build explanation", { message: error instanceof Error ? error.message : String(error) });
  }
}
