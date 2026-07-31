import type { ExecutiveSummary } from "@/lib/dashboard/executive-summary";
import type { ConfidenceSummary } from "@/lib/data-confidence";
import type { ExecutiveActionPlan } from "@/lib/dashboard/executive-layout";
import { buildExecutiveBriefingModel } from "@/lib/dashboard/executive-briefing";

export function ExecutiveBriefingPanel({
  summary,
  confidence,
  actions
}: {
  summary: ExecutiveSummary | null;
  confidence: ConfidenceSummary;
  actions: ExecutiveActionPlan[];
}) {
  const model = buildExecutiveBriefingModel({ summary, confidence, actions });

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 shadow-2xl shadow-black/40">
      <div className="text-xs font-semibold text-zinc-400">Executive briefing</div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <BriefCard title={model.health.title} tone={model.health.tone} lines={model.health.lines} />
        <BriefCard title={model.changed.title} tone={model.changed.tone} lines={model.changed.lines} />
        <BriefCard title={model.attention.title} tone={model.attention.tone} lines={model.attention.lines} />
        <BriefCard title={model.nextMove.title} tone={model.nextMove.tone} lines={model.nextMove.lines} />
      </div>
    </section>
  );
}

function BriefCard({
  title,
  tone,
  lines
}: {
  title: string;
  tone: "emerald" | "amber" | "rose" | "zinc";
  lines: string[];
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-400/30 bg-emerald-500/5"
      : tone === "rose"
        ? "border-rose-400/30 bg-rose-500/5"
        : tone === "amber"
          ? "border-amber-400/30 bg-amber-500/5"
          : "border-white/10 bg-black/20";

  return (
    <article className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="text-[11px] font-semibold text-zinc-400">{title}</div>
      <div className="mt-2 space-y-1">
        {lines.map((line, idx) => (
          <div
            key={`${title}-${idx}`}
            className={idx === 0 ? "text-sm font-semibold text-white" : "text-sm text-zinc-300"}
          >
            {line}
          </div>
        ))}
      </div>
    </article>
  );
}
