"use client";

import { useMemo } from "react";
import { StatusChip } from "./StatusChip";

type Props = {
  label: string;
  value: string;
  series?: number[];
  tone?: "zinc" | "emerald" | "amber" | "sky" | "rose";
};

export function TrendCard({ label, value, series, tone = "zinc" }: Props) {
  const trend = useMemo(() => computeTrend(series ?? []), [series]);
  const chipTone = trend.deltaPct == null ? "zinc" : trend.deltaPct >= 0 ? "emerald" : "rose";

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">{label}</div>
          <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {trend.deltaPct != null ? (
            <StatusChip label={`${trend.deltaPct >= 0 ? "+" : ""}${trend.deltaPct.toFixed(1)}%`} tone={chipTone} />
          ) : (
            <StatusChip label="trend" tone={tone} />
          )}
        </div>
      </div>

      <div className="mt-3">
        {series && series.length >= 2 ? <Sparkline values={series} tone={tone} /> : <EmptySparkline />}
      </div>
    </div>
  );
}

function Sparkline({ values, tone }: { values: number[]; tone: Props["tone"] }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(1e-9, max - min);

  const points = values
    .map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * 100;
      const y = 100 - ((v - min) / range) * 100;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const stroke =
    tone === "emerald"
      ? "#34d399"
      : tone === "sky"
        ? "#38bdf8"
        : tone === "amber"
          ? "#fbbf24"
          : tone === "rose"
            ? "#fb7185"
            : "#a1a1aa";

  return (
    <svg viewBox="0 0 100 40" className="h-10 w-full">
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
    </svg>
  );
}

function EmptySparkline() {
  return <div className="h-10 w-full rounded-xl border border-dashed border-white/10 bg-black/20" />;
}

function computeTrend(values: number[]) {
  if (values.length < 6) return { deltaPct: null as number | null };
  const mid = Math.floor(values.length / 2);
  const first = values.slice(0, mid);
  const second = values.slice(mid);
  const avg1 = first.reduce((a, b) => a + b, 0) / Math.max(1, first.length);
  const avg2 = second.reduce((a, b) => a + b, 0) / Math.max(1, second.length);
  if (!Number.isFinite(avg1) || !Number.isFinite(avg2) || avg1 === 0) return { deltaPct: null };
  return { deltaPct: ((avg2 - avg1) / Math.abs(avg1)) * 100 };
}

