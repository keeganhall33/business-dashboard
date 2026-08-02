import { ExecutiveRangeHeader } from "@/components/dashboard/ExecutiveRangeHeader";
import { getDashboardOverview } from "@/lib/api/dashboard";
import { sanitizeDashboardPayloadForHtml } from "@/lib/dashboard/sanitize-html";
import { resolveRangeQuery } from "../_lib/resolve-range";
import { RecommendVerticalSlice } from "@/components/vertical-slice/RecommendVerticalSlice";
import { computePreviousInclusiveDateRange } from "@/lib/dashboard/performance-baseline";
import { getCommerceTelemetry } from "@/lib/supabase/queries";
import { explainRevenueChange } from "@/lib/intelligence/explanation-engine";
import { detectOpportunities } from "@/lib/intelligence/opportunity-detection";
import { buildRecommendationsFromExplanation } from "@/lib/intelligence/recommendation-engine";
import type { OpportunitiesResponse, RecommendationsResponse } from "@/lib/intelligence/recommendation-contract";
import { OpportunityCenterPanel } from "@/components/vertical-slice/OpportunityCenterPanel";
import { RecommendationCenterPanel } from "@/components/vertical-slice/RecommendationCenterPanel";
import type { DashboardOverviewResponse, RangePreset } from "@/lib/types/dashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RecommendPage({ searchParams }: PageProps) {
  const { preset, start, end } = await resolveRangeQuery(searchParams);
  const overview = await getDashboardOverview({ preset, startDate: start, endDate: end });
  const sanitized = sanitizeDashboardPayloadForHtml(overview);

  // Build evidence-backed opportunities + recommendations server-side (read-only).
  const comparison = computePreviousInclusiveDateRange({ startDate: sanitized.range.startDate, endDate: sanitized.range.endDate });
  const missingSources = ["email", "matchback"]; // explicit until connected

  let opportunitiesPayload: OpportunitiesResponse | null = null;
  let recommendationsPayload: RecommendationsResponse | null = null;

  if (comparison) {
    try {
      const [currentTelemetry, prevTelemetry] = await Promise.all([
        getCommerceTelemetry({ startDate: sanitized.range.startDate, endDate: sanitized.range.endDate }),
        getCommerceTelemetry({ startDate: comparison.startDate, endDate: comparison.endDate })
      ]);

      const currentShell = {
        ...sanitized,
        commerceTelemetry: {
          range: sanitized.range,
          woo: currentTelemetry.woo ?? undefined,
          ga4: currentTelemetry.ga4 ?? undefined,
          funnel: currentTelemetry.funnel ?? undefined
        }
      } satisfies DashboardOverviewResponse;
      const prevShell = {
        ...sanitized,
        range: { preset: "custom" as RangePreset, startDate: comparison.startDate, endDate: comparison.endDate },
        commerceTelemetry: {
          range: { preset: "custom" as RangePreset, startDate: comparison.startDate, endDate: comparison.endDate },
          woo: prevTelemetry.woo ?? undefined,
          ga4: prevTelemetry.ga4 ?? undefined,
          funnel: prevTelemetry.funnel ?? undefined
        }
      } satisfies DashboardOverviewResponse;

      const explanation = explainRevenueChange({
        metric: "revenue",
        currentRange: { startDate: sanitized.range.startDate, endDate: sanitized.range.endDate },
        comparisonRange: comparison,
        current: currentShell,
        previous: prevShell
      });

      opportunitiesPayload = {
        ok: true,
        generatedAt: new Date().toISOString(),
        dataMode: explanation.dataMode,
        window: { startDate: sanitized.range.startDate, endDate: sanitized.range.endDate },
        opportunities: detectOpportunities({ explanation: explanation.explanation, missingSources }),
        warnings: []
      };

      recommendationsPayload = buildRecommendationsFromExplanation({ explanation, missingSources });
    } catch {
      opportunitiesPayload = null;
      recommendationsPayload = null;
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-white">Recommend</h1>
        <p className="text-sm text-zinc-400">Read-only prioritized next steps. Nothing is executed from here.</p>
      </header>
      <ExecutiveRangeHeader range={sanitized.range} insights={sanitized.executiveInsights} dataMode={sanitized.dataMode} />

      <OpportunityCenterPanel payload={opportunitiesPayload} />
      <RecommendationCenterPanel payload={recommendationsPayload} />

      <RecommendVerticalSlice data={sanitized} />
    </div>
  );
}
