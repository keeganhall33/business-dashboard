"use client";

import type { MetaAdsSnapshot } from "@/lib/types/dashboard";
import { StatusChip } from "./ui/StatusChip";
import { formatRelativeTimeFromNow } from "@/lib/date";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const decimalCurrency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

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
  const campaigns = snapshot.campaigns ?? [];
  const topCampaigns = campaigns.slice(0, 5);

  const deliveryAvailable =
    snapshot.summary.spend != null ||
    snapshot.summary.impressions != null ||
    snapshot.summary.clicks != null;
  const attributionAvailable = snapshot.summary.purchases != null || snapshot.summary.roas != null;

  const purchases = snapshot.summary.purchases;
  const purchaseCopy = !attributionAvailable
    ? "Purchase attribution unavailable for this window."
    : purchases && purchases > 0
      ? `${formatNumber(purchases)} Meta-reported purchases`
      : "No Meta-reported purchases in this window.";

  return (
    <section className="ui-glass rounded-3xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Meta Ads</div>
          <div className="text-sm text-zinc-400">Campaign-level spend over the last {snapshot.range} days.</div>
          <div className="text-xs text-zinc-500">Last updated {updatedLabel}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip label={`Account ${snapshot.accountId}`} tone="zinc" />
          <a
            href="/dashboard/logs/meta_ads_agent.log"
            className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-300 hover:text-sky-200"
          >
            LOG
          </a>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Kpi label="Spend" value={deliveryAvailable ? currency.format(snapshot.summary.spend ?? 0) : "Unavailable"} tone="emerald" />
        <Kpi label="Impressions" value={deliveryAvailable ? formatNumber(snapshot.summary.impressions) : "Unavailable"} />
        <Kpi label="Clicks" value={deliveryAvailable ? formatNumber(snapshot.summary.clicks) : "Unavailable"} />
        <Kpi label="CTR" value={deliveryAvailable ? formatPercent(getCtr(snapshot.summary)) : "Unavailable"} tone="sky" />
        <Kpi label="CPC" value={deliveryAvailable ? formatCurrencyMaybe(getCpc(snapshot.summary)) : "Unavailable"} />
        <Kpi label="ROAS" value={attributionAvailable ? formatRoas(snapshot.summary.roas) : "Not attributable"} tone="sky" />
      </div>

      <div className="mt-3 rounded-2xl border border-dashed border-white/10 bg-black/20 p-3 text-xs text-zinc-400">
        {purchaseCopy} Delivery metrics may be live while attribution is unavailable. Meta ROAS is reported as-is from Meta Ads Manager and may differ from GA4 or WooCommerce attribution.
      </div>

      <div className="mt-5">
        <div className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">Top campaigns</div>
      <div className="mt-3 space-y-2">
        {topCampaigns.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-500">No active campaigns reported.</div>
        ) : (
          topCampaigns.map((campaign) => (
              <div key={campaign.campaignId} className="rounded-2xl border border-white/8 bg-black/25 px-3 py-2 text-sm">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-200">{campaign.campaignName}</span>
                  <span className="text-zinc-400">{currency.format(campaign.spend ?? 0)}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-zinc-500">
                  <span>{formatNumber(campaign.impressions)} imp</span>
                  <span>{formatNumber(campaign.clicks)} clicks</span>
                  <span>CTR {formatPercent(campaign.ctr)}</span>
                  <span>ROAS {formatRoas(campaign.roas)}</span>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="mt-3 rounded-2xl border border-dashed border-white/10 bg-black/20 p-3 text-xs text-zinc-400">
          Purchases/ROAS unavailable? Meta conversions may not be configured or may attribute elsewhere.
        </div>
      </div>
      <div className="mt-4 text-xs text-zinc-500">
        Directional reporting only. No publishing, budget, or billing actions run through this agent.
      </div>
    </section>
  );
}

function Kpi({ label, value, tone = "zinc" }: { label: string; value: string; tone?: "zinc" | "emerald" | "sky" }) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
      : tone === "sky"
      ? "border-sky-400/30 bg-sky-400/10 text-sky-100"
      : "border-white/10 bg-white/[0.03] text-zinc-100";
  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${toneClass}`}>
      <div className="text-xs uppercase tracking-[0.3em] text-white/70">{label}</div>
      <div className="mt-1 text-xl">{value}</div>
    </div>
  );
}

function formatNumber(value?: number | null) {
  if (value == null) return "–";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

function formatPercent(value?: number | null) {
  if (value == null) return "–";
  return `${value.toFixed(2)}%`;
}

function formatRoas(value?: number | null) {
  if (value == null) return "–";
  return value >= 100 ? `${value.toFixed(0)}x` : value >= 10 ? `${value.toFixed(1)}x` : `${value.toFixed(2)}x`;
}

function getCtr(summary: MetaAdsSnapshot["summary"]) {
  if (!summary.impressions) return null;
  return (summary.clicks / summary.impressions) * 100;
}

function getCpc(summary: MetaAdsSnapshot["summary"]) {
  if (summary.clicks == null || summary.clicks <= 0) return null;
  if (summary.spend == null) return null;
  return summary.spend / summary.clicks;
}

function formatCurrencyMaybe(value: number | null) {
  if (value == null) return "–";
  return decimalCurrency.format(value);
}
