import { buildExecutiveActions, buildExecutiveDrivers } from "@/lib/dashboard/executive-layout";
import { buildDataConfidenceModel } from "@/lib/data-confidence";
import { buildOperationsIntel, type OperationsIntel } from "@/lib/operations-intelligence";
import { DashboardOverviewResponse } from "@/lib/types/dashboard";
import type { AgentDashboardResponse } from "@/lib/types/agent";
import { ExecutiveRangeHeader } from "./ExecutiveRangeHeader";
import { ExecutiveStatusPanel } from "./ExecutiveStatusPanel";
import { ExecutiveBriefPanel } from "./ExecutiveBriefPanel";
import { ExecutiveKpiScorecard } from "./ExecutiveKpiScorecard";
import { ExecutiveDriversPanel } from "./ExecutiveDriversPanel";
import { ExecutiveActionsPanel } from "./ExecutiveActionsPanel";
import { ForwardStrategyPanel } from "./ForwardStrategyPanel";
import { SurvivalStrip } from "./SurvivalStrip";
import { ActionQueuePanel } from "./ActionQueuePanel";
import { TaskBoard } from "./TaskBoard";
import { AutomationStatusPanel } from "./AutomationStatusPanel";
import { AgentStatusPanel } from "./AgentStatusPanel";
import { DataConfidencePanel } from "./DataConfidencePanel";
import { OperationsReliabilityPanel } from "./OperationsReliabilityPanel";
import { DashboardSection } from "./ui/DashboardSection";
import { AgentKpiStrip } from "./AgentKpiStrip";
import { AgentAreaBoard } from "./AgentAreaBoard";
import { AgentUpdateFeed } from "./AgentUpdateFeed";
import { ExecutiveCommandPanel } from "./ExecutiveCommandPanel";
import { WebsiteConversionPanel } from "./WebsiteConversionPanel";
import { CommerceVisualsPanel } from "./CommerceVisualsPanel";
import { RevenueEnginePanel } from "./RevenueEnginePanel";
import { BrandPowerPanel } from "./BrandPowerPanel";
import { MarketingPerformancePanel } from "./MarketingPerformancePanel";
import { MetaAdsPanel } from "./MetaAdsPanel";
import { SocialIntelligencePanel } from "./SocialIntelligencePanel";
import { CloudflarePanel } from "./CloudflarePanel";
import { PanelAuditPlaceholder } from "./ui/PanelAuditPlaceholder";
import { OpportunityRadarPanel } from "./OpportunityRadarPanel";
import { CollectorPipelinePanel } from "./CollectorPipelinePanel";
import { CollectorsStatusPanel } from "./CollectorsStatusPanel";
import { CeoQuestionDeskPanel } from "./CeoQuestionDeskPanel";
import { WarRoomPanel } from "./WarRoomPanel";
import { IdeaBoardPanel } from "./IdeaBoardPanel";
import { ProofOfWorkPanel } from "./ProofOfWorkPanel";
import { IndustryPulsePanel } from "./IndustryPulsePanel";

const DEFAULT_SECTION_PROPS = {
  density: "comfortable" as const
};

const COMMAND_SECTION_PROPS = {
  ...DEFAULT_SECTION_PROPS,
  storageKey: "dashboard-section-command-center",
  defaultOpen: true
};

const AGENT_SECTION_PROPS = {
  ...DEFAULT_SECTION_PROPS,
  storageKey: "dashboard-section-agent-domains",
  defaultOpen: false
};

const REVENUE_SECTION_PROPS = {
  ...DEFAULT_SECTION_PROPS,
  storageKey: "dashboard-section-revenue-brand",
  defaultOpen: true
};

const PIPELINE_SECTION_PROPS = {
  ...DEFAULT_SECTION_PROPS,
  storageKey: "dashboard-section-pipeline",
  defaultOpen: false
};

type Props = {
  data: DashboardOverviewResponse;
  agents: AgentDashboardResponse[];
};

