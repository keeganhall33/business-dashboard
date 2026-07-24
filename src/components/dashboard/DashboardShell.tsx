import type {
  DashboardOverviewResponse,
  WebsiteConversionSnapshot,
  MetaAdsSnapshot,
  MarketingCommandSnapshot,
  CommerceTelemetry,
  SocialContentSnapshot,
  WooRangeMeta
} from "@/lib/types/dashboard";
import { PanelWrapper } from "./ui/PanelWrapper";
import type { PanelDataMode } from "./ui/PanelModeBadge";
import { StatusBanner } from "./StatusBanner";
import { PreparedActionsQueuePanel } from "./PreparedActionsQueuePanel";
import { CommandFeedPanel } from "./CommandFeedPanel";
import { buildCommandFeedCards } from "@/lib/dashboard/command-feed";
import { buildPromoteProtectCards } from "@/lib/dashboard/promote-protect";
import { PromoteProtectPanel } from "./PromoteProtectPanel";
import { CollectorRadarPanel } from "./CollectorRadarPanel";
import { SalesTrendsPanel } from "./SalesTrendsPanel";
import { formatDateRangeLabel, formatRelativeTimeFromNow } from "@/lib/date";
import { buildContentIdeas } from "@/lib/dashboard/content-ideas";
import { ContentPlaysPanel } from "./ContentPlaysPanel";
import { AgentConsolePanel } from "./AgentConsolePanel";
import { prioritizePreparedActions } from "@/lib/dashboard/prepared-action-priority";
import { SignalChartsPanel } from "./SignalChartsPanel";
import { DataFreshnessPanel, DataFreshnessSource } from "./DataFreshnessPanel";
import { DecisionRangePanel } from "./DecisionRangePanel";
import { WhatChangedPanel } from "./WhatChangedPanel";
import { isTestAction } from "@/lib/dashboard/prepared-action-utils";
import type { RangeMeta } from "./types";
import { formatWooFallbackDetail, formatWooRangeWindow } from "@/lib/dashboard/woo-range";
import { GrowthDecisionPanel } from "./GrowthDecisionPanel";
import { RevenueEnginePanel } from "./RevenueEnginePanel";
import { ScoreboardPanel } from "./ScoreboardPanel";
import { FunnelDecisionPanel } from "./FunnelDecisionPanel";
import { ProductConversionPanel } from "./ProductConversionPanel";
import { buildWebsiteDecisionInsights } from "@/lib/dashboard/website-decisions";
import { TodayPrioritiesPanel } from "./TodayPrioritiesPanel";
import { ConversionInsightsPanel } from "./ConversionInsightsPanel";
import { ConversionWatchPanel } from "./ConversionWatchPanel";
import { RefreshHealthSummary } from "./RefreshHealthSummary";

type Props = {
  data: DashboardOverviewResponse;
};

