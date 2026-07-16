"use client";

import type { IndustryPulseOpportunity } from "@/lib/industry-pulse";
import { buildIndustryOpportunities } from "@/lib/industry-pulse";
import type { IndustryPulseSnapshot } from "@/lib/types/dashboard";
import { StatusChip } from "./ui/StatusChip";
import { formatRelativeTimeFromNow } from "@/lib/date";

export function IndustryPulsePanel({ snapshot }: { snapshot?: IndustryPulseSnapshot | null }) {
  if (!snapshot) {
    return (
      <section className="ui-glass rounded-3xl border border-dashed border-white/10 p-5 text-sm text-zinc-400">
        Industry pulse feed not available. Configure sources.
      </section>
    );
  }

  const opportunities = buildIndustryOpportunities(snapshot);

  if (opportunities.length === 0) {
    return (
      <section className="ui-glass rounded-3xl border border-white/10 p-5 text-sm text-zinc-400">
        No actionable opportunities surfaced in the current feed. Continue monitoring verified sources.
      </section>
    );
  }

  const updated = formatRelativeTimeFromNow(snapshot.generatedAt);

  return (
    <section className="ui-glass rounded-3xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Industry Pulse</div>
          <div className="text-sm text-zinc-400">Ranked opportunities across sports, culture, and licensing that fit Keegan’s brand.</div>
        </div>
        <StatusChip label={`Updated ${updated}`} tone="zinc" />
      </div>

      <div className="space-y-3">
        {opportunities.map((item) => (
          <OpportunityCard key={item.id} opportunity={item} />
        ))}
      </div>
    </section>
  );
}

function OpportunityCard({ opportunity }: { opportunity: IndustryPulseOpportunity }) {
  return (
    <article className="rounded-2xl border border-white/8 bg-black/25 p-4 text-sm text-zinc-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold text-white">{opportunity.concept}</div>
          <p className="text-xs text-zinc-400">{opportunity.sourceHeadline}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusChip label={`Score ${opportunity.opportunityScore}`} tone="emerald" />
          <StatusChip label={`${opportunity.urgency} • ${opportunity.confidence}`} tone={toneFromUrgency(opportunity.urgency)} />
        </div>
      </div>

      <dl className="mt-3 grid gap-2 text-xs text-zinc-300 md:grid-cols-2">
        <DetailRow label="Why it matters" value={opportunity.whyItMatters} />
        <DetailRow label="Proposed concept" value={opportunity.concept} />
        <DetailRow label="Commercial route" value={opportunity.commercialRoute} />
        <DetailRow label="Expected impact" value={opportunity.expectedImpact} />
        <DetailRow label="Licensing / rights" value={opportunity.licensingRisk} />
        <DetailRow label="Recommended next action" value={opportunity.nextAction} />
        <DetailRow label="Contact status" value={opportunity.contactStatus} />
        <DetailRow label="Evidence" value={opportunity.provenance} />
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.3em] text-white/50">
        <span>Confidence: {opportunity.confidence}</span>
        {opportunity.sourceUrl ? (
          <a href={opportunity.sourceUrl} className="text-sky-300 hover:text-sky-100" target="_blank" rel="noreferrer">
            Evidence
          </a>
        ) : null}
      </div>
    </article>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-semibold text-zinc-500">{label}</dt>
      <dd className="text-zinc-200">{value || "—"}</dd>
    </div>
  );
}

function toneFromUrgency(urgency: IndustryPulseOpportunity["urgency"]) {
  if (urgency.toLowerCase() === "high") return "emerald";
  if (urgency.toLowerCase() === "medium") return "sky";
  return "zinc";
}
