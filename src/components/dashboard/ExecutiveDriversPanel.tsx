import { buildExecutiveDrivers, ExecutiveDriver } from "@/lib/dashboard/executive-layout";
import type { ConfidenceSummary } from "@/lib/data-confidence";
import { TrendComparison } from "@/lib/types/dashboard";

export function ExecutiveDriversPanel({ trends, drivers: provided, confidence }: { trends: TrendComparison[]; drivers?: ExecutiveDriver[]; confidence?: ConfidenceSummary }) {
  const drivers = provided ?? buildExecutiveDrivers(trends, 3, confidence);

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-6">
      <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Top Drivers</div>
      {drivers.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-400">No material changes detected in the current window.</p>
      ) : (
        <div className="mt-4 space-y-4">
          {drivers.map((driver) => (
            <DriverCard key={driver.id} driver={driver} />
          ))}
        </div>
      )}
    </section>
  );
}

function DriverCard({ driver }: { driver: ExecutiveDriver }) {
  return (
    <article className="rounded-2xl border border-white/5 bg-black/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">{driver.title}</div>
          <p className="text-sm text-zinc-400">{driver.summary}</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] ${driver.tone}`}>{driver.confidence}</span>
      </div>
      {driver.supporting.length ? (
        <ul className="mt-3 space-y-1 text-sm text-zinc-300">
          {driver.supporting.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="text-zinc-500">•</span>
              <span className="leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {driver.caveat ? <p className="mt-2 text-xs text-zinc-500">{driver.caveat}</p> : null}
    </article>
  );
}