export function DashboardShell({ data }: Props) {
  const refreshedAt = data.timestamp;
  const websiteSnapshot = data.websiteConversion ?? null;
  const marketingSnapshot = data.marketingCommand ?? null;
  const metaSnapshot = data.metaAds ?? null;
  const socialSnapshot = data.socialContent ?? null;
  const partnershipSnapshot = data.partnershipFeed ?? null;
  const commerceTelemetry = data.commerceTelemetry ?? null;
  const performanceBaseline = data.performanceBaseline ?? null;
  const productConversion = data.productConversionIntelligence ?? null;
  const changeInsights = data.changeInsights ?? [];
  const websiteDecisionModel = buildWebsiteDecisionInsights({
    websiteSnapshot,
    wooSummary: commerceTelemetry?.woo?.summary ?? null,
    productConversion
  });
  const preparedActions = data.preparedActions ?? [];
  const prioritizedActions = prioritizePreparedActions(preparedActions);
  const actionableActions = prioritizedActions
    .filter((action) => action.createdByAgent !== "system")
    .filter((action) => !action.isInternal)
    .filter((action) => action.priorityLabel !== "blocked");
  const topActions = actionableActions
    .filter((action) => ["draft", "ready_for_review"].includes(action.status))
    .filter((action) => action.priorityLabel !== "backlog")
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 3);
  const executiveActions = topActions.length ? topActions : actionableActions.slice(0, 1);
  const dataSources = buildDataSources({
    websiteSnapshot,
    marketingSnapshot,
    metaSnapshot,
    socialSnapshot,
    partnershipSnapshot,
    preparedActions,
    productConversion
  });
  const dataFreshnessMap = Object.fromEntries(dataSources.map((source) => [source.id, source]));
  const dataWarnings = buildDataWarnings(dataSources);
  const primaryRange = describePrimaryRange(data.range);
  const momentumRange = { value: "Last 7 days", description: "Momentum pulse" };
  const comparisonRange = { value: "Previous matching period", description: "30 days before primary window" };
  const wooRangeDetail = commerceTelemetry?.woo?.range ?? null;
  const wooRangeMeta = describeWooRange(wooRangeDetail, data.range, websiteSnapshot?.wooCommerce ?? null);
  const metaRangeMeta = describeMetaRange(metaSnapshot ?? null);
  const socialRangeMeta = describeSocialRange(socialSnapshot ?? null);
  const marketingRangeMeta = describeMarketingRange(marketingSnapshot ?? null, data.range);
  const commerceRangeMeta = describeCommerceRange(commerceTelemetry?.range ?? null, data.range, wooRangeDetail);
  const scoreboardRangeMeta = describeDecisionRange(data.range);
  const momentumRangeMeta: RangeMeta = { label: "Last 7 days (momentum)", detail: "Fast-moving signals" };
  const snapshotRange = { value: wooRangeMeta.label, description: wooRangeMeta.detail ?? "Latest snapshot" };

  const websiteFresh = isFresh(websiteSnapshot?.generatedAt, 24);
  const marketingFresh = isFresh(marketingSnapshot?.generatedAt, 48);
  const metaFresh = isFresh(metaSnapshot?.generatedAt, 72);

  const commandFeedCards = marketingSnapshot ? buildCommandFeedCards(marketingSnapshot, { limit: 5 }) : [];
  const promoteProtectCards = marketingSnapshot
    ? buildPromoteProtectCards({
        momentum: marketingSnapshot.productMomentum ?? null,
        topProducts: websiteSnapshot?.wooCommerce?.topProducts ?? []
      })
    : [];
  const contentIdeas = marketingSnapshot ? buildContentIdeas(marketingSnapshot) : [];

  const marketingMode = marketingSnapshot ? (marketingFresh ? "LIVE" : "PARTIAL") : "BROKEN";
  const metaMode = metaSnapshot ? (metaFresh ? "LIVE" : "PARTIAL") : "BROKEN";
  const preparedActionsPanelMode = preparedActions.length ? "LIVE" : "PARTIAL";

  const showCommandFeed = marketingFresh && commandFeedCards.length > 0;
  const hasPromotionPlanner = Boolean(marketingSnapshot?.promotionPlanner?.recommendations?.length);
  const showCollectorRadar = Boolean(marketingSnapshot?.collectorRadar?.segments?.length);
  const showPromoteProtect = marketingFresh && !hasPromotionPlanner;
  const hasProductSignals = Boolean(marketingSnapshot?.productMomentum || commerceTelemetry?.woo?.products?.length || websiteSnapshot?.wooCommerce?.topProducts?.length);
  const showRevenueEngine = hasProductSignals || hasPromotionPlanner;
  const showPriorities = websiteDecisionModel.priorities.length > 0;
  const showConversionInsights = websiteDecisionModel.funnelMetrics.length > 0;
  const showProductConversion = Boolean(productConversion?.rows?.length);
  const showSalesTrends = Boolean(commerceTelemetry?.woo?.timeseries?.length);
  const showContentPlays = Boolean(socialSnapshot || contentIdeas.length);
  const showFunnelDecision = Boolean(websiteSnapshot || metaSnapshot);
  const funnelTrackingIncomplete = Boolean(!websiteSnapshot?.ga4?.addToCartEvents || !websiteSnapshot?.ga4?.beginCheckoutEvents);
  const funnelSourceMismatch = Boolean(
    websiteSnapshot?.ga4?.ecommercePurchases != null &&
      websiteSnapshot?.wooCommerce?.orderCount != null &&
      Math.abs(websiteSnapshot.ga4.ecommercePurchases - websiteSnapshot.wooCommerce.orderCount) >=
        Math.max(1, Math.ceil(0.2 * Math.max(websiteSnapshot.ga4.ecommercePurchases, websiteSnapshot.wooCommerce.orderCount)))
  );

  const freshnessItems = buildFreshnessItems({
    websiteSnapshot,
    metaSnapshot,
    marketingSnapshot,
    socialSnapshot,
    partnershipSnapshot
  });
  const rangeLabel = formatDateRangeLabel(data.range) ?? formatRangeLabel(data);
  const topCommandMode = deriveTopCommandMode({ websiteSnapshot, marketingSnapshot, metaSnapshot });
  const signalChartsMode = deriveSignalChartsMode({ websiteSnapshot, socialSnapshot, actions: preparedActions });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-20 pt-8 sm:px-6">
      {/* Command header */}
      <PanelWrapper mode={topCommandMode} refreshedAtIso={refreshedAt}>
        <StatusBanner
          rangeLabel={rangeLabel}
          freshnessItems={freshnessItems}
          marketingMode={marketingMode}
          metaMode={metaMode}
          schedulerSummary={data.schedulerSummary ?? null}
          warRoom={data.warRoom}
          pilotStatus={data.schedulerPilotStatus ?? null}
          dataWarnings={dataWarnings}
        />
      </PanelWrapper>

      <PanelWrapper mode={panelModeFromSources(dataFreshnessMap, ["website", "meta", "marketing", "social", "productConversion"], "DATA_LIGHT")} refreshedAtIso={refreshedAt}>
        <RefreshHealthSummary sources={dataSources} />
      </PanelWrapper>

      {showPriorities ? (
        <PanelWrapper mode={panelModeFromSources(dataFreshnessMap, ["website"], "DATA_LIGHT") } refreshedAtIso={websiteSnapshot?.generatedAt ?? refreshedAt}>
          <TodayPrioritiesPanel items={websiteDecisionModel.priorities} rangeLabel={rangeLabel} generatedAt={websiteSnapshot?.generatedAt ?? null} />
        </PanelWrapper>
      ) : null}

      {showConversionInsights ? (
        <PanelWrapper mode={panelModeFromSources(dataFreshnessMap, ["website"], "DATA_LIGHT")} refreshedAtIso={websiteSnapshot?.generatedAt ?? refreshedAt}>
          <ConversionInsightsPanel
            funnelMetrics={websiteDecisionModel.funnelMetrics}
            marketingActions={websiteDecisionModel.marketingActions}
            productCallouts={websiteDecisionModel.productCallouts}
            dataLabels={websiteDecisionModel.dataLabels}
          />
        </PanelWrapper>
      ) : null}

      <PanelWrapper mode={panelModeFromSources(dataFreshnessMap, ["website"], "DATA_LIGHT")} refreshedAtIso={websiteSnapshot?.generatedAt ?? refreshedAt}>
        <ConversionWatchPanel snapshot={websiteSnapshot} />
      </PanelWrapper>

      {/* Today's growth decision */}
      <PanelWrapper mode={panelModeFromSources(dataFreshnessMap, ["marketing", "preparedActions", "website"])} refreshedAtIso={refreshedAt}>
        <GrowthDecisionPanel
          promotionPlanner={marketingSnapshot?.promotionPlanner}
          collectorRadar={marketingSnapshot?.collectorRadar}
          topPreparedActions={executiveActions}
          rangeLabel={scoreboardRangeMeta.label}
        />
      </PanelWrapper>

      {/* Scoreboard */}
      <PanelWrapper mode={panelModeFromSources(dataFreshnessMap, ["website", "meta", "marketing"])} refreshedAtIso={refreshedAt}>
        <ScoreboardPanel data={data} wooRange={wooRangeMeta} metaRange={metaRangeMeta} scoreboardRange={scoreboardRangeMeta} />
      </PanelWrapper>

      {/* Revenue engine */}
      {showRevenueEngine ? (
      <PanelWrapper mode={panelModeFromSources(dataFreshnessMap, ["marketing", "website"])} refreshedAtIso={marketingSnapshot?.generatedAt ?? websiteSnapshot?.generatedAt ?? refreshedAt}>
        <RevenueEnginePanel
          momentum={marketingSnapshot?.productMomentum ?? null}
          wooProducts={commerceTelemetry?.woo?.products ?? null}
          wooSummary={commerceTelemetry?.woo?.summary ?? null}
          wooRange={wooRangeDetail}
          fallbackSnapshot={websiteSnapshot}
          promotionPlanner={marketingSnapshot?.promotionPlanner ?? null}
          ranges={{ woo: wooRangeMeta, marketing: marketingRangeMeta }}
        />
      </PanelWrapper>
    ) : null}

      {showProductConversion ? (
        <PanelWrapper
          mode={panelModeFromSources(dataFreshnessMap, ["productConversion", "website"], "DATA_LIGHT")}
          refreshedAtIso={productConversion?.generatedAt ?? refreshedAt}
        >
          <ProductConversionPanel data={productConversion} />
        </PanelWrapper>
      ) : null}

      {/* Collector radar */}
      {showCollectorRadar ? (
        <PanelWrapper mode={panelModeFromSources(dataFreshnessMap, ["marketing", "website"])} refreshedAtIso={marketingSnapshot?.generatedAt ?? websiteSnapshot?.generatedAt ?? refreshedAt}>
          <CollectorRadarPanel radar={marketingSnapshot?.collectorRadar ?? null} />
        </PanelWrapper>
      ) : null}

      {/* Funnel + paid decision */}
      {showFunnelDecision ? (
        <PanelWrapper mode={panelModeFromSources(dataFreshnessMap, ["website", "meta", "marketing"])} refreshedAtIso={refreshedAt}>
          <FunnelDecisionPanel
            websiteSnapshot={websiteSnapshot}
            wooSummary={commerceTelemetry?.woo?.summary ?? null}
            metaSnapshot={metaSnapshot}
            trackingIncomplete={funnelTrackingIncomplete}
            sourceMismatch={funnelSourceMismatch}
            rangeLabel={wooRangeMeta.label}
          />
        </PanelWrapper>
      ) : null}

      {/* Content plays */}
      {showContentPlays ? (
        <PanelWrapper mode={panelModeFromSources(dataFreshnessMap, ["social", "marketing"])} refreshedAtIso={socialSnapshot?.generatedAt ?? refreshedAt}>
          <ContentPlaysPanel
            socialSnapshot={socialSnapshot}
            ideas={contentIdeas}
            promotionPlanner={marketingSnapshot?.promotionPlanner ?? null}
            range={socialRangeMeta}
            generatedAt={socialSnapshot?.generatedAt ?? marketingSnapshot?.generatedAt ?? null}
          />
        </PanelWrapper>
      ) : null}

      {/* Agent workbench */}
      <PanelWrapper mode={panelModeFromSources(dataFreshnessMap, ["website", "marketing", "meta", "social", "partnership", "preparedActions"])} refreshedAtIso={refreshedAt}>
      <AgentConsolePanel
        preparedActions={preparedActions}
          agentUpdates={data.agentUpdateFeed ?? []}
          marketingSnapshot={marketingSnapshot}
          websiteSnapshot={websiteSnapshot}
          opportunityRadar={data.opportunityRadar ?? null}
          socialSnapshot={socialSnapshot}
          partnershipSnapshot={partnershipSnapshot}
          dataFreshness={dataFreshnessMap}
        />
      </PanelWrapper>

      {/* Prepared actions */}
      <PanelWrapper mode={preparedActionsPanelMode} refreshedAtIso={refreshedAt}>
        <PreparedActionsQueuePanel actions={prioritizedActions} />
      </PanelWrapper>

      {/* Data health */}
      <section className="rounded-3xl border border-white/10 bg-black/30 p-0">
        <details className="group" open={false}>
          <summary className="flex cursor-pointer items-center justify-between px-6 py-4 text-sm text-zinc-200">
            <span className="text-xs uppercase tracking-[0.3em] text-zinc-500">Data health</span>
            <span className="rounded-full border border-white/20 px-3 py-1 text-[11px] uppercase tracking-[0.3em] text-zinc-400 group-open:hidden">Show details</span>
            <span className="hidden rounded-full border border-white/20 px-3 py-1 text-[11px] uppercase tracking-[0.3em] text-zinc-400 group-open:inline">Hide details</span>
          </summary>
          <div className="border-t border-white/10 px-6 py-4">
            <DataFreshnessPanel sources={dataSources} />
          </div>
        </details>
      </section>

      {/* Appendix */}
      <section className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-0">
        <details>
          <summary className="flex cursor-pointer items-center justify-between px-6 py-4 text-sm text-zinc-200">
            <span className="text-xs uppercase tracking-[0.3em] text-zinc-500">Appendix & diagnostics</span>
            <span className="text-[11px] uppercase tracking-[0.3em] text-zinc-400">Expand</span>
          </summary>
          <div className="space-y-6 border-t border-white/10 px-6 py-6">
            <DecisionRangePanel primary={primaryRange} momentum={momentumRange} comparison={comparisonRange} snapshot={snapshotRange} />
            <WhatChangedPanel
              changeInsights={changeInsights}
              website={websiteSnapshot}
              marketing={marketingSnapshot}
              social={socialSnapshot}
              preparedActions={preparedActions}
              ranges={{ website: wooRangeMeta, marketing: marketingRangeMeta, social: socialRangeMeta }}
            />
            <SignalChartsPanel telemetry={commerceTelemetry} actions={preparedActions} social={socialSnapshot} />
            {showSalesTrends ? <SalesTrendsPanel telemetry={commerceTelemetry} baseline={performanceBaseline} rangeMeta={commerceRangeMeta} /> : null}
            {showCommandFeed && marketingSnapshot ? (
              <CommandFeedPanel cards={commandFeedCards.slice(0, 3)} generatedAt={marketingSnapshot.generatedAt ?? refreshedAt} rangeLabel={rangeLabel} />
            ) : null}
            {showPromoteProtect && marketingSnapshot ? <PromoteProtectPanel cards={promoteProtectCards} /> : null}
          </div>
        </details>
      </section>
    </div>
  );
}

