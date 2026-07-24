"use client";

import type { PerformancePulseSummary } from "@/lib/dashboard/performance-pulse";

type Props = {
  summary: PerformancePulseSummary;
};

const toneMap: Record<PerformancePulseSummary["status"], { pill: string; border: string }> = {
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

export function PerformancePulsePanel({ summary }: Props) {
  if (!summary.hasData) {
    return (
      <section className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-zinc-400">
        <p className="text-base font-semibold text-white">Performance pulse unavailable</p>
        <p className="mt-2">{summary.emptyReason ?? "Awaiting fresh marketing + website data."}</p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
      <div className="mb-4 flex flex-col gap-2 text-xs uppercase tracking-[0.3em] text-zinc-500 md:flex-row md:items-center md:justify-between">
        <div className="text-white/80">Performance pulse</div>
        <div className="flex items-center gap-2 text-sm text-white">
          <span>{summary.headline}</span>
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] ${toneMap[summary.status].pill}`}>{summary.statusLabel}</span>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {summary.stats.map((stat) => (
          <article key={stat.key} className={`rounded-2xl border ${toneMap[stat.status].border} bg-black/25 p-4`}>
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-white/70">
              <span>{stat.label}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] ${toneMap[stat.status].pill}`}>{stat.statusLabel}</span>
            </div>
            <p className="mt-2 text-2xl font-semibold text-white">{stat.currentValue}</p>
            <p className="text-xs text-zinc-400">{stat.priorComparisonLabel}</p>
            {stat.targetLabel ? <p className="text-xs text-zinc-500">{stat.targetLabel}</p> : null}
            <p className="mt-3 text-sm text-zinc-300">{stat.decision}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
