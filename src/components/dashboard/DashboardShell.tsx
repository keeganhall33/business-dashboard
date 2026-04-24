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
import { WarRoomPanel } from "./WarRoomPanel";
import { ActionQueuePanel } from "./ActionQueuePanel";
import { SurvivalStrip } from "./SurvivalStrip";
import { CollectorPipelinePanel } from "./CollectorPipelinePanel";
import { AgentAreaBoard } from "./AgentAreaBoard";
import { AutomationPanel } from "./AutomationPanel";
import { AgentKpiStrip } from "./AgentKpiStrip";
import { IdeaBoardPanel } from "./IdeaBoardPanel";
import { CeoQuestionDeskPanel } from "./CeoQuestionDeskPanel";

type Props = {
  data: DashboardOverviewResponse;
  agents: AgentDashboardResponse[];
};

export function DashboardShell({ data, agents }: Props) {
  return (
    <div className="space-y-8">
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
      <WarRoomPanel data={data.warRoom} />
      <CommerceVisualsPanel telemetry={data.commerceTelemetry} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="space-y-6 xl:col-span-8">
          <ActionQueuePanel data={data.actionQueue} />
          <TaskBoard
            tasks={data.tasks}
            schedulerJobs={data.schedulerJobs}
            agentSla={data.agentSla}
            approvalBottlenecks={data.approvalBottlenecks}
          />
        </div>
        <div className="space-y-6 xl:col-span-4">
          <SystemHealthPanel data={data.systemHealth} />
          <AutomationPanel jobs={data.schedulerJobs} />
        </div>
      </div>

      <section className="space-y-6">
        <AgentKpiStrip items={data.agentKpis} />
        <AgentAreaBoard agents={agents} />
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="space-y-6 xl:col-span-8">
          <ExecutiveCommandPanel data={data.executiveCommand} />
          <RevenueEnginePanel data={data.revenueEngine} />
          <OpportunityRadarPanel data={data.opportunityRadar} />
        </div>
        <div className="space-y-6 xl:col-span-4">
          <BrandPowerPanel data={data.brandPower} />
          <CollectorPipelinePanel data={data.pipelinePanel} />
          <CeoQuestionDeskPanel desk={data.ceoQuestionDesk} />
          <IdeaBoardPanel board={data.ideaBoard} />
        </div>
      </div>
    </div>
  );
}
