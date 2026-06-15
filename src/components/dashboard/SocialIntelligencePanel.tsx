"use client";

import type { SocialIntelligenceSnapshot } from "@/lib/types/dashboard";
import { StatusChip } from "./ui/StatusChip";
import { formatRelativeTimeFromNow } from "@/lib/date";

export function SocialIntelligencePanel({ snapshot }: { snapshot?: SocialIntelligenceSnapshot | null }) {
  if (!snapshot) {
    return (
      <section className="ui-glass rounded-3xl border border-dashed border-white/10 p-5 text-sm text-zinc-400">
        Social intelligence feed not available yet.
      </section>
    );
  }

  const updated = formatRelativeTimeFromNow(snapshot.generatedAt);
  const insights = snapshot.insights ?? [];

  return (
    <section className="ui-glass rounded-3xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Social Intelligence</div>
          <div className="text-sm text-zinc-400">Audience and content signals guiding the next post.</div>
        </div>
        <StatusChip label={`Updated ${updated}`} tone="zinc" />
      </div>

      {insights.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200">No insights captured.</div>
      ) : (
        <div className="space-y-3">
          {insights.slice(0, 4).map((insight, idx) => (
            <article key={`${insight.title}-${idx}`} className="rounded-2xl border border-white/8 bg-black/25 p-4 text-sm text-zinc-100">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold">{insight.title}</div>
                <StatusChip label={`${insight.platform} • ${insight.confidence}`} tone="sky" />
              </div>
              <div className="mt-1 text-xs text-zinc-400">{insight.metrics}</div>
              <div className="text-xs text-zinc-300">Why: {insight.why}</div>
              <div className="text-xs text-zinc-300">Next idea: {insight.nextIdea}</div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
