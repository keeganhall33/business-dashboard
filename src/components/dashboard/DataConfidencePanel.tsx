import type { ConfidenceSummary } from "@/lib/data-confidence";

export function DataConfidencePanel({ summary, partialDayNotice }: { summary: ConfidenceSummary; partialDayNotice?: string | null }) {
  const executive = buildExecutiveSummary(summary, partialDayNotice);
  const badgeLabel = partialDayNotice ? "Preliminary" : summary.overall.label;
  const badgeTone = partialDayNotice ? "amber" : summary.overall.tone;

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-6">
      <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Executive confidence</div>
            <div className="text-lg font-semibold text-white">{executive.label}</div>
          </div>
          <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.25em] ${toneBadge(badgeTone)}`}>
            {badgeLabel}
          </span>
        </div>
        <p className="mt-3 text-sm text-zinc-300">{executive.reason}</p>
        {executive.decisions.length ? (
          <div className="mt-4 text-xs text-zinc-400">
            <div className="font-semibold text-zinc-200">Decisions affected</div>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {executive.decisions.map((decision) => (
                <li key={decision}>{decision}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {executive.action ? (
          <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-100">
            <div className="font-semibold text-emerald-50">Next action</div>
            <p className="mt-1 text-sm text-emerald-100">{executive.action}</p>
          </div>
        ) : null}
        {summary.overall.lastRefresh ? (
          <p className="mt-4 text-xs text-zinc-500">Last verified {formatRelative(summary.overall.lastRefresh)}</p>
        ) : null}
      </div>

    </section>
  );
}

export function buildExecutiveSummary(summary: ConfidenceSummary, partialDayNotice?: string | null) {
  const reason = partialDayNotice ?? summary.overall.rationale ?? summary.topRisk?.executiveImpact ?? "Telemetry reporting normally.";
  const decisions = summary.decisionsAffected.slice(0, 2);
  const action = summary.recommendedActions[0]?.detail ?? summary.topRisk?.recommendedAction ?? null;
  return {
    label: partialDayNotice ? "Preliminary" : summary.overall.label,
    reason,
    decisions,
    action
  };
}

function toneBadge(tone: "emerald" | "amber" | "rose" | "zinc") {
  if (tone === "rose") return "border-rose-500/40 bg-rose-500/10 text-rose-200";
  if (tone === "amber") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  if (tone === "emerald") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  return "border-white/10 bg-white/5 text-zinc-200";
}

function formatRelative(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