function panelModeFromSources(map: Record<string, DataFreshnessSource>, ids: string[], fallback: PanelDataMode = "MISSING"): PanelDataMode {
  const sources = ids.map((id) => map[id]).filter((source): source is DataFreshnessSource => Boolean(source));
  if (!sources.length) return fallback;
  if (sources.some((source) => source.tone === "rose")) return "STALE";
  if (sources.some((source) => source.tone === "amber")) return "DATA_LIGHT";
  if (sources.every((source) => source.tone === "zinc")) return "MANUAL_ONLY";
  return "FRESH";
}

function describePrimaryRange(range: DashboardOverviewResponse["range"]) {
  const labelMap: Record<string, string> = {
    "7d": "Last 7 days",
    "30d": "Last 30 days",
    "90d": "Last 90 days",
    "180d": "Last 6 months",
    "365d": "Last 12 months",
    ytd: "Year to date"
  };
  if (range.preset === "custom") {
    return { value: `${range.startDate} → ${range.endDate}`, description: "Custom decision window" };
  }
  return { value: labelMap[range.preset] ?? "Last 30 days", description: "Primary decision window" };
}

const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function describeWooRange(
  wooRange: WooRangeMeta | null,
  fallbackRange: DashboardOverviewResponse["range"],
  snapshot: WebsiteConversionSnapshot["wooCommerce"] | null
): RangeMeta {
  if (wooRange) {
    const label = formatWooRangeWindow(wooRange, fallbackRange.startDate, fallbackRange.endDate) ?? "Woo telemetry";
    const fallbackDetail = formatWooFallbackDetail(wooRange);
    const refreshed = wooRange.lastRefreshedAt ? `Refreshed ${formatRelativeTimeFromNow(wooRange.lastRefreshedAt)}` : null;
    return {
      label,
      detail: fallbackDetail ?? refreshed ?? "WooCommerce telemetry window"
    };
  }
  if (snapshot?.windowStart && snapshot?.windowEnd) {
    return {
      label: formatRangeWindow(snapshot.windowStart, snapshot.windowEnd) ?? "Woo snapshot window",
      detail: "WooCommerce snapshot"
    };
  }
  if (snapshot?.rangeDays) {
    return { label: `Woo snapshot (~last ${snapshot.rangeDays} days)`, detail: "WooCommerce reported range" };
  }
  return { label: "Woo snapshot", detail: "Source range unavailable" };
}

