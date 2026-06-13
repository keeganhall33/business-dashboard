"use client";

import type { LeadIntelligenceSnapshot } from "@/lib/types/dashboard";
import { StatusChip } from "./ui/StatusChip";
import { formatRelativeTimeFromNow } from "@/lib/date";

export function LeadIntelligencePanel({ snapshot }: { snapshot?: LeadIntelligenceSnapshot | null }) {
  if (!snapshot) {
    return (
      <section className="ui-glass rounded-3xl border border-dashed border-white/10 p-5 text-sm text-zinc-400">
        Lead intelligence feed not available yet.
      </section>
    );
  }

  const updated = formatRelativeTimeFromNow(snapshot.generatedAt);
  const leads = snapshot.leads ?? [];
  const summary = snapshot.summary ?? { categories: [], warmIntros: [], highPriority: [], researchNeeded: [] };

  return (
    <section className="ui-glass rounded-3xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Lead Intelligence</div>
          <div className="text-sm text-zinc-400">Research-backed opportunities ready for review.</div>
        </div>
        <StatusChip label={`Updated ${updated}`} tone="zinc" />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <InsightsList title="Warm intro ops" leads={summary.warmIntros} empty="No warm leads." />
        <InsightsList title="High priority" leads={summary.highPriority} empty="No high priority leads." />
      </div>

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Needs research</h4>
        <InsightsList leads={summary.researchNeeded} empty="All leads reviewed." />
      </div>
    </section>
  );
}

function InsightsList({ title, leads = [], empty }: { title?: string; leads?: LeadIntelligenceSnapshot['leads']; empty: string }) {
  if (!leads.length) {
    return <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-400">{empty}</div>;
  }
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-3 text-sm text-zinc-100">
      {title ? <div className="text-xs uppercase tracking-[0.25em] text-white/50">{title}</div> : null}
      <ul className="mt-2 space-y-1 text-xs text-zinc-300">
        {leads.map((lead, idx) => (
          <li key={`${lead?.name}-${lead?.organization}-${idx}`}>
            {(lead?.name || lead?.organization) ?? 'Lead'}: {lead?.nextAction ?? 'Next step TBD'} ({lead?.priority ?? 'medium'})
          </li>
        ))}
      </ul>
    </div>
  );
}
