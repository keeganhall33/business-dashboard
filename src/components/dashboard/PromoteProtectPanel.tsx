"use client";

import type { PromoteProtectCard } from "@/lib/dashboard/promote-protect";

const typeAccent: Record<string, string> = {
  promote_now: "border-emerald-400/40 bg-emerald-500/10",
  protect_revenue: "border-amber-400/40 bg-amber-500/10",
  cooling_off: "border-rose-400/40 bg-rose-500/10",
  emerging_opportunity: "border-sky-400/40 bg-sky-500/10",
  email_hero: "border-slate-400/30 bg-slate-500/5",
  website_hero: "border-slate-400/30 bg-slate-500/5",
  paid_ad_candidate: "border-fuchsia-400/40 bg-fuchsia-500/10",
  partnership_candidate: "border-indigo-400/40 bg-indigo-500/10",
  collector_outreach_candidate: "border-cyan-400/40 bg-cyan-500/10"
};

const channelTags: Partial<Record<PromoteProtectCard["type"], { label: string; className: string }>> = {
  email_hero: { label: "Email hero", className: "border border-sky-400/40 bg-sky-500/10 text-sky-100" },
  website_hero: { label: "Site hero", className: "border border-indigo-400/40 bg-indigo-500/10 text-indigo-100" },
  paid_ad_candidate: { label: "Paid test", className: "border border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-100" },
  protect_revenue: { label: "Protect revenue", className: "border border-amber-400/40 bg-amber-500/10 text-amber-100" }
};

type Props = {
  cards: PromoteProtectCard[];
};

export function PromoteProtectPanel({ cards }: Props) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
      <div className="mb-4 flex items-center justify-between text-xs uppercase tracking-[0.3em] text-zinc-500">
        <span>Promote · Protect</span>
        <span>Artwork decision board</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {cards.map((card) => (
          <PromoteProtectCardRow key={card.id} card={card} />
        ))}
      </div>
    </section>
  );
}

function PromoteProtectCardRow({ card }: { card: PromoteProtectCard }) {
  const accent = typeAccent[card.type] ?? "border-white/10 bg-white/5";
  const channelTag = channelTags[card.type] ?? (card.recommendedChannel ? { label: card.recommendedChannel, className: "border border-white/20 text-white/70" } : null);
  return (
    <article className={`rounded-2xl border ${accent} p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-[0.3em] text-zinc-500">
        <span>{friendlyType(card.type)}</span>
        {channelTag ? <span className={`rounded-full px-2 py-0.5 text-[10px] ${channelTag.className}`}>{channelTag.label}</span> : null}
        <span className="text-white/70">Confidence {card.confidence}</span>
      </div>
      <p className="mt-2 text-sm font-semibold text-white">{card.productName ?? "Awaiting signal"}</p>
      <p className="mt-1 text-sm text-zinc-300">{card.reason}</p>
      {card.metricLabel && card.metricValue ? (
        <p className="mt-3 text-xs text-zinc-400">
          {card.metricLabel}: <span className="font-semibold text-white">{card.metricValue}</span>
        </p>
      ) : null}
      {card.nextAction ? <p className="mt-2 text-xs text-emerald-200">Next: {card.nextAction}</p> : null}
      {card.isEmpty ? <p className="mt-2 text-xs text-zinc-500">Awaiting fresher signal.</p> : null}
    </article>
  );
}

function friendlyType(type: PromoteProtectCard["type"]) {
  switch (type) {
    case "promote_now":
      return "Promote now";
    case "protect_revenue":
      return "Protect";
    case "cooling_off":
      return "Cooling";
    case "emerging_opportunity":
      return "Emerging";
    case "email_hero":
      return "Email hero";
    case "website_hero":
      return "Website hero";
    case "paid_ad_candidate":
      return "Paid candidate";
    case "partnership_candidate":
      return "Partnership";
    case "collector_outreach_candidate":
      return "Collector touch";
    default:
      return type;
  }
}
