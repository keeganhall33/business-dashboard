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
  const summary = snapshot.summary ?? {
    categories: [],
    warmIntros: [],
    topOpportunities: [],
    researchNeeded: [],
    missingData: [],
    stale: [],
    duplicates: [],
    recommendedActions: []
  };
  const quality = snapshot.quality ?? {
    missingCategory: [],
    missingStatus: [],
    missingEvidence: [],
    missingNextAction: [],
    missingOwner: [],
    warmIntros: [],
    staleLeads: [],
    highPriorityNoOwner: [],
    duplicates: []
  };
  const counts = snapshot.meta?.recordCounts;
  const modeLabel = snapshot.meta?.mode === "hubspot-live" ? "HubSpot (read-only)" : "Snapshot/manual";

  return (
    <section className="ui-glass rounded-3xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Lead Intelligence</div>
          <div className="text-sm text-zinc-400">Research-backed opportunities ready for review.</div>
          <div className="text-xs text-emerald-300/70">{modeLabel}</div>
        </div>
        <StatusChip label={`Updated ${updated}`} tone="zinc" />
      </div>

      <RecordCounts counts={counts} />

      <div className="grid gap-4 lg:grid-cols-2">
        <LeadCardList title="Top opportunities" leads={summary.topOpportunities} empty="No prioritized leads yet." />
        <CompactList title="Warm intro opportunities" leads={summary.warmIntros} empty="No warm paths yet." />
      </div>

      <LeadCardList title="Needs research" leads={summary.researchNeeded} empty="No blocked research." />

      <div className="grid gap-4 md:grid-cols-2">
        <CompactList title="Missing data" leads={summary.missingData} empty="All required fields present." tone="warning" />
        <CompactList title="Stale opportunities" leads={summary.stale} empty="No stale records." tone="warning" />
      </div>

      <CompactList title="Next recommended actions" leads={summary.recommendedActions} empty="No actions queued." tone="accent" />

      {summary.duplicates?.length ? <DuplicateList duplicates={summary.duplicates} /> : null}

      <HygieneBadges quality={quality} />
    </section>
  );
}

function RecordCounts({ counts }: { counts?: LeadIntelligenceSnapshot['meta']['recordCounts'] }) {
  if (!counts) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <CountCard label="Manual" value={counts.manual} detail="manual_input" />
      <CountCard label="Snapshot" value={counts.snapshot} detail="hubspot_snapshot" />
      <CountCard label="HubSpot companies" value={counts.hubspot.companies} />
      <CountCard label="HubSpot contacts" value={counts.hubspot.contacts} />
    </div>
  );
}

function CountCard({ label, value, detail }: { label: string; value: number; detail?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-3 text-sm">
      <div className="text-xs uppercase tracking-[0.2em] text-white/50">{label}</div>
      <div className="text-2xl font-semibold text-white">{value}</div>
      {detail ? <div className="text-xs text-zinc-400">{detail}</div> : null}
    </div>
  );
}

function LeadCardList({ title, leads = [], empty }: { title: string; leads?: Array<LeadIntelligenceSnapshot['leads'][number]>; empty: string }) {
  if (!leads.length) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-400">
        {empty}
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-zinc-100">
      <div className="text-xs uppercase tracking-[0.25em] text-white/50">{title}</div>
      <ul className="mt-2 space-y-1 text-xs text-zinc-300">
        {leads.map((lead, idx) => (
          <li key={`${lead?.name}-${lead?.organization}-${idx}`} className="rounded-xl border border-white/5 bg-black/20 p-3 text-left">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold text-white">{lead?.name || lead?.organization || 'Lead'}</div>
              <span className="text-[10px] uppercase tracking-[0.3em] text-white/60">{lead?.priority ?? 'medium'}</span>
            </div>
            <div className="text-[11px] text-zinc-400">
              {lead?.organization ?? lead?.sourceType ?? 'Unknown'} · {lead?.status ?? 'status unknown'} · {lead?.pathType ?? 'path'}
            </div>
            <div className="mt-1 text-[11px] text-emerald-200/80">{lead?.nextAction ?? 'Next step TBD'}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CompactList({ title, leads = [], empty, tone = "zinc" }: { title: string; leads?: Array<{ name: string | null; organization: string | null; priority?: string | null; status?: string | null; nextAction?: string | null }>; empty: string; tone?: "zinc" | "warning" | "accent" }) {
  if (!leads.length) {
    return <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-400">{empty}</div>;
  }
  const toneClass = tone === "warning" ? "text-amber-200" : tone === "accent" ? "text-sky-200" : "text-white";
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-zinc-200">
      <div className="text-xs uppercase tracking-[0.25em] text-white/50">{title}</div>
      <ul className="mt-2 space-y-1 text-xs">
        {leads.map((lead, idx) => (
          <li key={`${lead?.name}-${lead?.organization}-${idx}`} className={toneClass}>
            {(lead?.name || lead?.organization) ?? 'Lead'} → {lead?.nextAction ?? 'Clarify next step'} ({lead?.priority ?? 'priority?'})
          </li>
        ))}
      </ul>
    </div>
  );
}

function DuplicateList({ duplicates }: { duplicates: LeadIntelligenceSnapshot['summary']['duplicates'] }) {
  if (!duplicates?.length) return null;
  return (
    <div className="rounded-2xl border border-rose-400/30 bg-rose-950/40 p-4 text-sm text-rose-50">
      <div className="text-xs uppercase tracking-[0.25em] text-rose-200">Potential duplicates</div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
        {duplicates.map((group) => (
          <li key={group.key}>
            {group.leads.map((lead) => lead.name || lead.organization || 'Lead').join(' vs ')}
          </li>
        ))}
      </ul>
    </div>
  );
}

function HygieneBadges({ quality }: { quality: LeadIntelligenceSnapshot['quality'] }) {
  const items = [
    { label: 'Missing data', value: quality.missingOwner.length + quality.missingEvidence.length + quality.missingCategory.length + quality.missingStatus.length },
    { label: 'Stale', value: quality.staleLeads.length },
    { label: 'High-priority w/o owner', value: quality.highPriorityNoOwner.length },
    { label: 'Duplicates', value: quality.duplicates.length }
  ];
  return (
    <div className="flex flex-wrap gap-2 text-[11px]">
      {items.map((item) => (
        <span key={item.label} className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-white/80">
          {item.label}: {item.value}
        </span>
      ))}
    </div>
  );
}
