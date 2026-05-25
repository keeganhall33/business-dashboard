import { BrandPower } from "@/lib/types/dashboard";
import { MetricCard } from "./MetricCard";

type Props = {
  data: BrandPower;
};

export function BrandPowerPanel({ data }: Props) {
  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
      <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Brand Power</div>

      <div className="mt-4 grid grid-cols-1 gap-4">
        {data.metrics.map((metric) => (
          <MetricCard key={metric.metricKey} metric={metric} density="compact" />
        ))}
      </div>

      <div className="mt-6 space-y-5">
        <div>
          <div className="text-sm text-zinc-400">What’s Working</div>
          <ul className="mt-2 space-y-2 text-sm text-zinc-100">
            {data.whatIsWorking.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>

        <div>
          <div className="text-sm text-zinc-400">What to Do Next</div>
          <ul className="mt-2 space-y-2 text-sm text-zinc-100">
            {data.whatToDoNext.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
