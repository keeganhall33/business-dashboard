import type { MetaAdsSnapshot, WebsiteConversionSnapshot, WooSummary } from "@/lib/types/dashboard";
import { SourceRangeLabel } from "./ui/SourceRangeLabel";

const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export type FunnelDecisionPanelProps = {
  websiteSnapshot?: WebsiteConversionSnapshot | null;
  wooSummary?: WooSummary | null;
  metaSnapshot?: MetaAdsSnapshot | null;
  trackingIncomplete: boolean;
  sourceMismatch: boolean;
  rangeLabel: string;
};

export function FunnelDecisionPanel({ websiteSnapshot, wooSummary, metaSnapshot, trackingIncomplete, sourceMismatch, rangeLabel }: FunnelDecisionPanelProps) {
  if (!websiteSnapshot && !metaSnapshot) {
    return null;
  }

  const missingStages = extractMissingStages(websiteSnapshot);
  const paidSpend = metaSnapshot?.summary?.spend ?? 0;
  const paidPurchases = metaSnapshot?.summary?.purchases ?? 0;
  const paidStatement = paidSpend
    ? paidPurchases
      ? `Meta spend ${formatCurrency(paidSpend)} with ${paidPurchases} purchases (ROAS ${formatRoas(metaSnapshot?.summary?.roas)}).`
      : `Meta spend ${formatCurrency(paidSpend)} produced 0 purchases — hold budget until tracking + creative reset.`
    : "Paid spend is paused in this window.";

  const decision = "Do not scale spend yet.";
  const nextMove = paidPurchases
    ? "Fix attribution and checkout trust gaps before scaling."
    : "Fix attribution + creative before reintroducing spend.";

  return (
    <section className="rounded-3xl border border-white/10 bg-black/30 p-6" data-testid="funnel-decision-panel">
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-zinc-500">Funnel & paid decision</p>
          <p className="text-sm text-zinc-400">Directional read only — tracking is incomplete.</p>
          <SourceRangeLabel
            source="GA4 + Woo + Meta snapshots"
            range="Latest 7d snapshot"
            confidence="directional only"
            note="Ignores dashboard range until GA4 + Meta history is backfilled"
          />
        </div>
        <p className="text-xs text-zinc-500">Range: {rangeLabel}</p>
      </div>

      <ul className="mt-4 space-y-2 text-sm text-zinc-200">
        <li>
          <strong className="text-white">Tracking:</strong> {trackingIncomplete ? "Incomplete" : sourceMismatch ? "Woo vs GA4 mismatch" : "Aligned"}
          {missingStages.length ? ` · Missing ${missingStages.join(", ")}` : null}
        </li>
        <li>
          <strong className="text-white">Woo:</strong> {wooSummary?.orders != null ? `${wooSummary.orders} orders · ${formatCurrency(wooSummary.revenue ?? 0)} revenue` : "Reliable order truth"}
        </li>
        <li>
          <strong className="text-white">GA4 funnel:</strong> Directional only until add_to_cart, begin_checkout, and purchase events reconcile.
        </li>
        <li>
          <strong className="text-white">Paid:</strong> {paidStatement}
        </li>
      </ul>

      <div className="mt-4 rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-sm text-zinc-100">
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Decision</p>
        <p className="text-base font-semibold text-white">{decision}</p>
        <p className="text-sm text-zinc-300">{nextMove}</p>
        <p className="mt-2 text-xs text-amber-200">Next: repair GA4 events, confirm Woo checkout trust, refresh creative before adding budget.</p>
      </div>
    </section>
  );
}

function extractMissingStages(snapshot?: WebsiteConversionSnapshot | null) {
  if (!snapshot?.ga4) return ["all GA4 events"];
  const missing: string[] = [];
  if (snapshot.ga4.addToCartEvents == null) missing.push("add_to_cart");
  if (snapshot.ga4.beginCheckoutEvents == null) missing.push("begin_checkout");
  if (snapshot.ga4.ecommercePurchases == null) missing.push("purchase");
  return missing;
}

function formatCurrency(value?: number | null) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value ?? 0);
}

function formatRoas(value?: number | null) {
  if (value == null) return "n/a";
  return `${value.toFixed(2)}x`;
}
