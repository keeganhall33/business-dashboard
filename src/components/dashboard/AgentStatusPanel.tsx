"use client";

import type { AgentStatusPanelEntry } from "@/lib/types/dashboard";
import { StatusChip } from "./ui/StatusChip";
import { formatRelativeTimeFromNow } from "@/lib/date";

type Props = {
  entries?: AgentStatusPanelEntry[];
};

export function AgentStatusPanel({ entries }: Props) {
  return (
    <section className="ui-glass rounded-3xl p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Agent Status</div>
          <div className="text-sm text-zinc-400">Last runs and blockers for automation agents.</div>
        </div>
        <StatusChip label={`${entries?.length ?? 0} agents`} tone="zinc" />
      </div>
      <div className="divide-y divide-white/5">
        {(entries ?? []).map((entry) => (
          <div key={entry.agentName} className="py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold text-zinc-200">{entry.agentName}</div>
              <StatusChip
                label={entry.runStatus ?? "Unknown"}
                tone={entry.runStatus?.toLowerCase().includes("block") ? "amber" : entry.runStatus?.toLowerCase().includes("failed") ? "rose" : "emerald"}
              />
            </div>
            <div className="mt-1 text-xs text-zinc-400">
              Cadence: {entry.cadence ?? "n/a"} · Last run: {formatRelative(entry.lastRunAt)} · Next: {formatRelative(entry.nextRunAt)}
            </div>
            {entry.issues ? <div className="mt-1 text-xs text-amber-200">{entry.issues}</div> : null}
            {entry.actions.length ? (
              <div className="mt-1 text-xs text-zinc-400">Actions: {entry.actions.join(" · ")}</div>
            ) : null}
          </div>
        ))}
        {!entries?.length ? <div className="py-4 text-sm text-zinc-500">No agent telemetry available.</div> : null}
      </div>
    </section>
  );
}

function formatRelative(value: string | null) {
  if (!value) return "unscheduled";
  if (value.toLowerCase() === "not yet run" || value.toLowerCase() === "tbd") return value;
  if (!value.includes("T")) return value;
  return formatRelativeTimeFromNow(value);
}
