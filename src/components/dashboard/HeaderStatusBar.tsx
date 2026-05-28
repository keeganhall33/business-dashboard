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
        <div className="flex min-w-0 items-center gap-4">
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
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">Operator Command</div>
            <h1 className="mt-1 text-[length:var(--font-h1)] font-semibold leading-[var(--line-height-tight)] text-zinc-50">
              Executive Dashboard
            </h1>
            <div className="mt-1 text-xs uppercase tracking-[0.25em] text-zinc-500">Keegan Hall</div>
            <div className="mt-1 text-sm text-zinc-500 break-words">
              {refreshedAtIso ? `Updated ${new Date(refreshedAtIso).toLocaleTimeString()}` : ""}
            </div>
          </div>
        </div>
      </div>

      {controls ? (
        <div className="mt-6 sm:static sticky top-[calc(0.75rem+env(safe-area-inset-top))] z-40">
          <div className="rounded-3xl border border-white/10 bg-black/30 backdrop-blur-xl sm:border-0 sm:bg-transparent sm:backdrop-blur-none">
            <div className="sm:p-0 p-2">{controls}</div>
          </div>
        </div>
      ) : null}

      <div className="mt-6">
        {/* Mobile: swipeable KPI carousel. Desktop: grid. */}
        <div className="flex gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:hidden snap-x snap-mandatory">
          {metrics.map((metric) => (
            <div key={metric.metricKey} className="min-w-[86%] snap-start sm:min-w-[70%]">
              <MetricCard metric={metric} density="compact" dashboardUpdatedAtIso={refreshedAtIso} />
            </div>
          ))}
        </div>

        <div className="hidden md:grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <MetricCard key={metric.metricKey} metric={metric} density="comfortable" dashboardUpdatedAtIso={refreshedAtIso} />
          ))}
        </div>
      </div>
    </section>
  );
}
