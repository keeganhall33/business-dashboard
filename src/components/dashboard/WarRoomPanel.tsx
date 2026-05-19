import { WarRoomState } from "@/lib/types/dashboard";
import { StatusChip } from "./ui/StatusChip";
import { ProgressBar } from "./ui/ProgressBar";

type Props = {
  data: WarRoomState;
};

export function WarRoomPanel({ data }: Props) {
  const isActive = data.mode === "war_room";
  const intensity = Math.max(0, Math.min(100, (isActive ? 55 : 18) + data.entries.length * 8));

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
        {data.entries.map((entry) => (
          <article key={entry.id} className="ui-glass-hover rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">{formatDate(entry.createdAt)}</div>
            <h3 className="mt-1 text-sm font-semibold text-zinc-100">{entry.title}</h3>
            <p className="mt-2 text-sm text-zinc-200">{entry.summary}</p>
          </article>
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
