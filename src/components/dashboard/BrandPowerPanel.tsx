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
    .filter((m) => Boolean(m.metric.currentValue) && Boolean(m.source) && Boolean(m.formula) && Boolean(m.measuredAt));

  const hasMetrics = metrics.length > 0;
  const hasWorking = data.whatIsWorking.length > 0;
  const hasNext = data.whatToDoNext.length > 0;
  const nothingToShow = !hasMetrics && !hasWorking && !hasNext;

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
      <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Brand Power</div>

      {nothingToShow ? (
        <div className="mt-4">
          <EmptyState title="Data unavailable" detail="Brand tracking will display here once signals sync from Supabase." />
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-4">
            {hasMetrics ? (
              metrics.map(({ metric, source, formula, measuredAt }) => (
                <article key={metric.metricKey} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-500">Experimental</div>
                      <div className="mt-1 text-sm font-semibold text-white">{metric.metricKey}</div>
                      <div className="mt-1 text-xs text-zinc-400">Source: {source}</div>
                      <div className="mt-1 text-xs text-zinc-400">Formula: {formula}</div>
                      <div className="mt-1 text-xs text-zinc-500">Last update: {measuredAt}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xl font-semibold text-white">{formatMetricValue(metric.currentValue, metric.unit)}</div>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <EmptyState title="No brand KPIs" detail="No brand metrics tied to this range." />
            )}
          </div>

          <div className="mt-6 space-y-5">
            <div>
              <div className="text-sm text-zinc-400">What’s Working</div>
              {hasWorking ? (
                <ul className="mt-2 space-y-2 text-sm text-zinc-100">
                  {data.whatIsWorking.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              ) : (
                <div className="mt-2">
                  <EmptyState title="No wins logged" detail="Add campaign notes to surface proof here." />
                </div>
              )}
            </div>

            <div>
              <div className="text-sm text-zinc-400">What to Do Next</div>
              {hasNext ? (
                <ul className="mt-2 space-y-2 text-sm text-zinc-100">
                  {data.whatToDoNext.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              ) : (
                <div className="mt-2">
                  <EmptyState title="No actions queued" detail="Plan the next brand plays to see them here." />
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
