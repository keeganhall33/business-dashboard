import { DashboardOverviewResponse } from "@/lib/types/dashboard";
import type { AgentDashboardResponse } from "@/lib/types/agent";
import { PanelWrapper } from "./ui/PanelWrapper";
import { PanelAuditPlaceholder } from "./ui/PanelAuditPlaceholder";
import { HeaderStatusBar } from "./HeaderStatusBar";
import { WebsiteConversionPanel } from "./WebsiteConversionPanel";
import { CloudflarePanel } from "./CloudflarePanel";
import { SurvivalStrip } from "./SurvivalStrip";

type Props = {
  data: DashboardOverviewResponse;
  agents: AgentDashboardResponse[];
};

export function DashboardShell({ data }: Props) {
  const refreshedAt = data.timestamp;
  const websiteSnapshot = data.websiteConversion ?? null;
  const websiteRefreshedAt = websiteSnapshot?.generatedAt ?? refreshedAt;
  const survivalSnapshot = data.survivalStrip ?? null;

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
          <li>• Scheduler, Meta, Social, Pipeline, War Room, Executive = locked.</li>
          <li>• Automation claims are disabled until Fix Wave 3.</li>
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

      <PanelAuditPlaceholder
        title="Revenue & forecasts hidden"
        detail="Revenue engine, money-leak insights, and Fastest Path analysis stay OFF until upcoming Fix Wave 3 proves the inputs."
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

      <PanelAuditPlaceholder
        title="Automation + scheduler panels hidden"
        detail="Scheduler health strips were contradicting GitHub runs. We are wiring them to real telemetry before re-enabling."
      />

      <PanelAuditPlaceholder
        title="Pipeline, war room, collectors hidden"
        detail="Supabase pipeline queries are offline in this environment. Once the live feed is restored the full pipeline view will return."
      />

      <PanelAuditPlaceholder
        title="Social & Meta panels hidden"
        detail="These panels were sourcing snapshot/manual data. They will stay hidden until their APIs are confirmed live."
      />
    </div>
  );
}
