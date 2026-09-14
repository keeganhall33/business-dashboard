import { DateRangeControls } from "./DateRangeControls";
import type { ExecutiveInsightsPayload, RangePreset } from "@/lib/types/dashboard";
import { formatRangeLabel, getPreviousRange } from "@/lib/date/range";

export function ExecutiveRangeHeader({
  range,
  insights,
  dataMode,
  degraded
  ,showControls
}: {
  range: { preset: RangePreset; startDate: string; endDate: string };
  insights?: ExecutiveInsightsPayload | null;
  dataMode?: "LIVE_DATA" | "PARTIAL_LIVE_DATA" | "SEED_DATA" | "UNAVAILABLE";
  degraded?: boolean;
  showControls?: boolean;
}) {
  const comparisonRange = getPreviousRange(range);
  const rangeLabel = formatRangeLabel(range, { includeYear: true });
  const comparisonLabel = formatRangeLabel(comparisonRange, { includeYear: true });
  const includesPartialDay = insights?.brief?.pacificWindow?.includesPartialDay ?? false;
  const controlsEnabled = showControls ?? true;

  const modeLabel = degraded ? "UNAVAILABLE" : (dataMode ?? "LIVE_DATA");
  const modeTone =
    modeLabel === "LIVE_DATA" ? "border-emerald-200 bg-emerald-50 text-emerald-800" :
    modeLabel === "PARTIAL_LIVE_DATA" ? "border-amber-200 bg-amber-50 text-amber-800" :
    modeLabel === "SEED_DATA" ? "border-amber-200 bg-amber-50 text-amber-800" :
    "border-rose-200 bg-rose-50 text-rose-800";

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold text-slate-500">Business window</p>
            <p className="text-2xl font-semibold text-slate-950">{rangeLabel}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="text-sm text-slate-600">Pacific Time · Comparison window {comparisonLabel}</p>
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold ${modeTone}`}
                data-testid="data-mode-indicator"
              >
                {(modeLabel === "UNAVAILABLE" ? "LIMITED REPORTING" : modeLabel.replace(/_/g, " "))}
              </span>
            </div>
          </div>
          {includesPartialDay ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-800">
              <span className="font-semibold uppercase tracking-[0.2em]">Partial day</span>
              <span>Latest day is still ingesting. Treat trends as preliminary.</span>
            </div>
          ) : null}
        </div>

        {controlsEnabled ? (
          <div className="w-full max-w-xl">
            <DateRangeControls preset={range.preset} startDate={range.startDate} endDate={range.endDate} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
