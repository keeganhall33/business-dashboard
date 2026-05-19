import { DashboardOverviewResponse } from "@/lib/types/dashboard";
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
import { AgentKpiStrip } from "./AgentKpiStrip";
import { IdeaBoardPanel } from "./IdeaBoardPanel";
import { CeoQuestionDeskPanel } from "./CeoQuestionDeskPanel";
import { DashboardSection } from "./ui/DashboardSection";
import { CommandBar } from "./CommandBar";

type Props = {
  data: DashboardOverviewResponse;
  agents: AgentDashboardResponse[];
};

export function DashboardShell({ data, agents }: Props) {
  const agentCommentary = buildAgentCommentaryMap(agents);

  return (
    <div className="space-y-8">
      <CommandBar actionQueue={data.actionQueue} schedulerJobs={data.schedulerJobs} refreshedAtIso={data.timestamp} />
      <div className="space-y-6">
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
      </div>

      <DashboardSection
        title="Command Center"
        subtitle="Approvals, tasks, automation"
        storageKey="dashboard-section-command"
        defaultOpen
      >
        <div id="command-center" className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="space-y-8 lg:col-span-7 xl:col-span-8">
            <ActionQueuePanel data={data.actionQueue} />
            <TaskBoard
              tasks={data.tasks}
              schedulerJobs={data.schedulerJobs}
              agentSla={data.agentSla}
              approvalBottlenecks={data.approvalBottlenecks}
              agentCommentary={agentCommentary}
            />
          </div>
          <div className="space-y-8 lg:col-span-5 xl:col-span-4">
            <AutomationPanel jobs={data.schedulerJobs} />
            <SystemHealthPanel data={data.systemHealth} />
          </div>
        </div>
      </DashboardSection>

      <DashboardSection
        title="Agent Domains"
        subtitle="CEO, Product, Brand, Research"
        storageKey="dashboard-section-domains"
        defaultOpen={false}
      >
        <div className="space-y-6">
          <AgentKpiStrip items={data.agentKpis} dense />
          <AgentAreaBoard agents={agents} />
        </div>
      </DashboardSection>

      <DashboardSection
        title="Revenue & Brand Systems"
        subtitle="Revenue engine + brand signal"
        storageKey="dashboard-section-revenue"
        defaultOpen
      >
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="space-y-8 lg:col-span-7 xl:col-span-8">
            <ExecutiveCommandPanel data={data.executiveCommand} />
            <RevenueEnginePanel data={data.revenueEngine} />
            <BrandPowerPanel data={data.brandPower} />
          </div>
          <div className="space-y-8 lg:col-span-5 xl:col-span-4">
            <SalesPanel telemetry={data.commerceTelemetry} />
            <MarketingPerformancePanel telemetry={data.commerceTelemetry} />
            <CommerceVisualsPanel telemetry={data.commerceTelemetry} />
          </div>
        </div>
      </DashboardSection>

      <DashboardSection
        title="Pipeline & Partnerships"
        subtitle="Opportunities, collectors, war room, ideas"
        storageKey="dashboard-section-pipeline"
        defaultOpen={false}
      >
        <div id="pipeline" className="space-y-6">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            <div className="space-y-8 lg:col-span-6 xl:col-span-4">
              <OpportunityRadarPanel data={data.opportunityRadar} />
            </div>
            <div className="space-y-8 lg:col-span-6 xl:col-span-4">
              <CollectorPipelinePanel data={data.pipelinePanel} />
            </div>
            <div className="space-y-8 lg:col-span-12 xl:col-span-4">
              <WarRoomPanel data={data.warRoom} />
              <CeoQuestionDeskPanel desk={data.ceoQuestionDesk} />
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
