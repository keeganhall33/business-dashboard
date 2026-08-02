"use client";

import type { WebsiteConversionSnapshot } from "@/lib/types/dashboard";
import { StatusChip } from "./ui/StatusChip";
import { formatRelativeTimeFromNow } from "@/lib/date";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const decimalCurrency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

type Props = {
  snapshot?: WebsiteConversionSnapshot | null;
  range?: { startDate: string; endDate: string };
};

export function WebsiteConversionPanel({ snapshot, range }: Props) {
  const ga4 = snapshot?.ga4;
  const woo = snapshot?.wooCommerce;
  const generatedLabel = snapshot?.generatedAt ? formatRelativeTimeFromNow(snapshot.generatedAt) : "Unavailable";
  const observedPaid = woo?.observedPaidRange ?? null;
  const selectedWindow = range ? `${range.startDate} → ${range.endDate}` : null;
  const observedWindow = observedPaid?.earliestPaid && observedPaid?.latestPaid
    ? `${observedPaid.earliestPaid} → ${observedPaid.latestPaid}`
    : "Unavailable";
  const rangeMismatch = Boolean(selectedWindow && observedWindow && selectedWindow !== observedWindow);
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
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Latest website snapshot</div>
          <div className="mt-1 text-sm text-zinc-400">GA4 + WooCommerce snapshot (separate from selected-range telemetry).</div>
          <div className="text-xs text-zinc-500">Last updated: {generatedLabel}</div>
          {selectedWindow ? <div className="text-xs text-zinc-500">Selected range {selectedWindow}</div> : null}
          <div className="text-xs text-zinc-500">Snapshot window {observedWindow}</div>
        </div>
        <StatusChip label="Snapshot" tone="zinc" />
      </div>

      {rangeMismatch ? (
        <div className="rounded-2xl border border-amber-300/30 bg-amber-400/5 p-3 text-xs text-amber-100">
          Snapshot window differs from the selected range. Treat this as latest-snapshot evidence, not selected-range truth.
        </div>
      ) : null}

      {hasFunnelGap ? (
        <div className="rounded-2xl border border-amber-300/30 bg-amber-400/5 p-3 text-xs text-amber-100">
          Optional GA4 {funnelLabel} is unavailable. Purchase conversion remains available via Woo orders / GA4 sessions.
        </div>
      ) : null}

      <details className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <summary className="cursor-pointer select-none text-sm font-semibold text-zinc-200">Show snapshot detail</summary>
        <div className="mt-5 space-y-5">
          {ga4 ? <Ga4Section data={ga4} /> : <EmptyState title="GA4 offline" detail="Website agent could not load GA4 metrics." />}
          {woo ? <WooSection data={woo} /> : <EmptyState title="WooCommerce offline" detail="Unable to load latest order data." />}
        </div>
      </details>
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
          {data.purchaseRevenue != null ? (
            <StatusChip label={`GA4 revenue ${currency.format(Number(data.purchaseRevenue))}`} tone="emerald" />
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
  const revenue = data.totalRevenue ?? data.netRevenue ?? data.grossOrderRevenue ?? null;
  const orders = data.orderCount ?? data.paidOrdersInWindow ?? null;
  const aov =
    data.averageOrderValue ??
    (revenue != null && orders != null && orders > 0 ? revenue / orders : null);
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold text-zinc-200">Sales</div>
        <div className="flex flex-wrap gap-2">
          <StatusChip
            label={`Latest Woo snapshot ${revenue == null ? "Unavailable" : currency.format(revenue)}`}
            tone={revenue == null ? "zinc" : "emerald"}
          />
          <StatusChip label={`Orders ${orders == null ? "Unavailable" : formatNumber(orders)}`} tone="zinc" />
          <StatusChip label={`AOV ${aov == null ? "Unavailable" : decimalCurrency.format(aov)}`} tone="sky" />
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
            {(data.recentOrders ?? []).slice(0, 5).map((order) => (
              <li key={order.id} className="rounded-xl border border-white/5 bg-black/30 px-3 py-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-300">{formatOrderIdentifier(order)}</span>
                  <span className="text-zinc-400">{order.total == null ? "Unavailable" : decimalCurrency.format(order.total)}</span>
                </div>
                <div className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">
                  {formatOrderMeta(order)}
                </div>
              </li>
            ))}
            {!data.recentOrders?.length ? <li className="text-xs text-zinc-500">No orders in range</li> : null}
          </ul>
        </div>
      </div>
    </div>
  );
}

function formatOrderIdentifier(order: NonNullable<NonNullable<WebsiteConversionSnapshot["wooCommerce"]>["recentOrders"]>[number]) {
  // Production snapshots do not reliably persist buyer identity fields.
  // Use the order number/id as the primary identifier and omit any "Unknown customer" filler.
  const orderNumber = (order as unknown as { number?: string | number | null; order_number?: string | number | null }).number ??
    (order as unknown as { order_number?: string | number | null }).order_number;
  if (orderNumber != null && String(orderNumber).trim()) return `Order #${String(orderNumber).trim()}`;
  if (order.id != null && String(order.id).trim()) return `Order #${String(order.id).trim()}`;
  return "Order";
}

function formatOrderMeta(order: NonNullable<NonNullable<WebsiteConversionSnapshot["wooCommerce"]>["recentOrders"]>[number]) {
  const rawDate = order.date ?? order.date_paid ?? order.date_paid_gmt ?? null;
  const dateLabel = rawDate ? safeShortDate(rawDate) : "Unknown date";
  const statusLabel = order.status ? order.status : "Unknown status";
  return `${dateLabel} · ${statusLabel}`;
}

function safeShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
