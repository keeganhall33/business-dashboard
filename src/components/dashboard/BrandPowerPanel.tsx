import { BrandPower } from "@/lib/types/dashboard";
import { MetricCard } from "./MetricCard";
import { EmptyState } from "./ui/EmptyState";

type Props = {
  data: BrandPower;
};

export function BrandPowerPanel({ data }: Props) {
  const hasMetrics = data.metrics.length > 0;
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
              data.metrics.map((metric) => <MetricCard key={metric.metricKey} metric={metric} density="compact" />)
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
