import { ExecutiveRangeHeader } from "@/components/dashboard/ExecutiveRangeHeader";
import { getDashboardOverview } from "@/lib/api/dashboard";
import { sanitizeDashboardPayloadForHtml } from "@/lib/dashboard/sanitize-html";
import { resolveRangeQuery } from "../_lib/resolve-range";
import { ExplainVerticalSlice } from "@/components/vertical-slice/ExplainVerticalSlice";
import { computePreviousInclusiveDateRange } from "@/lib/dashboard/performance-baseline";
import { getCommerceTelemetry, getDashboardSnapshots } from "@/lib/supabase/queries";
import { explainRevenueChange } from "@/lib/intelligence/explanation-engine";
import type { ExplainResponse } from "@/lib/intelligence/explanation-contract";
import type { DashboardOverviewResponse, RangePreset } from "@/lib/types/dashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ExplainPage({ searchParams }: PageProps) {
  const { preset, start, end } = await resolveRangeQuery(searchParams);
  const overview = await getDashboardOverview({ preset, startDate: start, endDate: end });
  const sanitized = sanitizeDashboardPayloadForHtml(overview);

  const comparison = computePreviousInclusiveDateRange({ startDate: sanitized.range.startDate, endDate: sanitized.range.endDate });
  let explanation: ExplainResponse | null = null;
  if (comparison) {
    try {
      const [currentTelemetry, prevTelemetry, snapshots] = await Promise.all([
        getCommerceTelemetry({ startDate: sanitized.range.startDate, endDate: sanitized.range.endDate }),
        getCommerceTelemetry({ startDate: comparison.startDate, endDate: comparison.endDate }),
        getDashboardSnapshots(["meta"]).catch(() => [])
      ]);
      const metaSnapshot = (snapshots as Array<{ key: string; payload: unknown }>).find((s) => s.key === "meta")?.payload ?? null;

      // Create minimal OverviewResponse shells for the explanation engine.
      const currentShell = {
        ...sanitized,
        commerceTelemetry: {
          range: sanitized.range,
          woo: currentTelemetry.woo ?? undefined,
          ga4: currentTelemetry.ga4 ?? undefined,
          funnel: currentTelemetry.funnel ?? undefined
        },
        metaAds: metaSnapshot as typeof sanitized.metaAds
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

      explanation = explainRevenueChange({
        metric: "revenue",
        currentRange: { startDate: sanitized.range.startDate, endDate: sanitized.range.endDate },
        comparisonRange: comparison,
        current: currentShell,
        previous: prevShell
      });
    } catch {
      explanation = null;
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-white">Explain</h1>
        <p className="text-sm text-zinc-400">Read-only explanations with visible evidence and uncertainty.</p>
      </header>
      <ExecutiveRangeHeader range={sanitized.range} insights={sanitized.executiveInsights} dataMode={sanitized.dataMode} />
      <ExplainVerticalSlice data={sanitized} explanation={explanation} />
    </div>
  );
}
