import type { ChangeInsightsSnapshot } from "@/lib/types/dashboard";

const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const percentFormatter = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

export function ChangeInsightsPanel({ snapshot }: { snapshot?: ChangeInsightsSnapshot | null }) {
  if (!snapshot) return null;

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Change insights</div>
          <p className="text-sm text-zinc-400">Key movements versus the previous saved snapshot.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-zinc-400">
            {snapshot.previousGeneratedAt ? "Compared" : "History unavailable"}
          </span>
        </div>
      </div>

      {snapshot.insights.length === 0 ? (
        <p className="mt-5 text-sm text-zinc-500">No historical comparison available yet.</p>
      ) : (
        <ul className="mt-5 space-y-3">
          {snapshot.insights.map((insight) => (
            <li key={insight.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div className="text-sm font-semibold text-white">{insight.label}</div>
                <div className="text-xs text-zinc-400">{formatDeltaLabel(insight.unit, insight.delta, insight.deltaPercent)}</div>
              </div>
              <p className="mt-2 text-sm text-zinc-300">{insight.interpretation}</p>
              <div className="mt-2 text-xs text-zinc-500">
                Current {formatValue(insight.unit, insight.current)} · Previous {formatValue(insight.unit, insight.previous)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatValue(unit: "currency" | "count" | "percent", value: number | null) {
  if (value == null) return "—";
  if (unit === "currency") return currencyFormatter.format(value);
  if (unit === "percent") return percentFormatter.format(value);
  return numberFormatter.format(value);
}

function formatDeltaLabel(unit: "currency" | "count" | "percent", delta: number | null, deltaPercent: number | null) {
  if (delta == null) return "—";
  const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
  const abs = Math.abs(delta);
  const base = unit === "currency" ? currencyFormatter.format(abs) : unit === "percent" ? percentFormatter.format(abs) : numberFormatter.format(abs);

  if (deltaPercent == null) return `${sign}${base}`;
  const pct = percentFormatter.format(Math.abs(deltaPercent));
  return `${sign}${base} (${pct})`;
}
