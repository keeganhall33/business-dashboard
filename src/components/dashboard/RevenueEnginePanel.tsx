import { RevenueEngine } from "@/lib/types/dashboard";
import { MetricCard } from "./MetricCard";

type Props = {
  data: RevenueEngine;
};

export function RevenueEnginePanel({ data }: Props) {
  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
      <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Revenue Engine</div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        {data.metrics.map((metric) => (
          <MetricCard key={metric.metricKey} metric={metric} />
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 p-4">
          <div className="text-sm text-zinc-400">Money Leaks</div>
          <ul className="mt-3 space-y-2 text-sm text-zinc-100">
            {data.moneyLeaks.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-zinc-800 p-4">
          <div className="text-sm text-zinc-400">Fastest Path to Growth</div>
          <div className="mt-3 space-y-3">
            {data.fastestPathToIncreaseRevenue.map((item) => (
              <div key={item.move} className="rounded-xl bg-zinc-900 p-3">
                <div className="text-sm font-medium text-zinc-50">{item.move}</div>
                <div className="mt-1 text-sm text-zinc-400">{item.estimatedImpact}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

