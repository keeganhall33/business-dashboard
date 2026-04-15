import { WarRoomState } from "@/lib/types/dashboard";

type Props = {
  data: WarRoomState;
};

export function WarRoomPanel({ data }: Props) {
  const isActive = data.mode === "war_room";
  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">War Room</div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${isActive ? "bg-rose-600/20 text-rose-200" : "bg-emerald-600/20 text-emerald-200"}`}
        >
          {isActive ? "ACTIVE" : "NORMAL"}
        </span>
      </div>

      <div className="mt-3 text-sm text-zinc-400">
        {isActive ? data.reason ?? "Performance triggers exceeded." : "System operating in steady-state."}
      </div>
      {data.lastUpdated && (
        <div className="mt-1 text-xs uppercase tracking-[0.2em] text-zinc-500">Updated {formatDate(data.lastUpdated)}</div>
      )}

      <div className="mt-5 space-y-4">
        {data.entries.length === 0 && (
          <div className="rounded-2xl border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">
            No war-room notes yet.
          </div>
        )}
        {data.entries.map((entry) => (
          <article key={entry.id} className="rounded-2xl border border-zinc-900 bg-zinc-950/80 p-4">
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
