import type { DashboardOverviewResponse } from "@/lib/types/dashboard";
import { countRangeDays, elapsedRangeDays } from "@/lib/date/range";
import { buildForwardActions, describeTrend } from "@/lib/forward-strategy";

export function ForwardStrategyPanel({
  data
}: {
  data: DashboardOverviewResponse;
}) {
  const range = data.range;
  const totalDays = countRangeDays(range);
  const elapsedDays = elapsedRangeDays(range);

  const forwardActions = buildForwardActions(data, totalDays, elapsedDays);

  return (
    <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-950/60 via-zinc-950 to-zinc-950 p-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-400">Forward strategy</p>
        <p className="text-2xl font-semibold text-white">Deterministic path to target</p>
      </div>

      <ol className="mt-6 space-y-4">
        {forwardActions.map((action) => (
          <li key={action.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">{action.category}</p>
                <h3 className="mt-1 text-lg font-semibold text-white">{action.title}</h3>
              </div>
              <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] ${toneFromConfidence(action.confidence)}`}>
                {action.confidence}
              </span>
            </div>
            <p className="mt-2 text-sm text-zinc-300">{action.reason}</p>
            <div className="mt-3 grid gap-3 text-xs text-zinc-400 md:grid-cols-3">
              <div>
                <div className="font-semibold text-zinc-500">Expected impact</div>
                <div className="text-zinc-200">{action.expectedImpact}</div>
              </div>
              <div>
                <div className="font-semibold text-zinc-500">Evidence</div>
                <div>{action.evidence}</div>
              </div>
              <div>
                <div className="font-semibold text-zinc-500">Urgency</div>
                <div>{action.urgency}</div>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
export function toneFromConfidence(confidence: "high" | "medium" | "low") {
  if (confidence === "high") return "text-emerald-300 border-emerald-500/40";
  if (confidence === "medium") return "text-amber-300 border-amber-500/40";
  return "text-zinc-300 border-zinc-500/40";
}

export function describeTrend(trend: NonNullable<ExecutiveInsightsPayload>["trends"][number]) {
  const percent = typeof trend.percentChange === "number" ? `${trend.percentChange.toFixed(1)}%` : null;
  const direction = trend.direction === "down" ? "declined" : trend.direction === "up" ? "grew" : "held steady";
  const parts = [percent, direction].filter(Boolean).join(" ");
  return parts ? `${trend.label} ${parts}` : trend.label;
}
