import { BrandPower } from "@/lib/types/dashboard";
import { EmptyState } from "./ui/EmptyState";
import { formatMetricValue } from "@/lib/utils/format";

type Props = {
  data: BrandPower;
};

export function BrandPowerPanel({ data }: Props) {
  const metrics = data.metrics
    .map((metric) => {
      const source = (metric as unknown as { source?: string | null }).source;
      const formula = (metric as unknown as { formula?: string | null }).formula;
      const measuredAt = (metric as unknown as { measuredAt?: string | null }).measuredAt;
      return { metric, source, formula, measuredAt };
    })
    .filter(
      (m) =>
        m.metric.currentValue != null &&
        typeof m.metric.currentValue === "number" &&
        Number.isFinite(m.metric.currentValue) &&
        Boolean(m.source) &&
        Boolean(m.formula) &&
        Boolean(m.measuredAt)
    );

  const hasMetrics = metrics.length > 0;

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
      <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Brand Power</div>

      {!hasMetrics ? (
        <div className="mt-4">
          <EmptyState
            title="No experimental metrics"
            detail="No fully provenanced experimental KPIs are available for this range."
          />
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4">
          {metrics.map(({ metric, source, formula, measuredAt }) => (
            <article key={metric.metricKey} className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-500">Experimental</div>
                  <div className="mt-1 text-sm font-semibold text-white">{metric.metricKey}</div>
                  <div className="mt-1 text-xs text-zinc-400">Source: {source}</div>
                  <div className="mt-1 text-xs text-zinc-400">Formula: {formula}</div>
                  <div className="mt-1 text-xs text-zinc-400">Applies to: selected range</div>
                  <div className="mt-1 text-xs text-zinc-500">Measured: {measuredAt}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xl font-semibold text-white">{formatMetricValue(metric.currentValue, metric.unit)}</div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
