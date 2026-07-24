import { buildExecutiveActions, ExecutiveActionPlan } from "@/lib/dashboard/executive-layout";
import type { ConfidenceSummary } from "@/lib/data-confidence";
import { DashboardOverviewResponse } from "@/lib/types/dashboard";
import { rankActions, formatConfidence } from "@/lib/executive-actions";

export function ExecutiveActionsPanel({ data, actions: provided, confidence }: { data: DashboardOverviewResponse; actions?: ExecutiveActionPlan[]; confidence?: ConfidenceSummary }) {
  const actions = provided ?? buildExecutiveActions(data, 7, confidence);
  const ranked = rankActions(actions);

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-6">
      <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Executive Actions</div>
      {ranked.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-400">No high-priority actions surfaced for this window.</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-white/5">
          <table className="min-w-full text-sm text-zinc-200">
            <thead className="bg-white/5 text-[11px] uppercase tracking-[0.25em] text-zinc-400">
              <tr>
                <th className="px-4 py-3 text-left">Priority</th>
                <th className="px-4 py-3 text-left">Action</th>
                <th className="px-4 py-3 text-left">Impact</th>
                <th className="px-4 py-3 text-left">Confidence</th>
                <th className="px-4 py-3 text-left">Owner</th>
                <th className="px-4 py-3 text-left">Evidence</th>
                <th className="px-4 py-3 text-left">Due</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((action) => (
                <ActionRow key={action.id} action={action} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ActionRow({ action }: { action: ExecutiveActionPlan }) {
  return (
    <tr className="border-t border-white/5">
      <td className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">{action.priority}</td>
      <td className="px-4 py-3 font-semibold text-white">{action.title}</td>
      <td className="px-4 py-3 text-zinc-300">{action.impact}</td>
      <td className="px-4 py-3 text-zinc-300">
        {formatConfidence(action.confidence)}
        {action.confidenceDetail ? <p className="text-[10px] text-zinc-500">{action.confidenceDetail}</p> : null}
      </td>
      <td className="px-4 py-3 text-zinc-300">{action.owner ?? "—"}</td>
      <td className="px-4 py-3 text-zinc-400">
        <div>{action.evidence}</div>
      </td>
      <td className="px-4 py-3 text-zinc-300">{action.due ?? "—"}</td>
    </tr>
  );
}
