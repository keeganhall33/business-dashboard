"use client";

import type { CommerceTelemetry, WebsiteConversionSnapshot } from "@/lib/types/dashboard";
import { StatusChip } from "./ui/StatusChip";
import { formatRelativeTimeFromNow } from "@/lib/date";
import { RevenueInsightSection } from "./RevenueInsightSection";

type Props = {
  snapshot?: WebsiteConversionSnapshot | null;
  telemetry?: CommerceTelemetry;
};

export function WebsiteConversionPanel({ snapshot, telemetry }: Props) {
  const ga4 = snapshot?.ga4;
  const generatedLabel = snapshot?.generatedAt ? formatRelativeTimeFromNow(snapshot.generatedAt) : "unknown";
  const missingAddToCart = ga4?.addToCartEvents == null;
  const missingBeginCheckout = ga4?.beginCheckoutEvents == null;
  const hasFunnelGap = Boolean(missingAddToCart || missingBeginCheckout);
  const funnelLabel =
    missingAddToCart && missingBeginCheckout
      ? "`add_to_cart` and `begin_checkout` events"
      : missingAddToCart
        ? "`add_to_cart` event"
        : "`begin_checkout` event";

  return (
    <section className="ui-glass ui-glass-hover space-y-5 rounded-3xl p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Website & Conversion</div>
          <div className="mt-1 text-sm text-zinc-400">GA4 + WooCommerce automation snapshot.</div>
          <div className="text-xs text-zinc-500">Last updated {generatedLabel}</div>
        </div>
        <StatusChip label="Live telemetry" tone="emerald" />
      </div>

      {hasFunnelGap ? (
        <div className="rounded-2xl border border-amber-300/30 bg-amber-400/5 p-3 text-xs text-amber-100">
          Optional GA4 {funnelLabel} is still unavailable. Website data is LIVE, but funnel drop-off insights stay disabled until GA4 instrumentation is
          fixed. These metrics remain best-effort and will continue to warn instead of blocking the run.
        </div>
      ) : null}

      <RevenueInsightSection snapshot={snapshot} telemetry={telemetry} />
    </section>
  );
}
