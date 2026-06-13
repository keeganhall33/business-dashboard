import { DashboardOverviewResponse, type IdeaCard } from "@/lib/types/dashboard";
import type { AgentDashboardResponse } from "@/lib/types/agent";
import { HeaderStatusBar } from "./HeaderStatusBar";
import { ExecutiveCommandPanel } from "./ExecutiveCommandPanel";
import { RevenueEnginePanel } from "./RevenueEnginePanel";
import { BrandPowerPanel } from "./BrandPowerPanel";
import { OpportunityRadarPanel } from "./OpportunityRadarPanel";
import { TaskBoard } from "./TaskBoard";
import { SystemHealthPanel } from "./SystemHealthPanel";
import { DateRangeControls } from "./DateRangeControls";
import { CommerceVisualsPanel } from "./CommerceVisualsPanel";
import { MarketingPerformancePanel } from "./MarketingPerformancePanel";
import { SalesPanel } from "./SalesPanel";
import { WarRoomPanel } from "./WarRoomPanel";
import { ActionQueuePanel } from "./ActionQueuePanel";
import { SurvivalStrip } from "./SurvivalStrip";
import { CollectorPipelinePanel } from "./CollectorPipelinePanel";
import { AgentAreaBoard } from "./AgentAreaBoard";
import { AutomationPanel } from "./AutomationPanel";
import { AgentAutomationPanel } from "./AgentAutomationPanel";
import { AgentKpiStrip } from "./AgentKpiStrip";
import { IdeaBoardPanel } from "./IdeaBoardPanel";
import { CeoQuestionDeskPanel } from "./CeoQuestionDeskPanel";
import { IndustryPulsePanel } from "./IndustryPulsePanel";
import { ProofOfWorkPanel } from "./ProofOfWorkPanel";
import { LuxuryCollectiblesKpiPanel } from "./LuxuryCollectiblesKpiPanel";
import { EmptyState } from "./ui/EmptyState";
import { DashboardSection } from "./ui/DashboardSection";
import { ContextPanel, type ContextItem } from "./ui/ContextPanel";
import { CommandBar } from "./CommandBar";
import { formatRelativeTimeFromNow } from "@/lib/date";
import { MetaAdsPanel } from "./MetaAdsPanel";
import { MetaWebsiteComparison } from "./MetaWebsiteComparison";
import { ExecutiveSummaryPanel } from "./ExecutiveSummaryPanel";
import { IndustryPulsePanel } from "./IndustryPulsePanel";
import { SocialIntelligencePanel } from "./SocialIntelligencePanel";
import { LeadIntelligencePanel } from "./LeadIntelligencePanel";
import { WebsiteConversionPanel } from "./WebsiteConversionPanel";
import { AgentStatusPanel } from "./AgentStatusPanel";
import { AutomationStatusPanel } from "./AutomationStatusPanel";
import { DataSourceMatrixPanel } from "./DataSourceMatrixPanel";
import { ActionListPanel } from "./ActionListPanel";

type Props = {
  data: DashboardOverviewResponse;
  agents: AgentDashboardResponse[];
};

const numberFormatter = new Intl.NumberFormat("en-US");

