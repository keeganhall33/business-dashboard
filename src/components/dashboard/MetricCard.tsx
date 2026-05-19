import { HeaderMetric, RevenueMetric } from "@/lib/types/dashboard";
import { formatMetricValue } from "@/lib/utils/format";
import { statusClasses } from "@/lib/utils/status";
import { Sparkline } from "@/components/charts/Sparkline";
import { TargetProgress } from "@/components/charts/TargetProgress";

type Props = {
  metric: HeaderMetric | RevenueMetric;
  compact?: boolean;
};

export function MetricCard({ metric, compact }: Props) {
  const ownerAgent = (metric as { ownerAgent?: string | null }).ownerAgent;
  const tactics = (metric as { tactics?: string[] | null }).tactics;
  const evidence = (metric as { evidence?: Array<{ label: string; url: string }> | null }).evidence;
  const history = (metric as { history?: Array<{ measuredAt: string; value: number | null }> | null }).history;
  const stats = (metric as { stats?: { changePercent: number | null; min: number | null; max: number | null } | null }).stats;

  const historyValues = (history ?? []).map((h) => h.value);
  const changePercent = stats?.changePercent ?? null;
  const changeLabel =
    typeof changePercent === "number" && Number.isFinite(changePercent)
      ? `${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(1)}%`
      : null;

  return (
    <div className={`ui-glass ui-glass-hover ui-accent-ring rounded-2xl p-4 ${statusClasses(metric.status)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
          {"metricName" in metric ? metric.metricName : metric.metricKey.replaceAll("_", " ")}
        </div>
        {changeLabel && (
          <div className="rounded-full border border-white/10 bg-white/[0.02] px-2 py-1 text-[11px] text-zinc-200">
            {changeLabel}
          </div>
        )}
      </div>

      <div className={compact ? "mt-2 text-2xl font-semibold" : "mt-2 text-3xl font-semibold"}>
        {formatMetricValue(metric.currentValue ?? 0, metric.unit)}
      </div>
      <div className="mt-1 text-xs text-zinc-500">Target {formatMetricValue(metric.targetValue ?? 0, metric.unit)}</div>

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
              <Sparkline values={historyValues.length ? historyValues : [metric.currentValue, metric.currentValue * 0.98, metric.currentValue * 1.01]} />
            </div>
          </div>

          <div className="mt-3">
            <TargetProgress current={metric.currentValue ?? 0} target={metric.targetValue ?? 0} unit={metric.unit} />
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
                        className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.05]"
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
