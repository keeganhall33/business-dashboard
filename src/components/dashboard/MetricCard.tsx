import { HeaderMetric, RevenueMetric } from "@/lib/types/dashboard";
import { formatMetricValue } from "@/lib/utils/format";
import { statusClasses } from "@/lib/utils/status";
import { Sparkline } from "@/components/charts/Sparkline";
import { TargetProgress } from "@/components/charts/TargetProgress";
import type { DensityMode } from "@/lib/ui/tokens";

type Props = {
  metric: HeaderMetric | RevenueMetric;
  density?: DensityMode;
  /** @deprecated Prefer density="compact". */
  compact?: boolean;
  dashboardUpdatedAtIso?: string;
};

export function MetricCard({ metric, compact, density, dashboardUpdatedAtIso }: Props) {
  const resolvedDensity: DensityMode = density ?? (compact ? "compact" : "comfortable");

  const ownerAgent = (metric as { ownerAgent?: string | null }).ownerAgent;
  const tactics = (metric as { tactics?: string[] | null }).tactics;
  const evidence = (metric as { evidence?: Array<{ label: string; url: string }> | null }).evidence;
  const history = (metric as { history?: Array<{ measuredAt: string; value: number | null }> | null }).history;
  const stats = (metric as { stats?: { changePercent: number | null; min: number | null; max: number | null } | null }).stats;
  const definition =
    (metric as { definition?: string | null }).definition ??
    (metric as { description?: string | null }).description ??
    null;
  const measuredAt = (metric as { measuredAt?: string | null }).measuredAt ?? (history && history.length ? history[history.length - 1]?.measuredAt : null);

  const historyValues = (history ?? []).map((h) => h.value);
  const changePercent = stats?.changePercent ?? null;
  const changeLabel =
    typeof changePercent === "number" && Number.isFinite(changePercent)
      ? `${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(1)}%`
      : null;

  const tone = statusToTone(metric.status);
  const title = "metricName" in metric ? metric.metricName : metric.metricKey.replaceAll("_", " ");

  return (
    <div
      className={cn(
        "ui-glass ui-glass-hover ui-accent-ring rounded-2xl",
        resolvedDensity === "compact" ? "p-4" : "p-5",
        statusClasses(metric.status)
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
          {title}
        </div>
        {changeLabel && (
          <div className="rounded-full border border-white/10 bg-white/[0.02] px-2 py-1 text-[11px] text-zinc-200">
            {changeLabel}
          </div>
        )}
      </div>

      <div className={resolvedDensity === "compact" ? "mt-2 text-2xl font-semibold" : "mt-2 text-3xl font-semibold"}>
        {formatMetricValue(metric.currentValue ?? 0, metric.unit)}
      </div>
      <div className="mt-1 text-xs text-zinc-500">Target {formatMetricValue(metric.targetValue ?? 0, metric.unit)}</div>

      <MetricProvenance
        title={title}
        definition={definition}
        measuredAtIso={measuredAt}
        dashboardUpdatedAtIso={dashboardUpdatedAtIso}
        density={resolvedDensity}
      />

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <div className="rounded-xl border border-[var(--ui-border)] bg-white/[0.02] p-3">
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Trend</div>
              {stats?.min != null && stats?.max != null && (
                <div className="text-[11px] text-zinc-500">
                  Range {formatMetricValue(stats.min, metric.unit)}–{formatMetricValue(stats.max, metric.unit)}
                </div>
              )}
            </div>
            <div className="mt-2">
              <Sparkline
                values={historyValues.length ? historyValues : [metric.currentValue, metric.currentValue * 0.98, metric.currentValue * 1.01]}
                tone={tone}
              />
            </div>
          </div>

          <div className="mt-3">
            <TargetProgress current={metric.currentValue ?? 0} target={metric.targetValue ?? 0} unit={metric.unit} tone={tone} />
          </div>
        </div>

        <div className="lg:col-span-5">
          {(ownerAgent || (tactics && tactics.length > 0) || (evidence && evidence.length > 0)) ? (
            <div className="h-full rounded-xl border border-[var(--ui-border)] bg-white/[0.02] p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Tactics & Evidence</div>
                {ownerAgent && <div className="text-[11px] text-zinc-500">Owner <span className="text-zinc-300">{ownerAgent}</span></div>}
              </div>

              {tactics && tactics.length > 0 && (
                <ul className="mt-3 space-y-2 text-xs text-zinc-200">
                  {tactics.slice(0, 3).map((t) => (
                    <li key={t} className="flex gap-2">
                      <span className="mt-[2px] text-zinc-500">•</span>
                      <span className="leading-relaxed text-zinc-200">{t}</span>
                    </li>
                  ))}
                </ul>
              )}

              {evidence && evidence.length > 0 && (
                <div className={tactics && tactics.length > 0 ? "mt-4" : "mt-3"}>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Evidence</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {evidence.slice(0, 4).map((link) => (
                      <a
                        key={`${link.label}|${link.url}`}
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        title={link.label}
                        className="max-w-full min-w-0 truncate rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.05]"
                      >
                        {link.label}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {!tactics?.length && !evidence?.length && (
                <div className="mt-3 text-xs text-zinc-500">No linked tactics or evidence yet.</div>
              )}
            </div>
          ) : (
            <div className="h-full rounded-xl border border-[var(--ui-border)] bg-white/[0.02] p-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Tactics & Evidence</div>
              <div className="mt-3 text-xs text-zinc-500">No linked tactics or evidence yet.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricProvenance({
  title,
  definition,
  measuredAtIso,
  dashboardUpdatedAtIso,
  density
}: {
  title: string;
  definition: string | null;
  measuredAtIso: string | null;
  dashboardUpdatedAtIso?: string;
  density: DensityMode;
}) {
  const rows = [
    definition ? { label: "Definition", value: definition } : null,
    measuredAtIso ? { label: "Measured", value: formatLocalTimestamp(measuredAtIso) } : null,
    dashboardUpdatedAtIso ? { label: "Dashboard refresh", value: formatLocalTimestamp(dashboardUpdatedAtIso) } : null
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  if (!rows.length) return null;

  return (
    <details className={cn("mt-3 rounded-xl border border-white/5 bg-black/20", density === "compact" && "mt-2")}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200">
        <div className="flex flex-col">
          <span className="uppercase tracking-[0.18em] text-zinc-300">{title}</span>
          <span className="text-[11px] text-zinc-500">Definition &amp; freshness</span>
        </div>
        <span className="rounded-full border border-white/10 px-2 py-[2px] text-[10px] uppercase tracking-[0.18em] text-zinc-400">Provenance</span>
      </summary>
      <div className="space-y-2 px-3 pb-3 text-xs">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-4">
            <div className="shrink-0 uppercase tracking-[0.18em] text-zinc-500">{row.label}</div>
            <div className="min-w-0 text-right text-zinc-200 break-words">{row.value}</div>
          </div>
        ))}
      </div>
    </details>
  );
}

function formatLocalTimestamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function statusToTone(status: HeaderMetric["status"]) {
  if (status === "healthy" || status === "on_track") return "success" as const;
  if (status === "warning") return "warning" as const;
  return "danger" as const;
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