function describeMetaRange(meta: MetaAdsSnapshot | null): RangeMeta {
  if (meta?.range) {
    return { label: `Last ${meta.range} days (Meta)`, detail: "Meta Ads snapshot" };
  }
  return { label: "Meta snapshot", detail: "Range unavailable" };
}

function describeSocialRange(social: SocialContentSnapshot | null): RangeMeta {
  const from = social?.range?.from;
  const to = social?.range?.to;
  if (from && to) {
    return { label: formatRangeWindow(from, to) ?? "Social snapshot", detail: "Instagram content window" };
  }
  return { label: "Social snapshot", detail: "Range unavailable" };
}

function describeMarketingRange(
  marketing: MarketingCommandSnapshot | null,
  fallbackRange: DashboardOverviewResponse["range"]
): RangeMeta {
  const start = marketing?.range?.startDate;
  const end = marketing?.range?.endDate;
  if (start && end) {
    return { label: formatRangeWindow(start, end) ?? "Marketing snapshot", detail: "Marketing Command range" };
  }
  return {
    label: formatRangeWindow(fallbackRange.startDate, fallbackRange.endDate) ?? "Decision window",
    detail: "Marketing Command missing explicit window"
  };
}

function describeCommerceRange(
  range: CommerceTelemetry["range"] | null,
  fallbackRange: DashboardOverviewResponse["range"],
  wooRange?: WooRangeMeta | null
): RangeMeta {
  if (wooRange?.isFallback) {
    return {
      label: formatWooRangeWindow(wooRange, fallbackRange.startDate, fallbackRange.endDate) ?? "Commerce telemetry",
      detail: formatWooFallbackDetail(wooRange) ?? "Woo data is partial for this window"
    };
  }
  if (range?.startDate && range?.endDate) {
    return { label: formatRangeWindow(range.startDate, range.endDate) ?? "Commerce telemetry", detail: "Woo + GA4 telemetry" };
  }
  return {
    label: formatRangeWindow(fallbackRange.startDate, fallbackRange.endDate) ?? "Decision window",
    detail: "Telemetry range unavailable"
  };
}

