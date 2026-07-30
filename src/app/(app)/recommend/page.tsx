import { ExecutiveRangeHeader } from "@/components/dashboard/ExecutiveRangeHeader";
import { getDashboardOverview } from "@/lib/api/dashboard";
import { sanitizeDashboardPayloadForHtml } from "@/lib/dashboard/sanitize-html";
import { resolveRangeQuery } from "../_lib/resolve-range";
import { RecommendVerticalSlice } from "@/components/vertical-slice/RecommendVerticalSlice";

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

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-white">Recommend</h1>
        <p className="text-sm text-zinc-400">Read-only prioritized next steps. Nothing is executed from here.</p>
      </header>
      <ExecutiveRangeHeader range={sanitized.range} insights={sanitized.executiveInsights} dataMode={sanitized.dataMode} />
      <RecommendVerticalSlice data={sanitized} />
    </div>
  );
}
