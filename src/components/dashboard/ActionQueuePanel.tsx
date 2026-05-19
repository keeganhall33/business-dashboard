import { buildQuickActions } from "@/lib/action-queue";
import { formatRelativeTimeFromNow } from "@/lib/date";
import { ActionQueue } from "@/lib/types/dashboard";
import { ActionQueueQuickActions } from "./ActionQueueQuickActions";

type Props = {
  data: ActionQueue;
};

export function ActionQueuePanel({ data }: Props) {
  const sections = [data.needsApprovalTasks, data.pendingPlans, data.decisionsDue, data.invoicesToSend];
  const quickActions = buildQuickActions(data);

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Needs Keegan</div>
          <div className="text-lg font-semibold text-zinc-100">Action Queue</div>
        </div>
      </div>

      <div className="mt-5 space-y-5">
        <ActionQueueQuickActions items={quickActions} />

        <div className="space-y-4">
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
                      <div className="text-sm font-medium text-zinc-50">{item.title}</div>
                      {item.summary && <div className="mt-1 text-sm text-zinc-400">{item.summary}</div>}
                      <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                        <span className="capitalize">{item.itemType}</span>
                        <div className="flex items-center gap-3">
                          {item.actor && <span>{item.actor}</span>}
                          {item.dueAt && <span>{formatRelativeTimeFromNow(item.dueAt)}</span>}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
