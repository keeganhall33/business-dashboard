import { DashboardOverviewResponse } from "@/lib/types/dashboard";
import type { AgentDashboardResponse } from "@/lib/types/agent";
import { PanelWrapper } from "./ui/PanelWrapper";
import { PanelAuditPlaceholder } from "./ui/PanelAuditPlaceholder";
import { HeaderStatusBar } from "./HeaderStatusBar";
import { WebsiteConversionPanel } from "./WebsiteConversionPanel";
import { CloudflarePanel } from "./CloudflarePanel";
import { SurvivalStrip } from "./SurvivalStrip";
import { AutomationPanel } from "./AutomationPanel";
import { MetaAdsPanel } from "./MetaAdsPanel";
import { PipelineDealsPanel } from "./PipelineDealsPanel";
import { WarRoomPanel } from "./WarRoomPanel";
import { CollectorsStatusPanel } from "./CollectorsStatusPanel";

type Props = {
  data: DashboardOverviewResponse;
  agents: AgentDashboardResponse[];
};

export function DashboardShell({ data }: Props) {
  const refreshedAt = data.timestamp;
  const websiteSnapshot = data.websiteConversion ?? null;
  const websiteRefreshedAt = websiteSnapshot?.generatedAt ?? refreshedAt;
  const survivalSnapshot = data.survivalStrip ?? null;
  const schedulerJobs = data.schedulerJobs ?? [];
  const schedulerSummary = data.schedulerSummary ?? null;
  const metaSnapshot = data.metaAds ?? null;
  const pipelinePanel = data.pipelinePanel ?? { collectors: [], deals: [] };
  const pipelineDeals = pipelinePanel.deals ?? [];
  const collectorSnapshot = data.collectorTelemetry ?? null;
  const schedulerPanelMode = schedulerSummary?.status === "LIVE" ? "LIVE" : schedulerSummary?.status === "PARTIAL" ? "PARTIAL" : "BROKEN";
  const metaPanelMode = metaSnapshot?.status === "LIVE" ? "LIVE" : metaSnapshot?.status === "PARTIAL" ? "PARTIAL" : "FALLBACK";
  const warRoomState = data.warRoom;
  const hasWarRoomEntries = Boolean(warRoomState && (warRoomState.entries?.length || warRoomState.reason));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pb-16 pt-8 sm:px-6">
      <section className="rounded-3xl border border-amber-500/20 bg-amber-500/5 p-6 text-sm text-amber-100">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-200">Command Center audit mode</div>
        <p className="mt-2 text-base text-amber-50">
          Website ingestion (GA4 + WooCommerce) and Cloudflare telemetry are the only systems proven LIVE right now. All other surfaces stay locked
          until their data sources are verified. Cron remains OFF.
        </p>
        <ul className="mt-4 space-y-1 text-sm text-amber-100/90">
          <li>• Command Center = RED while audit mode is active.</li>
          <li>• Website + Cloudflare slices = GREEN/LIVE with artifact proof.</li>
          <li>• Meta telemetry is live; Social, Pipeline, War Room, Executive remain locked.</li>
          <li>• Scheduler automation claims stay disabled until Fix Wave 3 completes.</li>
        </ul>
        <div className="mt-4 text-xs uppercase tracking-[0.25em] text-amber-200/60">Audit containment build: e96bc28</div>
      </section>

      <PanelWrapper mode="SNAPSHOT" refreshedAtIso={refreshedAt}>
        <HeaderStatusBar metrics={data.headerMetrics} refreshedAtIso={refreshedAt} />
      </PanelWrapper>

      {survivalSnapshot?.configured ? (
        <PanelWrapper mode="SNAPSHOT" refreshedAtIso={survivalSnapshot.lastUpdatedAt ?? refreshedAt}>
          <SurvivalStrip data={survivalSnapshot} />
        </PanelWrapper>
      ) : null}

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

      {data.cloudflare ? (
        <PanelWrapper mode="LIVE" refreshedAtIso={data.cloudflare.generatedAt}>
          <CloudflarePanel snapshot={data.cloudflare} />
        </PanelWrapper>
      ) : (
        <PanelAuditPlaceholder title="Cloudflare panel hidden" detail="Cloudflare GraphQL telemetry unavailable. Re-run the cloudflare job to repopulate." />
      )}

      {schedulerJobs.length ? (
        <PanelWrapper mode={schedulerPanelMode} refreshedAtIso={schedulerSummary?.lastUpdatedAt ?? refreshedAt}>
          <AutomationPanel jobs={schedulerJobs} summary={schedulerSummary} />
        </PanelWrapper>
      ) : (
        <PanelAuditPlaceholder
          title="Scheduler telemetry unavailable"
          detail="No scheduler job metadata loaded. Run the scheduler status workflow to capture current telemetry before re-enabling cron."
        />
      )}

      <PanelAuditPlaceholder
        title="Revenue & forecasts hidden"
        detail="Revenue engine, money-leak insights, and Fastest Path analysis stay OFF until upcoming Fix Wave 3 proves the inputs."
      />

      {metaSnapshot ? (
        <PanelWrapper mode={metaPanelMode} refreshedAtIso={metaSnapshot.generatedAt}>
          <MetaAdsPanel snapshot={metaSnapshot} />
        </PanelWrapper>
      ) : (
        <PanelAuditPlaceholder
          title="Meta panel hidden"
          detail="Meta reporting not available. Run the meta agent to populate dashboard/data/meta/latest.json."
        />
      )}

      <PanelAuditPlaceholder
        title="Social telemetry pending"
        detail="Social telemetry pending. Current source is fallback/manual only, so the Social panel remains hidden until a live feed is verified."
      />

      <PanelAuditPlaceholder
        title="Action queue locked"
        detail="Action queue automation is disabled during audit mode. Tasks will reappear after verification."
      />

      <PanelAuditPlaceholder
        title="Executive summary hidden"
        detail="Executive copy references cross-agent data (Meta, Cloudflare, scheduler). It stays offline until all data sources are verified."
      />

      <PanelAuditPlaceholder
        title="Industry pulse snapshot hidden"
        detail="RSS sources are being reconciled with production feeds. We will restore this panel after verifying the external sources."
      />

      {pipelineDeals.length ? (
        <PanelWrapper mode="LIVE" refreshedAtIso={refreshedAt}>
          <PipelineDealsPanel deals={pipelineDeals} />
        </PanelWrapper>
      ) : (
        <PanelAuditPlaceholder
          title="Pipeline deals hidden"
          detail="No safe opportunity data was loaded. When Supabase opportunity_pipeline refreshes with live deals this panel will reappear."
          mode="PARTIAL"
        />
      )}

      {hasWarRoomEntries ? (
        <PanelWrapper mode="LIVE" refreshedAtIso={warRoomState?.lastUpdated ?? refreshedAt}>
          <WarRoomPanel data={warRoomState} />
        </PanelWrapper>
      ) : (
        <PanelAuditPlaceholder
          title="War Room hidden"
          detail="War Room state could not be loaded. Once the operating_mode state and thread history are verified this panel will return."
          mode="PARTIAL"
        />
      )}

      {collectorSnapshot ? (
        <PanelWrapper mode="PARTIAL" refreshedAtIso={collectorSnapshot.lastImportedAt ?? refreshedAt}>
          <CollectorsStatusPanel snapshot={collectorSnapshot} />
        </PanelWrapper>
      ) : (
        <PanelAuditPlaceholder
          title="Collectors hidden"
          detail="Collectors hidden. Source is stale. Latest collector touch: May 18. Manual fallback table last changed Apr 30."
          mode="BROKEN"
        />
      )}

    </div>
  );
}
