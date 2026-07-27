import type { ExecutiveSummary } from "@/lib/dashboard/executive-summary";
import { formatPerformanceBaselineDelta, formatPerformanceBaselineValue } from "@/components/dashboard/PerformanceBaselinePanel";

export function ExecutiveKpiPanel({ summary }: { summary: ExecutiveSummary | null }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
      <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Executive KPI Summary</div>

      {!summary ? (
        <p className="mt-3 text-sm text-zinc-400">Executive KPIs unavailable until a comparable prior window is available.</p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard metric={summary.metrics.revenue} />
          <KpiCard metric={summary.metrics.orders} />
          <KpiCard metric={summary.metrics.aov} />
          <KpiCard metric={summary.metrics.sessions} />
          <KpiCard metric={summary.metrics.purchaseConversion} />
          <KpiCard metric={summary.metrics.funnelCompletion} />
        </div>
      )}
    </section>
  );
}

function KpiCard({
  metric
}: {
  metric: ExecutiveSummary["metrics"][keyof ExecutiveSummary["metrics"]];
}) {
  const baselineMetric = {
    id: "revenue",
    unit: metric.unit,
    current: metric.current,
    previous: metric.previous,
    delta: metric.delta,
    deltaPercent: metric.deltaPercent
  } as const;

  const value = formatPerformanceBaselineValue(baselineMetric);
  const delta = formatPerformanceBaselineDelta(baselineMetric);

  return (
    <article className="rounded-2xl border border-white/10 bg-black/30 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{metric.label}</div>
      <div className="mt-2 text-xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-[11px] text-zinc-400">{delta}</div>
    </article>
  );
}
