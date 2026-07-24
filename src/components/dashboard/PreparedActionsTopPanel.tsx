import type { PrioritizedAction } from "@/lib/dashboard/prepared-action-priority";
import { StatusChip } from "./ui/StatusChip";
import { formatRelativeTimeFromNow } from "@/lib/date";

function priorityTone(label: PrioritizedAction["priorityLabel"]) {
  switch (label) {
    case "do_next":
      return { tone: "rose", text: "Do next" };
    case "review_soon":
      return { tone: "amber", text: "Review soon" };
    case "backlog":
      return { tone: "zinc", text: "Backlog" };
    case "blocked":
      return { tone: "zinc", text: "Needs data" };
    default:
      return { tone: "zinc", text: "Backlog" };
  }
}

export function PreparedActionsTopPanel({ actions }: { actions: PrioritizedAction[] }) {
  if (!actions.length) {
    return null;
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-black/20 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Top actions</p>
          <p className="text-sm text-zinc-400">Manual review order based on impact, urgency, and confidence.</p>
        </div>
      </div>
      <div className="space-y-3">
        {actions.map((action) => {
          const priority = priorityTone(action.priorityLabel);
          return (
            <article key={action.id} className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-zinc-100">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-white">{action.title}</p>
                  <p className="text-xs text-zinc-400">
                    {action.createdByAgent} · {action.category} · {formatRelativeTimeFromNow(action.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <StatusChip label={priority.text} tone={priority.tone as any} />
                  {action.dataWarning ? <StatusChip label={action.dataWarning} tone="amber" /> : null}
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-zinc-400">
                <p className="text-sm text-zinc-200">{action.whyItMatters}</p>
                {action.expectedUpside ? <p className="text-emerald-200">Expected upside: {action.expectedUpside}</p> : null}
                {action.riskIfIgnored ? <p className="text-rose-200">Risk if ignored: {action.riskIfIgnored}</p> : null}
                <p className="text-emerald-300">Next manual step: {action.requiredApprovalAction}</p>
              </div>
              {action.evidence?.length ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-zinc-400">
                  {action.evidence.slice(0, 2).map((evidence, idx) => (
                    <li key={idx}>{evidence.label}{evidence.value ? ` — ${evidence.value}` : ""}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
