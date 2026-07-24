"use client";

import type { MarketingCommandInsight, MarketingCommandSnapshot } from "@/lib/types/dashboard";

const severityColors: Record<string, string> = {
  HIGH: "border-rose-400/40 bg-rose-500/10 text-rose-100",
  MEDIUM: "border-amber-400/40 bg-amber-500/10 text-amber-100",
  LOW: "border-slate-400/40 bg-slate-500/10 text-slate-100"
};

export function ConnectedInsightsPanel({ snapshot }: { snapshot?: MarketingCommandSnapshot | null }) {
  const insights = snapshot?.topConnectedInsights ?? [];
  const suppressed = snapshot?.suppressedInsights ?? [];
  if (!snapshot) return null;

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-zinc-500">
        <span>Connected insights</span>
        <span>{snapshot.range ? `${snapshot.range.preset.toUpperCase()} window` : "7-day window"}</span>
      </div>
      {insights.length ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-zinc-400">No actionable insights fired in this window.</p>
      )}
      {suppressed.length ? (
        <div className="mt-4 rounded-2xl border border-dashed border-white/15 bg-black/30 p-3 text-xs text-zinc-400">
          <p className="font-semibold uppercase tracking-[0.3em] text-zinc-500">Suppressed</p>
          <ul className="mt-2 space-y-1 text-sm">
            {suppressed.map((item) => (
              <li key={item.id}>
                {item.title ?? item.id}: {item.suppressReason ?? "awaiting data"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function InsightCard({ insight }: { insight: MarketingCommandInsight }) {
  const severity = insight.severity ?? "LOW";
  const confidence = insight.confidence ?? "LOW";
  const toneClass = severityColors[severity] ?? severityColors.LOW;
  const contextLabel = inferContext(insight.id);
  const triggerLabel = formatTrigger(insight.triggerMetrics);

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.3em]">
        <span>{severity} · {confidence}</span>
        {contextLabel ? <span className="rounded-full border border-white/30 px-2 py-0.5 text-xs">{contextLabel}</span> : null}
        {insight.sourcesUsed?.length ? (
          <span className="text-white/70">{insight.sourcesUsed.join(", ")}</span>
        ) : null}
      </div>
      <p className="mt-2 text-base font-semibold text-white">{insight.title}</p>
      <p className="mt-1 text-sm text-white/80">{insight.insight}</p>
      {triggerLabel ? (
        <p className="mt-2 text-xs text-white/60">Trigger: {triggerLabel}</p>
      ) : null}
      <div className="mt-3 rounded-2xl border border-white/20 bg-black/30 px-3 py-2 text-sm text-emerald-100">
        <span className="text-[11px] uppercase tracking-[0.3em] text-emerald-300">Action</span>
        <p className="text-sm text-emerald-50">{insight.recommendedAction}</p>
      </div>
    </div>
  );
}

function inferContext(id: string | undefined) {
  if (!id) return null;
  if (id.includes("funnel")) return "Funnel";
  if (id.includes("meta")) return "Meta";
  if (id.includes("product")) return "Product";
  if (id.includes("geography")) return "Geography";
  return null;
}

function formatTrigger(metrics?: Record<string, unknown>) {
  if (!metrics) return null;
  const entries = Object.entries(metrics);
  if (!entries.length) return null;
  const [key, value] = entries[0];
  if (typeof value === "number") {
    return `${key.replaceAll("_", " ")}: ${value}`;
  }
  if (typeof value === "string") {
    return `${key.replaceAll("_", " ")}: ${value}`;
  }
  return key;
}
