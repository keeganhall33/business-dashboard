import { ExecutiveRangeHeader } from "@/components/dashboard/ExecutiveRangeHeader";
import { getDashboardOverview } from "@/lib/api/dashboard";
import { sanitizeDashboardPayloadForHtml } from "@/lib/dashboard/sanitize-html";
import { resolveRangeQuery } from "../_lib/resolve-range";
import { ActVerticalSlice } from "@/components/vertical-slice/ActVerticalSlice";
import { computePreviousInclusiveDateRange } from "@/lib/dashboard/performance-baseline";
import { getCommerceTelemetry } from "@/lib/supabase/queries";
import { explainRevenueChange } from "@/lib/intelligence/explanation-engine";
import { buildRecommendationsFromExplanation } from "@/lib/intelligence/recommendation-engine";
import { listActions } from "@/lib/actions/action-store";
import { ActionCenterClient } from "@/components/actions/ActionCenterClient";
import type { Recommendation } from "@/lib/intelligence/recommendation-contract";
import type { DashboardOverviewResponse, RangePreset } from "@/lib/types/dashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ActPage({ searchParams }: PageProps) {
  const { preset, start, end } = await resolveRangeQuery(searchParams);
  const overview = await getDashboardOverview({ preset, startDate: start, endDate: end });
  const sanitized = sanitizeDashboardPayloadForHtml(overview);

  const comparison = computePreviousInclusiveDateRange({ startDate: sanitized.range.startDate, endDate: sanitized.range.endDate });
  const missingSources = ["email", "matchback"]; // explicit until connected
  let recommendations: Recommendation[] = [];
  if (comparison) {
    try {
      const [currentTelemetry, prevTelemetry] = await Promise.all([
        getCommerceTelemetry({ startDate: sanitized.range.startDate, endDate: sanitized.range.endDate }),
        getCommerceTelemetry({ startDate: comparison.startDate, endDate: comparison.endDate })
      ]);
      const currentShell = {
        ...sanitized,
        commerceTelemetry: { range: sanitized.range, woo: currentTelemetry.woo ?? undefined, ga4: currentTelemetry.ga4 ?? undefined, funnel: currentTelemetry.funnel ?? undefined }
      } satisfies DashboardOverviewResponse;
      const prevShell = {
        ...sanitized,
        range: { preset: "custom" as RangePreset, startDate: comparison.startDate, endDate: comparison.endDate },
        commerceTelemetry: { range: { preset: "custom" as RangePreset, startDate: comparison.startDate, endDate: comparison.endDate }, woo: prevTelemetry.woo ?? undefined, ga4: prevTelemetry.ga4 ?? undefined, funnel: prevTelemetry.funnel ?? undefined }
      } satisfies DashboardOverviewResponse;
      const explanation = explainRevenueChange({
        metric: "revenue",
        currentRange: { startDate: sanitized.range.startDate, endDate: sanitized.range.endDate },
        comparisonRange: comparison,
        current: currentShell,
        previous: prevShell
      });
      recommendations = buildRecommendationsFromExplanation({ explanation, missingSources }).recommendations;
    } catch {
      recommendations = [];
    }
  }

  let actions = [] as Awaited<ReturnType<typeof listActions>>;
  try {
    actions = await listActions();
  } catch {
    actions = [];
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-white">Act</h1>
        <p className="text-sm text-zinc-400">Action prep + approvals (execution disabled for this milestone).</p>
      </header>
      <ExecutiveRangeHeader range={sanitized.range} insights={sanitized.executiveInsights} dataMode={sanitized.dataMode} />

      <ActionCenterClient window={{ startDate: sanitized.range.startDate, endDate: sanitized.range.endDate }} recommendations={recommendations} actions={actions} />

      <ActVerticalSlice data={sanitized} />
    </div>
  );
}
