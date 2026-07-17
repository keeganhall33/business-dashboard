import { formatRangeLabel } from "@/lib/date/range";
import { ExecutiveInsightsPayload, TrendComparison, TelemetryHealthStatus } from "@/lib/types/dashboard";
import { StatusChip } from "./ui/StatusChip";

const STATUS_LABEL: Record<TelemetryHealthStatus, string> = {
  healthy: "Fresh",
  warning: "Warning",
  critical: "Critical",
  unknown: "Unknown"
};

type Props = {
  insights?: ExecutiveInsightsPayload | null;
  partialDayNotice?: string | null;
};

export function ExecutiveBriefPanel({ insights, partialDayNotice }: Props) {
  const brief = insights?.brief;
  if (!brief) {
    return <div className="text-sm text-zinc-400">Executive intelligence is not available for this range.</div>;
  }

  const windowText = brief.pacificWindow ? `${formatRangeLabel(brief.pacificWindow, { includeYear: true })} PT` : "Window unavailable";
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.35em] text-zinc-500">Executive Brief</div>
          <div className="mt-1 text-lg font-semibold text-white">{windowText}</div>
          <div className="text-sm text-zinc-400">Business window locked to Pacific Time.</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {brief.pacificWindow.includesPartialDay ? <StatusChip label="Partial day" tone="amber" /> : null}
          {brief.warnings.length ? <StatusChip label="Critical warning" tone="rose" /> : null}
        </div>
      </header>

      {partialDayNotice ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{partialDayNotice}</div>
      ) : null}

      {brief.attention ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-100">
          <span className="font-semibold text-rose-50">Needs attention:</span> {brief.attention}
        </div>
      ) : null}

      {brief.warnings.length && !partialDayNotice ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-100">
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-200">Data health</div>
          <ul className="mt-2 space-y-1">
            {brief.warnings.map((warning) => (
              <li key={warning}>• {formatWarning(warning)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {partialDayNotice ? null : <TopChanges trends={brief.topChanges} />}
      <SourceHealth sources={brief.sourceFreshness} />
    </div>
  );
}

type TopChangesProps = {
  trends: TrendComparison[];
};

function TopChanges({ trends }: TopChangesProps) {
  if (!trends.length) {
    return <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3 text-sm text-zinc-400">No material changes detected.</div>;
  }
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Top changes</div>
      <div className="mt-3 space-y-3">
        {trends.map((trend) => (
          <TrendRow key={trend.id} trend={trend} />
        ))}
      </div>
    </div>
  );
}

type TrendRowProps = {
  trend: TrendComparison;
};

function TrendRow({ trend }: TrendRowProps) {
  const directionTone = trend.direction === "down" ? "rose" : trend.direction === "up" ? "emerald" : "zinc";
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/5 bg-black/30 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-sm font-medium text-white">{trend.label}</div>
        <div className="text-xs text-zinc-400">
          {formatNumber(trend.currentValue)} current · {formatNumber(trend.previousValue)} prior
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip label={formatTrendDirection(trend)} tone={directionTone} />
        {trend.percentChange != null ? (
          <StatusChip label={`${trend.percentChange >= 0 ? "+" : ""}${trend.percentChange.toFixed(1)}%`} tone={directionTone} />
        ) : null}
        {trend.anomaly ? <StatusChip label="Anomaly" tone="rose" /> : null}
      </div>
    </div>
  );
}

type SourceHealthProps = {
  sources: NonNullable<ExecutiveInsightsPayload["brief"]>["sourceFreshness"];
};

function SourceHealth({ sources }: SourceHealthProps) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.015] p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Source health</div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {sources.map((entry) => (
          <div key={entry.source} className="rounded-xl border border-white/5 bg-black/20 p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white">{entry.source.toUpperCase()}</div>
              <StatusChip label={STATUS_LABEL[entry.status]} tone={chipTone(entry.status)} />
            </div>
            <div className="mt-1 text-xs text-zinc-400">{entry.summary}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function chipTone(status: TelemetryHealthStatus) {
  if (status === "critical") return "rose";
  if (status === "warning") return "amber";
  if (status === "healthy") return "emerald";
  return "zinc";
}

function formatNumber(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1_000) {
    return `${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatTrendDirection(trend: TrendComparison) {
  if (trend.direction === "flat") return "Flat";
  return trend.direction === "up" ? "Trending up" : "Trending down";
}

function formatWarning(value: string) {
  const map: Record<string, string> = {
    no_data: "Source returned no data",
    stale_data: "Source reported stale data",
    future_dates_present: "Range includes future dates",
    metadata_unavailable: "Metadata unavailable",
    coverage_partial: "Coverage is incomplete",
    freshness_unknown: "Freshness unknown",
    partial_day: "Current day is still in progress",
    semantic_summary_unsafe: "Source summary needs verification"
  };
  return map[value] ?? value.replace(/_/g, " ");
}
