import { DashboardOverviewResponse } from "@/lib/types/dashboard";
import type { AgentDashboardResponse } from "@/lib/types/agent";
import { ActionQueuePanel } from "./ActionQueuePanel";
import { IndustryPulsePanel } from "./IndustryPulsePanel";
import { PanelWrapper } from "./ui/PanelWrapper";
import { PanelAuditPlaceholder } from "./ui/PanelAuditPlaceholder";
import { HeaderStatusBar } from "./HeaderStatusBar";
import { WebsiteConversionPanel } from "./WebsiteConversionPanel";
import { RevenueEnginePanel } from "./RevenueEnginePanel";

type Props = {
  data: DashboardOverviewResponse;
  agents: AgentDashboardResponse[];
};

export function DashboardShell({ data }: Props) {
  const refreshedAt = data.timestamp;
  const websiteSnapshot = data.websiteConversion ?? null;
  const websiteRefreshedAt = websiteSnapshot?.generatedAt ?? refreshedAt;

  return (
    <div className="layout-shell space-y-6">
      <section className="rounded-3xl border border-amber-500/20 bg-amber-500/5 p-6 text-sm text-amber-100">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-200">Integrity audit mode</div>
        <p className="mt-2 text-base text-amber-50">
          Command Center panels remain limited while we verify every data source. Website ingestion (GA4 + WooCommerce) is now LIVE, but optional GA4
          funnel events are still pending. Cron remains disabled until the broader audit completes.
        </p>
      </section>

      <PanelWrapper mode="SNAPSHOT" refreshedAtIso={refreshedAt}>
        <HeaderStatusBar metrics={data.headerMetrics} refreshedAtIso={refreshedAt} />
      </PanelWrapper>

      {websiteSnapshot ? (
        <PanelWrapper mode="LIVE" refreshedAtIso={websiteRefreshedAt}>
          <WebsiteConversionPanel snapshot={websiteSnapshot} />
        </PanelWrapper>
      ) : (
        <PanelAuditPlaceholder
          title="Website snapshot unavailable"
          detail="The latest GA4 + WooCommerce snapshot could not be loaded. Re-run the website agent to regenerate dashboard/data/website/latest.json."
        />
      )}

      <PanelWrapper mode="SNAPSHOT" refreshedAtIso={refreshedAt}>
        <RevenueEnginePanel data={data.revenueEngine} />
      </PanelWrapper>

      <PanelWrapper mode="LIVE" refreshedAtIso={refreshedAt}>
        <ActionQueuePanel data={data.actionQueue} />
      </PanelWrapper>

      <PanelAuditPlaceholder
        title="Executive summary hidden"
        detail="Executive copy references cross-agent data (Meta, Cloudflare, scheduler). It stays offline until all data sources are verified."
      />

      <PanelAuditPlaceholder
        title="Industry pulse snapshot hidden"
        detail="RSS sources are being reconciled with production feeds. We will restore this panel after verifying the external sources."
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
