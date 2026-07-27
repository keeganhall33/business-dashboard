import type { CommerceTelemetry } from "@/lib/types/dashboard";
import { formatCurrency } from "@/lib/utils/format";
import { StatusChip } from "./ui/StatusChip";
import { TrendCard } from "./ui/TrendCard";

type Props = {
  telemetry?: CommerceTelemetry;
};

export function MarketingPerformancePanel({ telemetry }: Props) {
  const ga4 = telemetry?.ga4;
  const summary = ga4?.summary;
  const series = ga4?.timeseries ?? [];

  const sessionsSeries = normalizeSeries(series.map((point) => toFiniteNumber(point.sessions)));
  const engagedSeries = normalizeSeries(series.map((point) => toFiniteNumber(point.engagedSessions)));
  const revenueSeries = normalizeSeries(series.map((point) => toFiniteNumber(point.revenue)));

  return (
    <section className="ui-glass ui-glass-hover rounded-3xl p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Marketing performance</div>
          <div className="mt-1 text-sm text-zinc-400">GA4 sessions, engagement, and revenue trend for the selected range.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusChip label="GA4" tone="sky" />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TrendCard label="Sessions" value={formatInt(summary?.sessions)} series={sessionsSeries} tone="sky" />
        <TrendCard label="Engaged sessions" value={formatInt(summary?.engagedSessions)} series={engagedSeries} tone="emerald" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kpi label="GA4 revenue" value={formatCurrency(summary?.revenue, { maximumFractionDigits: 0 })} series={revenueSeries} tone="sky" />
        <Kpi label="Events" value={formatInt(summary?.eventCount)} />
        <Kpi label="Avg engagement" value={formatSeconds(summary?.avgEngagementSeconds)} />
      </div>

      {!summary ? (
        <div className="mt-5 rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/50 p-4 text-sm text-zinc-400">
          GA4 summary not available in this range.
        </div>
      ) : null}

      <div className="mt-5 rounded-2xl border border-zinc-900 bg-zinc-950/60 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Evidence</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <StatusChip label="GA4 API" tone="zinc" />
        </div>
      </div>
    </section>
  );
}

function Kpi({
  label,
  value,
  tone,
  series
}: {
  label: string;
  value: string;
  tone?: "zinc" | "emerald" | "amber" | "sky" | "rose";
  series?: number[];
}) {
  return (
    <div className="rounded-2xl border border-zinc-900 bg-zinc-950/60 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      {tone ? (
        <div className="mt-2">
          <StatusChip label={tone === "amber" ? "needs hook" : "signal"} tone={tone} />
        </div>
      ) : null}
      {series && series.length >= 2 ? (
        <div className="mt-3 opacity-80">
          <div className="h-1 w-full rounded-full bg-black/30 ring-1 ring-white/5">
            <div className="h-1 w-[55%] rounded-full bg-gradient-to-r from-[var(--ui-accent)] to-[var(--ui-accent-2)] opacity-70" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatInt(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "Unavailable";
  return Math.round(value).toLocaleString();
}

function formatSeconds(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value <= 0) return "Unavailable";
  if (value < 60) return `${Math.round(value)}s`;
  return `${Math.round(value / 60)}m`;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value)) return null;
  return value;
}

function normalizeSeries(values: Array<number | null>): number[] {
  const numeric = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return numeric.length >= 2 ? numeric : [];
}
