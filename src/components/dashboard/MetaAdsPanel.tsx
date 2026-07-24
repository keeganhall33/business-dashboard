"use client";

import type { MetaAdsSnapshot } from "@/lib/types/dashboard";
import { StatusChip } from "./ui/StatusChip";
import { formatRelativeTimeFromNow } from "@/lib/date";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const preciseCurrency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export function MetaAdsPanel({ snapshot }: { snapshot?: MetaAdsSnapshot | null }) {
  if (!snapshot) {
    return (
      <section className="ui-glass rounded-3xl border border-dashed border-white/10 p-5 text-sm text-zinc-400">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Meta Ads</div>
        <div className="mt-2 text-sm">Meta reporting not configured yet.</div>
      </section>
    );
  }

  const updatedLabel = formatRelativeTimeFromNow(snapshot.generatedAt);
  const summary = snapshot.summary;
  const spend = summary.spend ?? 0;
  const purchaseValue = summary.purchaseValue ?? 0;
  const roas = summary.roas ?? null;
  const purchases = summary.purchases ?? 0;
  const impressions = summary.impressions ?? 0;
  const clicks = summary.clicks ?? 0;
  const ctr = clicks && impressions ? (clicks / impressions) * 100 : null;
  const cpc = clicks ? spend / clicks : null;
  const campaigns = snapshot.campaigns ?? [];
  const topCampaigns = campaigns.slice(0, 4);
  const singleCampaign = campaigns.length === 1;
  const lowPurchaseVolume = purchases < 3;

  return (
    <section className="ui-glass space-y-5 rounded-3xl p-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Meta performance</p>
          <p className="text-sm text-zinc-400">Spend vs revenue over the last {snapshot.range} days.</p>
          <p className="text-xs text-zinc-500">Last updated {updatedLabel}</p>
        </div>
        <StatusChip label={`Account ${snapshot.accountId}`} tone="zinc" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Spend vs purchase value</p>
          <div className="mt-3 space-y-2">
            <ValueBar label="Spend" value={spend} tone="emerald" baseline={Math.max(spend, purchaseValue, 1)} />
            <ValueBar label="Purchase value" value={purchaseValue} tone="sky" baseline={Math.max(spend, purchaseValue, 1)} />
          </div>
          <p className="mt-3 text-sm text-zinc-400">Net: {currency.format(purchaseValue - spend)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">ROAS & scale check</p>
          <p className="mt-2 text-3xl font-semibold text-white">{roas != null ? `${roas.toFixed(2)}x` : "—"}</p>
          <p className="text-sm text-zinc-400">{purchases} purchases reported</p>
          {lowPurchaseVolume ? (
            <p className="mt-2 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              Purchase sample is thin. Hold off on scaling until Meta logs ≥3 purchases.
            </p>
          ) : null}
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm text-zinc-300">
          <Stat label="CTR" value={ctr != null ? `${ctr.toFixed(2)}%` : "—"} />
          <Stat label="CPC" value={cpc != null ? preciseCurrency.format(cpc) : "—"} />
          <Stat label="Impressions" value={formatNumber(impressions)} />
          <Stat label="Clicks" value={formatNumber(clicks)} />
        </div>
      </div>

      {singleCampaign ? (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Only one campaign is spending. Rotate creative or spin up a test campaign to avoid fatigue.
        </div>
      ) : null}

      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Campaign comparison</p>
        {topCampaigns.length ? (
          <div className="mt-3 space-y-2">
            {topCampaigns.map((campaign) => (
              <div key={campaign.campaignId} className="rounded-2xl border border-white/8 bg-black/25 px-3 py-3 text-sm">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white">{campaign.campaignName}</span>
                  <span className="text-zinc-400">{currency.format(campaign.spend ?? 0)}</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-white/10">
                  <div
                    className="h-2 rounded-full bg-sky-400"
                    style={{ width: spend ? `${Math.min(((campaign.spend ?? 0) / spend) * 100, 100)}%` : "0%" }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-400">
                  <span>{formatNumber(campaign.impressions)} imp</span>
                  <span>{formatNumber(campaign.clicks)} clicks</span>
                  <span>CTR {formatPercent(campaign.ctr)}</span>
                  <span>ROAS {formatRoas(campaign.roas)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-2 rounded-2xl border border-dashed border-white/10 bg-black/20 p-3 text-sm text-zinc-500">No active campaigns reported.</div>
        )}
      </div>

      <p className="text-xs text-zinc-500">Directional reporting only. No publishing, budget, or billing actions run through this agent.</p>
    </section>
  );
}

function formatNumber(value?: number | null) {
  if (value == null) return "–";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

function formatRoas(value?: number | null) {
  if (value == null) return "–";
  return value >= 100 ? `${value.toFixed(0)}x` : value >= 10 ? `${value.toFixed(1)}x` : `${value.toFixed(2)}x`;
}

function formatPercent(value?: number | null) {
  if (value == null) return "–";
  return `${value.toFixed(2)}%`;
}

function ValueBar({ label, value, tone, baseline }: { label: string; value: number; tone: "emerald" | "sky"; baseline: number }) {
  const width = baseline ? Math.min((value / baseline) * 100, 100) : 0;
  const toneClass = tone === "emerald" ? "bg-emerald-400" : "bg-sky-400";
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span>{label}</span>
        <span className="text-white">{currency.format(value)}</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-white/10">
        <div className={`h-2 rounded-full ${toneClass}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 py-1 last:border-b-0">
      <span className="text-xs uppercase tracking-[0.3em] text-zinc-500">{label}</span>
      <span className="text-white">{value}</span>
    </div>
  );
}
