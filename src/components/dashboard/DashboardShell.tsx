import { buildExecutiveActions, buildDataConfidence, type ExecutiveActionPlan } from "@/lib/dashboard/executive-layout";
import { DashboardOverviewResponse, SchedulerJobHealth, SchedulerSummary } from "@/lib/types/dashboard";
import type { AgentDashboardResponse } from "@/lib/types/agent";
import { ExecutiveStatusPanel } from "./ExecutiveStatusPanel";
import { ExecutiveKpiScorecard } from "./ExecutiveKpiScorecard";
import { ExecutiveDriversPanel } from "./ExecutiveDriversPanel";
import { ExecutiveActionsPanel } from "./ExecutiveActionsPanel";
import { DataConfidencePanel } from "./DataConfidencePanel";
import { DashboardSection } from "./ui/DashboardSection";
import { WebsiteConversionPanel } from "./WebsiteConversionPanel";
import { RevenueEnginePanel } from "./RevenueEnginePanel";
import { BrandPowerPanel } from "./BrandPowerPanel";
import { MarketingPerformancePanel } from "./MarketingPerformancePanel";
import { MetaAdsPanel } from "./MetaAdsPanel";
import { ExecutiveBriefPanel } from "./ExecutiveBriefPanel";
import { ActionQueuePanel } from "./ActionQueuePanel";
import { SystemHealthPanel } from "./SystemHealthPanel";
import { IndustryPulsePanel } from "./IndustryPulsePanel";
import { PanelAuditPlaceholder } from "./ui/PanelAuditPlaceholder";
import { ExecutiveRangeHeader } from "./ExecutiveRangeHeader";
import { ForwardStrategyPanel } from "./ForwardStrategyPanel";
import { SiteHealthSummary } from "./SiteHealthSummary";
import { ExecutivePerspectivePanel } from "./ExecutivePerspectivePanel";

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
  const executiveActions = buildExecutiveActions(data, 5);
  const dataConfidence = buildDataConfidence(data.telemetryMetadata, data.telemetryHealth, data.executiveInsights?.brief ?? null);
  const commerceSummary = buildCommerceSummary(data, executiveActions);
  const marketingSummary = buildMarketingSummary(data, executiveActions);
  const operationsSummary = buildOperationsSummary(data, executiveActions);
  const industrySummary = buildIndustrySummary(data);
  const dataConfidenceSummary = buildDataConfidenceSummary(dataConfidence, executiveActions);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-16 pt-8 sm:px-6">
      <div className="space-y-6">
        <ExecutiveRangeHeader range={data.range} insights={data.executiveInsights} />
        <ExecutiveStatusPanel insights={data.executiveInsights} fallbackRange={data.range} />
        <ExecutivePerspectivePanel data={data} actions={executiveActions} />
        {data.executiveInsights ? <ExecutiveBriefPanel insights={data.executiveInsights} /> : null}
        <ExecutiveKpiScorecard metrics={data.headerMetrics} />
        <ExecutiveDriversPanel trends={data.executiveInsights?.trends ?? []} />
        <ExecutiveActionsPanel data={data} actions={executiveActions} />
        <ForwardStrategyPanel data={data} />
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
              <WebsiteConversionPanel snapshot={websiteSnapshot} />
            ) : (
              <PanelAuditPlaceholder title="Website snapshot unavailable" detail="GA4 + Woo snapshot missing for this range." />
            )}
            {data.revenueEngine ? <RevenueEnginePanel data={data.revenueEngine} /> : null}
            {data.brandPower ? <BrandPowerPanel data={data.brandPower} /> : null}
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
            <MarketingPerformancePanel telemetry={data.commerceTelemetry} meta={data.metaAds} />
            {metaSnapshot ? <MetaAdsPanel snapshot={metaSnapshot} /> : <PanelAuditPlaceholder title="Meta data unavailable" detail="Meta agent has not produced a snapshot for this window." />}
          </div>
        </DashboardSection>

        <DashboardSection
          title="Operations"
          subtitle="Automation cadence, system health, and approvals"
          storageKey="dashboard-section-operations"
          {...SECTION_PROPS}
          meta={<SectionMeta summary={operationsSummary} />}
        >
          <div className="space-y-5">
            {data.schedulerJobs?.length ? (
              <AutomationAttention jobs={data.schedulerJobs ?? []} summary={data.schedulerSummary} />
            ) : (
              <PanelAuditPlaceholder title="Scheduler telemetry missing" detail="No job metadata available." />
            )}
            {data.systemHealth ? <SystemHealthPanel data={data.systemHealth} /> : null}
            {data.actionQueue ? <ActionQueuePanel data={data.actionQueue} /> : null}
            <SiteHealthSummary snapshot={data.cloudflare} />
          </div>
        </DashboardSection>

        <DashboardSection
          title="Industry"
          subtitle="External signals, War Room, and intelligence"
          storageKey="dashboard-section-industry"
          meta={<SectionMeta summary={industrySummary} />}
          {...SECTION_PROPS}
        >
          <div className="space-y-5">
            {data.industryPulseSnapshot ? <IndustryPulsePanel snapshot={data.industryPulseSnapshot} /> : <PanelAuditPlaceholder title="Industry pulse offline" detail="No consolidated feed available." />}
          </div>
        </DashboardSection>

        <DashboardSection
          title="Data Confidence"
          subtitle="Source freshness, coverage, and telemetry warnings"
          storageKey="dashboard-section-data-confidence"
          {...SECTION_PROPS}
          meta={<SectionMeta summary={dataConfidenceSummary} />}
        >
          <DataConfidencePanel
            metadata={data.telemetryMetadata}
            health={data.telemetryHealth}
            brief={data.executiveInsights?.brief ?? null}
            summary={dataConfidence}
          />
        </DashboardSection>
      </div>
    </div>
  );
}

