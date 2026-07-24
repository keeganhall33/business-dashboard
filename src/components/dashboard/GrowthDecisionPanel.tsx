import type { PreparedAction, PromotionPlanner, PromotionRecommendation, CollectorRadar } from "@/lib/types/dashboard";
import { formatRelativeTimeFromNow } from "@/lib/date";
import { SourceRangeLabel } from "./ui/SourceRangeLabel";

export type GrowthDecisionItem = {
  key: string;
  label: string;
  title: string;
  summary: string;
  action: string;
  confidence?: "high" | "medium" | "low";
  source?: string;
  rangeLabel?: string;
};

type Props = {
  promotionPlanner?: PromotionPlanner | null;
  collectorRadar?: CollectorRadar | null;
  topPreparedActions: PreparedAction[];
  rangeLabel: string;
};

export function GrowthDecisionPanel({ promotionPlanner, collectorRadar, topPreparedActions, rangeLabel }: Props) {
  const decisions = buildDecisions({ promotionPlanner, collectorRadar, topPreparedActions, rangeLabel });

  if (!decisions.length) {
    return null;
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-black/30 p-6" data-testid="growth-decision-panel">
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Today's growth decision</p>
          <p className="text-sm text-zinc-400">Short-window push: move, revenue action, risk, and collector follow-up.</p>
          <SourceRangeLabel
            source="Promotion Planner + Prepared Actions + Collector Radar"
            range="Latest 7d snapshot"
            confidence="short-window signal"
            note="Ignores dashboard range until marketing backfills"
          />
        </div>
        <p className="text-xs text-zinc-500">Decision window: {rangeLabel}</p>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {decisions.map((item) => (
          <DecisionCard key={item.key} item={item} highlight={item.key === "primary"} />
        ))}
      </div>
    </section>
  );
}

type CardProps = {
  item: GrowthDecisionItem;
  highlight?: boolean;
};

function DecisionCard({ item, highlight }: CardProps) {
  return (
    <article className={`rounded-2xl border ${highlight ? "border-emerald-400/40 bg-emerald-500/5" : "border-white/10 bg-white/[0.02]"} p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-[0.3em] text-zinc-500">
        <span>{item.label}</span>
        {item.rangeLabel ? <span className="text-[11px] text-zinc-400">{item.rangeLabel}</span> : null}
      </div>
      <h3 className="mt-2 text-base font-semibold text-white">{item.title}</h3>
      <p className="mt-1 text-sm text-zinc-300">{item.summary}</p>
      <p className="mt-2 text-sm text-white">Action: {item.action}</p>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-zinc-400">
        {item.source ? <span>Source: {item.source}</span> : null}
        {item.confidence ? <span>Confidence: {item.confidence}</span> : null}
      </div>
    </article>
  );
}

function buildDecisions({
  promotionPlanner,
  collectorRadar,
  topPreparedActions,
  rangeLabel
}: {
  promotionPlanner?: PromotionPlanner | null;
  collectorRadar?: CollectorRadar | null;
  topPreparedActions: PreparedAction[];
  rangeLabel: string;
}): GrowthDecisionItem[] {
  const decisions: GrowthDecisionItem[] = [];

  const primaryRec = promotionPlanner?.recommendations?.find((rec) => rec.category === "PROMOTE_NOW") ?? promotionPlanner?.recommendations?.[0] ?? null;
  if (primaryRec) {
    decisions.push(recommendationToDecision(primaryRec, { key: "primary", label: "Primary move", rangeLabel }));
  }

  const topAction = topPreparedActions[0] ?? null;
  if (topAction) {
    decisions.push({
      key: "revenue",
      label: "Top revenue action",
      title: topAction.title,
      summary: topAction.whyItMatters,
      action: topAction.requiredApprovalAction,
      confidence: topAction.confidence,
      source: "Prepared action"
    });
  }

  const riskPick =
    promotionPlanner?.recommendations?.find((rec) => rec.category === "COOLING_OFF" || rec.category === "TRAFFIC_GAP") ??
    promotionPlanner?.recommendations?.find((rec) => rec.category === "HIDDEN_OPPORTUNITY") ??
    null;
  if (riskPick) {
    decisions.push(
      recommendationToDecision(riskPick, {
        key: "risk",
        label: "Top risk",
        rangeLabel
      })
    );
  }

  const collector = collectorRadar?.segments?.[0];
  if (collector) {
    decisions.push({
      key: "collector",
      label: "Customer follow-up",
      title: `Reach ${collector.displayName}`,
      summary: `${formatCurrency(collector.totalSpend)} · ${collector.orderCount} orders · Prefers ${(collector.products ?? []).slice(0, 2).join(", ") || "key heroes"}`,
      action: collector.suggestedAction,
      confidence: collector.confidence,
      source: "Collector radar"
    });
  }

  return decisions;
}

function recommendationToDecision(rec: PromotionRecommendation, {
  key,
  label,
  rangeLabel
}: {
  key: string;
  label: string;
  rangeLabel?: string;
}): GrowthDecisionItem {
  const lastSold = rec.lastSoldDate ? formatRelativeTimeFromNow(rec.lastSoldDate) : null;
  const metricParts = [rec.supportingMetric, lastSold ? `Last sold ${lastSold}` : undefined].filter(Boolean);
  return {
    key,
    label,
    title: rec.productName,
    summary: metricParts.join(" · ") || rec.reason,
    action: rec.suggestedAction,
    confidence: rec.confidence,
    source: "Woo telemetry",
    rangeLabel
  };
}

function formatCurrency(value?: number | null) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value ?? 0);
}
