import type { PrioritizedAction } from "@/lib/dashboard/prepared-action-priority";
import { StatusChip } from "./ui/StatusChip";

export type ExecutiveCommandBriefProps = {
  actions: PrioritizedAction[];
  dataFreshnessWarnings: string[];
};

export function ExecutiveCommandBrief({ actions, dataFreshnessWarnings }: ExecutiveCommandBriefProps) {
  const focus = actions[0] ?? null;
  const opportunity = actions[1] ?? null;
  const risk = findHighestRisk(actions);

  if (!focus) return null;

  const evidenceLines = focus.evidence?.slice(0, 2).map((item) => item.value || item.label) ?? [];
  const focusCards: { title: string; body: string; tone?: "rose" | "emerald" | "amber" | "zinc" }[] = [
    { title: "What to do", body: focus.title },
    { title: "Why now", body: focus.whyItMatters },
    { title: "Evidence", body: evidenceLines.join(" · ") || "Add evidence before acting", tone: "zinc" as const },
    { title: "Manual next step", body: focus.requiredApprovalAction, tone: "amber" as const },
    { title: "Expected upside", body: focus.expectedUpside ?? "Clarify upside", tone: "emerald" as const },
    {
      title: "Confidence",
      body: `${focus.confidence.toUpperCase()}${focus.dataWarning ? " · Needs data" : ""}`,
      tone: focus.dataWarning ? ("amber" as const) : ("emerald" as const)
    }
  ];
  if (focus.riskIfIgnored) {
    focusCards.push({ title: "Risk if ignored", body: focus.riskIfIgnored, tone: "rose" as const });
  }
  if (focus.dataWarning) {
    focusCards.push({ title: "Data caveat", body: focus.dataWarning, tone: "amber" as const });
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/5 to-black/20 p-5 text-sm text-zinc-100">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Executive Command Brief</p>
          <p className="text-sm text-zinc-400">Manual review summary pulled from current Prepared Actions.</p>
        </div>
        <StatusChip label="Manual review only" tone="zinc" />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {focusCards.map((card, idx) => (
          <BriefCard key={`${card.title}-${idx}`} title={card.title} body={card.body} subtitle={card.title === "What to do" ? focus.createdByAgent : undefined} tone={card.tone} />
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {opportunity ? (
          <BriefCard
            title="Secondary opportunity"
            body={`${opportunity.title}: ${opportunity.expectedUpside ?? opportunity.whyItMatters}`}
            tone="emerald"
          />
        ) : null}
        {risk ? <BriefCard title="Watch out" body={risk.riskIfIgnored ?? risk.whyItMatters} tone="rose" /> : null}
        {dataFreshnessWarnings.length ? (
          <BriefCard title="Data check" body={dataFreshnessWarnings.join(" · ")} tone="amber" />
        ) : null}
      </div>
    </section>
  );
}

function findHighestRisk(actions: PrioritizedAction[]) {
  return actions.find((action) => action.riskLevel === "high") ?? actions.find((action) => action.priorityLabel === "blocked") ?? null;
}

function BriefCard({ title, subtitle, body, tone }: { title: string; subtitle?: string | null; body: string; tone?: "rose" | "emerald" | "amber" | "zinc" }) {
  const toneClass =
    tone === "rose"
      ? "border-rose-400/30 text-rose-200"
      : tone === "emerald"
        ? "border-emerald-400/30 text-emerald-200"
        : tone === "amber"
          ? "border-amber-400/30 text-amber-200"
          : "border-white/10 text-zinc-100";
  return (
    <div className={`rounded-2xl border ${toneClass} bg-black/20 p-4`}>
      <p className="text-[11px] uppercase tracking-[0.35em] text-zinc-500">{title}</p>
      {subtitle ? <p className="text-[11px] text-zinc-400">{subtitle}</p> : null}
      <p className="mt-2 text-sm leading-relaxed">{body}</p>
    </div>
  );
}
