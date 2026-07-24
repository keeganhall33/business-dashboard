'use client';

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type SeriesPoint = {
  date?: string | null;
  revenue?: number | null;
  orders?: number | null;
};

export type RevenueTrendChartProps = {
  series?: SeriesPoint[] | null;
};

type Point = {
  date: string;
  revenue: number;
  orders: number;
  aov: number | null;
};

export function RevenueTrendChart({ series }: RevenueTrendChartProps) {
  const points: Point[] = (series ?? []).map((point) => {
    const revenue = Number(point.revenue ?? 0);
    const orders = Number(point.orders ?? 0);
    return {
      date: point.date ?? "",
      revenue,
      orders,
      aov: orders > 0 ? revenue / orders : null
    };
  });

  if (!points.length) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5 text-sm text-zinc-500">Revenue timeseries unavailable.</div>
    );
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
      <div className="mb-4 flex items-center justify-between text-xs uppercase tracking-[0.3em] text-zinc-500">
        <span>Revenue & orders</span>
        <span>WooCommerce · daily</span>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer>
          <AreaChart data={points} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="rgb(255,255,255)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="rgb(255,255,255)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis yAxisId="left" stroke="rgba(255,255,255,0.4)" width={48} tickFormatter={(value) => `$${Math.round(value / 1000)}k`} />
            <YAxis yAxisId="right" orientation="right" stroke="rgba(255,255,255,0.3)" width={32} tickFormatter={(value) => `${value}` as string} />
            <Tooltip content={<ChartTooltip />} />
            <Area yAxisId="left" type="monotone" dataKey="revenue" stroke="#fbbf24" fillOpacity={1} fill="url(#revenueArea)" strokeWidth={2} />
            <Area yAxisId="right" type="monotone" dataKey="orders" stroke="#60a5fa" fill="rgba(96,165,250,0.15)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

type ChartTooltipProps = {
  active?: boolean;
  payload?: Array<{ payload: Point }>;
};

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const point: Point = payload[0].payload;
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/90 px-4 py-2 text-sm text-white shadow-lg">
      <p className="text-xs text-zinc-400">{point.date}</p>
      <p className="font-semibold">Revenue: ${point.revenue.toLocaleString()}</p>
      <p>Orders: {point.orders.toLocaleString()}</p>
      <p>AOV: {point.aov != null ? `$${Math.round(point.aov)}` : "—"}</p>
    </div>
  );
}
