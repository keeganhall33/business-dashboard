import type { ExecutiveSummary } from "@/lib/dashboard/executive-summary";
import type { ConfidenceSummary } from "@/lib/data-confidence";
import { formatPerformanceBaselineDelta, formatPerformanceBaselineValue } from "@/components/dashboard/PerformanceBaselinePanel";
import { formatExecutiveTruthLine } from "@/lib/dashboard/metric-truth";

export function ExecutiveKpiPanel({ summary, confidence }: { summary: ExecutiveSummary | null; confidence: ConfidenceSummary }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
      <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Executive KPI Summary</div>

      {!summary ? (
        <p className="mt-3 text-sm text-zinc-400">Executive KPIs unavailable until a comparable prior window is available.</p>
      ) : (
        <>
          <div className="mt-2 text-xs text-zinc-500">Selected-period performance · {summary.rangeLabel}</div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <KpiCard metric={summary.metrics.revenue} rangeLabel={summary.rangeLabel} confidence={confidence} />
            <KpiCard metric={summary.metrics.orders} rangeLabel={summary.rangeLabel} confidence={confidence} />
            <KpiCard metric={summary.metrics.aov} rangeLabel={summary.rangeLabel} confidence={confidence} />
            <KpiCard metric={summary.metrics.sessions} rangeLabel={summary.rangeLabel} confidence={confidence} />
            <KpiCard metric={summary.metrics.purchaseConversion} rangeLabel={summary.rangeLabel} confidence={confidence} />
            <KpiCard metric={summary.metrics.funnelCompletion} rangeLabel={summary.rangeLabel} confidence={confidence} />
          </div>
        </>
      )}
    </section>
  );
}

function KpiCard({
  metric,
  rangeLabel,
  confidence
}: {
  metric: ExecutiveSummary["metrics"][keyof ExecutiveSummary["metrics"]];
  rangeLabel: string;
  confidence: ConfidenceSummary;
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
  const truth = formatExecutiveTruthLine({ metric, rangeLabel, confidence });

  return (
    <article className="rounded-2xl border border-white/10 bg-black/30 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{metric.label}</div>
      <div className="mt-2 text-xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-[11px] text-zinc-400">{truth}</div>
      <div className="mt-1 text-[11px] text-zinc-500">{delta}</div>
    </article>
  );
}
