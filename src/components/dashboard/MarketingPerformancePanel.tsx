import type { CommerceTelemetry } from "@/lib/types/dashboard";
import { StatusChip } from "./ui/StatusChip";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

type Props = {
  telemetry?: CommerceTelemetry;
};

export function MarketingPerformancePanel({ telemetry }: Props) {
  const ga4 = telemetry?.ga4;
  const summary = ga4?.summary;

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Marketing performance</div>
          <div className="mt-1 text-sm text-zinc-400">GA4 signal now. Facebook ads telemetry hooks next.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusChip label="GA4" tone="sky" />
          <StatusChip label="FB" tone="zinc" />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kpi label="Revenue" value={currency.format(Number(summary?.revenue ?? 0))} />
        <Kpi label="Sessions" value={formatInt(summary?.sessions)} />
        <Kpi label="Engaged" value={formatInt(summary?.engagedSessions)} />
        <Kpi label="Events" value={formatInt(summary?.eventCount)} />
        <Kpi label="Avg engagement" value={formatSeconds(summary?.avgEngagementSeconds)} />
        <Kpi label="Attribution" value="pending" tone="amber" />
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
          <StatusChip label="FB spend: missing" tone="amber" />
        </div>
      </div>
    </section>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "zinc" | "emerald" | "amber" | "sky" | "rose" }) {
  return (
    <div className="rounded-2xl border border-zinc-900 bg-zinc-950/60 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      {tone ? (
        <div className="mt-2">
          <StatusChip label={tone === "amber" ? "needs hook" : "signal"} tone={tone} />
        </div>
      ) : null}
    </div>
  );
}

function formatInt(value: number | null | undefined) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num.toLocaleString() : "0";
}

function formatSeconds(value: number | null | undefined) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num) || num <= 0) return "0s";
  if (num < 60) return `${Math.round(num)}s`;
  return `${Math.round(num / 60)}m`;
}