function describeDecisionRange(range: DashboardOverviewResponse["range"]): RangeMeta {
  return {
    label: formatRangeWindow(range.startDate, range.endDate) ?? "Decision window",
    detail: `${range.startDate} → ${range.endDate}`
  };
}

function formatRangeWindow(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  return `${SHORT_DATE.format(startDate)} → ${SHORT_DATE.format(endDate)}`;
}

function isFresh(timestamp?: string | null, maxAgeHours = 24) {
  if (!timestamp) return false;
  const updatedAt = new Date(timestamp).getTime();
  if (Number.isNaN(updatedAt)) return false;
  const ageHours = (Date.now() - updatedAt) / 36e5;
  return ageHours <= maxAgeHours;
}

function formatRangeLabel(data: DashboardOverviewResponse) {
  const { preset, startDate, endDate } = data.range;
  if (preset === "custom") {
    return `${startDate} → ${endDate}`;
  }
  return `${preset.toUpperCase()} window`;
}

function buildFreshnessItems({
  websiteSnapshot,
  metaSnapshot,
  marketingSnapshot,
  socialSnapshot,
  partnershipSnapshot
}: {
  websiteSnapshot: DashboardOverviewResponse["websiteConversion"];
  metaSnapshot: DashboardOverviewResponse["metaAds"];
  marketingSnapshot: DashboardOverviewResponse["marketingCommand"];
  socialSnapshot: DashboardOverviewResponse["socialContent"];
  partnershipSnapshot: DashboardOverviewResponse["partnershipFeed"];
}) {
  return [
    { label: "Website / Woo / GA4", timestamp: websiteSnapshot?.generatedAt },
    { label: "Meta Ads", timestamp: metaSnapshot?.generatedAt },
    { label: "Marketing Command", timestamp: marketingSnapshot?.generatedAt },
    { label: "Instagram Content", timestamp: socialSnapshot?.generatedAt },
    { label: "Partnership Feed", timestamp: partnershipSnapshot?.generatedAt }
  ];
}

