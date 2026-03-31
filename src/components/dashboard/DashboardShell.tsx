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
import { AgentConversationPanel } from "./AgentConversationPanel";

type Props = {
  data: DashboardOverviewResponse;
  agents: AgentDashboardResponse[];
};

export function DashboardShell({ data, agents }: Props) {
  return (
    <div className="space-y-8">
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
      <CommerceVisualsPanel telemetry={data.commerceTelemetry} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <ExecutiveCommandPanel data={data.executiveCommand} />
        </div>
        <div className="lg:col-span-2">
          <RevenueEnginePanel data={data.revenueEngine} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <BrandPowerPanel data={data.brandPower} />
        </div>
        <div className="lg:col-span-2">
          <OpportunityRadarPanel data={data.opportunityRadar} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[2fr_1fr]">
        <TaskBoard tasks={data.tasks} />
        <div className="space-y-6">
          <SystemHealthPanel data={data.systemHealth} />
          <AgentConversationPanel agents={agents} />
        </div>
      </div>
    </div>
  );
}
