import { WarRoomState } from "@/lib/types/dashboard";
import { StatusChip } from "./ui/StatusChip";
import { ProgressBar } from "./ui/ProgressBar";
import { InsightCard, type InsightObject } from "./ui/InsightCard";

type Props = {
  data: WarRoomState;
};

export function WarRoomPanel({ data }: Props) {
  const isActive = data.mode === "war_room";
  const intensity = Math.max(0, Math.min(100, (isActive ? 55 : 18) + data.entries.length * 8));

  const insights: InsightObject[] = data.entries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    claim: entry.summary,
    state: isActive ? "action_needed" : "supported",
    confidenceLabel: "operator log",
    updatedAtLabel: `Logged ${formatDate(entry.createdAt)}`,
    definition: "War Room notes capture the why + what-next when the system enters (or exits) elevated risk mode.",
    evidence: [
      { label: "Mode", value: data.mode.replace(/_/g, " ") },
      { label: "Reason", value: data.reason ?? "—" },
      { label: "Updated", value: data.lastUpdated ? formatDate(data.lastUpdated) : "—" }
    ],
    actions: entry.detailMd
      ? [{ label: "Read full detail", detail: "Open the Explain drawer to see evidence + full text." }]
      : [{ label: "Add full detail", detail: "Write a longer note (detailMd) for operator drill-down." }]
  }));

  return (
    <section className="ui-glass ui-glass-hover rounded-3xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className={`ui-status-dot ${isActive ? "ui-pulse" : ""}`} data-tone={isActive ? "rose" : "emerald"} />
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">War Room</div>
          </div>
          <div className="mt-2 text-sm text-zinc-400">
            {isActive ? data.reason ?? "Performance triggers exceeded." : "System operating in steady-state."}
          </div>
          {data.lastUpdated && (
            <div className="mt-1 text-xs uppercase tracking-[0.2em] text-zinc-500">Updated {formatDate(data.lastUpdated)}</div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusChip label={isActive ? "ACTIVE" : "NORMAL"} tone={isActive ? "rose" : "emerald"} />
          <div className="w-32">
            <ProgressBar value={intensity} tone={isActive ? "rose" : "emerald"} className="bg-black/25" />
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {data.entries.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm text-zinc-500">
            No war-room notes yet.
          </div>
        )}
        {insights.map((insight) => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </div>
    </section>
  );
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return value;
  }
}
