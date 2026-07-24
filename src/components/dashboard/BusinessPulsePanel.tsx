"use client";

import type { PerformancePulseSummary } from "@/lib/dashboard/performance-pulse";

const statusTone: Record<PerformancePulseSummary["status"], { pill: string; border: string }> = {
  slipping: {
    pill: "bg-rose-500/15 text-rose-100 border border-rose-400/40",
    border: "border-rose-400/40"
  },
  missing: {
    pill: "bg-zinc-500/20 text-zinc-200 border border-zinc-400/30",
    border: "border-zinc-500/30"
  },
  improving: {
    pill: "bg-emerald-500/15 text-emerald-100 border border-emerald-400/40",
    border: "border-emerald-400/40"
  },
  on_plan: {
    pill: "bg-sky-500/15 text-sky-100 border border-sky-400/40",
    border: "border-sky-400/40"
  }
};

type Props = {
  summary: PerformancePulseSummary;
};

export function BusinessPulsePanel({ summary }: Props) {
  if (!summary.hasData) {
    return (
      <section className="rounded-3xl border border-dashed border-white/15 bg-black/20 p-5">
        <p className="text-base font-semibold text-white">Business pulse unavailable</p>
        <p className="mt-2 text-sm text-zinc-400">
          {summary.emptyReason ?? "Run the marketing + website agents so we can compare this window vs the last."}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-black/40 via-black/20 to-blue-900/20 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Business Pulse</p>
          <p className="text-xl font-semibold text-white">{summary.headline}</p>
          <p className="text-sm text-zinc-400">
            Command Feed remains the source of truth. This view highlights what to pay attention to right now.
          </p>
        </div>
        <span
          className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.3em] ${statusTone[summary.status].pill}`}
        >
          {summary.statusLabel}
        </span>
      </div>
      <div className="mt-6 space-y-4">
        {summary.stats.map((stat) => (
          <article key={stat.key} className={`rounded-2xl border ${statusTone[stat.status].border} bg-black/30 p-4`}>
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-zinc-400">
              <span>{stat.label}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${statusTone[stat.status].pill}`}>
                {stat.statusLabel}
              </span>
            </div>
            <p className="mt-3 text-3xl font-semibold text-white">{stat.currentValue}</p>
            <p className="text-xs text-zinc-500">{stat.priorComparisonLabel}</p>
            {stat.targetLabel ? <p className="text-xs text-zinc-500">{stat.targetLabel}</p> : null}
            <p className="mt-3 text-sm text-zinc-100">{stat.decision}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
