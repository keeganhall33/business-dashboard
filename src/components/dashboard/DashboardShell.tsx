import { buildExecutiveActions, type ExecutiveActionPlan } from "@/lib/dashboard/executive-layout";
import { buildExecutiveSummary } from "@/lib/dashboard/executive-summary";
import { buildDataConfidenceModel } from "@/lib/data-confidence";
import { DashboardOverviewResponse } from "@/lib/types/dashboard";
import type { AgentDashboardResponse } from "@/lib/types/agent";
import { BusinessStatusPanel } from "./BusinessStatusPanel";
import { ExecutiveKpiPanel } from "./ExecutiveKpiPanel";
import { TopDriversPanel } from "./TopDriversPanel";
import { ExecutiveActionsPanel } from "./ExecutiveActionsPanel";
import { DataConfidencePanel } from "./DataConfidencePanel";
import { DashboardSection } from "./ui/DashboardSection";
import { WebsiteConversionPanel } from "./WebsiteConversionPanel";
import { RevenueEnginePanel } from "./RevenueEnginePanel";
import { BrandPowerPanel } from "./BrandPowerPanel";
import { MarketingPerformancePanel } from "./MarketingPerformancePanel";
import { MetaAdsPanel } from "./MetaAdsPanel";
import { ChangeInsightsPanel } from "./ChangeInsightsPanel";
import { PerformanceBaselinePanel } from "./PerformanceBaselinePanel";
import { IndustryPulsePanel } from "./IndustryPulsePanel";
import { PanelAuditPlaceholder } from "./ui/PanelAuditPlaceholder";
import { ExecutiveRangeHeader } from "./ExecutiveRangeHeader";
import { ForwardStrategyPanel } from "./ForwardStrategyPanel";
import { OperationsReliabilityPanel } from "./OperationsReliabilityPanel";
import { buildOperationsIntel } from "@/lib/operations-intelligence";

const SECTION_PROPS = {
  defaultOpen: false as const,
  density: "compact" as const
};

type Props = {
  data: DashboardOverviewResponse;
  agents: AgentDashboardResponse[];
};

