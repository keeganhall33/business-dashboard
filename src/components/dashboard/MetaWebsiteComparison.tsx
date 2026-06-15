"use client";

import type { MetaAdsSnapshot, WebsiteConversionSnapshot } from "@/lib/types/dashboard";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function MetaWebsiteComparison({
  meta,
  website
}: {
  meta?: MetaAdsSnapshot | null;
  website?: WebsiteConversionSnapshot | null;
}) {
  if (!meta || !website) {
    return (
      <section className="ui-glass rounded-3xl border border-dashed border-white/10 p-5 text-sm text-zinc-400">
        Directional comparison not available yet.
      </section>
    );
  }

  const metaSpend = meta.summary.spend ?? 0;
  const metaClicks = meta.summary.clicks ?? 0;
  const metaImpressions = meta.summary.impressions ?? 0;
  const gaSessions = website.ga4?.sessions ?? 0;
  const wooRevenue = website.wooCommerce?.totalRevenue ?? 0;
  const wooOrders = website.wooCommerce?.orderCount ?? 0;
  const blendedRoas = metaSpend ? wooRevenue / metaSpend : null;

  return (
    <section className="ui-glass rounded-3xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Meta ↔ Website</div>
          <div className="text-sm text-zinc-400">Directional comparison only. Meta, GA4, and WooCommerce attribution may differ.</div>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Metric label="Meta spend" value={currency.format(metaSpend)} />
        <Metric label="Meta clicks" value={formatNumber(metaClicks)} />
        <Metric label="Meta impressions" value={formatNumber(metaImpressions)} />
        <Metric label="GA4 sessions" value={formatNumber(gaSessions)} />
        <Metric label="Woo revenue" value={currency.format(wooRevenue)} />
        <Metric label="Woo orders" value={formatNumber(wooOrders)} />
        <Metric label="Blended ROAS" value={blendedRoas == null ? "–" : `${blendedRoas.toFixed(2)}x`} />
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-zinc-100">
      <div className="text-xs uppercase tracking-[0.3em] text-white/60">{label}</div>
      <div className="mt-1 text-lg">{value}</div>
    </div>
  );
}

function formatNumber(value?: number | null) {
  if (value == null) return "–";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}
