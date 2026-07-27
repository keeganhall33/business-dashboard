import type { DashboardOverviewResponse, ExecutiveInsightsPayload, HeaderMetric } from "@/lib/types/dashboard";
import { countRangeDays, elapsedRangeDays } from "@/lib/date/range";
import { formatCurrency } from "@/lib/utils/format";
import type { ExecutiveSummary } from "@/lib/dashboard/executive-summary";
import { buildForwardStrategyCopy } from "@/lib/dashboard/forward-strategy";

function findMetric(metrics: HeaderMetric[], predicate: (metric: HeaderMetric) => boolean) {
  return metrics.find(predicate);
}

export function ForwardStrategyPanel({
  data
}: {
  data: DashboardOverviewResponse;
}) {
  const range = data.range;
  const rangeIsMonthly = range.preset === "month_to_date" || range.preset === "previous_month";
  const totalDays = countRangeDays(range);
  const elapsedDays = elapsedRangeDays(range);


  const wooCompleteness = (data.commerceTelemetry as { woo?: { summary?: { completeness?: "complete" | "partial" | "unknown" } } })?.woo?.summary?.completeness;
  const commerceIncomplete = wooCompleteness != null && wooCompleteness !== "complete";
  const commerceQualification =
    "Woo totals are partial for this range, so exact pacing and target gaps are unavailable.";

  const revenueMetric = findMetric(
    data.headerMetrics,
    (metric) => metric.metricKey.toLowerCase().includes("revenue") || metric.metricName.toLowerCase().includes("revenue")
  );
  const ordersMetric = findMetric(
    data.headerMetrics,
    (metric) => metric.metricKey.toLowerCase().includes("order") || metric.metricName.toLowerCase().includes("order")
  );

  const currentRevenue = data.commerceTelemetry?.woo?.summary?.revenue ?? null;
  const effectiveRevenue = commerceIncomplete ? null : currentRevenue;
  const revenueTarget = revenueMetric?.targetValue ?? null;
  const paceRevenue =
    range.preset === "month_to_date" && !commerceIncomplete && effectiveRevenue != null && elapsedDays > 0
      ? (effectiveRevenue / elapsedDays) * totalDays
      : effectiveRevenue;
  const revenueGap = !commerceIncomplete && revenueTarget != null && paceRevenue != null ? revenueTarget - paceRevenue : null;
  const remainingDays = Math.max(0, totalDays - elapsedDays);
  const requiredDaily =
    !commerceIncomplete && range.preset === "month_to_date" && remainingDays > 0 && revenueGap != null && effectiveRevenue != null
      ? Math.max(0, revenueGap) / remainingDays
      : null;

  const currentOrders = data.commerceTelemetry?.woo?.summary?.orders ?? null;
  const effectiveOrders = commerceIncomplete ? null : currentOrders;
  const orderTarget = ordersMetric?.targetValue ?? null;
  const ordersGap = !commerceIncomplete && orderTarget != null && effectiveOrders != null ? orderTarget - effectiveOrders : null;

  const telemetryWarnings = Object.values(data.telemetryHealth ?? {})
    .filter((entry) => entry && entry.status !== "healthy")
    .slice(0, 3)
    .map((entry) => `${entry?.source.toUpperCase()}: ${entry?.reasons?.[0] ?? "Needs attention"}`);

  const summary = (data as unknown as { executiveSummary?: ExecutiveSummary | null }).executiveSummary ?? null;
  const strategyCopy = buildForwardStrategyCopy(summary);
  const topOpportunity = summarizeTopOpportunity(data.executiveInsights);

  const forecastBadge =
    !rangeIsMonthly || commerceIncomplete
      ? "Unavailable"
      : revenueGap != null
        ? revenueGap > 0
          ? "Behind target"
          : "Ahead of target"
        : "Forecast";
  const forecastTone =
    !rangeIsMonthly || commerceIncomplete
      ? "text-zinc-300"
      : revenueGap != null
        ? revenueGap > 0
          ? "text-amber-300"
          : "text-emerald-300"
        : "text-zinc-300";

  return (
    <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-950/60 via-zinc-950 to-zinc-950 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-400">Forward strategy</p>
          <p className="text-2xl font-semibold text-white">Deterministic path to target</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] ${forecastTone}`}>{forecastBadge}</span>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <MetricTile
          label="Revenue pace"
          value={!rangeIsMonthly || commerceIncomplete ? "Unavailable" : formatCurrency(paceRevenue, { maximumFractionDigits: 0 })}
          detail={
            !rangeIsMonthly
              ? "This panel only supports month-to-date or previous-month ranges."
              : commerceIncomplete ? commerceQualification : revenueTarget != null
                ? `Target ${formatCurrency(revenueTarget, { maximumFractionDigits: 0 })} • Gap ${formatDelta(revenueGap)}`
                : "No monthly revenue target on file"
          }
        />
        <MetricTile
          label="Daily needed"
          value={!commerceIncomplete && requiredDaily != null ? formatCurrency(requiredDaily, { maximumFractionDigits: 0 }) : "—"}
          detail={
            !rangeIsMonthly
              ? "Unavailable"
              : range.preset !== "month_to_date"
                ? "Only shown for active month-to-date periods"
                : remainingDays > 0
                  ? `${remainingDays} days remaining`
                  : "Range complete"
          }
        />
        <MetricTile
          label="Orders gap"
          value={!commerceIncomplete && ordersGap != null ? formatCountDelta(ordersGap) : "—"}
          detail={!rangeIsMonthly ? "Unavailable" : orderTarget != null ? `Target ${orderTarget.toLocaleString()} orders` : "No monthly order target on file"}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ListTile
          title="Top risks"
          items={telemetryWarnings.length ? telemetryWarnings : strategyCopy.risks}
        />
        <ListTile
          title="Next growth move"
          items={topOpportunity ?? [strategyCopy.nextAction]}
        />
      </div>
    </section>
  );
}

function summarizeTopOpportunity(insights?: ExecutiveInsightsPayload | null) {
  if (!insights?.trends?.length) return null;
  const positive = insights.trends.filter((trend) => trend.direction === "up" && trend.magnitude !== "minor");
  if (!positive.length) return null;
  const top = positive[0];
  const label = `${top.label} ${top.percentChange != null ? `${top.percentChange.toFixed(1)}%` : ""}`.trim();
  const explanation = top.caveat ?? "Sustain momentum by reinforcing the tactic that drove this lift.";
  const action = `Action: double down on ${top.label.toLowerCase()} within the next 7 days.`;
  return [label, explanation, action];
}

function formatDelta(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "Unavailable";
  return value >= 0
    ? `+${formatCurrency(value, { maximumFractionDigits: 0 })}`
    : `-${formatCurrency(Math.abs(value), { maximumFractionDigits: 0 })}`;
}

function formatCountDelta(value: number) {
  const rounded = Math.round(value);
  return rounded >= 0 ? `+${rounded.toLocaleString()}` : `-${Math.abs(rounded).toLocaleString()}`;
}

function MetricTile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-black/30 p-4">
      <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {detail ? <p className="mt-1 text-sm text-zinc-400">{detail}</p> : null}
    </div>
  );
}

function ListTile({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-black/30 p-4">
      <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">{title}</p>
      <ul className="mt-3 space-y-2 text-sm text-zinc-200">
        {items.map((item) => (
          <li key={item} className="leading-relaxed">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
