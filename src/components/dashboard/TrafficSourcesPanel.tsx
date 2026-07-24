"use client";

import type { WebsiteConversionSnapshot } from "@/lib/types/dashboard";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from "recharts";
import { StatusChip } from "./ui/StatusChip";

const COLORS = ["#38bdf8", "#818cf8", "#f472b6", "#facc15", "#34d399", "#fb7185", "#a855f7"];

const percentFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

type Props = {
  website?: WebsiteConversionSnapshot | null;
};

export function TrafficSourcesPanel({ website }: Props) {
  const channels = normalizeChannels(website);
  const devices = normalizeDevices(website);

  if (!channels.length) {
    return (
      <section className="rounded-3xl border border-dashed border-white/10 bg-black/30 p-6 text-sm text-zinc-300">
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Traffic sources</p>
        <p className="mt-2">GA4 channel breakdown unavailable. Run `op run --env-file=.env --env-file=.env.website -- pnpm website:run` to refresh website telemetry.</p>
      </section>
    );
  }

  const totalSessions = channels.reduce((sum, channel) => sum + channel.sessions, 0);
  const recommendation = buildTrafficRecommendation(channels);

  return (
    <section className="rounded-3xl border border-white/10 bg-black/30 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Traffic sources</p>
          <p className="text-sm text-zinc-400">Channel + device mix · Window {formatRangeLabel(website)}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-zinc-400">
          <StatusChip label={`Sessions ${totalSessions.toLocaleString()}`} tone="zinc" />
          <StatusChip label="No channel-level conversion" tone="amber" />
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Sessions by channel</p>
          <div className="mt-3 h-48">
            <ResponsiveContainer>
              <BarChart data={channels} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <XAxis type="number" hide />
                <YAxis
                  dataKey="label"
                  type="category"
                  width={110}
                  tick={{ fill: "#a1a1aa", fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: "#050505", borderColor: "#27272a" }}
                  formatter={(raw, name, item) => {
                    const value = typeof raw === "number" ? raw : Number(raw ?? 0);
                    const share = item && !Array.isArray(item) ? item.payload?.share ?? 0 : 0;
                    return [`${value.toLocaleString()} sessions (${formatPercent(share)})`, item && !Array.isArray(item) ? item.payload?.label ?? String(name) : String(name)];
                  }}
                />
                <Bar dataKey="sessions" radius={[0, 6, 6, 0]}>
                  {channels.map((entry, index) => (
                    <Cell key={entry.label} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Device mix</p>
          <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row">
            <div className="h-40 w-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={devices} dataKey="sessions" innerRadius={45} outerRadius={70} paddingAngle={3}>
                    {devices.map((entry, index) => (
                      <Cell key={entry.label} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-2 text-sm text-zinc-300">
              {devices.map((device, index) => (
                <div key={device.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span className="font-semibold capitalize text-white">{device.label}</span>
                  </div>
                  <span className="text-zinc-400">{formatPercent(device.share)}</span>
                </div>
              ))}
              {!devices.length ? <p className="text-xs text-zinc-500">Device data unavailable.</p> : null}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <InsightCard title="What changed" body={recommendation.whatChanged} />
        <InsightCard title="Why it matters" body={recommendation.whyItMatters} />
        <InsightCard title="What to do next" body={recommendation.nextStep} />
      </div>

      <div className="mt-4 rounded-2xl border border-dashed border-amber-300/30 bg-amber-500/10 p-3 text-xs text-amber-100">
        GA4 purchase-by-channel data is not ingested yet. Use this panel to direct attention, not to claim attribution. Run an expanded GA4 query or extend `website:run` before making conversion decisions per channel.
      </div>
    </section>
  );
}

type ChannelRow = {
  label: string;
  sessions: number;
  share: number;
};

type DeviceRow = {
  label: string;
  sessions: number;
  share: number;
};

function normalizeChannels(website?: WebsiteConversionSnapshot | null): ChannelRow[] {
  const raw = website?.ga4?.channelBreakdown ?? [];
  const total = raw.reduce((sum, item) => sum + (Number(item.sessions) || 0), 0);
  return raw
    .map((item) => {
      const sessions = Number(item.sessions) || 0;
      return {
        label: item.label ?? "Other",
        sessions,
        share: total > 0 ? (sessions / total) * 100 : 0
      };
    })
    .filter((item) => item.sessions > 0)
    .sort((a, b) => b.sessions - a.sessions);
}

function normalizeDevices(website?: WebsiteConversionSnapshot | null): DeviceRow[] {
  const raw = website?.ga4?.deviceBreakdown ?? [];
  const total = raw.reduce((sum, item) => sum + (Number(item.sessions) || 0), 0);
  return raw
    .map((item) => {
      const sessions = Number(item.sessions) || 0;
      return {
        label: item.label ?? "other",
        sessions,
        share: total > 0 ? (sessions / total) * 100 : 0
      };
    })
    .filter((item) => item.sessions > 0)
    .sort((a, b) => b.sessions - a.sessions);
}

function buildTrafficRecommendation(channels: ChannelRow[]) {
  const top = channels[0];
  const paid = channels.find((channel) => /paid/i.test(channel.label));
  const organic = channels.find((channel) => /organic/i.test(channel.label) && !/shopping/i.test(channel.label));

  const whatChanged = top
    ? `${top.label} now accounts for ${formatPercent(top.share)} of sessions (${top.sessions.toLocaleString()} visits).`
    : "Traffic mix unchanged.";

  let whyItMatters = "Concentration in one channel makes revenue fragile.";
  if (paid && paid.share < 10) {
    whyItMatters = "Paid social is contributing under 10% of sessions, so Meta data stays thin.";
  } else if (organic && organic.share > 25) {
    whyItMatters = "Organic discovery is carrying the load; keep SEO/PR momentum high.";
  }

  let nextStep = "Allocate attention to the next-highest quality channel before scaling spend.";
  if (paid && paid.share < 5) {
    nextStep = "Run a controlled paid test to lift Paid Social above 10% of sessions.";
  } else if (!paid) {
    nextStep = "Reintroduce a measurable paid channel so we can attribute wins.";
  } else if (top && /direct/i.test(top.label)) {
    nextStep = "Reduce dependence on Direct by promoting a collector story via email + paid.";
  }

  return { whatChanged, whyItMatters, nextStep };
}

function InsightCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">{title}</p>
      <p className="mt-2 text-sm text-zinc-100">{body}</p>
    </div>
  );
}

function formatPercent(value: number) {
  return `${percentFormatter.format(value)}%`;
}

function formatRangeLabel(website?: WebsiteConversionSnapshot | null) {
  const start = website?.wooCommerce?.windowStart;
  const end = website?.wooCommerce?.windowEnd;
  if (start && end) return `${start} → ${end}`;
  const days = website?.wooCommerce?.rangeDays;
  if (days) return `Last ${days} days`;
  return "current window";
}