export function DashboardShell({ data, agents }: Props) {
  const agentCommentary = buildAgentCommentaryMap(agents);
  const commandContext = buildCommandContext(data);
  const agentContext = buildAgentDomainContext(data);
  const revenueContext = buildRevenueContext(data);
  const pipelineContext = buildPipelineContext(data);

  return (
    <div className="layout-shell section-grid">
      <CommandBar actionQueue={data.actionQueue} schedulerJobs={data.schedulerJobs} refreshedAtIso={data.timestamp} />
      <div className="section-grid">
        <SurvivalStrip data={data.survivalStrip} />
        <HeaderStatusBar
          metrics={data.headerMetrics}
          refreshedAtIso={data.timestamp}
          controls={
            <DateRangeControls
              key={`${data.range.startDate}-${data.range.endDate}-${data.range.preset}`}
              preset={data.range.preset}
              startDate={data.range.startDate}
              endDate={data.range.endDate}
            />
          }
        />

        <IndustryPulsePanel initialSnapshot={data.industryPulse} />
      </div>

      <DashboardSection
        title="Command Center"
        subtitle="Approvals, tasks, automation"
        storageKey="dashboard-section-command"
        defaultOpen
        context={commandContext}
      >
        <div id="command-center" className="responsive-columns" data-align="wide">
          <div className="column column-wide space-y-8">
            <ActionQueuePanel data={data.actionQueue} />
            <ActionListPanel title="Top Actions" subtitle="Execution-ready moves" items={data.topActions} />
            <ActionListPanel title="Blocked" subtitle="Needs attention" items={data.blockedItems} />
            <TaskBoard
              tasks={data.tasks}
              schedulerJobs={data.schedulerJobs}
              agentSla={data.agentSla}
              approvalBottlenecks={data.approvalBottlenecks}
              agentCommentary={agentCommentary}
            />
          </div>
          <div className="column column-medium space-y-8">
            {data.luxuryCollectibles ? (
              <LuxuryCollectiblesKpiPanel data={data.luxuryCollectibles} />
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <EmptyState title="Luxury KPIs unavailable" detail="No live luxury collectible data has been ingested yet." />
              </div>
            )}
            <AgentStatusPanel entries={data.agentStatusPanel} />
            <AutomationStatusPanel entries={data.automationStatusPanel} />
            <DataSourceMatrixPanel entries={data.dataSourceAccess} />
            <AutomationPanel jobs={data.schedulerJobs} />
            <AgentAutomationPanel agentSla={data.agentSla} />
            <SystemHealthPanel data={data.systemHealth} />
            <ProofOfWorkPanel items={data.proofOfWork ?? []} />
          </div>
        </div>
      </DashboardSection>

      <DashboardSection
        title="Agent Domains"
        subtitle="CEO, Product, Brand, Research"
        storageKey="dashboard-section-domains"
        defaultOpen={false}
        context={agentContext}
      >
        <div className="space-y-6">
          <AgentKpiStrip items={data.agentKpis} dense />
          <AgentAreaBoard agents={agents} agentSla={data.agentSla} />
        </div>
      </DashboardSection>

      <DashboardSection
        title="Revenue & Brand Systems"
        subtitle="Revenue engine + brand signal"
        storageKey="dashboard-section-revenue"
        defaultOpen
        context={revenueContext}
      >
        <div className="responsive-columns" data-align="wide">
          <div className="column column-wide space-y-8">
            <ExecutiveSummaryPanel summary={data.executiveSummary} />
            <WebsiteConversionPanel snapshot={data.websiteConversion} />
            <ExecutiveCommandPanel data={data.executiveCommand} />
            <RevenueEnginePanel data={data.revenueEngine} />
            <BrandPowerPanel data={data.brandPower} />
          </div>
          <div className="column column-medium space-y-8">
            <SalesPanel telemetry={data.commerceTelemetry} />
            <MarketingPerformancePanel telemetry={data.commerceTelemetry} />
            <CommerceVisualsPanel telemetry={data.commerceTelemetry} />
            <MetaAdsPanel snapshot={data.metaAds} />
            <MetaWebsiteComparison meta={data.metaAds} website={data.websiteConversion ?? undefined} />
          </div>
        </div>
      </DashboardSection>

      <DashboardSection
        title="Pipeline & Partnerships"
        subtitle="Opportunities, collectors, war room, ideas"
        storageKey="dashboard-section-pipeline"
        defaultOpen={false}
        context={pipelineContext}
      >
        <div id="pipeline" className="space-y-6">
          <IndustryPulsePanel snapshot={data.industryPulse} />
          <div className="responsive-columns" data-align="equal">
            <div className="column space-y-8">
              <OpportunityRadarPanel data={data.opportunityRadar} />
            </div>
            <div className="column space-y-8">
              <CollectorPipelinePanel data={data.pipelinePanel} />
            </div>
            <div className="column space-y-8">
              <WarRoomPanel data={data.warRoom} />
              <CeoQuestionDeskPanel desk={data.ceoQuestionDesk} />
              <SocialIntelligencePanel snapshot={data.socialIntelligence} />
              <LeadIntelligencePanel snapshot={data.leadIntelligence} />
            </div>
          </div>

          <IdeaBoardPanel board={data.ideaBoard} />
        </div>
      </DashboardSection>
    </div>
  );
}

type AgentCommentary = {
  title: string | null;
  summary: string | null;
  createdAt: string | null;
};

function buildAgentCommentaryMap(agents: AgentDashboardResponse[]) {
  return agents.reduce<Record<string, AgentCommentary | null>>((acc, agent) => {
    const latest = agent.recentUpdates.find((update) => update.summary || update.title);
    acc[agent.agent.agentKey] = latest
      ? {
          title: latest.title ?? null,
          summary: latest.summary ?? null,
          createdAt: latest.createdAt ?? null
        }
      : null;
    return acc;
  }, {});
}

function buildCommandContext(data: DashboardOverviewResponse) {
  const approvalsPending = data.actionQueue.needsApprovalTasks.count;
  const decisionsDue = data.actionQueue.decisionsDue.count;
  const openTasks = data.tasks.filter((task) => task.status !== "completed").length;
  const oldestPendingHours = data.approvalBottlenecks.oldestPendingHours;
  const failedJob = data.schedulerJobs.find((job) => job.lastStatus === "failed");
  const lastRun = data.schedulerJobs
    .filter((job) => job.lastRunAt)
    .sort((a, b) => (b.lastRunAt ?? "").localeCompare(a.lastRunAt ?? ""))[0];

  const automationItems: ContextItem[] = [
    { label: "Jobs scheduled", value: `${data.schedulerJobs.length}` },
    failedJob
      ? {
          label: "Attention",
          value: failedJob.jobName,
          supportingText: failedJob.lastRunAt ? `Failed ${formatRelativeTimeFromNow(failedJob.lastRunAt)}` : "Failed on last run"
        }
      : { label: "Status", value: "All passing" },
    lastRun?.lastRunAt
      ? { label: "Last refresh", value: formatRelativeTimeFromNow(lastRun.lastRunAt) }
      : undefined
  ].filter(Boolean) as ContextItem[];

  return (
    <>
      <ContextPanel
        title="Approval Load"
        items={[
          {
            label: "Awaiting review",
            value: `${approvalsPending} items`,
            supportingText: oldestPendingHours ? `Oldest pending ${oldestPendingHours.toFixed(1)}h` : undefined
          },
          { label: "Decisions due", value: `${decisionsDue}` },
          { label: "Open tasks", value: `${openTasks}` }
        ]}
      />
      <ContextPanel title="Automation Health" items={automationItems} />
    </>
  );
}

