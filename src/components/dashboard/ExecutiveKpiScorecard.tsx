import { HeaderMetric } from "@/lib/types/dashboard";
import { formatMetricValue } from "@/lib/utils/format";

const STATUS_BADGES: Record<HeaderMetric["status"], string> = {
  healthy: "text-emerald-300 border-emerald-500/30",
  on_track: "text-emerald-200 border-emerald-500/20",
  warning: "text-amber-300 border-amber-500/40",
  critical: "text-rose-300 border-rose-500/40"
};

export function ExecutiveKpiScorecard({ metrics }: { metrics: HeaderMetric[] }) {
  const selected = metrics.slice(0, 8);

  if (!selected.length) {
    return (
      <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 text-sm text-zinc-400">
        No KPIs available for this window.
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-6">
      <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Executive KPI Scorecard</div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {selected.map((metric) => (
          <KpiCard key={metric.metricKey} metric={metric} />
        ))}
      </div>
    </section>
  );
}

function KpiCard({ metric }: { metric: HeaderMetric }) {
  const delta = typeof metric.deltaPercent === "number" ? metric.deltaPercent : null;
  const statusClass = STATUS_BADGES[metric.status] ?? STATUS_BADGES.healthy;

  return (
    <article className="flex flex-col rounded-2xl border border-white/5 bg-black/30 p-4 shadow-inner shadow-black/40">
      <div className="flex items-center justify-between gap-3">
        <div className="truncate text-[11px] uppercase tracking-[0.3em] text-zinc-500">{metric.metricName}</div>
        <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${statusClass}`}>{metric.status.replace("_", " ")}</span>
      </div>
      <div className="mt-3 text-3xl font-semibold text-white">{formatMetricValue(metric.currentValue ?? 0, metric.unit)}</div>
      <div className="mt-1 text-xs text-zinc-500">Target {formatMetricValue(metric.targetValue ?? 0, metric.unit)}</div>
      <div className="mt-3 flex items-center justify-between text-sm">
        {delta != null ? (
          <span className={delta >= 0 ? "text-emerald-300" : "text-rose-300"}>{delta >= 0 ? "+" : ""}{delta.toFixed(1)}%</span>
        ) : (
          <span className="text-zinc-500">No change</span>
        )}
        {metric.ownerAgent ? <span className="truncate text-right text-xs text-zinc-400">Owner {metric.ownerAgent}</span> : null}
      </div>
    </article>
  );
}
