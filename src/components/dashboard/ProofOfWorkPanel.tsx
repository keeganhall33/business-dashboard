import { useState } from "react";
import type { ProofOfWorkEntry } from "@/lib/types/dashboard";
import { DeliverableAttachmentList } from "./DeliverableAttachmentList";
import { EmptyState } from "./ui/EmptyState";

const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric"
});

type Props = {
  items: ProofOfWorkEntry[];
};

export function ProofOfWorkPanel({ items }: Props) {
  const [referenceNow] = useState(() => Date.now());
  const topEntries = items.slice(0, 4);
  const hasEntries = topEntries.length > 0;
  const latestCompletedAt = topEntries.reduce<Date | null>((latest, entry) => {
    if (!entry.completedAt) return latest;
    const date = new Date(entry.completedAt);
    if (Number.isNaN(date.getTime())) return latest;
    if (!latest || date.getTime() > latest.getTime()) return date;
    return latest;
  }, null);
  const isStale = (() => {
    if (!latestCompletedAt) return true;
    const diffDays = Math.round((referenceNow - latestCompletedAt.getTime()) / 86400000);
    return diffDays > 14;
  })();

  return (
    <section className="rounded-2xl border border-[var(--ui-border)] bg-white/[0.03] p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">Proof of Work</div>
          <div className="mt-1 text-sm text-zinc-400">Latest agent deliverables</div>
        </div>
        {items.length > topEntries.length ? (
          <div className="text-xs text-zinc-500">{items.length} logged</div>
        ) : null}
      </div>

      {hasEntries && isStale ? (
        <div className="mt-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
          Last proof was logged {formatRelative(latestCompletedAt?.toISOString() ?? null, referenceNow)}. New deliverables have not been captured in over two weeks.
        </div>
      ) : null}

      {hasEntries ? (
        <div className="mt-4 space-y-4">
          {topEntries.map((entry) => (
            <div key={entry.taskId} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                <span>{entry.agentKey ?? "agent"}</span>
                <span>{formatRelative(entry.completedAt, referenceNow)}</span>
              </div>
              <div className="mt-2 text-sm font-semibold text-zinc-50">{entry.taskTitle}</div>
              {entry.summary ? <p className="mt-2 text-sm text-zinc-300">{entry.summary}</p> : null}
              <DeliverableAttachmentList attachments={entry.deliverableLinks} tone="emerald" />
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4">
          <EmptyState
            title="No proof logged"
            detail="Agents haven’t attached deliverables or summaries yet. When tasks include proof links, they’ll show here."
          />
        </div>
      )}
    </section>
  );
}

function formatRelative(iso: string | null, referenceNow: number) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const diffDays = Math.round((date.getTime() - referenceNow) / 86400000);
  if (Math.abs(diffDays) <= 14) {
    return relativeFormatter.format(diffDays, "day");
  }
  return dateFormatter.format(date);
}
