import { StatusChip } from "./ui/StatusChip";
import type { DataFreshnessSource } from "./DataFreshnessPanel";
import { formatRelativeTimeFromNow } from "@/lib/date";

const TONE_LABEL: Record<DataFreshnessSource["tone"], string> = {
  emerald: "Live",
  amber: "Stale",
  rose: "Broken",
  zinc: "Manual"
};

type Props = {
  sources: DataFreshnessSource[];
};

export function RefreshHealthSummary({ sources }: Props) {
  if (!sources.length) return null;

  const actionable = sources.filter((source) => source.id !== "preparedActions");
  const lastIso = actionable
    .map((source) => source.lastUpdatedIso ? new Date(source.lastUpdatedIso).getTime() : 0)
    .filter(Boolean)
    .sort((a, b) => b - a)[0];
  const lastRefreshLabel = lastIso ? formatRelativeTimeFromNow(new Date(lastIso).toISOString()) ?? "recent" : "unknown";
  const staleSources = actionable.filter((source) => source.tone === "amber");
  const missingSources = actionable.filter((source) => source.tone === "rose");

  const healthSummary = [
    { label: "Fresh", tone: "emerald" as const, items: actionable.filter((source) => source.tone === "emerald") },
    { label: "Stale", tone: "amber" as const, items: staleSources },
    { label: "Missing", tone: "rose" as const, items: missingSources }
  ];

  return (
    <section className="rounded-3xl border border-white/10 bg-black/30 p-6" data-testid="refresh-health-summary">
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Refresh health</p>
          <p className="text-sm text-zinc-400">Last successful ingestion {lastRefreshLabel}. Stale or missing sources show below.</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {healthSummary.map((bucket) => (
          <article key={bucket.label} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">{bucket.label}</p>
              <StatusChip label={bucket.label} tone={bucket.tone} />
            </div>
            {bucket.items.length ? (
              <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                {bucket.items.map((source) => (
                  <li key={source.id}>
                    <p className="font-semibold text-white">{source.label}</p>
                    <p className="text-xs text-zinc-500">
                      {TONE_LABEL[source.tone]} · {source.relativeLabel}
                    </p>
                    {source.detail ? <p className="text-xs text-amber-200">{source.detail}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-zinc-500">None.</p>
            )}
          </article>
        ))}
      </div>

      {missingSources.length ? (
        <p className="mt-4 text-sm text-rose-200">
          Missing sources block decision-grade insights. Run the refresh command or inspect `dashboard/logs/dashboard-refresh.log`.
        </p>
      ) : null}
    </section>
  );
}
