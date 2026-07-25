import type { DashboardOverviewResponse, ExecutiveInsightsPayload, HeaderMetric } from "@/lib/types/dashboard";
import { countRangeDays, elapsedRangeDays } from "@/lib/date/range";

function findMetric(metrics: HeaderMetric[], predicate: (metric: HeaderMetric) => boolean) {
  return metrics.find(predicate);
}

export function ForwardStrategyPanel({
  data
}: {
  data: DashboardOverviewResponse;
}) {
  const range = data.range;
  const totalDays = countRangeDays(range);
  const elapsedDays = elapsedRangeDays(range);

  const revenueMetric = findMetric(
    data.headerMetrics,
    (metric) => metric.metricKey.toLowerCase().includes("revenue") || metric.metricName.toLowerCase().includes("revenue")
  );
  const ordersMetric = findMetric(
    data.headerMetrics,
    (metric) => metric.metricKey.toLowerCase().includes("order") || metric.metricName.toLowerCase().includes("order")
  );

  const currentRevenue =
    revenueMetric?.currentValue ??
    data.commerceTelemetry?.woo?.summary?.revenue ??
    data.websiteConversion?.wooCommerce?.netRevenue ??
    data.websiteConversion?.wooCommerce?.grossOrderRevenue ??
    null;
  const revenueTarget = revenueMetric?.targetValue ?? null;
  const paceRevenue = currentRevenue != null && elapsedDays > 0 ? (currentRevenue / elapsedDays) * totalDays : currentRevenue;
  const revenueGap = revenueTarget != null && paceRevenue != null ? revenueTarget - paceRevenue : null;
  const remainingDays = Math.max(0, totalDays - elapsedDays);
  const requiredDaily = remainingDays > 0 && revenueGap != null ? Math.max(0, revenueGap) / remainingDays : null;

  const currentOrders = ordersMetric?.currentValue ?? data.websiteConversion?.wooCommerce?.paidOrdersInWindow ?? null;
  const orderTarget = ordersMetric?.targetValue ?? null;
  const ordersGap = orderTarget != null && currentOrders != null ? orderTarget - currentOrders : null;

  const telemetryWarnings = Object.values(data.telemetryHealth ?? {})
    .filter((entry) => entry && entry.status !== "healthy")
    .slice(0, 3)
    .map((entry) => `${entry?.source.toUpperCase()}: ${entry?.reasons?.[0] ?? "Needs attention"}`);

  const topOpportunity = summarizeTopOpportunity(data.executiveInsights);

  const forecastBadge = revenueGap != null ? (revenueGap > 0 ? "Behind target" : "Ahead of target") : "Forecast";
  const forecastTone = revenueGap != null ? (revenueGap > 0 ? "text-amber-300" : "text-emerald-300") : "text-zinc-300";

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
          value={paceRevenue == null ? "Unavailable" : `$${Math.round(paceRevenue).toLocaleString()}`}
          detail={
            revenueTarget != null
              ? `Target $${Math.round(revenueTarget).toLocaleString()} • Gap ${formatDelta(revenueGap ?? 0)}`
              : "No revenue target on file"
          }
        />
        <MetricTile
          label="Daily needed"
          value={requiredDaily != null ? `$${Math.round(requiredDaily).toLocaleString()}` : "—"}
          detail={remainingDays > 0 ? `${remainingDays} day window remaining` : "Range complete"}
        />
        <MetricTile
          label="Orders gap"
          value={ordersGap != null ? formatCountDelta(ordersGap) : "—"}
          detail={orderTarget != null ? `Target ${orderTarget.toLocaleString()} orders` : "No order target on file"}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ListTile
          title="Top risks"
          items={
            telemetryWarnings.length
              ? telemetryWarnings
              : ["No telemetry risks surfaced. Continue monitoring core sources."]
          }
        />
        <ListTile
          title="Next growth move"
          items={topOpportunity ?? ["No material positive driver detected. Focus on defending core KPIs."]}
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

function formatDelta(value: number) {
  return value >= 0 ? `+$${Math.round(value).toLocaleString()}` : `-$${Math.abs(Math.round(value)).toLocaleString()}`;
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
