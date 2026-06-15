import { DashboardOverviewResponse } from "@/lib/types/dashboard";
import type { AgentDashboardResponse } from "@/lib/types/agent";
import { ActionQueuePanel } from "./ActionQueuePanel";
import { IndustryPulsePanel } from "./IndustryPulsePanel";
import { PanelWrapper } from "./ui/PanelWrapper";
import { PanelAuditPlaceholder } from "./ui/PanelAuditPlaceholder";

type Props = {
  data: DashboardOverviewResponse;
  agents: AgentDashboardResponse[];
};

export function DashboardShell({ data }: Props) {
  const refreshedAt = data.timestamp;

  return (
    <div className="layout-shell space-y-6">
      <section className="rounded-3xl border border-amber-500/20 bg-amber-500/5 p-6 text-sm text-amber-100">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-200">Integrity audit mode</div>
        <p className="mt-2 text-base text-amber-50">
          Command Center panels are temporarily limited while we verify each data source. Only the sections below are safe to reference.
          Cron remains disabled until this audit completes.
        </p>
      </section>

      <PanelWrapper mode="LIVE" refreshedAtIso={refreshedAt}>
        <ActionQueuePanel data={data.actionQueue} />
      </PanelWrapper>

      <PanelAuditPlaceholder
        title="Industry pulse snapshot hidden"
        detail="RSS sources are being reconciled with production feeds. We will restore this panel after verifying the external sources."
      />

      <PanelAuditPlaceholder
        title="Website & revenue panels hidden"
        detail="GA4 + WooCommerce metrics are being revalidated. Website conversion, revenue engine, and executive copy will return once the data passes integrity checks."
      />

      <PanelAuditPlaceholder
        title="Automation + scheduler panels hidden"
        detail="Scheduler health strips were contradicting GitHub runs. We are wiring them to real telemetry before re-enabling."
      />

      <PanelAuditPlaceholder
        title="Pipeline, war room, collectors hidden"
        detail="Supabase pipeline queries are offline in this environment. Once the live feed is restored the full pipeline view will return."
      />

      <PanelAuditPlaceholder
        title="Social, Cloudflare, Meta panels hidden"
        detail="These panels were sourcing snapshot/manual data. They will stay hidden until their APIs are confirmed live."
      />
    </div>
  );
}
