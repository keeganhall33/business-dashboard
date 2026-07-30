import type { DashboardOverviewResponse, TrendComparison, TelemetryMetadata } from "@/lib/types/dashboard";
import { VerticalSliceCard, Pill, DefinitionRow } from "./VerticalSliceCard";

function confidenceTone(value: string) {
  const v = value.toLowerCase();
  if (v.includes("high") || v.includes("trusted") || v.includes("confirmed")) return "emerald" as const;
  if (v.includes("medium") || v.includes("usable")) return "amber" as const;
  if (v.includes("low") || v.includes("blocked") || v.includes("insufficient")) return "rose" as const;
  return "zinc" as const;
}

function formatNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

function describeTrend(trend: TrendComparison) {
  const pct = trend.percentChange != null ? `${trend.percentChange >= 0 ? "+" : ""}${trend.percentChange.toFixed(1)}%` : null;
  const abs = trend.absoluteChange != null ? formatNumber(trend.absoluteChange) : null;
  const dir = trend.direction === "down" ? "down" : trend.direction === "up" ? "up" : "flat";
  if (pct && abs) return `${pct} (${abs}) ${dir} vs prior`;
  if (pct) return `${pct} ${dir} vs prior`;
  if (abs) return `${abs} ${dir} vs prior`;
  return `${dir} vs prior`;
}

function renderMetadata(meta: TelemetryMetadata | null | undefined) {
  if (!meta) return <div className="text-sm text-zinc-500">No metadata available.</div>;
  const warnings = meta.warningCodes?.length ? meta.warningCodes.join(", ") : "None";
  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={meta.freshnessStatus === "fresh" ? "emerald" : meta.freshnessStatus === "stale" ? "amber" : "zinc"}>
          Freshness: {meta.freshnessStatus}
        </Pill>
        <Pill tone={meta.coverageStatus === "complete" ? "emerald" : meta.coverageStatus === "partial" ? "amber" : "zinc"}>
          Coverage: {meta.coverageStatus}
        </Pill>
        {meta.includesPartialDay ? <Pill tone="amber">Partial day</Pill> : null}
      </div>
      <div className="mt-3 space-y-2">
        <DefinitionRow label="Requested range" value={`${meta.requestedStartDate} → ${meta.requestedEndDate} (${meta.timezone})`} />
        <DefinitionRow label="Latest completed day" value={meta.latestCompletedBusinessDate ?? "—"} />
        <DefinitionRow label="Generated at" value={meta.generatedAt ?? "—"} />
        <DefinitionRow label="Warnings" value={warnings} />
      </div>
    </div>
  );
}

export function ExplainVerticalSlice({ data }: { data: DashboardOverviewResponse }) {
  const brief = data.executiveInsights?.brief ?? null;
  const trends = data.executiveInsights?.trends ?? [];
  const topChanges = brief?.topChanges ?? [];
  const missing = [
    "Email platform is not identified/connected",
    "Meta-to-Woo matchback is not implemented",
    "UTM + campaign taxonomy not standardized",
    "Identity resolution not implemented"
  ];

  return (
    <div className="space-y-6">
      <VerticalSliceCard
        title="Summary → Explanation"
        subtitle="Read-only: what changed, likely contributors, and what we can and cannot claim from the current source stack."
      >
        <div className="space-y-3">
          <div className="text-sm text-zinc-200">
            {brief?.attention ? brief.attention : "No single dominant verified anomaly in this window. Monitoring core KPIs."}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={confidenceTone(brief?.sourceFreshness?.[0]?.status ?? "")}>{`Confidence: ${brief ? "window-scoped" : "unknown"}`}</Pill>
            <Pill tone="zinc">Causality guardrails: correlation ≠ causation</Pill>
            <Pill tone="amber">Attribution may be duplicated</Pill>
          </div>
        </div>
      </VerticalSliceCard>

      <VerticalSliceCard title="What changed (vs previous comparable period)" subtitle="Derived from Executive Insights trend comparisons.">
        {topChanges.length ? (
          <div className="space-y-3">
            {topChanges.slice(0, 8).map((trend) => (
              <TrendRow key={trend.id} trend={trend} />
            ))}
          </div>
        ) : (
          <div className="text-sm text-zinc-500">No verified top changes available for this window.</div>
        )}
      </VerticalSliceCard>

      <VerticalSliceCard title="Evidence" subtitle="Source freshness, coverage, and warnings for the evidence used in the explanation.">
        <div className="space-y-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Limitations you should see</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-300">
              {missing.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Telemetry metadata</div>
            {renderMetadata(data.telemetryMetadata?.woo ?? null)}
            {renderMetadata(data.telemetryMetadata?.meta ?? null)}
            {renderMetadata(data.telemetryMetadata?.ga4 ?? null)}
          </div>
        </div>
      </VerticalSliceCard>

      <VerticalSliceCard title="Recommended response (read-only)" subtitle="This page does not execute actions. Recommendations live in the Recommend view.">
        <div className="text-sm text-zinc-300">
          Use the Recommend tab to see prioritized next steps with required approval classes and measurement plans.
        </div>
      </VerticalSliceCard>

      <VerticalSliceCard title="Alternative explanations" subtitle="What could also explain changes, but is currently unprovable with connected data.">
        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-300">
          <li>Email sends/promos may have driven sales (email telemetry missing).</li>
          <li>Press/celebrity shares may have driven direct traffic spikes (press log not integrated).</li>
          <li>Inventory/availability may have constrained conversion (availability history missing).</li>
        </ul>
      </VerticalSliceCard>
    </div>
  );
}

function TrendRow({ trend }: { trend: TrendComparison }) {
  const tone = trend.direction === "down" ? "rose" : trend.direction === "up" ? "emerald" : "zinc";
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-white">{trend.label}</div>
          <div className="text-xs text-zinc-400">{trend.metric} • source: {trend.source}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Pill tone={tone}>{describeTrend(trend)}</Pill>
          {trend.anomaly ? <Pill tone="amber">Anomaly</Pill> : null}
          {trend.caveat ? <Pill tone="zinc">Caveat</Pill> : null}
        </div>
      </div>
      {trend.caveat ? <div className="mt-2 text-sm text-zinc-300">Evidence caveat: {trend.caveat}</div> : null}
    </div>
  );
}
