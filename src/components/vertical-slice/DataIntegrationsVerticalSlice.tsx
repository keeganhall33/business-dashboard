import type { DashboardOverviewResponse, TelemetrySource } from "@/lib/types/dashboard";
import { buildDataConfidenceModel } from "@/lib/data-confidence";
import { VerticalSliceCard, Pill, DefinitionRow } from "./VerticalSliceCard";
import integrationGapJson from "../../../docs/bi-integration-gap-analysis.json";

type IntegrationStatus =
  | "connected_reliable"
  | "connected_incomplete"
  | "manual_only"
  | "technically_connectable"
  | "placeholder_or_seed"
  | "unavailable"
  | "not_worth_connecting";

type GapAnalysis = {
  integrations: Array<{ integration_id: string; source_name: string; business_function: string; status: IntegrationStatus }>;
};

function statusTone(status: IntegrationStatus) {
  if (status === "connected_reliable") return "emerald" as const;
  if (status === "connected_incomplete") return "amber" as const;
  if (status === "placeholder_or_seed") return "amber" as const;
  if (status === "manual_only") return "zinc" as const;
  if (status === "technically_connectable") return "zinc" as const;
  if (status === "not_worth_connecting") return "zinc" as const;
  return "rose" as const;
}

function healthTone(status?: string | null) {
  if (status === "healthy") return "emerald" as const;
  if (status === "warning") return "amber" as const;
  if (status === "critical") return "rose" as const;
  return "zinc" as const;
}

export function DataIntegrationsVerticalSlice({ data }: { data: DashboardOverviewResponse }) {
  const confidence = buildDataConfidenceModel(data);
  const gap = integrationGapJson as unknown as GapAnalysis;

  const sources: Array<{ source: TelemetrySource; label: string }> = [
    { source: "woo", label: "WooCommerce (revenue truth)" },
    { source: "meta", label: "Meta Ads (spend/performance snapshot)" },
    { source: "ga4", label: "GA4 (traffic snapshot)" },
    { source: "funnelkit", label: "FunnelKit (funnel)" }
  ];

  return (
    <div className="space-y-6">
      <VerticalSliceCard
        title="Data & Integrations"
        subtitle="Live source freshness/coverage + known limitations. No secrets. No PII."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={confidence.overall.tone}>Overall confidence: {confidence.overall.label}</Pill>
          {confidence.topRisk ? <Pill tone="amber">Top risk: {confidence.topRisk.label}</Pill> : null}
        </div>
      </VerticalSliceCard>

      <VerticalSliceCard title="Live telemetry health" subtitle="Shows what is being used for the vertical slice right now.">
        <div className="space-y-3">
          {sources.map((s) => {
            const meta = data.telemetryMetadata?.[s.source] ?? null;
            const health = data.telemetryHealth?.[s.source] ?? null;
            const warningCodes = meta?.warningCodes?.length ? meta.warningCodes.join(", ") : "None";
            return (
              <div key={s.source} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">{s.label}</div>
                    <div className="text-xs text-zinc-400">Source id: {s.source}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <Pill tone={healthTone(health?.status)}>{health?.status ?? "unknown"}</Pill>
                    <Pill tone={meta?.freshnessStatus === "fresh" ? "emerald" : meta?.freshnessStatus === "stale" ? "amber" : "zinc"}>
                      freshness: {meta?.freshnessStatus ?? "unknown"}
                    </Pill>
                    <Pill tone={meta?.coverageStatus === "complete" ? "emerald" : meta?.coverageStatus === "partial" ? "amber" : "zinc"}>
                      coverage: {meta?.coverageStatus ?? "unknown"}
                    </Pill>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  <DefinitionRow label="Requested" value={`${meta?.requestedStartDate ?? "—"} → ${meta?.requestedEndDate ?? "—"}`} />
                  <DefinitionRow label="Latest completed day" value={meta?.latestCompletedBusinessDate ?? "—"} />
                  <DefinitionRow label="Warnings" value={warningCodes} />
                  {health?.reasons?.length ? <DefinitionRow label="Health reasons" value={health.reasons.join(" • ")} /> : null}
                </div>
              </div>
            );
          })}
        </div>
      </VerticalSliceCard>

      <VerticalSliceCard title="Integration inventory (Milestone 7)" subtitle="Classification system + next steps; does not assume connectivity from UI placeholders.">
        {gap ? (
          <div className="space-y-2">
            {gap.integrations.slice(0, 30).map((it) => (
              <div key={it.integration_id} className="flex flex-col gap-1 rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">{it.source_name}</div>
                  <div className="text-xs text-zinc-400">{it.business_function} • id: {it.integration_id}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Pill tone={statusTone(it.status)}>{it.status.replace(/_/g, " ")}</Pill>
                </div>
              </div>
            ))}
            {gap.integrations.length > 30 ? (
              <div className="text-xs text-zinc-500">Showing first 30 of {gap.integrations.length} integrations.</div>
            ) : null}
          </div>
        ) : (
          <div className="text-sm text-zinc-500">Gap analysis file unavailable in runtime environment.</div>
        )}
      </VerticalSliceCard>

      <VerticalSliceCard title="Known limitations (must remain visible)" subtitle="These constraints are intentionally not hidden.">
        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-300">
          <li>Email platform not identified/connected.</li>
          <li>Meta-to-Woo matchback not implemented.</li>
          <li>UTM + campaign taxonomy not standardized.</li>
          <li>Identity resolution not implemented.</li>
          <li>Platform-attributed revenue may conflict with Woo revenue truth.</li>
        </ul>
      </VerticalSliceCard>
    </div>
  );
}
