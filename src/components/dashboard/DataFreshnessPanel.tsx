import { StatusChip } from "./ui/StatusChip";
import { formatRelativeTimeFromNow } from "@/lib/date";
import { SourceRangeLabel } from "./ui/SourceRangeLabel";

export type DataFreshnessSource = {
  id: string;
  label: string;
  description: string;
  panels: string[];
  command?: { label: string; command: string };
  lastUpdatedIso?: string | null;
  relativeLabel: string;
  statusLabel: string;
  tone: "emerald" | "amber" | "rose" | "zinc";
  detail?: string;
  warnExecutive?: boolean;
};

type Props = {
  sources: DataFreshnessSource[];
};

export function DataFreshnessPanel({ sources }: Props) {
  if (!sources.length) return null;

  return (
    <section
      data-testid="data-freshness-panel"
      className="rounded-3xl border border-white/10 bg-black/20 p-5 text-sm text-zinc-200"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Data refresh state</p>
          <p className="text-sm text-zinc-400">Manual visibility into which sources are current, stale, or missing.</p>
          <SourceRangeLabel source="Data health monitors" range="Range not applicable" confidence="live status" note="Use commands to refresh when safe" />
        </div>
        <p className="text-xs text-zinc-500">Refresh commands are informational only; nothing runs automatically.</p>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {sources.map((source) => (
          <article key={source.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">{source.label}</p>
                <p className="mt-1 text-xs text-zinc-400">{source.description}</p>
              </div>
              <StatusChip label={source.statusLabel} tone={source.tone} />
            </div>
            <p className="mt-2 text-xs text-zinc-500">Last refresh: {source.relativeLabel}</p>
            <p className="mt-1 text-xs text-zinc-500">Used by: {source.panels.join(", ")}</p>
            {source.detail ? <p className="mt-1 text-xs text-amber-200">{source.detail}</p> : null}
            {source.command ? (
              <details className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-left">
                <summary className="cursor-pointer text-zinc-400">Manual refresh command</summary>
                <div className="mt-2 space-y-1">
                  <p className="font-semibold text-zinc-300">{source.command.label}</p>
                  <code className="block whitespace-pre-wrap rounded bg-black/60 p-2 text-[11px] text-zinc-100">{source.command.command}</code>
                </div>
              </details>
            ) : (
              <p className="mt-3 text-xs text-zinc-500">Manual updates happen inside the dashboard (no CLI command).</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
