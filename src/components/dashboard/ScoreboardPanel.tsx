import type {
  DashboardOverviewResponse,
  MetaAdsSnapshot,
  WooSummary,
  CommerceTelemetry,
  WebsiteConversionSnapshot
} from "@/lib/types/dashboard";
import type { RangeMeta } from "./types";
import { formatWooFallbackDetail, formatWooRangeWindow } from "@/lib/dashboard/woo-range";
import { SourceRangeLabel } from "./ui/SourceRangeLabel";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

type Props = {
  data: DashboardOverviewResponse;
  wooRange: RangeMeta;
  scoreboardRange: RangeMeta;
  metaRange: RangeMeta;
};

type ScoreboardMetric = {
  key: string;
  label: string;
  value: string;
  context?: string;
  note?: string;
  tone?: "emerald" | "amber" | "rose" | "zinc";
};

export function ScoreboardPanel({ data, wooRange, scoreboardRange, metaRange }: Props) {
  const wooSummary = data.commerceTelemetry?.woo?.summary ?? null;
  const wooSnapshot = data.websiteConversion?.wooCommerce ?? null;
  const wooRangeMeta = data.commerceTelemetry?.woo?.range ?? null;
  const funnelSummary = (data.commerceTelemetry?.funnel ?? null) as CommerceTelemetry["funnel"] | null;
  const metaSnapshot = data.metaAds ?? null;
  const ga4Snapshot = data.websiteConversion?.ga4 ?? null;
  const wooFallbackDetail = formatWooFallbackDetail(wooRangeMeta);
  const rangeLabel = scoreboardRange.detail ?? scoreboardRange.label;
  const scoreboardNotes: string[] = [];
  if (wooFallbackDetail) scoreboardNotes.push("Woo range fallback");
  if (!funnelSummary?.summary?.conversionRate) scoreboardNotes.push("Conversion uses GA4 directional data");
  if (!(metaSnapshot?.summary?.purchases ?? 0)) scoreboardNotes.push("Paid metrics = spend signal only");
  const scoreboardConfidence = wooFallbackDetail ? "directional (snapshot fallback)" : "reliable";

  const metrics: ScoreboardMetric[] = [
    buildRevenueMetric({ wooSummary, wooSnapshot, scoreboardRange, wooFallbackDetail, wooRange, data }),
    buildOrdersMetric({ wooSummary, wooSnapshot, scoreboardRange, wooFallbackDetail }),
    buildAovMetric({ wooSummary, wooSnapshot, scoreboardRange, wooFallbackDetail }),
    buildConversionMetric({ funnelSummary, ga4Snapshot, wooSummary, scoreboardRange }),
    buildPaidSpendMetric({ metaSnapshot, metaRange }),
    buildPaidPurchaseMetric({ metaSnapshot })
  ].filter(Boolean) as ScoreboardMetric[];

  return (
    <section className="rounded-3xl border border-white/10 bg-black/20 p-6" data-testid="scoreboard-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Scoreboard</p>
          <p className="text-sm text-zinc-400">One-pass read on revenue, orders, funnel, and paid.</p>
          <SourceRangeLabel
            source="Woo + GA4 + Meta"
            range={rangeLabel}
            confidence={scoreboardConfidence}
            note={scoreboardNotes.length ? scoreboardNotes.join(" · ") : undefined}
          />
        </div>
        <p className="text-xs text-zinc-500">Range: {scoreboardRange.label}</p>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {metrics.map((metric) => (
          <article key={metric.key} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="text-xs uppercase tracking-[0.3em] text-zinc-500">{metric.label}</div>
            <p className={`mt-2 text-3xl font-semibold ${toneClass(metric.tone)}`}>{metric.value}</p>
            {metric.context ? <p className="text-xs text-zinc-400">{metric.context}</p> : null}
            {metric.note ? <p className="mt-2 text-xs text-amber-200">{metric.note}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

type MetricBuilderDeps = {
  wooSummary: WooSummary | null;
  wooSnapshot?: WebsiteConversionSnapshot["wooCommerce"] | null;
  scoreboardRange: RangeMeta;
  wooFallbackDetail?: string | null;
  wooRange?: RangeMeta;
  data?: DashboardOverviewResponse;
};

type ConversionDeps = {
  funnelSummary: CommerceTelemetry["funnel"] | null;
  ga4Snapshot?: WebsiteConversionSnapshot["ga4"] | null;
  wooSummary: WooSummary | null;
  scoreboardRange: RangeMeta;
};

type PaidDeps = {
  metaSnapshot: MetaAdsSnapshot | null;
  metaRange?: RangeMeta;
};

function buildRevenueMetric({ wooSummary, wooSnapshot, scoreboardRange, wooFallbackDetail, wooRange, data }: MetricBuilderDeps): ScoreboardMetric {
  const hasRangeValue = Boolean(wooSummary?.hasData && wooSummary.revenue != null);
  if (hasRangeValue) {
    return {
      key: "revenue",
      label: "Revenue",
      value: currency.format(wooSummary?.revenue ?? 0),
      context: `${scoreboardRange.label} · Woo truth`,
      tone: wooFallbackDetail ? "amber" : "emerald",
      note: wooFallbackDetail ?? undefined
    };
  }

  const snapshotValue = wooSnapshot?.totalRevenue ?? null;
  return {
    key: "revenue",
    label: "Revenue",
    value: snapshotValue != null ? currency.format(snapshotValue) : "Unavailable",
    context: snapshotValue != null ? `Latest snapshot (${formatWooRangeWindow(data?.commerceTelemetry?.woo?.range, data?.range.startDate, data?.range.endDate) ??
        wooRange?.label ?? "Woo snapshot"})` : "Woo snapshot missing",
    tone: snapshotValue != null ? "zinc" : "rose",
    note: wooFallbackDetail ?? "Refresh Woo snapshot to unlock the selected range."
  };
}

function buildOrdersMetric({ wooSummary, wooSnapshot, scoreboardRange, wooFallbackDetail }: MetricBuilderDeps): ScoreboardMetric {
  const hasRangeValue = Boolean(wooSummary?.hasData && wooSummary.orders != null);
  if (hasRangeValue) {
    return {
      key: "orders",
      label: "Orders",
      value: integer.format(wooSummary?.orders ?? 0),
      context: `${scoreboardRange.label} · Woo truth`,
      tone: wooFallbackDetail ? "amber" : "emerald",
      note: wooFallbackDetail ?? undefined
    };
  }
  const snapshotValue = wooSnapshot?.orderCount ?? null;
  return {
    key: "orders",
    label: "Orders",
    value: snapshotValue != null ? integer.format(snapshotValue) : "Unavailable",
    context: snapshotValue != null ? "Latest Woo snapshot" : "Woo snapshot missing",
    tone: snapshotValue != null ? "zinc" : "rose",
    note: wooFallbackDetail ?? undefined
  };
}

function buildAovMetric({ wooSummary, wooSnapshot, scoreboardRange, wooFallbackDetail }: MetricBuilderDeps): ScoreboardMetric {
  const hasRangeValue = Boolean(wooSummary?.hasData && wooSummary.avgOrderValue != null);
  if (hasRangeValue) {
    return {
      key: "aov",
      label: "AOV",
      value: currency.format(wooSummary?.avgOrderValue ?? 0),
      context: `${scoreboardRange.label} · Woo truth`,
      tone: wooFallbackDetail ? "amber" : "emerald",
      note: wooFallbackDetail ?? undefined
    };
  }
  const snapshotValue = wooSnapshot?.averageOrderValue ?? null;
  return {
    key: "aov",
    label: "AOV",
    value: snapshotValue != null ? currency.format(snapshotValue) : "Unavailable",
    context: snapshotValue != null ? "Latest Woo snapshot" : "Woo snapshot missing",
    tone: snapshotValue != null ? "zinc" : "rose",
    note: wooFallbackDetail ?? undefined
  };
}

function buildConversionMetric({ funnelSummary, ga4Snapshot, wooSummary, scoreboardRange }: ConversionDeps): ScoreboardMetric {
  const conversion = funnelSummary?.summary?.conversionRate ?? null;
  if (conversion != null) {
    return {
      key: "conversion",
      label: "Conversion",
      value: `${percent.format(conversion)}%`,
      context: `${scoreboardRange.label} · Funnel summary`,
      tone: "emerald"
    };
  }

  const sessions = ga4Snapshot?.sessions ?? null;
  const orders = wooSummary?.orders ?? null;
  const derived = sessions && orders ? (orders / sessions) * 100 : null;
  if (derived != null) {
    return {
      key: "conversion",
      label: "Conversion",
      value: `${percent.format(derived)}%`,
      context: "Derived from Woo orders / GA4 sessions",
      tone: "amber",
      note: "GA4 funnel incomplete — treat conversion as directional."
    };
  }

  return {
    key: "conversion",
    label: "Conversion",
    value: "Directional only",
    context: "GA4 funnel missing key events",
    tone: "rose"
  };
}

function buildPaidSpendMetric({ metaSnapshot, metaRange }: PaidDeps): ScoreboardMetric {
  if (!metaSnapshot) {
    return {
      key: "paid-spend",
      label: "Paid spend",
      value: "No snapshot",
      context: "Run Meta ingest",
      tone: "rose"
    };
  }

  return {
    key: "paid-spend",
    label: "Paid spend",
    value: currency.format(metaSnapshot.summary?.spend ?? 0),
    context: metaRange ? metaRange.label : `Last ${metaSnapshot.range}-day window`,
    tone: (metaSnapshot.summary?.spend ?? 0) ? "zinc" : "amber",
    note: (metaSnapshot.summary?.purchases ?? 0) ? undefined : "Spend recorded with no purchases."
  };
}

function buildPaidPurchaseMetric({ metaSnapshot }: { metaSnapshot: MetaAdsSnapshot | null }): ScoreboardMetric {
  if (!metaSnapshot) {
    return {
      key: "paid-purchases",
      label: "Paid purchases / ROAS",
      value: "n/a",
      context: "Meta snapshot missing",
      tone: "rose"
    };
  }

  const purchases = metaSnapshot.summary?.purchases ?? 0;
  const roas = metaSnapshot.summary?.roas ?? null;
  const roasLabel = roas != null ? `${roas.toFixed(2)}x ROAS` : "ROAS unavailable";
  const tone: ScoreboardMetric["tone"] = !purchases ? "rose" : roas && roas >= 2 ? "emerald" : "amber";

  return {
    key: "paid-purchases",
    label: "Paid purchases",
    value: `${purchases} purchases`,
    context: roasLabel,
    tone,
    note: !purchases ? "Hold spend until creative + tracking are fixed." : undefined
  };
}

function toneClass(tone?: ScoreboardMetric["tone"]) {
  if (tone === "emerald") return "text-emerald-300";
  if (tone === "amber") return "text-amber-200";
  if (tone === "rose") return "text-rose-300";
  return "text-white";
}
