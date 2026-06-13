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
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100">
      {title ? <div className="text-xs uppercase tracking-[0.25em] text-white/50">{title}</div> : null}
      <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-zinc-300">
        {items.map((entry, idx) => (
          <li key={`${entry}-${idx}`}>{entry}</li>
        ))}
      </ul>
    </div>
  );
}