function buildAgentDomainContext(data: DashboardOverviewResponse) {
  const overdueAgents = data.agentSla.filter((snapshot) => (snapshot.minutesSinceRun ?? 0) > 240).length;
  const unhealthyAgents = data.systemHealth.agents.filter((agent) => agent.health !== "healthy").length;
  const avgCompletion = data.systemHealth.agentTaskCompletionRate;

  return (
    <ContextPanel
      title="Agent SLA"
      items={[
        {
          label: "Overdue runs",
          value: `${overdueAgents}`,
          supportingText: overdueAgents ? "Agents past SLA window" : "All agents within SLA"
        },
        {
          label: "Needs attention",
          value: `${unhealthyAgents}`,
          supportingText: unhealthyAgents ? "Agents that are warning/stale" : "All green"
        },
        {
          label: "Completion rate",
          value: avgCompletion != null ? `${(avgCompletion * 100).toFixed(0)}%` : "—"
        }
      ]}
    />
  );
}

function buildRevenueContext(data: DashboardOverviewResponse) {
  const primaryMetric = data.revenueEngine.metrics[0];
  const primaryMetricLabel = primaryMetric
    ? (primaryMetric as typeof primaryMetric & { metricName?: string }).metricName ?? primaryMetric.metricKey
    : "—";
  const changePercent = primaryMetric?.stats?.changePercent ?? null;
  const changeLabel =
    typeof changePercent === "number" && Number.isFinite(changePercent)
      ? `${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(1)}%`
      : "—";
  const leakCount = data.revenueEngine.moneyLeaks.length;
  const topPriority = data.executiveCommand.topPriorities[0];

  return (
    <>
      <ContextPanel
        title="Revenue Pulse"
        items={[
          { label: "Primary metric", value: primaryMetricLabel },
          { label: "Delta vs. prior", value: changeLabel },
          { label: "Money leaks", value: `${leakCount}` }
        ]}
      />
      {topPriority ? (
        <ContextPanel
          title="Directive"
          items={[{ label: "Focus", value: topPriority, supportingText: "Weekly directive" }]}
        />
      ) : null}

    </>
  );
}

function buildPipelineContext(data: DashboardOverviewResponse) {
  const activeOpportunities = data.opportunityRadar.activeCount;
  const readyForOutreach = data.opportunityRadar.readyForOutreachCount;
  const collectors = data.pipelinePanel.collectors.length;
  const warMode = data.warRoom.mode === "war_room";
  const ideaCounts = countIdeas(data.ideaBoard);

  return (
    <>
      <ContextPanel
        title="Opportunities"
        items={[
          { label: "Active", value: numberFormatter.format(activeOpportunities) },
          { label: "Ready to act", value: numberFormatter.format(readyForOutreach) },
          { label: "Collectors", value: numberFormatter.format(collectors) }
        ]}
      />
      <ContextPanel
        title="Ideas & War Room"
        items={[
          { label: "Ideas", value: numberFormatter.format(ideaCounts.total) },
          { label: "Needs CEO review", value: numberFormatter.format(ideaCounts.needsCeoReview) },
          { label: "Mode", value: warMode ? "War Room" : "Normal" }
        ]}
      />
    </>
  );
}

function countIdeas(board: DashboardOverviewResponse["ideaBoard"]) {
  let total = 0;
  let needsCeoReview = 0;

  const columns: unknown[] = Array.isArray(board.columns) ? board.columns : Object.values(board.columns ?? {});
  for (const column of columns) {
    if (!column) continue;
    const ideasArray = normalizeIdeas(column);
    for (const idea of ideasArray) {
      if (!idea) continue;
      total += 1;
      if (idea.requiresCeoApproval && !idea.approvedAt) {
        needsCeoReview += 1;
      }
    }
  }

  return { total, needsCeoReview };
}

function normalizeIdeas(column: unknown): IdeaCard[] {
  if (Array.isArray(column)) {
    return column.filter(isIdeaCard);
  }

  if (typeof column === "object" && column !== null && "ideas" in column) {
    const maybeIdeas = (column as { ideas?: unknown }).ideas;
    if (Array.isArray(maybeIdeas)) {
      return maybeIdeas.filter(isIdeaCard);
    }
  }

  return [];
}

function isIdeaCard(value: unknown): value is IdeaCard {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<IdeaCard>;
  return typeof v.id === "string" && typeof v.agentKey === "string" && typeof v.title === "string";
}
