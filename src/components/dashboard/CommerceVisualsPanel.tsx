"use client";

import { CommerceTelemetry } from "@/lib/types/dashboard";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  // Ensure deterministic SSR/CSR output. We feed dates as `YYYY-MM-DDT00:00:00Z`.
  timeZone: "UTC"
});

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

function formatDateLabel(value: string) {
  if (!value) return value;
  return dateFormatter.format(new Date(`${value}T00:00:00Z`));
}

type Props = {
  telemetry?: CommerceTelemetry;
};

export function CommerceVisualsPanel({ telemetry }: Props) {
  if (!telemetry) return null;

  const revenueSeries = (telemetry.woo?.timeseries ?? []).map((point) => ({
    date: point.date,
    revenue: Number(point.revenue ?? 0),
    orders: Number(point.orders ?? 0)
  }));

  const trafficSeries = (telemetry.ga4?.timeseries ?? []).map((point) => ({
    date: point.date,
    sessions: Number(point.sessions ?? 0),
    engagedSessions: Number(point.engagedSessions ?? 0)
  }));

  const funnelSeries = (telemetry.funnel?.timeseries ?? []).map((point) => ({
    date: point.date,
    conversionRate: Number(point.conversionRate ?? 0)
  }));

  const revenueSummary = telemetry.woo?.summary;
  const funnelSummary = telemetry.funnel?.summary;

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Commerce Telemetry</div>
          <div className="mt-1 text-sm text-zinc-400">
            {telemetry.range.startDate} → {telemetry.range.endDate}
          </div>
        </div>
        {revenueSummary && (
          <div className="flex gap-6 text-sm text-zinc-300">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Revenue</div>
              <div className="text-lg font-semibold text-white">
                {currencyFormatter.format(Number(revenueSummary.revenue ?? 0))}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Orders</div>
              <div className="text-lg font-semibold text-white">{Number(revenueSummary.orders ?? 0)}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">AOV</div>
              <div className="text-lg font-semibold text-white">
                {currencyFormatter.format(Number(revenueSummary.avgOrderValue ?? 0))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 chart-grid">
        <div className="rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900/70 to-zinc-900 p-4">
          <div className="text-sm text-zinc-400">Revenue & Orders</div>
          <div className="mt-3 h-56">
            {revenueSeries.length ? (
              <ResponsiveContainer>
                <LineChart data={revenueSeries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="date" tickFormatter={formatDateLabel} stroke="#52525b" fontSize={12} tickLine={false} />
                  <YAxis yAxisId="left" stroke="#52525b" fontSize={12} tickLine={false} tickFormatter={(value) => `$${value}`} />
                  <YAxis yAxisId="right" orientation="right" stroke="#52525b" fontSize={12} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0a0a0a", borderColor: "#27272a" }}
                    labelFormatter={(value) => formatDateLabel(String(value))}
                    formatter={(value, name) => {
                      const numeric = Number(value ?? 0);
                      if (name === "Revenue") {
                        return [currencyFormatter.format(numeric), name];
                      }
                      return [numeric.toLocaleString(), name];
                    }}
                  />
                  <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#38bdf8" strokeWidth={2} yAxisId="left" dot={false} />
                  <Line type="monotone" dataKey="orders" name="Orders" stroke="#f472b6" strokeWidth={2} yAxisId="right" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState label="No revenue data" />
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900/70 to-zinc-900 p-4">
          <div className="text-sm text-zinc-400">Traffic & Engagement</div>
          <div className="mt-3 h-56">
            {trafficSeries.length ? (
              <ResponsiveContainer>
                <AreaChart data={trafficSeries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="sessions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="engaged" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="date" tickFormatter={formatDateLabel} stroke="#52525b" fontSize={12} tickLine={false} />
                  <YAxis stroke="#52525b" fontSize={12} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0a0a0a", borderColor: "#27272a" }}
                    labelFormatter={(value) => formatDateLabel(String(value))}
                    formatter={(value, name) => [Number(value ?? 0).toLocaleString(), name]}
                  />
                  <Area type="monotone" dataKey="sessions" name="Traffic" stroke="#22d3ee" fillOpacity={1} fill="url(#sessions)" />
                  <Area type="monotone" dataKey="engagedSessions" name="Engaged Sessions" stroke="#a855f7" fillOpacity={1} fill="url(#engaged)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState label="No traffic data" />
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm text-zinc-400">Funnel Conversion</div>
            {funnelSummary ? (
              <div className="mt-1 text-3xl font-semibold text-white">
                {(Number(funnelSummary.conversionRate ?? 0)).toFixed(1)}%
              </div>
            ) : (
              <div className="mt-1 text-zinc-500">No funnel data</div>
            )}
          </div>
          <div className="flex gap-6 text-sm text-zinc-300">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Entries</div>
              <div className="text-lg font-semibold text-white">{Number(funnelSummary?.entries ?? 0)}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Completions</div>
              <div className="text-lg font-semibold text-white">{Number(funnelSummary?.completions ?? 0)}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Upsell Take Rate</div>
              <div className="text-lg font-semibold text-white">
                {(Number(funnelSummary?.upsellTakeRate ?? 0)).toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 h-32">
          {funnelSeries.length ? (
            <ResponsiveContainer>
              <LineChart data={funnelSeries} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="date" tickFormatter={formatDateLabel} stroke="#52525b" fontSize={11} tickLine={false} />
                <YAxis stroke="#52525b" fontSize={11} tickLine={false} tickFormatter={(value) => `${value}%`} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0a0a0a", borderColor: "#27272a" }}
                  labelFormatter={(value) => formatDateLabel(String(value))}
                  formatter={(value) => [`${Number(value ?? 0).toFixed(2)}%`, "Conversion"]}
                />
                <Line type="monotone" dataKey="conversionRate" stroke="#fbbf24" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState label="No conversion trend" />
          )}
        </div>
      </div>
    </section>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-zinc-800 text-sm text-zinc-500">
      {label}
    </div>
  );
}
