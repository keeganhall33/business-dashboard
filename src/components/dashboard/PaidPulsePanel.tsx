"use client";

import type { PaidPulseInsight } from "@/lib/dashboard/paid-pulse";

type Props = {
  insight: PaidPulseInsight;
};

const decisionTone: Record<PaidPulseInsight["decision"], string> = {
  scale: "border-emerald-400/40 bg-emerald-500/10",
  pause: "border-rose-400/40 bg-rose-500/10",
  refresh: "border-amber-400/40 bg-amber-500/10",
  watch: "border-sky-400/40 bg-sky-500/10",
  thin: "border-slate-500/30 bg-slate-600/10"
};

export function PaidPulsePanel({ insight }: Props) {
  if (!insight.showPanel) {
    return null;
  }

  const tone = decisionTone[insight.decision];

  return (
    <section className={`rounded-3xl border ${tone} p-5`}>
      <div className="text-xs uppercase tracking-[0.3em] text-white/70">Paid pulse</div>
      <p className="mt-1 text-base font-semibold text-white">{insight.headline}</p>
      <p className="mt-1 text-sm text-zinc-200">{insight.message}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Spend" value={insight.spendLabel} />
        <Stat label="ROAS" value={insight.roasLabel} />
        <Stat label="Purchases" value={insight.volumeLabel} />
      </div>
      <p className="mt-3 text-sm text-emerald-200">Next: {insight.recommendation}</p>
      <p className="mt-2 text-xs text-zinc-500">Confidence {insight.confidence}</p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
      <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}
