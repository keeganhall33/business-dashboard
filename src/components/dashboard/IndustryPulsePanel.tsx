"use client";

import type { IndustryPulseOpportunity } from "@/lib/industry-pulse";
import { buildIndustryOpportunities } from "@/lib/industry-pulse";
import type { IndustryPulseSnapshot } from "@/lib/types/dashboard";
import { StatusChip } from "./ui/StatusChip";
import { formatRelativeTimeFromNow } from "@/lib/date";
import { RecommendationList } from "./ui/RecommendationList";

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
  const items = opportunities.map(toRecommendationItem);

  return (
    <section className="ui-glass rounded-3xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Industry Pulse</div>
          <div className="text-sm text-zinc-400">Ranked opportunities across sports, culture, and licensing that fit Keegan’s brand.</div>
        </div>
        <StatusChip label={`Updated ${updated}`} tone="zinc" />
      </div>

      <RecommendationList items={items} empty="No verified opportunities within the current range." />
    </section>
  );
}

function toRecommendationItem(opportunity: IndustryPulseOpportunity) {
  return {
    id: opportunity.id,
    title: opportunity.concept,
    whyNow: opportunity.whyItMatters,
    impact: opportunity.expectedImpact,
    evidence: opportunity.sourceUrl ?? opportunity.provenance,
    confidence: `${opportunity.confidence} • Score ${opportunity.opportunityScore}`,
    nextStep: opportunity.nextAction,
    owner: opportunity.contactStatus,
    badges: [opportunity.urgency, opportunity.outreachStage]
  };
}
