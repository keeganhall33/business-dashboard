"use client";

import type { MetaAdsCampaign, MetaAdsSnapshot } from "@/lib/types/dashboard";
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip } from "recharts";
import { StatusChip } from "./ui/StatusChip";

const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const percentFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

type Props = {
  snapshot?: MetaAdsSnapshot | null;
};

export function PaidPerformancePanel({ snapshot }: Props) {
  if (!snapshot) {
    return (
      <section className="rounded-3xl border border-dashed border-white/10 bg-black/30 p-6 text-sm text-zinc-300">
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Paid performance</p>
        <p className="mt-2">Meta snapshot unavailable. Run `op run --env-file=.env --env-file=.env.website -- pnpm meta:run` to refresh spend + purchase telemetry.</p>
      </section>
    );
  }

  const summary = snapshot.summary ?? null;
  const spend = toNumber(summary?.spend) ?? 0;
  const impressions = toNumber(summary?.impressions) ?? 0;
  const clicks = toNumber(summary?.clicks) ?? 0;
  const purchases = toNumber(summary?.purchases) ?? 0;
  const purchaseValue = toNumber(summary?.purchaseValue) ?? 0;
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : null;
  const cpc = clicks > 0 ? spend / clicks : null;
  const roas = summary?.roas != null ? toNumber(summary.roas) : spend > 0 ? purchaseValue / spend : null;
  const costPerPurchase = purchases > 0 ? spend / purchases : null;
  const thinData = purchases < 3;
  const decision = buildDecision({ thinData, roas, spend, ctr });
  const guidance = buildGuidance({ thinData, roas, spend, purchases, ctr });
  const campaignRows = snapshot.campaigns?.slice(0, 4) ?? [];

  return (
    <section className="rounded-3xl border border-white/10 bg-black/30 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Paid performance (Meta)</p>
          <p className="text-sm text-zinc-400">Window: last {snapshot.range ?? 7} days · Account {snapshot.accountId}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-zinc-400">
          <StatusChip label={`Refreshed ${new Date(snapshot.generatedAt).toLocaleString()}`} tone="zinc" />
          <StatusChip label={decision.label} tone={decision.tone} />
          {thinData ? <StatusChip label="Data light — <3 purchases" tone="rose" /> : null}
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <MetricCard label="Spend" value={currencyFormatter.format(spend)} sublabel={`Purchases ${purchases}`} />
        <MetricCard label="Purchase value" value={currencyFormatter.format(purchaseValue)} sublabel={`ROAS ${formatNumber(roas)}x`} />
        <MetricCard
          label="Cost / purchase"
          value={costPerPurchase != null ? currencyFormatter.format(costPerPurchase) : "–"}
          sublabel={`CTR ${formatPercent(ctr)} · CPC ${cpc != null ? currencyFormatter.format(cpc) : "–"}`}
        />
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Spend vs purchase value</p>
        <div className="mt-3 h-32">
          <ResponsiveContainer>
            <BarChart data={[{ label: "Spend", value: spend }, { label: "Purchase value", value: purchaseValue }]} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
              <XAxis dataKey="label" stroke="#52525b" fontSize={12} tickLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "#050505", borderColor: "#27272a" }}
                formatter={(raw, name) => [`${currencyFormatter.format(Number(raw ?? 0))}`, name]}
              />
              <Bar dataKey="value" fill="#38bdf8" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <InsightCard title="What changed" body={guidance.whatChanged} />
        <InsightCard title="Why it matters" body={guidance.whyItMatters} />
        <InsightCard title="What to do next" body={guidance.nextStep} />
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Campaign drill-down</p>
          {!campaignRows.length ? <span className="text-xs text-zinc-500">Campaign-level stats not available in this snapshot.</span> : null}
        </div>
        {campaignRows.length ? (
          <div className="mt-3 grid gap-3">
            {campaignRows.map((campaign) => (
              <CampaignRow key={campaign.campaignId} campaign={campaign} thinData={thinData} />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

type CampaignRowProps = {
  campaign: MetaAdsCampaign;
  thinData: boolean;
};

function CampaignRow({ campaign, thinData }: CampaignRowProps) {
  const spend = toNumber(campaign.spend) ?? 0;
  const purchases = toNumber(campaign.purchases) ?? 0;
  const purchaseValue = toNumber(campaign.purchaseValue) ?? 0;
  const roas = campaign.roas != null ? toNumber(campaign.roas) : spend > 0 ? purchaseValue / spend : null;
  const ctr = toNumber(campaign.ctr);
  const cpc = toNumber(campaign.cpc);
  const decision = buildDecision({ thinData: thinData || purchases < 3, roas, spend, ctr });

  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-white">
        <span className="font-semibold">{campaign.campaignName}</span>
        <StatusChip label={decision.label} tone={decision.tone} />
      </div>
      <div className="mt-2 grid gap-3 text-xs text-zinc-400 md:grid-cols-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Spend</p>
          <p className="text-sm text-zinc-100">{currencyFormatter.format(spend)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Purchases</p>
          <p className="text-sm text-zinc-100">{purchasesLabel(purchases)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">ROAS</p>
          <p className="text-sm text-zinc-100">{roas != null ? `${formatNumber(roas)}x` : "–"}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">CTR / CPC</p>
          <p className="text-sm text-zinc-100">{`${formatPercent(ctr)} · ${cpc != null ? currencyFormatter.format(cpc) : "–"}`}</p>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, sublabel }: { label: string; value: string; sublabel?: string | null }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {sublabel ? <p className="text-xs text-zinc-400">{sublabel}</p> : null}
    </div>
  );
}

function InsightCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">{title}</p>
      <p className="mt-2 text-sm text-zinc-100">{body}</p>
    </div>
  );
}

function buildDecision({ thinData, roas, spend, ctr }: { thinData: boolean; roas: number | null; spend: number; ctr: number | null }) {
  if (thinData) {
    return { label: "Too thin to judge", tone: "amber" as const };
  }
  if (roas == null || Number.isNaN(roas)) {
    return { label: "Hold", tone: "zinc" as const };
  }
  if (roas >= 2) {
    return { label: "Scale", tone: "emerald" as const };
  }
  if (roas >= 1) {
    return { label: "Hold", tone: "zinc" as const };
  }
  if (roas >= 0.5 || (ctr != null && ctr >= 1)) {
    return { label: "Refresh creative", tone: "amber" as const };
  }
  if (spend > 0) {
    return { label: "Pause", tone: "rose" as const };
  }
  return { label: "Hold", tone: "zinc" as const };
}

function buildGuidance({ thinData, roas, spend, purchases, ctr }: { thinData: boolean; roas: number | null; spend: number; purchases: number; ctr: number | null }) {
  if (thinData) {
    return {
      whatChanged: `Only ${purchasesLabel(purchases)} purchase${purchases === 1 ? "" : "s"} recorded during this window.`,
      whyItMatters: "Scaling from two or fewer purchases produces false positives.",
      nextStep: "Let this run another 48h or pair Meta with a hero drop before scaling."
    };
  }
  const whatChanged = `Spend is ${currencyFormatter.format(spend)} with ROAS ${roas != null ? `${formatNumber(roas)}x` : "n/a"}.`;
  const whyItMatters = roas != null && roas < 1 ? "Meta is not covering spend this week; cash is better deployed elsewhere." : "Meta is pulling its weight; protect this channel while funnel issues are addressed.";
  let nextStep: string;
  if (roas != null && roas >= 2) {
    nextStep = "Scale budgets modestly (+15%) while the creative is working.";
  } else if (roas != null && roas >= 1) {
    nextStep = "Hold spend. Focus on funnel fixes so ROAS can break 2x before scaling.";
  } else if (roas != null && roas >= 0.5) {
    nextStep = "Refresh creative and landing narrative; re-measure after 3 days.";
  } else {
    nextStep = ctr != null && ctr < 1 ? "Pause spend and rebuild the hook before wasting impressions." : "Pause until the cart leak is fixed; then relaunch.";
  }
  return {
    whatChanged,
    whyItMatters,
    nextStep
  };
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

function formatPercent(value: number | null) {
  if (value == null || Number.isNaN(value)) return "–";
  return `${percentFormatter.format(value)}%`;
}

function formatNumber(value: number | null) {
  if (value == null || Number.isNaN(value)) return "–";
  return value.toFixed(2);
}

function purchasesLabel(purchases: number) {
  return purchases > 0 ? purchases.toString() : "0";
}
