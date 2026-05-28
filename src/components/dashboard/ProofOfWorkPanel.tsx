import type { ProofOfWorkEntry } from "@/lib/types/dashboard";
import { DeliverableAttachmentList } from "./DeliverableAttachmentList";

const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric"
});

type Props = {
  items: ProofOfWorkEntry[];
};

export function ProofOfWorkPanel({ items }: Props) {
  const topEntries = items.slice(0, 4);

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

      {topEntries.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 px-4 py-6 text-sm text-zinc-500">
          No proof has been logged yet. Once agents attach links or summaries to completed tasks, you’ll see them here.
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {topEntries.map((entry) => (
            <div key={entry.taskId} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                <span>{entry.agentKey ?? "agent"}</span>
                <span>{formatRelative(entry.completedAt)}</span>
              </div>
              <div className="mt-2 text-sm font-semibold text-zinc-50">{entry.taskTitle}</div>
              {entry.summary ? <p className="mt-2 text-sm text-zinc-300">{entry.summary}</p> : null}
              <DeliverableAttachmentList attachments={entry.deliverableLinks} tone="emerald" />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function formatRelative(iso: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const diffDays = Math.round((date.getTime() - Date.now()) / 86400000);
  if (Math.abs(diffDays) <= 14) {
    return relativeFormatter.format(diffDays, "day");
  }
  return dateFormatter.format(date);
}
