import { WarRoomState } from "@/lib/types/dashboard";

type Props = {
  data: WarRoomState;
};

export function WarRoomPanel({ data }: Props) {
  const isActive = data.mode === "war_room";
  const entries = data.entries ?? [];
  const latestEntry = entries[0] ?? null;
  const archiveEntries = entries.slice(1);
  const latestIsFresh = latestEntry ? isFresh(latestEntry.createdAt) : false;
  const nextSteps = latestEntry ? extractNextSteps(latestEntry.detailMd) : [];
  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">War Room</div>
          <p className="text-sm text-zinc-400">Tue/Fri live session — outcomes auto-wired into ops.</p>
        </div>
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
        {!latestEntry && (
          <div className="rounded-2xl border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">
            No war-room notes yet.
          </div>
        )}

        {latestEntry && (
          <article className="rounded-2xl border border-emerald-800 bg-emerald-900/10 p-4">
            <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.2em] text-emerald-300">
              <span>Latest session · {formatDate(latestEntry.createdAt)}</span>
              {latestIsFresh && <FreshBadge />}
            </div>
            <h3 className="mt-1 text-base font-semibold text-emerald-50">{latestEntry.title}</h3>
            <p className="mt-2 text-sm text-emerald-100">{latestEntry.summary}</p>

            {nextSteps.length > 0 && (
              <div className="mt-4 rounded-2xl border border-emerald-800/60 bg-emerald-900/40 p-4">
                <div className="text-[11px] uppercase tracking-[0.3em] text-emerald-300">Next steps (auto-wired)</div>
                <ul className="mt-3 space-y-2 text-sm text-emerald-50">
                  {nextSteps.map((step, index) => (
                    <li key={`next-step-${index}`} className="flex gap-2">
                      <span>•</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-emerald-200">Related tasks were pushed to the queue immediately.</p>
              </div>
            )}
          </article>
        )}

        {archiveEntries.length > 0 && (
          <div className="space-y-3">
            <div className="text-[11px] uppercase tracking-[0.3em] text-zinc-600">Previous sessions</div>
            {archiveEntries.map((entry) => (
              <article key={entry.id} className="rounded-2xl border border-zinc-900 bg-zinc-950/80 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">{formatDate(entry.createdAt)}</div>
                <h3 className="mt-1 text-sm font-semibold text-zinc-100">{entry.title}</h3>
                <p className="mt-2 text-sm text-zinc-200">{entry.summary}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function extractNextSteps(detail?: string | null) {
  if (!detail) return [];
  return detail
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

function isFresh(iso: string | null, hours = 24) {
  if (!iso) return false;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < hours * 36e5;
}

function FreshBadge() {
  return (
    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-100">
      New
    </span>
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
