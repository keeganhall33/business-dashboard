import { DashboardOverviewResponse } from "@/lib/types/dashboard";
import { HeaderStatusBar } from "./HeaderStatusBar";
import { ExecutiveCommandPanel } from "./ExecutiveCommandPanel";
import { RevenueEnginePanel } from "./RevenueEnginePanel";
import { BrandPowerPanel } from "./BrandPowerPanel";
import { OpportunityRadarPanel } from "./OpportunityRadarPanel";
import { TaskBoard } from "./TaskBoard";
import { SystemHealthPanel } from "./SystemHealthPanel";
import { DateRangeControls } from "./DateRangeControls";
import { CommerceVisualsPanel } from "./CommerceVisualsPanel";

type Props = {
  data: DashboardOverviewResponse;
};

export function DashboardShell({ data }: Props) {
  return (
    <div className="space-y-8">
      <DateRangeControls
        key={`${data.range.startDate}-${data.range.endDate}-${data.range.preset}`}
        preset={data.range.preset}
        startDate={data.range.startDate}
        endDate={data.range.endDate}
      />
      <HeaderStatusBar metrics={data.headerMetrics} refreshedAtIso={data.timestamp} />
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TaskBoard tasks={data.tasks} />
        </div>
        <div className="lg:col-span-1">
          <SystemHealthPanel data={data.systemHealth} />
        </div>
      </div>
    </div>
  );
}