function AutomationAttention({ jobs, summary }: { jobs: SchedulerJobHealth[]; summary?: SchedulerSummary | null }) {
  const attentionJobs = jobs
    .filter((job) => job.lastStatus === "failed" || job.lastError || job.lastRunAt === null || job.isActive === false)
    .slice(0, 3);

  const statusLabel = summary?.status === "BROKEN" ? "Automation broken" : summary?.status === "PARTIAL" ? "Automation partial" : "Automation live";
  const badgeTone = summary?.status === "BROKEN" ? "text-rose-300 border-rose-500/40" : summary?.status === "PARTIAL" ? "text-amber-200 border-amber-500/40" : "text-emerald-200 border-emerald-500/40";

  return (
    <section className="rounded-3xl border border-white/8 bg-black/30 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">Automation health</div>
          <p className="text-sm text-zinc-400">{summary?.failingCount ? `${summary.failingCount} job(s) need attention` : "All critical cadences reporting."}</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] ${badgeTone}`}>{statusLabel}</span>
      </div>

      {attentionJobs.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-400">No failing jobs detected.</p>
      ) : (
        <ul className="mt-4 space-y-3 text-sm text-zinc-200">
          {attentionJobs.map((job) => (
            <li key={job.jobKey} className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
              <div className="font-semibold text-white">{job.jobName}</div>
              <div className="text-xs text-zinc-400">Last run {formatAutomationTimestamp(job.lastRunAt)}</div>
              <div className="text-xs text-amber-200">{job.lastError ?? job.lastSummary ?? "No summary provided"}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatAutomationTimestamp(iso: string | null) {
  if (!iso) return "unknown";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleString();
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
  const woo = data.websiteConversion?.wooCommerce;
  const ga4 = data.websiteConversion?.ga4;
  const revenue = woo?.grossOrderRevenue ?? woo?.netRevenue ?? null;
  const orders = woo?.paidOrdersInWindow ?? null;
  const conversion = ga4?.funnelRates?.sessionToPurchase ?? null;
  const insight = data.executiveInsights?.trends?.find((trend) => trend.source === "woo")?.label ?? null;
  return {
    status: woo ? "Live" : "Needs data",
    tone: woo ? "emerald" : "amber",
    metrics: [
      revenue != null ? `Rev ${formatCurrencyShort(revenue)}` : null,
      orders != null ? `Orders ${formatCount(orders)}` : null,
      conversion != null ? `Conv ${(conversion * 100).toFixed(1)}%` : null
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

function buildDataConfidenceSummary(summary: ReturnType<typeof buildDataConfidence>, actions: ExecutiveActionPlan[]): SectionSummary {
  const healthy = summary.rows.filter((row) => row.status === "Healthy").length;
  const warnings = summary.rows.length - healthy;
  const warningRow = summary.rows.find((row) => row.warning);
  const tone: SectionSummary["tone"] = summary.overall.tone.includes("emerald")
    ? "emerald"
    : summary.overall.tone.includes("amber")
      ? "amber"
      : "rose";
  return {
    status: summary.overall.label,
    tone,
    metrics: [`Healthy ${healthy}`, `Warnings ${warnings}`],
    insight: warningRow?.warning ?? null,
    actions: actions.filter((action) => action.id.startsWith("telemetry-")).length
  };
}

function formatCurrencyShort(value: number | null | undefined) {
  if (value == null) return "$0";
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${Math.round(value)}`;
}

function formatCount(value: number | null | undefined) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num.toString() : "0";
}
