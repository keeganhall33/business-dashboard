"use client";

import { CommandFeedCard } from "@/lib/dashboard/command-feed";
import { formatRelativeTimeFromNow } from "@/lib/date";
import { StatusChip } from "./ui/StatusChip";

const priorityTone: Record<CommandFeedCard["priority"], { badge: string; border: string }> = {
  DO_NOW: { badge: "bg-rose-500/15 text-rose-100 border border-rose-400/40", border: "border-rose-400/30" },
  WATCH: { badge: "bg-amber-500/15 text-amber-100 border border-amber-400/40", border: "border-amber-400/30" },
  FYI: { badge: "bg-slate-600/30 text-slate-100 border border-slate-500/30", border: "border-slate-500/20" }
};

const categoryTone: Record<string, string> = {
  Revenue: "text-emerald-200",
  Promotion: "text-sky-200",
  Paid: "text-fuchsia-200",
  Funnel: "text-amber-200",
  Ops: "text-slate-200",
  Partnership: "text-indigo-200",
  Geography: "text-teal-200"
};

type Props = {
  cards: CommandFeedCard[];
  generatedAt?: string | null;
  rangeLabel?: string | null;
};

export function CommandFeedPanel({ cards, generatedAt, rangeLabel }: Props) {
  const updatedLabel = generatedAt ? formatRelativeTimeFromNow(generatedAt) : null;
  const visibleCards = cards.slice(0, 5);
  const hoursOld = generatedAt ? (Date.now() - new Date(generatedAt).getTime()) / 36e5 : null;
  const stale = hoursOld != null && hoursOld > 48;
  return (
    <section className="ui-glass ui-glass-hover space-y-4 rounded-3xl p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Command Feed</p>
          <p className="text-sm text-zinc-400">Top decisions and the moves required right now.</p>
          <p className="text-xs text-zinc-500">
            {updatedLabel ? `Updated ${updatedLabel}` : "Awaiting latest run"}
            {rangeLabel ? ` · Window ${rangeLabel}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.3em] text-zinc-500">
          <StatusChip label="Source: Marketing snapshot" tone="zinc" />
          <StatusChip label={stale ? `Stale (${hoursOld?.toFixed(1)}h)` : "Fresh"} tone={stale ? "rose" : "emerald"} />
          <span className="rounded-full border border-rose-400/40 px-2.5 py-0.5 text-rose-100">Do Now</span>
          <span className="rounded-full border border-amber-400/40 px-2.5 py-0.5 text-amber-100">Watch</span>
          <span className="rounded-full border border-slate-500/30 px-2.5 py-0.5 text-slate-200">FYI</span>
        </div>
      </div>

      {stale ? (
        <div className="rounded-2xl border border-amber-300/40 bg-amber-500/5 p-3 text-xs text-amber-100">
          Marketing Command hasn’t refreshed in over 48 hours. If 7d and 30d decisions look identical, rerun `pnpm marketing:run` before acting on these cards.
        </div>
      ) : null}

      {!visibleCards.length ? (
        <EmptyState />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {visibleCards.map((card) => (
            <CommandFeedCardRow key={card.id} card={card} />
          ))}
        </div>
      )}
    </section>
  );
}

function CommandFeedCardRow({ card }: { card: CommandFeedCard }) {
  const tone = priorityTone[card.priority];
  const categoryStyle = categoryTone[card.category] ?? "text-zinc-200";
  return (
    <article className={`rounded-2xl border ${tone.border} bg-black/20 p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-[0.3em]">
        <span className={`rounded-full px-2.5 py-0.5 ${tone.badge}`}>{card.priority.replace(/_/g, " ")}</span>
        <span className={`font-semibold ${categoryStyle}`}>{card.category}</span>
        <span className="text-zinc-500">Confidence {card.confidence}</span>
      </div>
      <p className="mt-3 text-base font-semibold text-white">{card.action}</p>
      <p className="mt-1 text-sm text-zinc-300">{card.why}</p>
      {card.evidence?.length ? (
        <ul className="mt-3 space-y-1 text-sm text-zinc-400">
          {card.evidence.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/40" />
              {item}
            </li>)
          )}
        </ul>
      ) : null}
      <p className="mt-3 text-xs text-rose-200/80">{card.consequence}</p>
      {card.supportingLink ? (
        <a
          className="mt-3 inline-flex items-center text-xs font-semibold text-sky-300 hover:text-sky-200"
          href={card.supportingLink.href}
          target="_blank"
          rel="noreferrer"
        >
          {card.supportingLink.label}
        </a>
      ) : null}
    </article>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-6 text-center text-sm text-zinc-400">
      No live decisions yet. Run the marketing command agent to populate the feed.
    </div>
  );
}