export function DashboardShell({ data }: Props) {
  const websiteSnapshot = data.websiteConversion ?? null;
  const metaSnapshot = data.metaAds ?? null;
  const changeInsights = data.changeInsights ?? null;
  const performanceBaseline = data.performanceBaseline ?? null;
  const executiveSummary = buildExecutiveSummary(data);
  const dataConfidence = buildDataConfidenceModel(data);
  const executiveActions = buildExecutiveActions(data, 5, dataConfidence);
  const commerceSummary = buildCommerceSummary(data, executiveActions);
  const marketingSummary = buildMarketingSummary(data, executiveActions);
  const operationsSummary = buildOperationsSummary(data, executiveActions);
  const industrySummary = buildIndustrySummary(data);
  const dataConfidenceSummary = buildConfidenceSectionSummary(dataConfidence);
  const operationsIntel = buildOperationsIntel(data);
  const hasBrandSignals = Boolean(
    data.brandPower &&
      (data.brandPower.metrics?.some((m) => {
        const measuredAt = (m as unknown as { measuredAt?: string | null }).measuredAt;
        const source = (m as unknown as { source?: string | null }).source;
        const formula = (m as unknown as { formula?: string | null }).formula;
        const hasValue = m.currentValue != null;
        return hasValue && Boolean(measuredAt) && Boolean(source) && Boolean(formula);
      }) ||
        (data.brandPower.whatIsWorking?.length ?? 0) > 0 ||
        (data.brandPower.whatToDoNext?.length ?? 0) > 0)
  );

  const rangeIsMonthly = data.range.preset === "month_to_date" || data.range.preset === "previous_month";
  const shouldShowOperations = Boolean(
    operationsIntel.incidents.some((incident) => incident.severity === "critical") ||
      operationsIntel.actions.length > 0
  );
  const shouldShowIndustry = Boolean(data.industryPulseSnapshot && (data.industryPulseSnapshot.alerts?.length ?? 0) > 0);
  const shouldShowChangeInsights = Boolean(changeInsights && (changeInsights.insights?.length ?? 0) > 0);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-16 pt-8 sm:px-6">
      <div className="space-y-6">
        <ExecutiveRangeHeader range={data.range} insights={data.executiveInsights} />
        <BusinessStatusPanel summary={executiveSummary} />
        <ExecutiveKpiPanel summary={executiveSummary} />
        <PerformanceBaselinePanel snapshot={performanceBaseline} range={data.range} />
        <TopDriversPanel summary={executiveSummary} />
        <ExecutiveActionsPanel data={data} actions={executiveActions} confidence={dataConfidence} />
      </div>

      <div className="space-y-6">
        <DashboardSection
          title="Commerce"
          subtitle="Sessions, conversion, orders, revenue, and product signals"
          storageKey="dashboard-section-commerce"
          meta={<SectionMeta summary={commerceSummary} />}
          {...SECTION_PROPS}
        >
          <div className="space-y-5">
            {websiteSnapshot ? (
              <WebsiteConversionPanel snapshot={websiteSnapshot} range={data.range} />
            ) : (
              <PanelAuditPlaceholder title="Website snapshot unavailable" detail="GA4 + Woo snapshot missing for this range." />
            )}
            {data.revenueEngine ? (
              <details className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <summary className="cursor-pointer select-none text-sm font-semibold text-zinc-200">Revenue Engine (diagnostics)</summary>
                <div className="mt-4">
                  <RevenueEnginePanel data={data.revenueEngine} />
                </div>
              </details>
            ) : null}
          </div>
        </DashboardSection>

        <DashboardSection
          title="Marketing"
          subtitle="Spend, ROAS, campaigns, and creative"
          storageKey="dashboard-section-marketing"
          meta={<SectionMeta summary={marketingSummary} />}
          {...SECTION_PROPS}
        >
          <div className="space-y-5">
            <MarketingPerformancePanel telemetry={data.commerceTelemetry} />
            {metaSnapshot ? <MetaAdsPanel snapshot={metaSnapshot} /> : <PanelAuditPlaceholder title="Meta data unavailable" detail="Meta agent has not produced a snapshot for this window." />}
          </div>
        </DashboardSection>

        {shouldShowOperations ? (
          <DashboardSection
            title="Operations"
            subtitle="Automation cadence and system health"
            storageKey="dashboard-section-operations"
            {...SECTION_PROPS}
            meta={<SectionMeta summary={operationsSummary} />}
          >
            <OperationsReliabilityPanel intel={operationsIntel} />
          </DashboardSection>
        ) : null}

        {shouldShowIndustry ? (
          <DashboardSection
            title="Industry"
            subtitle="External signals"
            storageKey="dashboard-section-industry"
            meta={<SectionMeta summary={industrySummary} />}
            {...SECTION_PROPS}
          >
            <div className="space-y-5">
              {data.industryPulseSnapshot ? <IndustryPulsePanel snapshot={data.industryPulseSnapshot} /> : null}
            </div>
          </DashboardSection>
        ) : null}

        {shouldShowChangeInsights ? (
          <DashboardSection
            title="Change Insights"
            subtitle="Key movements versus the previous saved snapshot"
            storageKey="dashboard-section-change-insights"
            {...SECTION_PROPS}
          >
            <ChangeInsightsPanel snapshot={changeInsights} />
          </DashboardSection>
        ) : null}

        <DashboardSection
          title="Data Confidence"
          subtitle="Source freshness, coverage, and telemetry warnings"
          storageKey="dashboard-section-data-confidence"
          {...SECTION_PROPS}
          meta={<SectionMeta summary={dataConfidenceSummary} />}
        >
          <DataConfidencePanel summary={dataConfidence} />
        </DashboardSection>

        {rangeIsMonthly ? (
          <DashboardSection
            title="Forward Strategy"
            subtitle="Long-range positioning and focus"
            storageKey="dashboard-section-forward-strategy"
            {...SECTION_PROPS}
          >
            <ForwardStrategyPanel data={{ ...data, executiveSummary } as DashboardOverviewResponse & { executiveSummary: typeof executiveSummary }} />
          </DashboardSection>
        ) : null}

        {hasBrandSignals ? (
          <DashboardSection
            title="Experimental"
            subtitle="Prototype signals and non-production-grade metrics"
            storageKey="dashboard-section-experimental"
            {...SECTION_PROPS}
          >
            <div className="space-y-5">
              {data.brandPower ? <BrandPowerPanel data={data.brandPower} /> : null}
            </div>
          </DashboardSection>
        ) : null}
      </div>
    </div>
  );
}

type SectionSummary = {
  status: string;
  tone: "emerald" | "amber" | "rose" | "zinc";
  metrics: string[];
  insight?: string | null;
  actions: number;
};

function SectionMeta({ summary }: { summary: SectionSummary }) {
  const metrics = summary.metrics.length ? summary.metrics.join(" • ") : "No metrics";
  return (
    <div className="text-right text-[11px] leading-relaxed text-zinc-400">
      <div className={`font-semibold ${toneText(summary.tone)}`}>{summary.status}</div>
      <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">{metrics}</div>
      {summary.insight ? <div className="mt-1 text-[10px] text-zinc-500 line-clamp-1">{summary.insight}</div> : null}
      <div className="text-[10px] text-zinc-500">Actions: {summary.actions}</div>
    </div>
  );
}

function toneText(tone: SectionSummary["tone"]) {
  switch (tone) {
    case "emerald":
      return "text-emerald-300";
    case "amber":
      return "text-amber-300";
    case "rose":
      return "text-rose-300";
    default:
      return "text-zinc-300";
  }
}

