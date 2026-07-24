import type { CommandFeedCard } from "@/lib/dashboard/command-feed";
import { StatusChip } from "./ui/StatusChip";

type Props = {
  cards: CommandFeedCard[];
  updatedAt?: string | null;
};

export function PreparedActionsPreviewPanel({ cards, updatedAt }: Props) {
  const preview = cards.slice(0, 4);

  if (!preview.length) {
    return (
      <section className="rounded-3xl border border-dashed border-white/10 bg-black/30 p-6 text-sm text-zinc-300">
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Prepared actions</p>
        <p className="mt-2">No Command Feed insights loaded. Refresh Marketing Command to populate draft actions.</p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-black/30 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Prepared actions (read-only)</p>
          <p className="text-sm text-zinc-400">Pulled directly from Command Feed. No automation or approvals yet.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-zinc-400">
          {updatedAt ? <StatusChip label={`Updated ${new Date(updatedAt).toLocaleString()}`} tone="zinc" /> : null}
          <StatusChip label="Draft only" tone="amber" />
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {preview.map((card) => (
          <article key={card.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-[0.2em] text-zinc-500">
              <span>{card.category}</span>
              <span>{card.priority}</span>
            </div>
            <p className="mt-2 text-base font-semibold text-white">{card.action}</p>
            <p className="mt-1 text-sm text-zinc-300">{card.why}</p>
            <div className="mt-3 grid gap-2 text-xs text-zinc-400 md:grid-cols-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">What changed</p>
                <p className="text-sm text-zinc-200">{card.evidence[0] ?? "See Command Feed"}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Why it matters</p>
                <p className="text-sm text-zinc-200">{card.consequence}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">What to do next</p>
                <p className="text-sm text-zinc-200">Follow in Command Feed (manual only).</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-500">
              <StatusChip label={`Confidence ${card.confidence}`} tone={card.confidence === "HIGH" ? "emerald" : card.confidence === "MEDIUM" ? "amber" : "zinc"} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