export function DashboardShell({ data, agents }: Props) {
  const dataConfidence = buildDataConfidenceModel(data);
  const operationsIntel = buildOperationsIntel(data);
  const executiveActions = buildExecutiveActions(data, 5, dataConfidence);
  const executiveDrivers = buildExecutiveDrivers(data.executiveInsights?.trends ?? [], 3, dataConfidence);
  const commandSummary = buildCommandSummary(data, operationsIntel);
  const agentSummary = buildAgentSummary(data, agents);
  const revenueSummary = buildRevenueBrandSummary(data);
  const pipelineSummary = buildPipelineSummary(data);
  const websiteSnapshot = data.websiteConversion ?? null;
  const metaSnapshot = data.metaAds ?? null;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-16 pt-8 sm:px-6">
      <DashboardSection title="Command Center" subtitle="Range controls, approvals, automation, and reliability" meta={<SectionMeta summary={commandSummary} />} {...COMMAND_SECTION_PROPS}>
        <div className="space-y-6">
          {data.survivalStrip ? <SurvivalStrip data={data.survivalStrip} /> : null}
          <ExecutiveRangeHeader range={data.range} insights={data.executiveInsights} />
          <ExecutiveStatusPanel insights={data.executiveInsights} fallbackRange={data.range} />
          {data.executiveInsights ? <ExecutiveBriefPanel insights={data.executiveInsights} /> : null}
          <ExecutiveKpiScorecard metrics={data.headerMetrics} />
          <div className="grid gap-6 lg:grid-cols-2">
            <ExecutiveDriversPanel trends={data.executiveInsights?.trends ?? []} drivers={executiveDrivers} confidence={dataConfidence} />
            <ExecutiveActionsPanel data={data} actions={executiveActions} confidence={dataConfidence} />
          </div>
          <ForwardStrategyPanel data={data} />
          <div className="grid gap-6 lg:grid-cols-2">
            <ActionQueuePanel data={data.actionQueue} />
            <TaskBoard
              tasks={data.tasks}
              schedulerJobs={data.schedulerJobs}
              agentSla={data.agentSla}
              approvalBottlenecks={data.approvalBottlenecks}
            />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <AutomationStatusPanel entries={data.automationStatusPanel} />
            <AgentStatusPanel entries={data.agentStatusPanel} />
          </div>
          <DataConfidencePanel summary={dataConfidence} />
          <OperationsReliabilityPanel intel={operationsIntel} />
        </div>
      </DashboardSection>

      <DashboardSection title="Agent Domains" subtitle="CEO, Product & Ecommerce, Brand Strategy, Research" meta={<SectionMeta summary={agentSummary} />} {...AGENT_SECTION_PROPS}>
        <div className="space-y-6">
          <AgentKpiStrip items={data.agentKpis} />
          <AgentAreaBoard agents={agents} agentSla={data.agentSla} />
          <AgentUpdateFeed items={data.agentUpdateFeed ?? []} />
        </div>
      </DashboardSection>

      <DashboardSection title="Revenue & Brand Systems" subtitle="Executive command, commerce telemetry, and channel performance" meta={<SectionMeta summary={revenueSummary} />} {...REVENUE_SECTION_PROPS}>
        <div className="space-y-6">
          <ExecutiveCommandPanel data={data.executiveCommand} />
          <div className="grid gap-6 lg:grid-cols-2">
            {websiteSnapshot ? (
              <WebsiteConversionPanel snapshot={websiteSnapshot} telemetry={data.commerceTelemetry} />
            ) : (
              <PanelAuditPlaceholder title="Website snapshot unavailable" detail="GA4 + Woo snapshot missing for this range." />
            )}
            <CommerceVisualsPanel telemetry={data.commerceTelemetry} />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            {data.revenueEngine ? <RevenueEnginePanel data={data.revenueEngine} /> : <PanelAuditPlaceholder title="Revenue engine offline" detail="No revenue diagnostics for this range." />}
            {data.brandPower ? <BrandPowerPanel data={data.brandPower} /> : <PanelAuditPlaceholder title="Brand KPIs offline" detail="Waiting on brand snapshot." />}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <MarketingPerformancePanel telemetry={data.commerceTelemetry} meta={data.metaAds} />
            {metaSnapshot ? (
              <MetaAdsPanel snapshot={metaSnapshot} />
            ) : (
              <PanelAuditPlaceholder title="Meta data unavailable" detail="Meta agent has not produced a snapshot for this window." />
            )}
          </div>
          <SocialIntelligencePanel snapshot={data.socialIntelligence} />
          <CloudflarePanel snapshot={data.cloudflare} />
        </div>
      </DashboardSection>

      <DashboardSection title="Pipeline & Partnerships" subtitle="Opportunities, collectors, CEO desk, and idea output" meta={<SectionMeta summary={pipelineSummary} />} {...PIPELINE_SECTION_PROPS}>
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <OpportunityRadarPanel data={data.opportunityRadar} />
            <CollectorPipelinePanel data={data.pipelinePanel} />
          </div>
          {data.collectorTelemetry ? <CollectorsStatusPanel snapshot={data.collectorTelemetry} /> : null}
          <div className="grid gap-6 lg:grid-cols-2">
            <CeoQuestionDeskPanel desk={data.ceoQuestionDesk} />
            <WarRoomPanel data={data.warRoom} />
          </div>
          <IdeaBoardPanel board={data.ideaBoard} />
          <ProofOfWorkPanel items={data.proofOfWork ?? []} />
          <div className="space-y-5">
            {data.industryPulseSnapshot ? (
              <IndustryPulsePanel snapshot={data.industryPulseSnapshot} />
            ) : (
              <PanelAuditPlaceholder title="Industry pulse offline" detail="No consolidated feed available." />
            )}
          </div>
        </div>
      </DashboardSection>
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

function buildCommandSummary(data: DashboardOverviewResponse, intel: OperationsIntel): SectionSummary {
  const approvals = data.actionQueue?.needsApprovalTasks?.count ?? 0;
  const decisions = data.actionQueue?.decisionsDue?.count ?? 0;
  const pendingTasks = (data.tasks ?? []).filter((task) => task.status !== "completed").length;
  const cronStatus = data.schedulerSummary?.status ?? "UNKNOWN";
  const warRoomActive = data.warRoom?.mode === "war_room";
  return {
    status: warRoomActive ? "War Room" : intel.overall.label,
    tone: warRoomActive ? "rose" : intel.overall.tone,
    metrics: [
      `Queue ${approvals + decisions}`,
      `Tasks ${pendingTasks}`,
      data.schedulerSummary ? `Cron ${cronStatus}` : null
    ].filter(Boolean) as string[],
    insight: warRoomActive ? data.warRoom.reason ?? intel.overall.detail : intel.overall.detail,
    actions: approvals + decisions + intel.actions.length
  };
}

function buildAgentSummary(data: DashboardOverviewResponse, agents: AgentDashboardResponse[]): SectionSummary {
  const totalAgents = agents.length;
  const agentRuns = data.agentSla ?? [];
  const paused = agentRuns.filter((snapshot) => (snapshot.minutesSinceRun ?? 0) > 240).length;
  const updates = data.agentUpdateFeed?.length ?? 0;
  const activeAgents = totalAgents - paused;
  const tone: SectionSummary["tone"] = paused === 0 ? "emerald" : paused < totalAgents ? "amber" : "rose";
  return {
    status: `${activeAgents}/${totalAgents} agents active`,
    tone,
    metrics: [
      `KPIs ${formatCount(data.agentKpis.length)}`,
      `Updates ${formatCount(updates)}`
    ],
    insight: paused ? `${paused} agent${paused === 1 ? "" : "s"} paused` : "All agents reporting",
    actions: paused
  };
}

function buildRevenueBrandSummary(data: DashboardOverviewResponse): SectionSummary {
  const woo = data.websiteConversion?.wooCommerce;
  const meta = data.metaAds;
  const revenue = woo?.grossOrderRevenue ?? woo?.netRevenue ?? null;
  const spend = meta?.summary?.spend ?? null;
  const roas = meta?.summary?.roas ?? null;
  let tone: SectionSummary["tone"] = revenue ? "emerald" : "amber";
  if (!revenue && !meta?.status) tone = "zinc";
  return {
    status: revenue ? "Revenue live" : "Need commerce data",
    tone,
    metrics: [
      revenue != null ? `Rev ${formatCurrencyShort(revenue)}` : null,
      spend != null ? `Spend ${formatCurrencyShort(spend)}` : null,
      roas != null ? `ROAS ${(roas ?? 0).toFixed(1)}x` : null
    ].filter(Boolean) as string[],
    insight: meta?.status ? `Meta ${meta.status}` : null,
    actions: data.executiveCommand.topPriorities.length
  };
}

function buildPipelineSummary(data: DashboardOverviewResponse): SectionSummary {
  const active = data.opportunityRadar?.activeCount ?? 0;
  const ready = data.opportunityRadar?.readyForOutreachCount ?? 0;
  const collectors = data.pipelinePanel?.collectors?.length ?? 0;
  const tone: SectionSummary["tone"] = active + ready > 0 ? "emerald" : collectors > 0 ? "amber" : "zinc";
  return {
    status: active + ready > 0 ? "Pipeline active" : "Pipeline idle",
    tone,
    metrics: [
      `Active ${formatCount(active)}`,
      `Ready ${formatCount(ready)}`,
      `Collectors ${formatCount(collectors)}`
    ],
    insight: data.warRoom?.reason ?? null,
    actions: data.proofOfWork?.length ?? 0
  };
}

function formatCurrencyShort(value: number | null | undefined) {
  if (value == null) return "$0";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${Math.round(value)}`;
}

function formatCount(value: number | null | undefined) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num.toString() : "0";
}
