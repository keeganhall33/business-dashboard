"use client";

import { formatRelativeTimeFromNow } from "@/lib/date";

export type FreshnessItem = {
  label: string;
  timestamp?: string | null;
  fallbackNote?: string;
};

type Props = {
  items: FreshnessItem[];
};

export function DataFreshnessStrip({ items }: Props) {
  if (!items.length) return null;

  return (
    <section className="rounded-3xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-200">
      <div className="flex flex-wrap gap-3">
        {items.map((item) => (
          <FreshnessBadge key={item.label} item={item} />
        ))}
      </div>
    </section>
  );
}

function FreshnessBadge({ item }: { item: FreshnessItem }) {
  const state = computeStatus(item.timestamp);
  const relative = item.timestamp ? formatRelativeTimeFromNow(item.timestamp) ?? "unknown" : item.fallbackNote ?? "unknown";
  const toneClass =
    state.tone === "fresh"
      ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-50"
      : state.tone === "stale"
        ? "border-amber-400/40 bg-amber-500/10 text-amber-50"
        : state.tone === "missing"
          ? "border-rose-400/30 bg-rose-500/10 text-rose-100"
          : "border-white/20 bg-white/5 text-zinc-100";

  return (
    <div className={`rounded-2xl border px-3 py-2 text-xs uppercase tracking-[0.3em] ${toneClass}`}>
      <div className="text-[10px] font-semibold">{item.label}</div>
      <div className="text-[10px] normal-case tracking-normal text-white/80">{state.status}</div>
      <div className="text-[10px] normal-case tracking-normal text-white/60">{relative}</div>
    </div>
  );
}

function computeStatus(timestamp?: string | null) {
  if (!timestamp) {
    return { tone: "missing" as const, status: "Data missing" };
  }
  const updated = new Date(timestamp);
  if (Number.isNaN(updated.getTime())) {
    return { tone: "missing" as const, status: "Invalid timestamp" };
  }
  const hours = (Date.now() - updated.getTime()) / 36e5;
  if (hours <= 24) {
    return { tone: "fresh" as const, status: "Fresh" };
  }
  if (hours <= 48) {
    return { tone: "stale" as const, status: "Needs refresh" };
  }
  return { tone: "missing" as const, status: "Stale" };
}
