import { ActionQueue } from "@/lib/types/dashboard";

type Props = {
  data: ActionQueue;
};

function formatRelativeTime(iso: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = date.getTime() - Date.now();
  const diffHours = diffMs / 36e5;
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(diffHours) < 24) {
    return formatter.format(Math.round(diffHours), "hour");
  }
  return formatter.format(Math.round(diffHours / 24), "day");
}

export function ActionQueuePanel({ data }: Props) {
  const sections = [data.needsApprovalTasks, data.pendingPlans, data.decisionsDue, data.invoicesToSend];
  const hasFreshUpdates = sections.some((section) => section.items.some((item) => isFresh(item.createdAt)));

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Needs Keegan</div>
          <div className="text-lg font-semibold text-zinc-100">Action Queue</div>
        </div>
        {hasFreshUpdates && <FreshBadge />}
      </div>

      <div className="mt-5 space-y-4">
        {sections.map((section) => (
          <div key={section.label} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="flex items-center justify-between text-sm font-semibold text-zinc-100">
              <span>{section.label}</span>
              <span className="text-xs text-zinc-500">{section.count}</span>
            </div>
            <div className="mt-3 space-y-3">
              {section.count === 0 ? (
                <div className="text-sm text-zinc-500">All clear.</div>
              ) : (
                section.items.map((item) => (
                  <div key={`${section.label}-${item.id}`} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-zinc-50">
                      <span>{item.title}</span>
                      {isFresh(item.createdAt) && <FreshChip />}
                    </div>
                    {item.summary && <div className="mt-1 text-sm text-zinc-400">{item.summary}</div>}
                    <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                      <span className="capitalize">{item.itemType}</span>
                      <div className="flex items-center gap-3">
                        {item.actor && <span>{item.actor}</span>}
                        {item.dueAt && <span>{formatRelativeTime(item.dueAt)}</span>}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function isFresh(iso: string | null | undefined, hours = 12) {
  if (!iso) return false;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < hours * 36e5;
}

function FreshBadge() {
  return (
    <span className="rounded-full bg-sky-500/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-sky-100">
      New updates
    </span>
  );
}

function FreshChip() {
  return <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-sky-100">New</span>;
}