function buildDataWarnings(sources: DataFreshnessSource[]) {
  return sources
    .filter((source) => source.warnExecutive)
    .filter((source) => source.tone !== "emerald")
    .map((source) => `${source.label}: ${source.statusLabel}`);
}

function getWebsiteWindowLabel(snapshot?: DashboardOverviewResponse["websiteConversion"] | null) {
  const start = snapshot?.wooCommerce?.windowStart;
  const end = snapshot?.wooCommerce?.windowEnd;
  if (start && end) {
    return `${start.slice(0, 10)} → ${end.slice(0, 10)}`;
  }
  const rangeDays = snapshot?.wooCommerce?.rangeDays;
  if (rangeDays) {
    return `Last ${rangeDays} days`;
  }
  return null;
}

function deriveTopCommandMode({
  websiteSnapshot,
  marketingSnapshot,
  metaSnapshot
}: {
  websiteSnapshot: DashboardOverviewResponse["websiteConversion"];
  marketingSnapshot: DashboardOverviewResponse["marketingCommand"];
  metaSnapshot: DashboardOverviewResponse["metaAds"];
}) {
  const timestamps = [
    { ts: websiteSnapshot?.generatedAt, max: 24 },
    { ts: marketingSnapshot?.generatedAt, max: 48 },
    { ts: metaSnapshot?.generatedAt, max: 72 }
  ];
  if (timestamps.every((entry) => !entry.ts)) return "MISSING";
  if (timestamps.some((entry) => !isFresh(entry.ts, entry.max))) return "STALE";
  if (timestamps.filter((entry) => Boolean(entry.ts)).length <= 1) return "DATA_LIGHT";
  return "FRESH";
}

