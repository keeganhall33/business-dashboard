"use client";

import type { SchedulerControlState, SchedulerSummary, WarRoomState } from "@/lib/types/dashboard";
import type { PrioritizedAction } from "@/lib/dashboard/prepared-action-priority";

const modeTone: Record<string, string> = {
  LIVE: "bg-emerald-500/15 text-emerald-100 border border-emerald-400/40",
  PARTIAL: "bg-amber-500/15 text-amber-100 border border-amber-400/40",
  BROKEN: "bg-rose-500/15 text-rose-100 border border-rose-400/40",
  FALLBACK: "bg-rose-500/15 text-rose-100 border border-rose-400/40"
};

type FreshnessItem = { label: string; timestamp?: string | null; fallbackNote?: string };

type Props = {
  rangeLabel?: string | null;
  freshnessItems: FreshnessItem[];
  marketingMode: string;
  metaMode: string;
  schedulerSummary?: SchedulerSummary | null;
  warRoom?: WarRoomState | null;
  pilotStatus?: SchedulerControlState | null;
  dataWarnings?: string[];
};

export function StatusBanner({
  rangeLabel,
  freshnessItems,
  marketingMode,
  metaMode,
  schedulerSummary,
  warRoom,
  pilotStatus,
  dataWarnings = []
}: Props) {
  const cronEnabled = schedulerSummary?.cronEnabled ?? false;
  const cronStatus = cronEnabled ? "LIVE" : "BROKEN";
  const staleNotes = freshnessItems
    .map((item) => ({ label: item.label, ageLabel: formatAge(item.timestamp), stale: isStale(item.timestamp) }))
    .filter((item) => item.stale)
    .map((item) => `${item.label}: ${item.ageLabel ?? "unknown"}`);
  const warRoomActive = warRoom?.mode === "war_room";
  const pilotJob = pilotStatus?.pilotJobs?.[0];
  const observeJob = pilotStatus?.observeJobs?.[0];
  const skippedSummary = pilotJob?.skippedByReason ? formatSkippedSummary(pilotJob.skippedByReason) : null;
  const warningChips = dataWarnings.length ? dataWarnings : staleNotes;

  return (
    <section className="rounded-3xl border border-white/10 bg-black/30 p-5 text-sm text-zinc-100">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.35em] text-zinc-500">Business status</p>
            <p className="text-2xl font-semibold text-white">{rangeLabel ?? "Current window"}</p>
            <p className={`text-xs ${staleNotes.length ? "text-amber-200" : "text-zinc-400"}`}>
              {staleNotes.length ? `Stale data: ${staleNotes.join(", ")}` : "All telemetry fresh."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.3em]">
            <StatusChip label="Marketing" mode={marketingMode} />
            <StatusChip label="Meta" mode={metaMode} />
            <StatusChip label="Cron" mode={cronStatus} detail={cronEnabled ? "Enabled" : "OFF"} />
            {warRoomActive ? <StatusChip label="War room" mode="BROKEN" detail={warRoom?.reason ?? "Manual override"} /> : null}
          </div>
        </div>

        {warningChips.length ? (
          <div className="flex flex-wrap gap-2">
            {warningChips.map((warning) => (
              <span key={warning} className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.3em] text-amber-100">
                {warning}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {pilotStatus ? (
        <details className="mt-4 rounded-2xl border border-white/5 bg-black/20 p-3 text-xs text-zinc-400">
          <summary className="cursor-pointer list-none text-[11px] uppercase tracking-[0.35em] text-zinc-500">
            Scheduler & alert routing
          </summary>
          <div className="mt-2 space-y-1">
            <p>
              <span className="font-semibold text-zinc-200">Safe snapshot jobs:</span> {pilotStatus.activeSnapshotJobs.join(", ") || "None"}
            </p>
            {pilotJob ? (
              <p>
                <span className="font-semibold text-zinc-200">Alert pilot:</span> {pilotJob.jobKey} ({pilotJob.mode}) · last run {formatAge(pilotJob.lastRunAt) ?? "unknown"} ·
                created {pilotJob.createdCount ?? 0}/{pilotJob.alertCap ?? 3}
                {skippedSummary ? ` · skipped ${skippedSummary}` : ""}
              </p>
            ) : null}
            {observeJob ? (
              <p>
                <span className="font-semibold text-zinc-200">Observe-only:</span> {observeJob.jobKey} ({observeJob.mode}) · last run {formatAge(observeJob.lastRunAt) ?? "unknown"}
              </p>
            ) : null}
            {pilotStatus.blockedJobs.length ? (
              <p>
                <span className="font-semibold text-zinc-200">Blocked jobs:</span> {pilotStatus.blockedJobs.join(", ")}
              </p>
            ) : null}
            {pilotStatus.policySummary ? (
              <p className="text-zinc-300">
                <span className="font-semibold text-zinc-200">Alert policy:</span> eligible {formatList(pilotStatus.policySummary.eligibleCategories)} ·
                grouped {formatList(pilotStatus.policySummary.groupedCategories)} · manual {formatList(pilotStatus.policySummary.manualReviewCategories)}
              </p>
            ) : null}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function StatusChip({ label, mode, detail }: { label: string; mode: string; detail?: string | null }) {
  const tone = modeTone[mode] ?? "bg-zinc-800/80 text-zinc-200 border border-zinc-600/60";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs ${tone}`}>
      <span>{label}</span>
      {detail ? <span className="text-[10px] uppercase tracking-[0.3em] text-white/70">{detail}</span> : null}
    </span>
  );
}

function formatAge(timestamp?: string | null) {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  const diffHours = (Date.now() - date.getTime()) / 36e5;
  if (diffHours < 1) return "<1h";
  if (diffHours < 24) return `${diffHours.toFixed(1)}h`;
  const diffDays = diffHours / 24;
  return `${diffDays.toFixed(1)}d`;
}

function isStale(timestamp?: string | null, thresholdHours = 24) {
  if (!timestamp) return true;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return true;
  const diffHours = (Date.now() - date.getTime()) / 36e5;
  return diffHours > thresholdHours;
}

function formatSkippedSummary(map: Record<string, number>) {
  const entries = Object.entries(map);
  if (!entries.length) return "0";
  return entries
    .map(([reason, count]) => `${reason} ${count}`)
    .join(", ");
}

function formatList(list?: string[]) {
  if (!list || list.length === 0) return "none";
  return list.join(", ");
}
