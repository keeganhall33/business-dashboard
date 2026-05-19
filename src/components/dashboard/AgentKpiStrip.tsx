import type { AgentKpiBucket } from "@/lib/types/dashboard";
import { ProgressDial } from "./ui/ProgressDial";
import { ProgressBar } from "./ui/ProgressBar";
import { StatusChip } from "./ui/StatusChip";
import { EmptyState } from "./ui/EmptyState";

type Props = {
  items?: AgentKpiBucket[];
  dense?: boolean;
};

export function AgentKpiStrip({ items, dense = false }: Props) {
  if (!items || items.length === 0) {
    return (
      <EmptyState
        title="Agent KPIs"
        detail="No KPI snapshots yet for this range. Once agents report metrics, you’ll see a per-agent dial + their top KPIs here."
      />
    );
  }

  const visibleAgents = items
    .map((agent) => {
      const liveKpis = agent.kpis.filter((kpi) => (kpi.latestReading?.value ?? null) != null);
      return { ...agent, kpis: liveKpis };
    })
    .filter((agent) => agent.kpis.length > 0);

  if (visibleAgents.length === 0) {
    return (
      <EmptyState
        title="Agent KPIs"
        detail="No live KPI readings in this range. Once agents report metrics, you’ll see a per-agent dial + deltas here."
      />
    );
  }

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950/70 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Agent KPIs</div>
          {!dense ? (
            <p className="mt-1 text-sm text-zinc-400">Fast read on who’s on-track, who’s blocked, and where the deltas live.</p>
          ) : (
            <p className="mt-1 text-sm text-zinc-400">Condensed per-agent scores (scroll horizontally for full set).</p>
          )}
        </div>
        <div className="text-xs text-zinc-500">Scrollable on smaller screens</div>
      </div>

      <div
        className="mt-5 flex gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {visibleAgents.map((agent) => {
          const scored = agent.kpis
            .map((kpi) => {
              const value = kpi.latestReading?.value ?? null;
              const target = kpi.targetValue ?? null;
              const percent = value != null && target != null && target > 0 ? (value / target) * 100 : null;
              return { kpi, value, target, percent };
            })
            .filter((item) => item.percent != null);
          const avg = scored.length ? scored.reduce((acc, item) => acc + (item.percent ?? 0), 0) / scored.length : 0;
          const top = agent.kpis.slice(0, dense ? 2 : 3);
          const tone = avg >= 100 ? ("emerald" as const) : avg >= 70 ? ("amber" as const) : ("rose" as const);

          const lastMeasuredAt = agent.kpis
            .map((kpi) => kpi.latestReading?.measuredAt ?? null)
            .filter((d): d is string => Boolean(d))
            .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
          const updatedLabel = lastMeasuredAt ? `updated ${formatTimeAgo(lastMeasuredAt)}` : null;

          return (
            <div
              key={agent.agentKey}
              className={`${dense ? "min-w-[240px] max-w-[280px]" : "min-w-[320px] max-w-[360px]"} flex-1 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">{agent.agentKey}</div>
                  <div className="text-lg font-semibold text-zinc-50">{agent.agentName}</div>
                  {!dense ? (
                    <p className="mt-1 line-clamp-2 text-sm text-zinc-400">Top KPI snapshot</p>
                  ) : null}
                  {updatedLabel ? (
                    <div className="mt-2">
                      <StatusChip label={updatedLabel} tone="zinc" />
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <ProgressDial value={Math.min(130, Math.max(0, avg))} tone={tone} />
                  <StatusChip label={avg >= 100 ? "on track" : avg >= 70 ? "watch" : "off"} tone={tone} />
                </div>
              </div>

              <div className="mt-3 text-sm text-zinc-200">{agent.agentName}</div>

              <div className="mt-4 space-y-3">
                {top.map((kpi) => {
                  const value = kpi.latestReading?.value ?? null;
                  const prior = kpi.priorReading?.value ?? null;
                  const target = kpi.targetValue ?? null;
                  const pct = value != null && target != null && target > 0 ? (value / target) * 100 : 0;
                  const kpiTone = pct >= 100 ? ("emerald" as const) : pct >= 70 ? ("amber" as const) : ("rose" as const);

                  const delta = value != null && prior != null ? value - prior : null;
                  const deltaPct = delta != null && prior != null && prior !== 0 ? (delta / prior) * 100 : null;
                  const deltaTone = delta == null ? null : delta > 0 ? ("emerald" as const) : delta < 0 ? ("rose" as const) : ("zinc" as const);
                  return (
                    <div key={`${agent.agentKey}-${kpi.kpiKey}`} className="rounded-xl border border-zinc-900 bg-zinc-950 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
                            {kpi.kpiName}
                          </div>
                          <div className="mt-1 text-sm text-zinc-100">
                            <span className="font-semibold">{value == null ? "—" : formatMetric(value, kpi.unit, kpi.kpiKey)}</span>
                            <span className="text-zinc-500">
                              {kpi.targetValue == null ? "" : ` / ${formatMetric(kpi.targetValue, kpi.unit, kpi.kpiKey)}`}
                            </span>
                          </div>
                          {delta != null ? (
                            <div className="mt-1 text-xs text-zinc-500">
                              <span className={deltaTone === "emerald" ? "text-emerald-400" : deltaTone === "rose" ? "text-rose-400" : "text-zinc-400"}>
                                {delta > 0 ? "+" : delta < 0 ? "−" : ""}
                                {formatMetric(Math.abs(delta), kpi.unit, kpi.kpiKey)}
                              </span>
                              {deltaPct != null ? <span className="text-zinc-600"> {`(${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(1)}%)`}</span> : null}
                              <span className="text-zinc-600"> vs prior</span>
                            </div>
                          ) : null}
                        </div>
                        <div className="text-right text-xs text-zinc-500">{kpi.frequency ?? ""}</div>
                      </div>
                      <div className="mt-2">
                        <ProgressBar value={Math.min(130, Math.max(0, pct))} tone={kpiTone} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function formatTimeAgo(iso: string) {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - then);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatMetric(value: number, unit?: string | null, metricKey?: string) {
  if (value == null || Number.isNaN(value)) return "—";
  const normalizedUnit = unit?.toLowerCase() ?? "";
  if (normalizedUnit === "usd" || normalizedUnit === "dollars") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(value);
  }
  if (normalizedUnit === "percent" || (metricKey && metricKey.includes("rate"))) {
    return `${value.toFixed(1)}%`;
  }
  if (Math.abs(value) >= 1000) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
  }
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(2);
}