function deriveSignalChartsMode({
  websiteSnapshot,
  socialSnapshot,
  actions
}: {
  websiteSnapshot: DashboardOverviewResponse["websiteConversion"];
  socialSnapshot: DashboardOverviewResponse["socialContent"];
  actions: DashboardOverviewResponse["preparedActions"];
}) {
  const hasWebsiteData = Boolean(websiteSnapshot);
  const hasWoo = Boolean(websiteSnapshot?.wooCommerce);
  const hasGa = Boolean(websiteSnapshot?.ga4);
  const hasSocial = Boolean(socialSnapshot?.posts?.length);
  const hasActions = Boolean(actions.length);

  if (!hasWebsiteData && !hasSocial && !hasActions) return "MISSING";
  if (!isFresh(websiteSnapshot?.generatedAt, 24)) return "STALE";
  const strongSignals = [hasWoo, hasGa, hasSocial, hasActions].filter(Boolean).length;
  if (strongSignals <= 1) return "DATA_LIGHT";
  return "FRESH";
}

function buildDataSources({
  websiteSnapshot,
  marketingSnapshot,
  metaSnapshot,
  socialSnapshot,
  partnershipSnapshot,
  preparedActions,
  productConversion
}: {
  websiteSnapshot: DashboardOverviewResponse["websiteConversion"];
  marketingSnapshot: DashboardOverviewResponse["marketingCommand"];
  metaSnapshot: DashboardOverviewResponse["metaAds"];
  socialSnapshot: DashboardOverviewResponse["socialContent"];
  partnershipSnapshot: DashboardOverviewResponse["partnershipFeed"];
  preparedActions: DashboardOverviewResponse["preparedActions"];
  productConversion: DashboardOverviewResponse["productConversionIntelligence"];
}): DataFreshnessSource[] {
  const sources: DataFreshnessSource[] = [];

  sources.push(
    evaluateSourceStatus({
      id: "website",
      label: "Website & Funnel",
      description: "WooCommerce and GA4 snapshots",
      timestamp: websiteSnapshot?.generatedAt ?? null,
      thresholdHours: 24,
      panels: ["Website conversion", "Funnel leak", "Signal charts", "Sloan recommendations", "Executive brief"],
      command: { label: "Refresh website snapshot", command: "op run --env-file=.env --env-file=.env.website -- pnpm website:run" },
      warnExecutive: true
    })
  );

  sources.push(
    evaluateSourceStatus({
      id: "marketing",
      label: "Marketing Command",
      description: "Connected insights + Promote/Protect",
      timestamp: marketingSnapshot?.generatedAt ?? null,
      thresholdHours: 48,
      panels: ["Command feed", "Promote/Protect", "Executive brief"],
      command: { label: "Refresh marketing snapshot", command: "op run --env-file=.env --env-file=.env.website -- pnpm marketing:run" },
      warnExecutive: true
    })
  );

  sources.push(
    evaluateSourceStatus({
      id: "meta",
      label: "Meta Ads",
      description: "Paid marketing performance",
      timestamp: metaSnapshot?.generatedAt ?? null,
      thresholdHours: 24,
      panels: ["Paid marketing", "KPI tiles"],
      command: { label: "Refresh Meta reporting", command: "op run --env-file=.env --env-file=.env.meta -- pnpm meta:run" },
      warnExecutive: true
    })
  );

  sources.push(
    evaluateSourceStatus({
      id: "social",
      label: "Instagram Content",
      description: "Lyra narrative + Signal charts",
      timestamp: socialSnapshot?.generatedAt ?? null,
      thresholdHours: 48,
      panels: ["Agent Console (Lyra)", "Signal charts", "Executive brief"],
      command: { label: "Refresh social snapshot", command: "op run --env-file=.env --env-file=.env.meta -- pnpm social:run" },
      warnExecutive: true
    })
  );

  sources.push(
    evaluateSourceStatus({
      id: "partnership",
      label: "Partnership Feed",
      description: "Noah opportunity radar",
      timestamp: partnershipSnapshot?.generatedAt ?? null,
      thresholdHours: 72,
      panels: ["Agent Console (Noah)", "Executive brief"],
      command: { label: "Refresh partnership feed", command: "op run --env-file=.env --env-file=.env.meta -- pnpm partnership:run" },
      warnExecutive: true
    })
  );

  const latestAction = [...preparedActions].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
  sources.push(
    evaluateSourceStatus({
      id: "preparedActions",
      label: "Prepared Actions",
      description: "Manual approval queue",
      timestamp: latestAction?.updatedAt ?? null,
      thresholdHours: 24,
      panels: ["Prepared Actions queue", "Executive brief", "Agent Console"],
      manualOnly: true,
      detail: preparedActions.length ? undefined : "No prepared actions staged yet."
    })
  );

  sources.push(
    evaluateSourceStatus({
      id: "productConversion",
      label: "Product Conversion Intelligence",
      description: "GA4 item payload + Woo revenue",
      timestamp: productConversion?.generatedAt ?? null,
      thresholdHours: 48,
      panels: ["Product Conversion"],
      manualOnly: true,
      detail: productConversion
        ? "Live GA4 items joined with Woo orders."
        : "Run pnpm products:run to generate snapshot."
    })
  );

  return sources;
}

