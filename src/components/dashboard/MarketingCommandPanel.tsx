"use client";

import type { MarketingCommandSnapshot } from "@/lib/types/dashboard";
import { StatusChip } from "./ui/StatusChip";
import { formatDateRangeLabel, formatRelativeTimeFromNow } from "@/lib/date";

const deltaPercentFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const deltaCurrencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const deltaNumberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

type Props = {
  snapshot?: MarketingCommandSnapshot | null;
};

export function MarketingCommandPanel({ snapshot }: Props) {
  const statusLabel = snapshot?.status === "LIVE" ? "Live insights" : "Needs attention";
  const statusTone = snapshot?.status === "LIVE" ? "emerald" : "amber";
  const updatedLabel = snapshot?.generatedAt ? formatRelativeTimeFromNow(snapshot.generatedAt) : "unknown";
  const rangeLabel = snapshot?.range ? formatDateRangeLabel(snapshot.range) : null;

  return (
    <section className="ui-glass ui-glass-hover space-y-4 rounded-3xl p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Marketing Command</p>
          <p className="mt-1 text-sm text-zinc-400">Daily summary of Website, Meta, and Funnel telemetry.</p>
          <p className="text-xs text-zinc-500">Last generated {updatedLabel}</p>
          {rangeLabel ? <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">Window {rangeLabel}</p> : null}
        </div>
        <StatusChip label={statusLabel} tone={statusTone} />
      </div>

      <ComparisonRibbon basis={snapshot?.insightBasis} />

      {snapshot ? (
        <InsightMeta
          confidence={snapshot.confidenceSummary}
          freshness={snapshot.sourceFreshnessSummary}
        />
      ) : null}

      {!snapshot ? (
        <EmptyState title="Not generated" detail="Run the marketing command script to populate recommendations." />
      ) : (
        <div className="space-y-4">
          <Section title="Comparison summary" emptyFallback="No notable deltas." items={snapshot.comparisonSummary ?? []} />
          <MetricDeltaList deltas={snapshot.metricDeltas} />
          <ProductMomentumCard momentum={snapshot.productMomentum} />
          <Section title="What changed" emptyFallback="No summary available." items={snapshot.whatChanged} />
          <Section title="What matters" emptyFallback="No highlights today." items={snapshot.whatMatters} />
          <ActionList actions={snapshot.actions} />
          <Section title="Risks" emptyFallback="No risks flagged." items={snapshot.risks} tone="amber" />
          <Section title="Monitor tomorrow" emptyFallback="Add objectives for tomorrow." items={snapshot.monitorTomorrow} tone="sky" />
        </div>
      )}
    </section>
  );
}

function ComparisonRibbon({ basis }: { basis?: MarketingCommandSnapshot["insightBasis"] }) {
  if (!basis) return null;
  const currentLabel = formatDateRangeLabel(basis.current) ?? "current";
  const previousLabel = formatDateRangeLabel(basis.previous) ?? "previous";
  return (
    <div className="flex flex-wrap gap-2 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3 text-[11px] uppercase tracking-[0.3em] text-zinc-500">
      <span className="rounded-full border border-emerald-400/40 px-3 py-1 text-emerald-200">Current {currentLabel}</span>
      <span className="rounded-full border border-zinc-600/60 px-3 py-1 text-zinc-300">Vs previous {previousLabel}</span>
    </div>
  );
}

function InsightMeta({
  confidence,
  freshness
}: {
  confidence?: MarketingCommandSnapshot["confidenceSummary"];
  freshness?: MarketingCommandSnapshot["sourceFreshnessSummary"];
}) {
  if (!confidence && !freshness?.length) return null;
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {confidence ? (
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Confidence mix</p>
            <div className="mt-3 flex flex-wrap gap-3 text-sm text-zinc-100">
              <ConfidenceChip label="High" value={confidence.high} tone="emerald" />
              <ConfidenceChip label="Medium" value={confidence.medium} tone="sky" />
              <ConfidenceChip label="Low" value={confidence.low} tone="zinc" />
            </div>
          </div>
        ) : null}
        {freshness?.length ? (
          <div className="flex flex-wrap gap-3">
            {freshness.map((stat) => (
              <div
                key={stat.source}
                className={`rounded-xl border px-3 py-2 text-xs ${stat.stale ? "border-amber-400/40 text-amber-100" : "border-emerald-400/40 text-emerald-100"}`}
              >
                <p className="text-[11px] uppercase tracking-[0.3em]">{stat.source}</p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {stat.hoursSince != null ? `${stat.hoursSince.toFixed(1)}h old` : "unknown"}
                </p>
                <p className="text-[11px] text-zinc-400">Target &lt; {stat.thresholdHours}h</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ConfidenceChip({ label, value, tone }: { label: string; value: number; tone: "emerald" | "sky" | "zinc" }) {
  const toneClass =
    tone === "emerald"
      ? "bg-emerald-500/20 text-emerald-100"
      : tone === "sky"
        ? "bg-sky-500/20 text-sky-100"
        : "bg-zinc-700/60 text-zinc-200";
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${toneClass}`}>
      {label}: {value}
    </span>
  );
}

function MetricDeltaList({ deltas }: { deltas?: MarketingCommandSnapshot["metricDeltas"] }) {
  if (!deltas?.length) return null;
  const sortable = deltas
    .filter((delta) => delta.percentChange != null || delta.absoluteChange != null)
    .sort((a, b) => Math.abs(b.percentChange ?? b.absoluteChange ?? 0) - Math.abs(a.percentChange ?? a.absoluteChange ?? 0))
    .slice(0, 6);
  if (!sortable.length) return null;
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
      <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Key deltas (current vs prev 7d)</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {sortable.map((delta) => (
          <div key={delta.metric} className="rounded-2xl border border-white/5 bg-black/30 p-3">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-zinc-500">
              <span>{delta.label}</span>
              {delta.direction ? (
                <span className={delta.direction === "up" ? "text-emerald-300" : "text-amber-300"}>{delta.direction === "up" ? "↑" : "↓"}</span>
              ) : null}
            </div>
            <p className="mt-2 text-2xl font-semibold text-white">{formatDeltaValue(delta)}</p>
            <p className="text-xs text-zinc-500">Prev 7d: {formatValue(delta.previousValue, delta.unit)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProductMomentumCard({ momentum }: { momentum?: MarketingCommandSnapshot["productMomentum"] }) {
  if (!momentum) return null;
  if (momentum.suppressedReasons?.length) {
    return (
      <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Product momentum</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-500">
          {momentum.suppressedReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>
    );
  }

  const winners = momentum.winners ?? [];
  const laggards = momentum.laggards ?? [];
  const breakouts = momentum.newBreakouts ?? [];
  const hasContent = winners.length || laggards.length || breakouts.length || momentum.concentration;
  if (!hasContent) return null;

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
      <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Product momentum</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <MomentumColumn title="Surging" tone="emerald" entries={winners} emptyLabel="No gains this week." />
        <MomentumColumn title="Cooling" tone="amber" entries={laggards} emptyLabel="No laggards detected." />
      </div>
      <MomentumColumn title="Breakouts" tone="emerald" entries={breakouts} emptyLabel="No new heroes yet." />
      {momentum.concentration?.sharePercent ? (
        <p className="mt-3 text-sm text-zinc-400">
          <span className="text-zinc-100">{momentum.concentration.topProduct ?? "Top product"}</span> drove {deltaPercentFormatter.format(momentum.concentration.sharePercent)}% of Woo revenue.
        </p>
      ) : null}
    </div>
  );
}

function MomentumColumn({
  title,
  tone,
  entries,
  emptyLabel
}: {
  title: string;
  tone: "emerald" | "amber";
  entries: Array<{ name?: string | null; revenueDeltaPercent?: number | null }>;
  emptyLabel: string;
}) {
  if (!entries?.length) {
    return (
      <div className="rounded-2xl border border-white/5 bg-black/20 p-3 text-sm text-zinc-500">
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">{title}</p>
        <p className="mt-2">{emptyLabel}</p>
      </div>
    );
  }
  const toneClass = tone === "emerald" ? "text-emerald-200" : "text-amber-200";
  return (
    <div className="rounded-2xl border border-white/5 bg-black/30 p-3">
      <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">{title}</p>
      <ul className="mt-2 space-y-1 text-sm text-zinc-100">
        {entries.map((entry, idx) => (
          <li key={entry.name ?? `${title}-${idx}`} className="flex items-center justify-between">
            <span>{entry.name ?? "Unnamed product"}</span>
            <span className={toneClass}>{formatMomentumPercent(entry.revenueDeltaPercent)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatMomentumPercent(value?: number | null) {
  if (value == null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${deltaPercentFormatter.format(value)}%`;
}

function formatDeltaValue(delta: NonNullable<MarketingCommandSnapshot["metricDeltas"]>[number]) {
  if (delta.percentChange != null) {
    const prefix = delta.percentChange >= 0 ? "+" : "-";
    return `${prefix}${deltaPercentFormatter.format(Math.abs(delta.percentChange))}%`;
  }
  if (delta.absoluteChange != null) {
    const prefix = delta.absoluteChange >= 0 ? "+" : "-";
    return `${prefix}${formatValue(Math.abs(delta.absoluteChange), delta.unit)}`;
  }
  return "—";
}

function formatValue(value: number | null | undefined, unit?: string | null) {
  if (value == null) return "—";
  if (unit === "usd") {
    return deltaCurrencyFormatter.format(value);
  }
  if (unit === "percent") {
    return `${deltaPercentFormatter.format(value)}%`;
  }
  return deltaNumberFormatter.format(value);
}

function Section({ title, items, emptyFallback, tone }: { title: string; items: string[]; emptyFallback: string; tone?: "amber" | "sky" }) {
  const bulletTone = tone === "amber" ? "bg-amber-300" : tone === "sky" ? "bg-sky-300" : "bg-emerald-300";
  if (!items?.length) {
    return (
      <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">{title}</p>
        <p className="mt-2 text-sm text-zinc-500">{emptyFallback}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
      <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">{title}</p>
      <ul className="mt-3 space-y-2 text-sm text-zinc-100">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <span className={`mt-1 h-1.5 w-1.5 rounded-full ${bulletTone}`} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActionList({ actions }: { actions: Array<{ title: string; detail: string; metric: string }> }) {
  if (!actions?.length) {
    return (
      <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Top actions</p>
        <p className="mt-2 text-sm text-zinc-500">No priority moves surfaced today.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
      <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Top actions</p>
      <ol className="mt-3 space-y-3 text-sm text-zinc-100">
        {actions.map((action) => (
          <li key={action.title} className="rounded-2xl border border-white/5 bg-black/30 p-3">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-zinc-500">
              <span>{action.metric.replaceAll("_", " ")}</span>
            </div>
            <p className="mt-2 text-base font-semibold text-white">{action.title}</p>
            <p className="text-sm text-zinc-300 mt-1">{action.detail}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-center">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="text-xs text-zinc-500 mt-2">{detail}</p>
    </div>
  );
}
