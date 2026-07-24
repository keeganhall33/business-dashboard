import type { ConfidenceSummary } from "@/lib/data-confidence";

export function DataConfidencePanel({ summary }: { summary: ConfidenceSummary }) {
  const caveats = [...summary.caveatSources, ...summary.conflictingSources];

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Data Confidence</div>
          <p className="text-sm text-zinc-400">{summary.overall.rationale}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {summary.partialDay ? (
            <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-amber-200">Partial day</span>
          ) : null}
          {summary.overall.lastRefresh ? (
            <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-zinc-400">
              Refreshed {formatRelative(summary.overall.lastRefresh)}
            </span>
          ) : null}
          <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] ${toneBadge(summary.overall.tone)}`}>{summary.overall.label}</span>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <ConfidenceGroup title="Trusted" items={summary.trustedSources} placeholder="No trusted sources" tone="emerald" />
        <ConfidenceGroup title="Watch" items={caveats} placeholder="No caveats" tone="amber" />
        <ConfidenceGroup title="Unavailable" items={summary.insufficientSources} placeholder="All sources reporting" tone="rose" />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <RiskCard summary={summary} />
        <ActionCard summary={summary} />
      </div>
    </section>
  );
}

function ConfidenceGroup({ title, items, placeholder, tone }: { title: string; items: string[]; placeholder: string; tone: "emerald" | "amber" | "rose" }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <div className={`text-[11px] uppercase tracking-[0.3em] ${toneText(tone)}`}>{title}</div>
      {items.length ? (
        <ul className="mt-3 space-y-1 text-sm text-zinc-200">
          {items.map((item) => (
            <li key={item} className="flex items-center gap-2">
              <span className="text-zinc-500">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-zinc-500">{placeholder}</p>
      )}
    </div>
  );
}

function RiskCard({ summary }: { summary: ConfidenceSummary }) {
  const risk = summary.topRisk;
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <div className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">Top trust risk</div>
      {risk ? (
        <div className="mt-2 space-y-2 text-sm text-zinc-200">
          <div className="font-semibold text-white">{risk.label}</div>
          <p className="text-zinc-300">{risk.decisionImpact}</p>
          <p className="text-zinc-400 text-xs">{risk.provenance}</p>
          <p className="text-xs text-zinc-500">Last success {risk.lastSuccess ? formatRelative(risk.lastSuccess) : "Unknown"}</p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-zinc-500">No significant risks detected.</p>
      )}
    </div>
  );
}

function ActionCard({ summary }: { summary: ConfidenceSummary }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <div className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">Confidence actions</div>
      {summary.recommendedActions.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">No remediation required.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {summary.recommendedActions.map((action) => (
            <li key={action.id} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-zinc-200">
              <div className="font-semibold text-white">{action.title}</div>
              <p className="text-xs text-zinc-400">{action.detail}</p>
            </li>
          ))}
        </ul>
      )}
      {summary.decisionsAffected.length ? (
        <div className="mt-4 text-xs text-zinc-500">
          <div className="font-semibold text-zinc-300">Decisions affected</div>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {summary.decisionsAffected.slice(0, 3).map((decision) => (
              <li key={decision}>{decision}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function toneBadge(tone: "emerald" | "amber" | "rose") {
  switch (tone) {
    case "emerald":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
    case "amber":
      return "border-amber-500/40 bg-amber-500/10 text-amber-200";
    default:
      return "border-rose-500/40 bg-rose-500/10 text-rose-200";
  }
}

function toneText(tone: "emerald" | "amber" | "rose") {
  switch (tone) {
    case "emerald":
      return "text-emerald-300";
    case "amber":
      return "text-amber-300";
    default:
      return "text-rose-300";
  }
}

function formatRelative(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
