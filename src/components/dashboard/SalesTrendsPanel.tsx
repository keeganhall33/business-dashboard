"use client";

import type { CommerceTelemetry, PerformanceBaseline } from "@/lib/types/dashboard";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { StatusChip } from "./ui/StatusChip";
import { RangeBadge } from "./ui/RangeBadge";
import type { RangeMeta } from "./types";
import { formatWooFallbackDetail } from "@/lib/dashboard/woo-range";

const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const percentFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

type Props = {
  telemetry?: CommerceTelemetry | null;
  baseline?: PerformanceBaseline | null;
  rangeMeta?: RangeMeta;
};

type MetricConfig = {
  key: "revenue" | "orders" | "aov" | "conversion";
  label: string;
  unit: "usd" | "count" | "percent";
};

const METRICS: MetricConfig[] = [
  { key: "revenue", label: "Revenue", unit: "usd" },
  { key: "orders", label: "Orders", unit: "count" },
  { key: "aov", label: "Average order value", unit: "usd" },
  { key: "conversion", label: "Conversion", unit: "percent" }
];

export function SalesTrendsPanel({ telemetry, baseline, rangeMeta }: Props) {
  if (!telemetry) {
    return (
      <section className="rounded-3xl border border-dashed border-white/10 bg-black/30 p-6 text-sm text-zinc-400">
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Sales trends</p>
        <p className="mt-2 text-sm text-zinc-300">Commerce telemetry unavailable. Run `op run --env-file=.env --env-file=.env.website -- pnpm website:run` to refresh Woo + GA4 data.</p>
      </section>
    );
  }

  const revenueSeries = (telemetry.woo?.timeseries ?? []).map((point) => ({
    date: point.date,
    value: Number(point.revenue ?? 0)
  }));

  const ordersSeries = (telemetry.woo?.timeseries ?? []).map((point) => ({
    date: point.date,
    value: Number(point.orders ?? 0)
  }));

  const aovSeries = (telemetry.woo?.timeseries ?? []).map((point) => ({
    date: point.date,
    value: point.orders ? Number(point.revenue ?? 0) / Math.max(1, Number(point.orders ?? 0)) : 0
  }));

  const conversionSeries = (telemetry.funnel?.timeseries ?? []).map((point) => ({
    date: point.date,
    value: Number(point.conversionRate ?? 0)
  }));

  const summaries = buildMetricSummaries(baseline);
  const guidance = buildGuidance(summaries);
  const confidence = buildConfidence(telemetry);
  const wooFallbackDetail = formatWooFallbackDetail(telemetry.woo?.range ?? null);
  const wooBucketSize = telemetry.woo?.range?.bucketSize ?? "day";

  const chartMap = {
    revenue: revenueSeries,
    orders: ordersSeries,
    aov: aovSeries,
    conversion: conversionSeries
  } as const;

  return (
    <section className="rounded-3xl border border-white/10 bg-black/30 p-6" data-testid="sales-trends-panel">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Sales trends</p>
          <p className="text-sm text-zinc-400">Woo + GA4 over the active window.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-zinc-400">
          <RangeBadge
            label={rangeMeta?.label ?? `${telemetry.range.startDate} → ${telemetry.range.endDate}`}
            description={rangeMeta?.detail ?? "Commerce telemetry window"}
          />
          {confidence ? <StatusChip label={confidence.label} tone={confidence.tone} /> : null}
          {wooFallbackDetail ? (
            <span title={wooFallbackDetail}>
              <StatusChip label="Woo data partial" tone="amber" />
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {METRICS.map((config) => (
          <TrendCard
            key={config.key}
            label={config.label}
            unit={config.unit}
            summary={summaries[config.key]}
            data={chartMap[config.key] ?? []}
            bucketSize={config.key === "conversion" ? "day" : wooBucketSize}
          />
        ))}
      </div>

      <div className="mt-6 rounded-3xl border border-white/5 bg-white/[0.02] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Current vs previous window</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {METRICS.map((config) => (
            <SummaryRow key={config.key} label={config.label} summary={summaries[config.key]} unit={config.unit} />
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <InsightCard title="What changed" body={guidance.whatChanged ?? "Trend pending fresh baseline."} />
        <InsightCard title="Why it matters" body={guidance.whyItMatters ?? "Unable to compare windows; refresh scoreboard."} />
        <InsightCard title="What to do next" body={guidance.nextStep ?? "Hold steady until telemetry refresh completes."} />
      </div>
    </section>
  );
}

type TrendCardProps = {
  label: string;
  data: Array<{ date: string; value: number }>;
  unit: MetricConfig["unit"];
  summary: MetricSummary;
  bucketSize: "day" | "week" | "month";
};

function TrendCard({ label, data, unit, summary, bucketSize }: TrendCardProps) {
  const formatter = unit === "usd" ? currencyFormatter : unit === "percent" ? percentFormatter : numberFormatter;
  const current = summary.current != null ? formatter.format(summary.current) + (unit === "percent" ? "%" : "") : "–";
  const trend = summary.percentDelta;
  const trendLabel = trend != null ? `${trend > 0 ? "+" : ""}${percentFormatter.format(trend)}%` : "n/a";
  const trendTone = trend == null ? "text-zinc-500" : trend >= 0 ? "text-emerald-300" : "text-rose-300";

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between text-sm text-zinc-300">
        <span>{label}</span>
        <span className={trendTone}>{trendLabel}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold text-white">{current}</div>
      <div className="mt-3 h-28">
        {data.length ? (
          <ResponsiveContainer>
            <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <defs>
              <linearGradient id={`${label}-gradient`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.45} />
                <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" hide tickFormatter={(value) => formatBucketLabel(String(value), bucketSize)} />
            <Tooltip
              contentStyle={{ backgroundColor: "#050505", borderColor: "#27272a" }}
              labelFormatter={(value) => formatBucketLabel(String(value), bucketSize)}
              formatter={(raw) => {
                const numeric = typeof raw === "number" ? raw : Array.isArray(raw) ? Number(raw[0]) : Number(raw ?? 0);
                const safeValue = Number.isFinite(numeric) ? numeric : 0;
                return [`${formatter.format(safeValue)}${unit === "percent" ? "%" : ""}`, label];
              }}
              />
              <Area type="monotone" dataKey="value" stroke="#38bdf8" fillOpacity={1} fill={`url(#${label}-gradient)`} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-zinc-500">No data</div>
        )}
      </div>
    </div>
  );
}

type MetricSummary = {
  current: number | null;
  previous: number | null;
  delta: number | null;
  percentDelta: number | null;
};

type MetricsSummary = Record<MetricConfig["key"], MetricSummary>;

function buildMetricSummaries(baseline?: PerformanceBaseline | null): MetricsSummary {
  const fallback: MetricSummary = { current: null, previous: null, delta: null, percentDelta: null };
  if (!baseline) {
    return {
      revenue: fallback,
      orders: fallback,
      aov: fallback,
      conversion: fallback
    };
  }

  const process = (snapshot?: { current: number | null; previous: number | null }): MetricSummary => {
    const current = snapshot?.current ?? null;
    const previous = snapshot?.previous ?? null;
    const delta = current != null && previous != null ? current - previous : null;
    const percentDelta = current != null && previous != null && previous !== 0 ? ((current - previous) / previous) * 100 : null;
    return { current, previous, delta, percentDelta };
  };

  return {
    revenue: process(baseline.revenue),
    orders: process(baseline.orders),
    aov: process(baseline.aov),
    conversion: process(baseline.conversion)
  };
}

type Guidance = {
  whatChanged: string | null;
  whyItMatters: string | null;
  nextStep: string | null;
};

function buildGuidance(summaries: MetricsSummary): Guidance {
  const priority = [...METRICS]
    .map((config) => ({
      key: config.key,
      label: config.label,
      unit: config.unit,
      summary: summaries[config.key]
    }))
    .filter(({ summary }) => summary.percentDelta != null && summary.current != null && summary.previous != null)
    .sort((a, b) => Math.abs(b.summary.percentDelta!) - Math.abs(a.summary.percentDelta!))[0];

  if (!priority) {
    return {
      whatChanged: null,
      whyItMatters: null,
      nextStep: null
    };
  }

  const formatter = priority.unit === "usd" ? currencyFormatter : priority.unit === "percent" ? percentFormatter : numberFormatter;
  const suffix = priority.unit === "percent" ? "%" : "";
  const direction = priority.summary.delta! >= 0 ? "up" : "down";
  const verb = direction === "up" ? "up" : "down";
  const whatChanged = `${priority.label} is ${verb} ${Math.abs(priority.summary.percentDelta!).toFixed(1)}% (${formatter.format(priority.summary.current!)} vs ${formatter.format(priority.summary.previous!)}${suffix}).`;

  let whyItMatters: string;
  if (priority.key === "conversion") {
    whyItMatters = "Conversion movement compounds across every campaign; even small drops erase revenue quickly.";
  } else if (priority.key === "orders") {
    whyItMatters = "Order volume dictates cash flow pace. Lower throughput means promos and launches miss targets.";
  } else if (priority.key === "aov") {
    whyItMatters = "AOV softness signals buyers choosing smaller pieces; margin gets compressed unless we reposition.";
  } else {
    whyItMatters = "Revenue is the scoreboard. Slippage here means the current tactics aren’t covering burn.";
  }

  let nextStep: string;
  if (priority.key === "conversion") {
    nextStep = "Run the Funnel Leak playbook: review shipping/tax surprises, checkout trust signals, and the promo promise.";
  } else if (priority.key === "orders") {
    nextStep = "Push one high-authority story to drive qualified sessions rather than broad reach.";
  } else if (priority.key === "aov") {
    nextStep = "Center higher-ticket bundles/commissions in the Promote channel for the next 48h.";
  } else {
    nextStep = "Hold promos until the leak is identified; use Command Feed actions before scaling spend.";
  }

  return { whatChanged, whyItMatters, nextStep };
}

type Confidence = { label: string; tone: "emerald" | "amber" | "rose" | "zinc" } | null;

function buildConfidence(telemetry: CommerceTelemetry): Confidence {
  const orders = telemetry.woo?.summary?.orders ?? null;
  if (orders == null) return null;
  if (orders < 10) return { label: "Data light — <10 orders", tone: "rose" };
  if (orders < 25) return { label: "Directional only", tone: "amber" };
  return { label: "Confident signal", tone: "emerald" };
}

type SummaryRowProps = {
  label: string;
  summary: MetricSummary;
  unit: MetricConfig["unit"];
};

function SummaryRow({ label, summary, unit }: SummaryRowProps) {
  const formatter = unit === "usd" ? currencyFormatter : unit === "percent" ? percentFormatter : numberFormatter;
  const suffix = unit === "percent" ? "%" : "";
  return (
    <div className="rounded-2xl border border-white/5 bg-black/30 p-4">
      <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">
        {summary.current != null ? `${formatter.format(summary.current)}${suffix}` : "–"}
      </p>
      <p className="text-xs text-zinc-400">
        Prev {summary.previous != null ? `${formatter.format(summary.previous)}${suffix}` : "–"}
      </p>
    </div>
  );
}

function InsightCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">{title}</p>
      <p className="mt-2 text-sm text-zinc-100">{body}</p>
    </div>
  );
}

function formatBucketLabel(value: string, bucketSize: "day" | "week" | "month") {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  if (bucketSize === "day") {
    return dateFormatter.format(parsed);
  }
  if (bucketSize === "week") {
    const end = new Date(parsed);
    end.setUTCDate(end.getUTCDate() + 6);
    return `Week of ${dateFormatter.format(parsed)} – ${dateFormatter.format(end)}`;
  }
  const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });
  return monthFormatter.format(parsed);
}
