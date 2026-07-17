import { buildExecutiveActions, ExecutiveActionPlan } from "@/lib/dashboard/executive-layout";
import type { ConfidenceSummary } from "@/lib/data-confidence";
import { DashboardOverviewResponse } from "@/lib/types/dashboard";
import { rankActions, formatConfidence } from "@/lib/executive-actions";
import { RecommendationList, type RecommendationListItem } from "./ui/RecommendationList";

export function ExecutiveActionsPanel({
  data,
  actions: provided,
  confidence
}: {
  data: DashboardOverviewResponse;
  actions?: ExecutiveActionPlan[];
  confidence?: ConfidenceSummary;
}) {
  const actions = provided ?? buildExecutiveActions(data, 7, confidence);
  const ranked = rankActions(actions).filter(isActionExecutable);

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-6">
      <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Executive Actions</div>
      {ranked.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-400">No high-priority actions surfaced for this window.</p>
      ) : (
        <div className="mt-4">
          <RecommendationList items={ranked.map(mapExecutiveAction)} empty="No actions available" />
        </div>
      )}
    </section>
  );
}

function isActionExecutable(action: ExecutiveActionPlan) {
  const title = action.title?.trim().toLowerCase() ?? "";
  const prohibitedTitles = [
    "close the revenue gap",
    "increase monthly revenue",
    "increase aov",
    "increase conversion rate"
  ];
  if (prohibitedTitles.includes(title)) return false;
  if (!action.nextStep || !action.nextStep.trim()) return false;
  if (!action.evidence || !action.evidence.trim()) return false;
  return true;
}

function mapExecutiveAction(action: ExecutiveActionPlan): RecommendationListItem {
  return {
    id: action.id,
    title: action.title,
    whyNow: action.whyNow ?? action.evidence,
    impact: action.impact,
    evidence: action.evidence,
    confidence: action.confidenceDetail ? `${formatConfidence(action.confidence)} • ${action.confidenceDetail}` : formatConfidence(action.confidence),
    nextStep: action.nextStep ?? (action.owner ? `Coordinate with ${action.owner}` : "Assign accountable owner"),
    owner: action.owner,
    badges: action.badges ?? [action.priority]
  };
}