function buildCommerceSummary(data: DashboardOverviewResponse, actions: ExecutiveActionPlan[]): SectionSummary {
  const wooTelemetry = data.commerceTelemetry?.woo?.summary;
  const funnelTelemetry = data.commerceTelemetry?.funnel?.summary;

  const revenue = wooTelemetry?.revenue ?? null;
  const orders = wooTelemetry?.orders ?? null;
  // Selected-range truth: purchase conversion from baseline if available; otherwise FunnelKit completion.
  const purchaseConversion = data.performanceBaseline?.metrics.purchaseConversionRate.current ?? null;
  const conversionPercent = purchaseConversion ?? (funnelTelemetry?.conversionRate ?? null);
  const insight = data.executiveInsights?.trends?.find((trend) => trend.source === "woo")?.label ?? null;
  return {
    status: revenue != null || orders != null ? "Live" : "Needs data",
    tone: revenue != null || orders != null ? "emerald" : "amber",
    metrics: [
      revenue != null ? `Rev ${formatCurrencyShort(revenue)}` : null,
      orders != null ? `Orders ${formatCount(orders)}` : null,
      conversionPercent != null ? `Conv ${conversionPercent.toFixed(1)}%` : null
    ].filter(Boolean) as string[],
    insight,
    actions: actions.filter((action) => action.id.startsWith("top-")).length
  };
}

function buildMarketingSummary(data: DashboardOverviewResponse, actions: ExecutiveActionPlan[]): SectionSummary {
  const meta = data.metaAds;
  const spend = meta?.summary?.spend ?? null;
  const roas = meta?.summary?.roas ?? null;
  const conversions = meta?.summary?.purchases ?? null;
  const insight = data.executiveInsights?.trends?.find((trend) => trend.source === "meta")?.label ?? null;
  let tone: SectionSummary["tone"] = "zinc";
  if (meta?.status === "LIVE") tone = "emerald";
  else if (meta?.status === "PARTIAL") tone = "amber";
  return {
    status: meta?.status ? `Meta ${meta.status}` : "Meta pending",
    tone,
    metrics: [
      spend != null ? `Spend ${formatCurrencyShort(spend)}` : null,
      roas != null ? `ROAS ${(roas ?? 0).toFixed(1)}x` : null,
      conversions != null ? `Conv ${formatCount(conversions)}` : null
    ].filter(Boolean) as string[],
    insight,
    actions: actions.filter((action) => action.id.startsWith("marketing-")).length
  };
}

function buildOperationsSummary(data: DashboardOverviewResponse, actions: ExecutiveActionPlan[]): SectionSummary {
  const summary = data.schedulerSummary;
  const failing = summary?.failingCount ?? 0;
  const freshness = data.systemHealth?.dataFreshnessHours;
  const tone: SectionSummary["tone"] = summary ? (summary.status === "BROKEN" ? "rose" : summary.status === "PARTIAL" ? "amber" : "emerald") : "zinc";
  return {
    status: summary?.status ? `Cron ${summary.status}` : "Cron unknown",
    tone,
    metrics: [
      `Failing ${failing}`,
      summary ? `Cron ${summary.cronEnabled ? "on" : "off"}` : null,
      freshness != null ? `Fresh ${freshness}h` : null
    ].filter(Boolean) as string[],
    insight: failing ? `${failing} automation${failing === 1 ? "" : "s"} blocked` : null,
    actions: actions.filter((action) => action.id === "scheduler" || action.id.startsWith("telemetry-")).length
  };
}

function buildIndustrySummary(data: DashboardOverviewResponse): SectionSummary {
  const alerts = data.industryPulseSnapshot?.alerts ?? [];
  return {
    status: alerts.length ? "Opportunities live" : "No live intel",
    tone: alerts.length ? "emerald" : "zinc",
    metrics: [
      `Alerts ${formatCount(alerts.length)}`,
      `Sources ${formatCount(data.industryPulseSnapshot?.sources?.length ?? 0)}`
    ],
    insight: alerts[0]?.whyItMatters ?? null,
    actions: 0
  };
}

function buildConfidenceSectionSummary(summary: ReturnType<typeof buildDataConfidenceModel>): SectionSummary {
  const tone = summary.overall.tone;
  const watchCount = summary.caveatSources.length + summary.conflictingSources.length;
  return {
    status: summary.overall.label,
    tone,
    metrics: [`Trusted ${summary.trustedSources.length}`, `Watch ${watchCount}`],
    insight: summary.topRisk?.decisionImpact ?? summary.overall.rationale,
    actions: summary.recommendedActions.length
  };
}

function formatCurrencyShort(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "Unavailable";
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${Math.round(value)}`;
}

function formatCount(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "Unavailable";
  return Math.round(value).toString();
}
