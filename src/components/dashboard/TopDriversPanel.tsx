import type { ExecutiveSummary } from "@/lib/dashboard/executive-summary";
import { formatCount, formatCurrency, formatMetricValue } from "@/lib/utils/format";

type Driver = {
  metric: string;
  current: string;
  previous: string;
  absolute: string;
  relative: string | null;
  direction: "up" | "down" | "flat";
};

export function TopDriversPanel({ summary }: { summary: ExecutiveSummary | null }) {
  const drivers = buildDrivers(summary);

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
      <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Top Drivers</div>

      {!summary ? (
        <p className="mt-3 text-sm text-zinc-400">No material movement detected (baseline unavailable).</p>
      ) : drivers.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-400">No material movement detected.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {drivers.map((d) => (
            <DriverRow key={d.metric} driver={d} />
          ))}
          <div className="mt-2 text-xs text-zinc-500">Comparison window: {summary.comparisonLabel}</div>
        </div>
      )}
    </section>
  );
}

function DriverRow({ driver }: { driver: Driver }) {
  const tone = driver.direction === "down" ? "text-rose-200" : driver.direction === "up" ? "text-emerald-200" : "text-zinc-200";
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-white">{driver.metric}</div>
          <div className="mt-1 text-sm text-zinc-400">{driver.current} vs {driver.previous}</div>
        </div>
        <div className={`shrink-0 text-right text-sm font-semibold ${tone}`}>{driver.absolute}</div>
      </div>
      {driver.relative ? <div className="mt-1 text-xs text-zinc-400">{driver.relative}</div> : null}
    </div>
  );
}

function buildDrivers(summary: ExecutiveSummary | null): Driver[] {
  if (!summary) return [];

  const materialThreshold = 0.1; // 10%
  const candidates = Object.values(summary.metrics)
    .map((m) => ({
      metric: m.label,
      unit: m.unit,
      current: m.current,
      previous: m.previous,
      delta: m.delta,
      deltaPercent: m.deltaPercent
    }))
    .filter((m): m is typeof m & { deltaPercent: number } => typeof m.deltaPercent === "number" && Number.isFinite(m.deltaPercent))
    .filter((m) => Math.abs(m.deltaPercent) >= materialThreshold);

  candidates.sort((a, b) => Math.abs(b.deltaPercent) - Math.abs(a.deltaPercent));

  return candidates.slice(0, 3).map((m) => {
    const direction = m.deltaPercent < 0 ? "down" : m.deltaPercent > 0 ? "up" : "flat";
    const current = formatForUnit(m.current, m.unit);
    const previous = formatForUnit(m.previous, m.unit);
    const abs = formatForUnit(m.delta != null ? Math.abs(m.delta) : null, m.unit);
    const sign = direction === "down" ? "-" : direction === "up" ? "+" : "";
    const absolute = `${sign}${abs}`;
    const relative = m.deltaPercent != null ? `${sign}${(Math.abs(m.deltaPercent) * 100).toFixed(1)}% vs comparison` : null;
    return { metric: m.metric, current, previous, absolute, relative, direction };
  });
}

function formatForUnit(value: number | null, unit: "currency" | "count" | "percent") {
  if (unit === "currency") return formatCurrency(value, { maximumFractionDigits: 0 });
  if (unit === "count") return formatCount(value);
  // percent is in 0–100 scale
  return formatMetricValue(value, "%");
}