function evaluateSourceStatus({
  id,
  label,
  description,
  timestamp,
  thresholdHours,
  panels,
  command,
  warnExecutive,
  manualOnly,
  detail
}: {
  id: string;
  label: string;
  description: string;
  timestamp: string | null;
  thresholdHours: number;
  panels: string[];
  command?: { label: string; command: string };
  warnExecutive?: boolean;
  manualOnly?: boolean;
  detail?: string;
}): DataFreshnessSource {
  if (manualOnly) {
    return {
      id,
      label,
      description,
      panels,
      command,
      lastUpdatedIso: timestamp,
      relativeLabel: timestamp ? formatRelativeTimeFromNow(timestamp) ?? "unknown" : "Manual updates",
      statusLabel: timestamp ? "Manual updates" : "Manual (empty)",
      tone: "zinc",
      detail,
      warnExecutive
    };
  }

  const relative = timestamp ? formatRelativeTimeFromNow(timestamp) ?? "unknown" : "Missing";
  const fresh = isFresh(timestamp, thresholdHours ?? 24);
  const missing = !timestamp;
  const tone: DataFreshnessSource["tone"] = missing ? "rose" : fresh ? "emerald" : "amber";
  const statusLabel = missing ? "Missing data" : fresh ? "Fresh" : "Stale";

  return {
    id,
    label,
    description,
    panels,
    command,
    lastUpdatedIso: timestamp,
    relativeLabel: relative,
    statusLabel,
    tone,
    detail,
    warnExecutive
  };
}
