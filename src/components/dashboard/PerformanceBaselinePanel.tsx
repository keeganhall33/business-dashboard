import type { PerformanceBaselineMetric, PerformanceBaselineSnapshot } from "@/lib/types/dashboard";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

export function PerformanceBaselinePanel({ snapshot }: { snapshot?: PerformanceBaselineSnapshot | null }) {
  if (!snapshot) return null;

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Performance baseline</div>
          <p className="mt-1 text-sm text-zinc-400">Current window versus the immediately preceding window of equal length.</p>
        </div>
        <div className="text-xs text-zinc-500">
          {snapshot.range.startDate} → {snapshot.range.endDate}
          <span className="mx-2 text-zinc-700">/</span>
          {snapshot.previousRange.startDate} → {snapshot.previousRange.endDate}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard metric={snapshot.metrics.revenue} label="Revenue" />
        <MetricCard metric={snapshot.metrics.orders} label="Orders" />
        <MetricCard metric={snapshot.metrics.avgOrderValue} label="AOV" />
        <MetricCard metric={snapshot.metrics.sessions} label="Sessions" />
        <MetricCard metric={snapshot.metrics.conversionRate} label="Conversion" />
      </div>

      <p className="mt-4 text-xs text-zinc-500">
        Comparisons are computed only when both current and previous values are available. Percent deltas are omitted when the prior value is zero.
      </p>
    </section>
  );
}

function MetricCard({ metric, label }: { metric: PerformanceBaselineMetric; label: string }) {
  const value = formatValue(metric);
  const delta = formatDelta(metric);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-xs text-zinc-400">{delta}</div>
    </div>
  );
}

function formatValue(metric: PerformanceBaselineMetric): string {
  if (metric.current == null) return "—";

  switch (metric.unit) {
    case "currency":
      return currency.format(metric.current);
    case "percent":
      // Conversion rate is already 0–100 scale.
      return `${metric.current.toFixed(1)}%`;
    default:
      return integer.format(metric.current);
  }
}

function formatDelta(metric: PerformanceBaselineMetric): string {
  if (metric.current == null || metric.previous == null || metric.delta == null) return "No comparable history";

  const sign = metric.delta > 0 ? "+" : metric.delta < 0 ? "-" : "";
  const abs = Math.abs(metric.delta);

  const base =
    metric.unit === "currency"
      ? currency.format(abs)
      : metric.unit === "percent"
        ? `${abs.toFixed(1)}%`
        : integer.format(abs);

  if (metric.deltaPercent == null) return `${sign}${base}`;

  // deltaPercent is fraction (e.g. 0.12 => 12%)
  return `${sign}${base} (${percent.format(Math.abs(metric.deltaPercent))})`;
}
