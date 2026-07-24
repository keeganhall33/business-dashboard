import type { PriorityInsight } from "@/lib/dashboard/website-decisions";
import { SourceRangeLabel } from "./ui/SourceRangeLabel";
import { StatusChip } from "./ui/StatusChip";

const CONFIDENCE_TONE: Record<string, Parameters<typeof StatusChip>[0]["tone"]> = {
  high: "emerald",
  medium: "amber",
  low: "zinc"
};

type Props = {
  items: PriorityInsight[];
  rangeLabel: string;
  generatedAt?: string | null;
};

export function TodayPrioritiesPanel({ items, rangeLabel, generatedAt }: Props) {
  if (!items.length) return null;

  return (
    <section className="rounded-3xl border border-white/10 bg-black/30 p-6" data-testid="today-priorities-panel">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Today's priorities</p>
          <p className="text-sm text-zinc-400">Ranked moves pulled from GA4 + Woo snapshot.</p>
          <SourceRangeLabel
            source="GA4 + Woo snapshot"
            range={rangeLabel}
            confidence="directional"
            note={generatedAt ? `Snapshot ${new Date(generatedAt).toLocaleString()}` : undefined}
          />
        </div>
        <p className="text-xs text-zinc-500">Decision window: {rangeLabel}</p>
      </header>

      <ol className="mt-5 space-y-3">
        {items.map((item, index) => (
          <li key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.3em] text-zinc-500">
              <span>Priority {index + 1}</span>
              <StatusChip label={item.confidence.toUpperCase()} tone={CONFIDENCE_TONE[item.confidence]} />
              <span className="text-[11px] text-zinc-400">Source: {item.source}</span>
            </div>
            <h3 className="mt-2 text-base font-semibold text-white">{item.title}</h3>
            <p className="mt-1 text-sm text-zinc-300">{item.whyItMatters}</p>
            <p className="mt-2 text-sm text-emerald-200">Action: {item.action}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
