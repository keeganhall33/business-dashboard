import { buildExecutiveActions, ExecutiveActionPlan } from "@/lib/dashboard/executive-layout";
import type { ConfidenceSummary } from "@/lib/data-confidence";
import { DashboardOverviewResponse } from "@/lib/types/dashboard";
import { rankActions, formatConfidence } from "@/lib/executive-actions";

export function ExecutiveActionsPanel({ data, actions: provided, confidence }: { data: DashboardOverviewResponse; actions?: ExecutiveActionPlan[]; confidence?: ConfidenceSummary }) {
  const actions = provided ?? buildExecutiveActions(data, 7, confidence);
  const ranked = rankActions(actions);
  const filtered = filterEvidenceBacked(ranked).slice(0, 3);

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
      <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Recommended Actions</div>

      {filtered.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-400">No evidence-backed recommendation is available for this period.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {filtered.map((action) => (
            <ActionCard key={action.id} action={action} />
          ))}
        </div>
      )}
    </section>
  );
}

function ActionCard({ action }: { action: ExecutiveActionPlan }) {
  const evidence = action.evidence.trim();
  const impact = action.impact.trim();
  const due = action.due ? `Due: ${action.due}` : null;
  const confidenceLabel = formatConfidence(action.confidence);
  return (
    <article className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">{action.title}</div>
          <div className="mt-1 text-sm text-zinc-300">{impact}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-300">{action.priority}</div>
          <div className="mt-1 text-[11px] text-zinc-400">{confidenceLabel}</div>
        </div>
      </div>

      <div className="mt-2 text-xs text-zinc-500">Evidence: {evidence}</div>
      {action.sourceDomain ? <div className="mt-1 text-xs text-zinc-500">Source: {action.sourceDomain}</div> : null}
      {due ? <div className="mt-1 text-xs text-zinc-500">{due}</div> : null}
    </article>
  );
}

function filterEvidenceBacked(actions: ExecutiveActionPlan[]) {
  const blockedPhrases = [
    "stabilize automation cadence",
    "increase monthly revenue",
    "increase average order value",
    "move toward target",
    "design premium pricing architecture",
    "investigation required",
    "re-enable cron",
    "repair",
    "automation"
  ];

  return actions.filter((action) => {
    // Remove operational / automation actions from the executive view.
    if (action.id === "scheduler" || action.id.startsWith("telemetry-")) return false;
    if (action.sourceDomain === "operations") return false;

    const title = action.title.toLowerCase();
    if (blockedPhrases.some((phrase) => title.includes(phrase))) return false;

    // Must have concrete evidence.
    const evidence = action.evidence?.trim();
    if (!evidence) return false;
    if (evidence.toLowerCase().includes("missing telemetry") || evidence.toLowerCase().includes("unknown")) return false;

    return true;
  });
}
