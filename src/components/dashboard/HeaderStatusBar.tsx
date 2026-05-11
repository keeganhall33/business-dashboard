import Image from "next/image";
import { HeaderMetric } from "@/lib/types/dashboard";
import { MetricCard } from "./MetricCard";

type Props = {
  metrics: HeaderMetric[];
  refreshedAtIso?: string;
  controls?: React.ReactNode;
};

export function HeaderStatusBar({ metrics, refreshedAtIso, controls }: Props) {
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative h-14 w-14 overflow-hidden rounded-full border border-zinc-800 bg-zinc-900">
            <Image
              src="/avatars/keegan.png"
              alt="Keegan Hall"
              fill
              sizes="60px"
              priority
              className="object-cover"
            />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">Operator Command</div>
            <h1 className="mt-1 text-3xl font-semibold text-zinc-50">Executive Dashboard</h1>
            <div className="mt-1 text-xs uppercase tracking-[0.25em] text-zinc-500">Keegan Hall</div>
            <div className="mt-1 text-sm text-zinc-500">
              {refreshedAtIso ? `Updated ${new Date(refreshedAtIso).toLocaleTimeString()}` : ""}
            </div>
          </div>
        </div>
      </div>

      {controls ? <div className="mt-6">{controls}</div> : null}

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard key={metric.metricKey} metric={metric} />
        ))}
      </div>
    </section>
  );
}
