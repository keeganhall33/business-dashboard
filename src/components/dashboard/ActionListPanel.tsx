"use client";

import type { DashboardActionItem } from "@/lib/types/dashboard";
import { StatusChip } from "./ui/StatusChip";

const toneMap: Record<NonNullable<DashboardActionItem["tone"]>, "zinc" | "emerald" | "amber" | "rose" | "sky"> = {
  info: "zinc",
  success: "emerald",
  warning: "amber",
  danger: "rose"
};

type Props = {
  title: string;
  subtitle?: string;
  items?: DashboardActionItem[];
};

export function ActionListPanel({ title, subtitle, items }: Props) {
  return (
    <section className="ui-glass rounded-3xl p-5">
      <div className="mb-3">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">{title}</div>
        {subtitle ? <div className="text-sm text-zinc-400">{subtitle}</div> : null}
      </div>
      <div className="space-y-3 text-sm">
        {(items ?? []).map((item, index) => (
          <div key={`${item.title}-${index}`} className="rounded-2xl border border-white/8 bg-black/25 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold text-zinc-200">{item.title}</div>
              <StatusChip label={item.status ?? (item.tone ? item.tone.toUpperCase() : "INFO")} tone={toneMap[item.tone ?? "info"]} />
            </div>
            {item.detail ? <div className="mt-1 text-xs text-zinc-400">{item.detail}</div> : null}
            {item.owner ? <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-zinc-500">Owner: {item.owner}</div> : null}
          </div>
        ))}
        {!items?.length ? <div className="text-sm text-zinc-500">No items yet.</div> : null}
      </div>
    </section>
  );
}
