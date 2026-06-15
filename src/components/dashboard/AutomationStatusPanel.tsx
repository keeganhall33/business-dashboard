"use client";

import type { AutomationStatusEntry } from "@/lib/types/dashboard";
import { StatusChip } from "./ui/StatusChip";
import { formatRelativeTimeFromNow } from "@/lib/date";

type Props = {
  entries?: AutomationStatusEntry[];
};

export function AutomationStatusPanel({ entries }: Props) {
  return (
    <section className="ui-glass rounded-3xl p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Automation Status</div>
          <div className="text-sm text-zinc-400">Job schedule, last run, and upcoming alerts.</div>
        </div>
        <StatusChip label={`${entries?.length ?? 0} jobs`} tone="zinc" />
      </div>
      <div className="space-y-3">
        {(entries ?? []).map((entry) => (
          <div key={entry.jobName} className="rounded-2xl border border-white/8 bg-black/25 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold text-zinc-200">{entry.jobName}</div>
              <StatusChip label={entry.lastResult ?? "Unknown"} tone={toneForResult(entry.lastResult)} />
            </div>
            <div className="mt-1 text-xs text-zinc-400">
              Cadence: {entry.frequency ?? "n/a"} · Expected {entry.expectedRunTime ?? "—"}
            </div>
            <div className="mt-1 text-xs text-zinc-400">
              Last run: {formatRelative(entry.lastRunAt)} · Next: {formatRelative(entry.nextRunAt)}
            </div>
            {entry.notes ? <div className="mt-1 text-xs text-amber-200">{entry.notes}</div> : null}
          </div>
        ))}
        {!entries?.length ? <div className="text-sm text-zinc-500">No automation metadata yet.</div> : null}
      </div>
    </section>
  );
}

function toneForResult(result?: string | null) {
  if (!result) return "zinc";
  const value = result.toLowerCase();
  if (value.includes("fail")) return "rose";
  if (value.includes("blocked")) return "amber";
  if (value.includes("success") || value.includes("completed")) return "emerald";
  return "zinc";
}

function formatRelative(value: string | null) {
  if (!value) return "unscheduled";
  if (!value.includes("T")) return value;
  return formatRelativeTimeFromNow(value);
}
