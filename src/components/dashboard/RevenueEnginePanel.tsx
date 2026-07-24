import type {
  MarketingCommandProductMomentum,
  PromotionPlanner,
  PromotionRecommendation,
  WebsiteConversionSnapshot,
  WooProductPerformance,
  WooRangeMeta,
  WooSummary
} from "@/lib/types/dashboard";
import type { RangeMeta } from "./types";
import { formatWooFallbackDetail } from "@/lib/dashboard/woo-range";
import { SourceRangeLabel } from "./ui/SourceRangeLabel";

const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

type Props = {
  momentum?: MarketingCommandProductMomentum | null;
  wooProducts?: WooProductPerformance[] | null;
  wooSummary?: WooSummary | null;
  wooRange?: WooRangeMeta | null;
  fallbackSnapshot?: WebsiteConversionSnapshot | null;
  promotionPlanner?: PromotionPlanner | null;
  ranges: {
    woo: RangeMeta;
    marketing: RangeMeta;
  };
};

type ProductRow = {
  name: string;
  revenue: number;
  units: number;
};

type Callout = {
  key: string;
  label: string;
  title: string;
  detail: string;
  action: string;
};

export function RevenueEnginePanel({ momentum, wooProducts, wooSummary, wooRange, fallbackSnapshot, promotionPlanner, ranges }: Props) {
  const selectedRangeProducts = normalizeProducts(wooProducts);
  const fallbackProducts = normalizeSnapshotProducts(fallbackSnapshot);
  const products = selectedRangeProducts.length ? selectedRangeProducts : fallbackProducts;
  const topByRevenue = [...products].sort((a, b) => b.revenue - a.revenue).slice(0, 4);
  const topByUnits = [...products].sort((a, b) => b.units - a.units).slice(0, 4);
  const concentration = resolveConcentration(momentum, topByRevenue);

  const callouts = buildCallouts({ promotionPlanner, momentum, concentration });
  const wooRangeWarning = wooRange?.isFallback ? formatWooFallbackDetail(wooRange) ?? "Woo data is partial" : null;

  if (!products.length && !callouts.length) {
    return (
      <section className="rounded-3xl border border-dashed border-white/10 bg-black/30 p-6 text-sm text-zinc-300">
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Revenue engine</p>
        <p className="mt-2">Woo + promotion planner data missing. Refresh website + marketing snapshots.</p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-black/30 p-6" data-testid="revenue-engine-panel">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Revenue engine</p>
          <p className="text-sm text-zinc-400">Top products respect the selected range; promotion recs are short-window snapshots.</p>
          <SourceRangeLabel
            source="Woo products + Promotion Planner"
            range={`Woo ${ranges.woo.label} · Planner ${ranges.marketing.label}`}
            confidence="Woo = reliable · Planner = short-window"
            note="Planner ignores dashboard range until marketing history is backfilled"
          />
        </div>
        <div className="text-right text-xs text-zinc-500">
          <p>Woo window: {ranges.woo.label}</p>
          <p>Momentum: {ranges.marketing.label}</p>
        </div>
      </div>

      {wooRangeWarning ? <p className="mt-3 text-xs text-amber-200">{wooRangeWarning}</p> : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <ProductList title="Top products by revenue" products={topByRevenue} fallback={!selectedRangeProducts.length} />
          <ProductList title="Top products by units" products={topByUnits} fallback={!selectedRangeProducts.length} />
        </div>

        <div className="space-y-3">
          {callouts.map((callout) => (
            <CalloutCard key={callout.key} callout={callout} />
          ))}
          {concentration ? (
            <div className="rounded-2xl border border-amber-300/40 bg-amber-500/10 p-4 text-sm text-amber-50">
              <p className="text-xs uppercase tracking-[0.3em] text-amber-200">Revenue concentration</p>
              <p className="mt-1 font-semibold text-white">
                {concentration.topProduct} = {concentration.sharePercent.toFixed(1)}% of Woo revenue
              </p>
              <p className="text-xs text-amber-100/80">Stage a backup hero so one SKU doesn't control cash.</p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ProductList({ title, products, fallback }: { title: string; products: ProductRow[]; fallback: boolean }) {
  if (!products.length) {
    return (
      <section className="rounded-2xl border border-dashed border-white/10 bg-white/[0.01] p-4 text-sm text-zinc-400">
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">{title}</p>
        <p className="mt-2">No Woo product data in this range.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-zinc-500">
        <span>{title}</span>
        {fallback ? <span className="text-[11px] text-zinc-400">Snapshot fallback</span> : null}
      </div>
      <div className="mt-3 space-y-2">
        {products.map((product, index) => (
          <div key={`${product.name}-${index}`} className="flex items-center justify-between text-sm">
            <span className="text-white">{product.name}</span>
            <span className="text-zinc-300">
              {currencyFormatter.format(product.revenue)} · {product.units} units
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function CalloutCard({ callout }: { callout: Callout }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">{callout.label}</p>
      <h3 className="mt-1 text-base font-semibold text-white">{callout.title}</h3>
      <p className="text-sm text-zinc-300">{callout.detail}</p>
      <p className="mt-2 text-sm text-emerald-200">Next: {callout.action}</p>
    </article>
  );
}

function buildCallouts({
  promotionPlanner,
  momentum,
  concentration
}: {
  promotionPlanner?: PromotionPlanner | null;
  momentum?: MarketingCommandProductMomentum | null;
  concentration: { topProduct: string; sharePercent: number } | null;
}): Callout[] {
  const callouts: Callout[] = [];
  const usedProducts = new Set<string>();

  const promoteNow = pickUniqueRecommendation(promotionPlanner, usedProducts, (rec) => rec.category === "PROMOTE_NOW");
  if (promoteNow) {
    callouts.push({
      key: "primary",
      label: "Promote now",
      title: promoteNow.productName,
      detail: promoteNow.reason,
      action: promoteNow.suggestedAction
    });
  }

  const reliableSeller = pickUniqueRecommendation(promotionPlanner, usedProducts, (rec) => rec.category === "RELIABLE_SELLER");
  if (reliableSeller) {
    callouts.push({
      key: "reliable",
      label: "Reliable seller",
      title: reliableSeller.productName,
      detail: reliableSeller.supportingMetric ?? reliableSeller.reason,
      action: reliableSeller.suggestedAction
    });
  }

  const backupHero = pickUniqueRecommendation(
    promotionPlanner,
    usedProducts,
    (rec) => rec.category === "RISING_MOMENTUM" || rec.category === "HIDDEN_OPPORTUNITY"
  );
  if (backupHero) {
    callouts.push({
      key: "backup",
      label: "Backup hero",
      title: backupHero.productName,
      detail: backupHero.reason,
      action: backupHero.suggestedAction
    });
  }

  if (!backupHero && concentration) {
    callouts.push({
      key: "concentration",
      label: "Backup hero",
      title: "Diversify revenue",
      detail: `${concentration.topProduct} controls ${concentration.sharePercent.toFixed(1)}% of revenue.`,
      action: "Feature the next best seller in email + social."
    });
  }

  const momentumWinner = momentum?.winners?.find((winner) => !usedProducts.has(winner.name ?? ""));
  if (momentumWinner?.name) {
    usedProducts.add(momentumWinner.name);
    callouts.push({
      key: "winner",
      label: "Current winner",
      title: momentumWinner.name,
      detail: momentumWinner.revenueDeltaPercent != null ? `Revenue up ${momentumWinner.revenueDeltaPercent.toFixed(1)}% vs prior.` : "Momentum rising.",
      action: "Keep it pinned in Promote/Protect."
    });
  }

  return callouts;
}

function pickUniqueRecommendation(
  planner: PromotionPlanner | null | undefined,
  used: Set<string>,
  predicate: (rec: PromotionRecommendation) => boolean
) {
  if (!planner) return null;
  const target = planner.recommendations?.find((rec) => predicate(rec) && !used.has(rec.productName)) ?? null;
  if (target?.productName) {
    used.add(target.productName);
  }
  return target;
}

function normalizeProducts(wooProducts?: WooProductPerformance[] | null): ProductRow[] {
  return (wooProducts ?? [])
    .map((product, index) => ({
      name: product.name ?? `Product #${index + 1}`,
      revenue: Number(product.revenue ?? 0),
      units: Number(product.units ?? 0)
    }))
    .filter((item) => item.revenue > 0 || item.units > 0);
}

function normalizeSnapshotProducts(snapshot?: WebsiteConversionSnapshot | null): ProductRow[] {
  const products = snapshot?.wooCommerce?.topProducts ?? [];
  return products
    .map((product, index) => ({
      name: product.name ?? `Snapshot product #${index + 1}`,
      revenue: Number(product.revenue ?? 0),
      units: Number(product.units ?? 0)
    }))
    .filter((item) => item.revenue > 0 || item.units > 0);
}

function resolveConcentration(
  momentum?: MarketingCommandProductMomentum | null,
  topProducts: ProductRow[] = []
): { topProduct: string; sharePercent: number } | null {
  if (momentum?.concentration?.sharePercent && momentum.concentration.topProduct) {
    return { topProduct: momentum.concentration.topProduct, sharePercent: momentum.concentration.sharePercent };
  }
  if (!topProducts.length) return null;
  const total = topProducts.reduce((sum, product) => sum + product.revenue, 0);
  if (!total) return null;
  const [leader] = topProducts;
  const share = (leader.revenue / total) * 100;
  if (share < 40) return null;
  return { topProduct: leader.name, sharePercent: share };
}
