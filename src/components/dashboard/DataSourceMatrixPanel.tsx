"use client";

import type { DataSourceAccessEntry } from "@/lib/types/dashboard";
import { StatusChip } from "./ui/StatusChip";
import { formatRelativeTimeFromNow } from "@/lib/date";

type Props = {
  entries?: DataSourceAccessEntry[];
};

export function DataSourceMatrixPanel({ entries }: Props) {
  return (
    <section className="ui-glass rounded-3xl p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Data Access</div>
          <div className="text-sm text-zinc-400">Credential status for every telemetry source.</div>
        </div>
        <StatusChip label={`Sources ${entries?.length ?? 0}`} tone="zinc" />
      </div>
      <div className="space-y-3 text-sm">
        {(entries ?? []).map((entry) => (
          <div key={entry.name} className="rounded-2xl border border-white/8 bg-black/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold text-zinc-200">{entry.name}</div>
              <StatusChip label={entry.status} tone={toneForStatus(entry.status)} />
            </div>
            <div className="mt-1 text-xs text-zinc-400">
              Owner: {entry.owner ?? "unassigned"} · Last verified: {formatRelative(entry.lastVerified)}
            </div>
            <div className="mt-1 text-xs text-zinc-400">
              Credential: {entry.credentialLocation ?? "unknown"} · Access: {entry.accessMethod ?? "n/a"}
            </div>
            {entry.notes ? <div className="mt-1 text-xs text-amber-200">{entry.notes}</div> : null}
          </div>
        ))}
        {!entries?.length ? <div className="text-sm text-zinc-500">No sources documented.</div> : null}
      </div>
    </section>
  );
}

function toneForStatus(status?: string) {
  if (!status) return "zinc";
  const lower = status.toLowerCase();
  if (lower.includes("pending") || lower.includes("unknown") || lower.includes("inaccessible")) return "amber";
  if (lower.includes("confirmed") || lower.includes("verified") || lower.includes("available")) return "emerald";
  return "zinc";
}

function formatRelative(value: string | null) {
  if (!value) return "unknown";
  if (!value.includes("T")) return value;
  return formatRelativeTimeFromNow(value);
}
