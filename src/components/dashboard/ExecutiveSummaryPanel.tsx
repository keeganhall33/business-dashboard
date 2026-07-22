"use client";

import type { ExecutiveSummary } from "@/lib/types/dashboard";
import { StatusChip } from "./ui/StatusChip";
import { formatRelativeTimeFromNow } from "@/lib/date";

export function ExecutiveSummaryPanel({ summary }: { summary?: ExecutiveSummary | null }) {
  if (!summary) {
    return (
      <section className="ui-glass rounded-3xl border border-dashed border-white/10 p-5 text-sm text-zinc-400">
        Executive Command summary not available yet.
      </section>
    );
  }

  const updated = formatRelativeTimeFromNow(summary.generatedAt);

  return (
    <section className="ui-glass rounded-3xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Executive Command</div>
          <div className="text-sm text-zinc-400">Summary of Website, Meta, and automation status.</div>
        </div>
        <StatusChip label={`Updated ${updated}`} tone="zinc" />
      </div>

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Top actions</h4>
        <ul className="mt-2 space-y-2">
          {summary.actions.map((action, idx) => (
            <li key={`${action.action}-${idx}`} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-100">
              <div className="font-semibold">{action.action}</div>
              <div className="text-xs text-zinc-400">{action.why}</div>
              <div className="mt-1 flex flex-wrap gap-3 text-[11px] uppercase tracking-[0.3em] text-white/50">
                <span>Confidence: {action.confidence}</span>
                {action.owner ? <span>Owner: {action.owner}</span> : null}
                {action.timing ? <span>Timing: {action.timing}</span> : null}
                {action.source ? <span>Source: {action.source}</span> : null}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <SummaryList title="Wins" items={summary.wins} empty="No wins recorded." />
        <SummaryList title="Risks" items={summary.risks} tone="warning" empty="No risks logged." />
        <SummaryList title="Blocked" items={summary.blockedItems.map((item) => `${item.name}: ${item.detail ?? ''}`)} tone="amber" empty="No blockers." />
      </div>

      {summary.socialHighlights?.length ? (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Social highlights</h4>
          <ul className="mt-2 space-y-1 text-xs text-zinc-300">
            {summary.socialHighlights.map((highlight, idx) => (
              <li key={`${highlight.title}-${idx}`}>
                {highlight.platform}: {highlight.title} → {highlight.nextIdea} ({highlight.confidence})
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {summary.leadHighlights?.length ? (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Lead highlights</h4>
          <LeadInlineList leads={summary.leadHighlights} empty="No top lead opportunities." />
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {summary.leadWarmIntros ? (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Warm intro opportunities</h4>
            <LeadInlineList leads={summary.leadWarmIntros} empty="No warm intros queued." />
          </div>
        ) : null}
        {summary.leadResearchNeeded ? (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Lead research blockers</h4>
            <LeadInlineList leads={summary.leadResearchNeeded} empty="No blocked research." tone="warning" />
          </div>
        ) : null}
      </div>

      {summary.leadActions?.length ? (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Next business development actions</h4>
          <LeadInlineList leads={summary.leadActions} empty="No actions queued." tone="accent" />
        </div>
      ) : null}

      {summary.leadHygiene ? <LeadHygieneBar hygiene={summary.leadHygiene} /> : null}

      {summary.cloudflare ? (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Site health (Cloudflare)</h4>
          <CloudflareInline snapshot={summary.cloudflare} warnings={summary.siteHealthWarnings ?? []} cacheIssues={summary.siteCacheIssues ?? []} security={summary.siteSecurityRisks ?? []} />
        </div>
      ) : null}

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Decisions needed</h4>
        <SummaryList items={summary.decisionsNeeded} empty="No pending decisions." />
      </div>
    </section>
  );
}

function SummaryList({ title, items, empty, tone }: { title?: string; items: string[]; empty: string; tone?: "warning" | "amber" }) {
  if (!items.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-400">{empty}</div>
    );
  }
  const toneClass = tone === "warning" ? "text-amber-200" : tone === "amber" ? "text-amber-100" : "text-zinc-100";
  return (
    <div className={`rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm ${toneClass}`}>
      {title ? <div className="text-xs uppercase tracking-[0.25em] text-white/50">{title}</div> : null}
      <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-zinc-300">
        {items.map((entry, idx) => (
          <li key={`${entry}-${idx}`}>{entry}</li>
        ))}
      </ul>
    </div>
  );
}

function LeadInlineList({ leads, empty, tone }: { leads: Array<{ name: string | null; organization: string | null; nextAction?: string | null; priority?: string | null }> | undefined; empty: string; tone?: "warning" | "accent" }) {
  if (!leads?.length) {
    return <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-500">{empty}</div>;
  }
  const toneClass = tone === "warning" ? "text-amber-200" : tone === "accent" ? "text-sky-200" : "text-zinc-100";
  return (
    <ul className="mt-2 space-y-1 text-xs">
      {leads.map((lead, idx) => (
        <li key={`${lead.organization}-${idx}`} className={`rounded-xl border border-white/5 bg-black/20 px-3 py-2 ${toneClass}`}>
          {(lead.name || lead.organization) ?? 'Lead'} → {lead.nextAction ?? 'Next step TBD'} ({lead.priority ?? 'priority?'})
        </li>
      ))}
    </ul>
  );
}

function LeadHygieneBar({ hygiene }: { hygiene: { missingData: number; stale: number; duplicates: number; highPriorityNoOwner: number } }) {
  const items = [
    { label: 'Missing data', value: hygiene.missingData },
    { label: 'Stale', value: hygiene.stale },
    { label: 'Duplicates', value: hygiene.duplicates },
    { label: 'High-priority no owner', value: hygiene.highPriorityNoOwner }
  ];
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-[11px] text-white/80">
      <div className="text-xs uppercase tracking-[0.25em] text-white/50">Lead hygiene</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item.label} className="rounded-full border border-white/15 bg-black/40 px-3 py-1">
            {item.label}: {item.value}
          </span>
        ))}
      </div>
    </div>
  );
}

function CloudflareInline({ snapshot, warnings, cacheIssues, security }: { snapshot: NonNullable<ExecutiveSummary['cloudflare']>; warnings: string[]; cacheIssues: string[]; security: string[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-3 text-xs">
      <div className="text-zinc-100">
        Zone: {snapshot.zone?.name ?? 'unknown'} – Cache health: {snapshot.summary?.cacheHealth ?? 'unknown'} – Traffic: {snapshot.summary?.trafficHealth ?? 'unknown'}
      </div>
      <ul className="mt-2 space-y-1 text-[11px] text-amber-200">
        {warnings.map((w, idx) => (
          <li key={`cf-warn-${idx}`}>Warning: {w}</li>
        ))}
        {cacheIssues.map((c, idx) => (
          <li key={`cf-cache-${idx}`}>Cache issue: {c}</li>
        ))}
        {security.map((s, idx) => (
          <li key={`cf-sec-${idx}`}>Security: {s}</li>
        ))}
        {warnings.length === 0 && cacheIssues.length === 0 && security.length === 0 ? <li>No active site health warnings.</li> : null}
      </ul>
    </div>
  );
}
