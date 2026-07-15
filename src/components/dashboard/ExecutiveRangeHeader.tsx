import { DateRangeControls } from "./DateRangeControls";
import type { ExecutiveInsightsPayload, RangePreset } from "@/lib/types/dashboard";
import { formatRangeLabel, getPreviousRange } from "@/lib/date/range";

export function ExecutiveRangeHeader({
  range,
  insights
}: {
  range: { preset: RangePreset; startDate: string; endDate: string };
  insights?: ExecutiveInsightsPayload | null;
}) {
  const comparisonRange = getPreviousRange(range);
  const rangeLabel = formatRangeLabel(range, { includeYear: true });
  const comparisonLabel = formatRangeLabel(comparisonRange, { includeYear: true });
  const includesPartialDay = insights?.brief?.pacificWindow?.includesPartialDay ?? false;

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">Business window</p>
            <p className="text-2xl font-semibold text-white">{rangeLabel}</p>
            <p className="text-sm text-zinc-400">Pacific Time · Comparison window {comparisonLabel}</p>
          </div>
          {includesPartialDay ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-100">
              <span className="font-semibold uppercase tracking-[0.2em]">Partial day</span>
              <span>Latest day is still ingesting. Treat trends as preliminary.</span>
            </div>
          ) : null}
        </div>

        <div className="w-full max-w-xl">
          <DateRangeControls preset={range.preset} startDate={range.startDate} endDate={range.endDate} />
        </div>
      </div>
    </section>
  );
}
