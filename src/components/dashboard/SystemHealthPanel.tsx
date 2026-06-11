import { SystemHealth } from "@/lib/types/dashboard";
import { ProgressBar } from "./ui/ProgressBar";

type Props = {
  data: SystemHealth;
};

export function SystemHealthPanel({ data }: Props) {
  const { label: freshnessLabel, tone: freshnessTone, detail: freshnessDetail } = classifyFreshness(data.dataFreshnessHours);
  const badgeClasses = freshnessTone === "rose"
    ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
    : freshnessTone === "amber"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
      : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  return (
    <section className="ui-glass ui-glass-hover rounded-3xl p-6">
      <div className="flex items-center gap-3">
        <span className={`ui-status-dot ${freshnessTone === "rose" ? "ui-pulse" : ""}`} data-tone={freshnessTone} />
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">System Health</div>
        <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] ${badgeClasses}`}>{freshnessLabel}</span>
      </div>

      <div className="mt-4 space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="text-sm text-zinc-400">Data Freshness</div>
          <div className="mt-2 text-3xl font-semibold text-zinc-50">
            {data.dataFreshnessHours != null ? `${data.dataFreshnessHours}h` : "—"}
          </div>
          <div className="mt-1 text-xs text-zinc-500">{freshnessDetail}</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="text-sm text-zinc-400">Task Completion Rate</div>
          <div className="mt-2 text-3xl font-semibold text-zinc-50">
            {data.agentTaskCompletionRate != null ? `${data.agentTaskCompletionRate}%` : "—"}
          </div>
          <div className="mt-3">
            <ProgressBar value={Number(data.agentTaskCompletionRate ?? 0)} tone={Number(data.agentTaskCompletionRate ?? 0) >= 80 ? "emerald" : "amber"} className="bg-black/25" />
          </div>
        </div>

        <div className="ui-scroll-snap-x flex gap-3 overflow-x-auto pb-2 md:block md:space-y-3 md:overflow-visible">
          {data.agents.map((agent) => (
            <div
              key={agent.agentKey}
              className="ui-snap-item w-[78vw] min-w-[260px] shrink-0 rounded-2xl border border-white/10 bg-white/[0.02] p-4 md:w-auto md:min-w-0"
            >
              <div className="text-sm font-medium text-zinc-50">{agent.agentKey}</div>
              <div className="mt-1 text-sm text-zinc-400">
                Open {agent.openTaskCount} • Completed {agent.completedTaskCount}
              </div>
              <div className="mt-1 text-xs uppercase tracking-[0.14em] text-zinc-500">{agent.health}</div>
              <div className="mt-3 flex items-center gap-3">
                <span
                  className={`ui-status-dot ${agent.health === "unhealthy" ? "ui-pulse" : ""}`}
                  data-tone={agent.health === "healthy" ? "emerald" : agent.health === "unhealthy" ? "rose" : "amber"}
                />
                <ProgressBar
                  value={pct(agent.completedTaskCount, agent.completedTaskCount + agent.openTaskCount)}
                  tone={agent.health === "healthy" ? "emerald" : agent.health === "unhealthy" ? "rose" : "amber"}
                  className="flex-1 bg-black/25"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function pct(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Math.max(0, Math.min(100, (numerator / denominator) * 100));
}

function classifyFreshness(hours: number | null) {
  if (hours == null) {
    return { label: "Unknown", tone: "amber" as const, detail: "No freshness telemetry reported." };
  }
  if (hours <= 2) {
    return { label: "Fresh", tone: "emerald" as const, detail: `Updated ${hours}h ago.` };
  }
  if (hours <= 6) {
    return { label: "Aging", tone: "amber" as const, detail: `Last refresh ${hours}h ago — consider rerunning ingestion soon.` };
  }
  return { label: "Stale", tone: "rose" as const, detail: `Stale data (${hours}h since last refresh).` };
}
