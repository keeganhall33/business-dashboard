import { LuxuryCollectibleKpis } from "@/lib/types/dashboard";
import { ProgressBar } from "./ui/ProgressBar";

type Props = {
  data?: LuxuryCollectibleKpis;
};

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

export function LuxuryCollectiblesKpiPanel({ data }: Props) {
  if (!data) return null;

  const sellThroughTarget = clampPct(data.premiumEdition.targetSellThroughPercent);
  const sellThroughActual = clampPct(data.premiumEdition.actualSellThroughPercent);

  const timeToSellDeltaDays =
    typeof data.premiumEdition.timeToSell.avgDaysCurrent === "number" &&
    typeof data.premiumEdition.timeToSell.avgDaysPrior === "number"
      ? data.premiumEdition.timeToSell.avgDaysCurrent - data.premiumEdition.timeToSell.avgDaysPrior
      : null;

  const evidenceHealth = data.proofOfWork.evidenceHealthPercent != null ? clampPct(data.proofOfWork.evidenceHealthPercent) : null;
  const priceRealization = realizationPct(data.pricingLadder.avgSellingPriceUsd, data.pricingLadder.floorPriceUsd);

  return (
    <section className="ui-glass ui-glass-hover rounded-3xl p-6">
      <div className="flex items-center gap-3">
        <span className="ui-status-dot" data-tone="amber" />
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Luxury Collectible KPIs</div>
      </div>

      <div className="mt-4 space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-zinc-400">Premium edition sell-through</div>
            <div className="text-xs uppercase tracking-[0.14em] text-zinc-500">Target {sellThroughTarget.toFixed(0)}%</div>
          </div>
          <div className="mt-2 flex items-end justify-between gap-4">
            <div className="text-3xl font-semibold text-zinc-50">{sellThroughActual.toFixed(0)}%</div>
            <div className="text-right text-xs text-zinc-400">
              {data.premiumEdition.timeToSell.avgDaysCurrent != null ? (
                <div>
                  Time-to-sell {data.premiumEdition.timeToSell.avgDaysCurrent}d
                  {timeToSellDeltaDays != null ? (
                    <span className={timeToSellDeltaDays <= 0 ? "text-emerald-300" : "text-amber-300"}>
                      {" "}
                      ({timeToSellDeltaDays <= 0 ? "" : "+"}
                      {timeToSellDeltaDays}d)
                    </span>
                  ) : null}
                </div>
              ) : (
                <div>Time-to-sell —</div>
              )}
            </div>
          </div>
          <div className="mt-3">
            <ProgressBar value={sellThroughActual} tone={sellThroughActual >= sellThroughTarget ? "emerald" : "amber"} className="bg-black/25" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="text-sm text-zinc-400">VIP collectors</div>
            <div className="mt-2 text-3xl font-semibold text-zinc-50">{data.vipCollectors.total}</div>
            <div className="mt-1 text-xs uppercase tracking-[0.14em] text-zinc-500">
              +{data.vipCollectors.growth30d} in 30d • Retention {data.vipCollectors.retentionPercent != null ? `${clampPct(data.vipCollectors.retentionPercent).toFixed(0)}%` : "—"}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="text-sm text-zinc-400">Proof cadence</div>
            <div className="mt-2 text-3xl font-semibold text-zinc-50">{data.proofOfWork.deliverablesCompletedPerWeek}/wk</div>
            <div className="mt-1 text-xs uppercase tracking-[0.14em] text-zinc-500">
              Evidence health {evidenceHealth != null ? `${evidenceHealth.toFixed(0)}%` : "—"}
            </div>
            {evidenceHealth != null ? (
              <div className="mt-3">
                <ProgressBar value={evidenceHealth} tone={evidenceHealth >= 85 ? "emerald" : evidenceHealth >= 70 ? "amber" : "rose"} className="bg-black/25" />
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="text-sm text-zinc-400">Institutional / hospitality pipeline</div>
          <div className="mt-2 flex items-baseline justify-between gap-3">
            <div className="text-3xl font-semibold text-zinc-50">{data.institutionalPipeline.activeOpportunities}</div>
            <div className="text-sm text-zinc-300">{moneyFormatter.format(data.institutionalPipeline.totalValueUsd)} total</div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs uppercase tracking-[0.14em] text-zinc-500">Pricing ladder realization</div>
            <div className="text-xs text-zinc-400">
              Avg {moneyFormatter.format(data.pricingLadder.avgSellingPriceUsd)} vs floor {moneyFormatter.format(data.pricingLadder.floorPriceUsd)}
              {priceRealization != null ? (
                <span className={priceRealization >= 150 ? "text-emerald-300" : "text-amber-300"}> • {priceRealization.toFixed(0)}%</span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function clampPct(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function realizationPct(avgPrice: number, floorPrice: number) {
  if (!Number.isFinite(avgPrice) || !Number.isFinite(floorPrice) || floorPrice <= 0) return null;
  return (avgPrice / floorPrice) * 100;
}
