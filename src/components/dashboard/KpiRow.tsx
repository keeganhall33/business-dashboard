import type { MarketingCommandMetricDelta, MetaAdsSnapshot, WebsiteConversionSnapshot } from "@/lib/types/dashboard";

const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export type KpiRowProps = {
  metricDeltas?: MarketingCommandMetricDelta[];
  website?: WebsiteConversionSnapshot | null;
  meta?: MetaAdsSnapshot | null;
  rangeLabel: string;
};

export function KpiRow({ metricDeltas = [], website, meta, rangeLabel }: KpiRowProps) {
  const deltaMap = new Map(metricDeltas.map((delta) => [delta.metric, delta]));

  const cards: KpiCardProps[] = [
    buildCard("Revenue", deltaMap.get("woo_revenue"), "usd"),
    buildCard("Orders", deltaMap.get("woo_orders")),
    buildCard("Sessions", deltaMap.get("sessions")),
    buildCard("Add to cart", deltaMap.get("add_to_cart")),
    buildCard("Begin checkout", deltaMap.get("begin_checkout")),
    buildCard("Purchases", deltaMap.get("woo_purchases") ?? deltaMap.get("ecommerce_purchases")),
    buildCard("Conversion rate", deltaMap.get("conversion_rate"), "percent"),
    buildCard("Average order value", deltaMap.get("woo_aov"), "usd"),
    buildCard("Meta spend", deltaMap.get("meta_spend"), "usd"),
    buildCard("Meta ROAS", deltaMap.get("meta_roas"))
  ];

  // fallback populators when delta missing
  const fallback = {
    revenue: website?.wooCommerce?.totalRevenue ?? null,
    orders: website?.wooCommerce?.orderCount ?? null,
    sessions: website?.ga4?.sessions ?? null,
    add_to_cart: website?.ga4?.addToCartEvents ?? null,
    begin_checkout: website?.ga4?.beginCheckoutEvents ?? null,
    purchases: website?.ga4?.ecommercePurchases ?? null,
    conversion_rate: null,
    woo_aov: website?.wooCommerce?.averageOrderValue ?? null,
    meta_spend: meta?.summary?.spend ?? null,
    meta_roas: meta?.summary?.roas ?? null
  } as Record<string, number | null | undefined>;

  const resolvedCards = cards.map((card) => {
    if (card.currentValue == null && fallback[card.metricKey]) {
      return { ...card, currentValue: fallback[card.metricKey] ?? null };
    }
    return card;
  });

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
      <div className="mb-4 flex items-center justify-between text-xs uppercase tracking-[0.3em] text-zinc-500">
        <span>Key KPIs</span>
        <span>{rangeLabel}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {resolvedCards.map((card) => (
          <KpiCard key={card.label} {...card} />
        ))}
      </div>
    </div>
  );
}

type KpiCardProps = {
  label: string;
  currentValue: number | null;
  previousValue: number | null;
  absoluteChange: number | null;
  percentChange: number | null;
  unit?: "usd" | "percent" | null;
  metricKey: string;
};

function buildCard(label: string, delta?: MarketingCommandMetricDelta, unit?: "usd" | "percent" | null): KpiCardProps {
  return {
    label,
    currentValue: toNumber(delta?.currentValue) ?? null,
    previousValue: toNumber(delta?.previousValue) ?? null,
    absoluteChange: toNumber(delta?.absoluteChange) ?? null,
    percentChange: toNumber(delta?.percentChange) ?? null,
    unit: unit ?? (delta?.unit === "usd" ? "usd" : delta?.unit === "percent" ? "percent" : null),
    metricKey: delta?.metric ?? label.toLowerCase().replace(/\s+/g, "_")
  } satisfies KpiCardProps;
}

function KpiCard({ label, currentValue, previousValue, absoluteChange, percentChange, unit }: KpiCardProps) {
  const hasDelta = absoluteChange != null || percentChange != null;
  const direction = percentChange == null ? (absoluteChange == null ? "flat" : absoluteChange >= 0 ? "up" : "down") : percentChange >= 0 ? "up" : "down";

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{formatValue(currentValue, unit)}</p>
      <div className="mt-1 text-xs text-zinc-400">
        {previousValue != null ? <span>Prev: {formatValue(previousValue, unit)}</span> : <span>Prev: —</span>}
      </div>
      {hasDelta ? (
        <div className="mt-2 flex items-center gap-2 text-sm">
          <DeltaBadge direction={direction} />
          <span className="text-white">{formatDelta(absoluteChange, percentChange, unit)}</span>
        </div>
      ) : (
        <div className="mt-2 text-sm text-zinc-500">No change data</div>
      )}
    </div>
  );
}

function DeltaBadge({ direction }: { direction: "up" | "down" | "flat" }) {
  const label = direction === "up" ? "UP" : direction === "down" ? "DOWN" : "FLAT";
  const color = direction === "up" ? "text-emerald-300 bg-emerald-500/10" : direction === "down" ? "text-rose-300 bg-rose-500/10" : "text-zinc-300 bg-zinc-600/20";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${color}`}>{label}</span>;
}

function formatValue(value: number | null, unit?: "usd" | "percent" | null) {
  if (value == null) return "—";
  if (unit === "usd") return currencyFormatter.format(value);
  if (unit === "percent") return `${numberFormatter.format(value)}%`;
  return numberFormatter.format(value);
}

function formatDelta(absolute: number | null, percent: number | null, unit?: "usd" | "percent" | null) {
  const parts: string[] = [];
  if (absolute != null) {
    parts.push(`${absolute >= 0 ? "+" : ""}${formatValue(Math.abs(absolute), unit)}`);
  }
  if (percent != null) {
    parts.push(`${percent >= 0 ? "+" : ""}${numberFormatter.format(percent)}%`);
  }
  return parts.length ? parts.join(" / ") : "No change";
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}
