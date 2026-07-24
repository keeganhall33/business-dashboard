import { summarizeExecutiveStatus } from "@/lib/dashboard/executive-layout";
import { ExecutiveInsightsPayload } from "@/lib/types/dashboard";

export function ExecutiveStatusPanel({ insights, fallbackRange }: { insights?: ExecutiveInsightsPayload | null; fallbackRange: { startDate: string; endDate: string } }) {
  const summary = summarizeExecutiveStatus(insights?.brief, fallbackRange);

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl shadow-black/40">
      <div className="text-[11px] font-semibold uppercase tracking-[0.4em] text-zinc-500">Business Status</div>
      <p className="mt-3 text-xl font-semibold text-white">{summary.sentence}</p>

      <div className="mt-4 flex flex-wrap gap-4 text-sm text-zinc-400">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Window</span>
          <span className="rounded-full border border-white/10 px-2 py-1 text-zinc-100">{summary.rangeLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Confidence</span>
          <span className="rounded-full border border-white/10 px-2 py-1 text-zinc-100">{formatConfidence(summary.confidence)}</span>
        </div>
        {summary.includesPartialDay ? (
          <div className="flex items-center gap-2 text-amber-300">
            <span className="text-[10px] uppercase tracking-[0.3em] text-amber-400">Partial day</span>
            <span className="rounded-full border border-amber-400/40 px-2 py-1 text-amber-100">Latest day incomplete</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function formatConfidence(value: string) {
  switch (value) {
    case "high":
      return "High confidence";
    case "low":
      return "Low confidence";
    default:
      return "Moderate confidence";
  }
}
