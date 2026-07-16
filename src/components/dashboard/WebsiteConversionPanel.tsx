"use client";

import type { CommerceTelemetry, WebsiteConversionSnapshot } from "@/lib/types/dashboard";
import { StatusChip } from "./ui/StatusChip";
import { formatRelativeTimeFromNow } from "@/lib/date";
import { RevenueInsightSection } from "./RevenueInsightSection";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const decimalCurrency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

type Props = {
  snapshot?: WebsiteConversionSnapshot | null;
  telemetry?: CommerceTelemetry;
};

export function WebsiteConversionPanel({ snapshot, telemetry }: Props) {
  const ga4 = snapshot?.ga4;
  const woo = snapshot?.wooCommerce;
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
      {ga4 ? <Ga4Section data={ga4} /> : <EmptyState title="GA4 offline" detail="Website agent could not load GA4 metrics." />}
      {woo ? <WooSection data={woo} /> : <EmptyState title="WooCommerce offline" detail="Unable to load latest order data." />}
    </section>
  );
}

function Ga4Section({
  data
}: {
  data: NonNullable<WebsiteConversionSnapshot["ga4"]>;
}) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold text-zinc-200">Traffic & funnel</div>
        <div className="flex flex-wrap gap-2">
          <StatusChip label={`Users ${formatNumber(data.totalUsers)}`} tone="sky" />
          <StatusChip label={`Sessions ${formatNumber(data.sessions)}`} />
          <StatusChip label={`Purchases ${formatNumber(data.ecommercePurchases)}`} tone="emerald" />
          {Number(data.purchaseRevenue) ? (
            <StatusChip label={`Revenue ${currency.format(Number(data.purchaseRevenue))}`} tone="emerald" />
          ) : null}
          {data.warnings?.map((warning) => (
            <StatusChip key={warning} label={warning} tone="amber" />
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <BreakdownCard title="Device mix" items={data.deviceBreakdown} />
        <BreakdownCard title="Channel mix" items={data.channelBreakdown} />
      </div>
    </div>
  );
}

function WooSection({
  data
}: {
  data: NonNullable<WebsiteConversionSnapshot["wooCommerce"]>;
}) {
  const orders = data.paidOrdersInWindow ?? 0;
  const revenue = data.netRevenue ?? data.grossOrderRevenue ?? 0;
  const aov = data.grossAov ?? (orders ? revenue / orders : 0);
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold text-zinc-200">Sales</div>
        <div className="flex flex-wrap gap-2">
          <StatusChip label={`Revenue ${currency.format(revenue ?? 0)}`} tone="emerald" />
          <StatusChip label={`Orders ${formatNumber(orders)}`} tone="zinc" />
          <StatusChip label={`AOV ${decimalCurrency.format(aov || 0)}`} tone="sky" />
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">Top products</div>
          <ul className="mt-3 space-y-2 text-sm text-zinc-200">
            {(data.topProducts ?? []).slice(0, 5).map((product) => (
              <li key={product.name} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/30 px-3 py-2">
                <span className="text-zinc-300">{product.name}</span>
                <span className="text-zinc-400">
                  {product.units} × {decimalCurrency.format(product.revenue ?? 0)}
                </span>
              </li>
            ))}
            {!data.topProducts?.length ? <li className="text-xs text-zinc-500">No product data</li> : null}
          </ul>
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">Recent orders</div>
          <ul className="mt-3 space-y-2 text-sm text-zinc-200">
            {(data.recentOrders ?? []).slice(0, 5).map((order, idx) => {
              const paidIso = order.date_paid || order.date_paid_gmt;
              const paidLabel = paidIso
                ? new Date(paidIso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                : "Unknown date";
              return (
                <li key={`${order.id ?? paidIso ?? `order-${idx}`}`} className="rounded-xl border border-white/5 bg-black/30 px-3 py-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-300">{`Order #${order.id ?? "n/a"}`}</span>
                    <span className="text-zinc-400">{decimalCurrency.format(order.total ?? 0)}</span>
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">
                    {paidLabel}
                    {order.status ? ` · ${order.status}` : null}
                  </div>
                </li>
              );
            })}
            {!data.recentOrders?.length ? <li className="text-xs text-zinc-500">No orders in range</li> : null}
          </ul>
        </div>
      </div>
    </div>
  );
}

function BreakdownCard({
  title,
  items
}: {
  title: string;
  items?: Array<{ label?: string; sessions?: number } | undefined>;
}) {
  if (!items || !items.length) {
    return <EmptyState title={`${title} unavailable`} detail="No GA4 data." />;
  }

  return (
    <div className="rounded-2xl border border-white/5 bg-black/20 p-3">
      <div className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">{title}</div>
      <div className="mt-3 space-y-2 text-sm text-zinc-200">
        {items.map((item) => (
          <div key={`${title}-${item?.label ?? "unknown"}`} className="flex items-center justify-between">
            <span>{item?.label ?? "Unknown"}</span>
            <span className="text-zinc-400">{formatNumber(item?.sessions)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-black/30 p-4 text-sm text-zinc-400">
      <div className="font-semibold text-zinc-300">{title}</div>
      <div className="text-xs uppercase tracking-[0.25em] text-zinc-500">{detail}</div>
    </div>
  );
}

function formatNumber(value?: number | null) {
  if (value == null) return "–";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}
