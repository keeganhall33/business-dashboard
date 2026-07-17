import type { DashboardOverviewResponse } from "@/lib/types/dashboard";
import { countRangeDays, elapsedRangeDays } from "@/lib/date/range";
import { buildForwardActions } from "@/lib/forward-strategy";
import { buildIndustryOpportunities } from "@/lib/industry-pulse";
import { RecommendationList } from "./ui/RecommendationList";

export function ForwardStrategyPanel({
  data
}: {
  data: DashboardOverviewResponse;
}) {
  const range = data.range;
  const totalDays = countRangeDays(range);
  const elapsedDays = elapsedRangeDays(range);
  const industryOpportunities = data.industryPulseSnapshot ? buildIndustryOpportunities(data.industryPulseSnapshot) : [];

  const forwardActions = buildForwardActions(data, totalDays, elapsedDays, industryOpportunities);

  const recommendations = forwardActions.map((action) => ({
    id: action.id,
    title: action.title,
    whyNow: action.reason,
    impact: action.expectedImpact,
    evidence: action.evidence,
    confidence: `Confidence ${action.confidence}`,
    nextStep: `${action.urgency}: Deliver ${action.title.toLowerCase()}`,
    badges: [action.category]
  }));

  return (
    <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-950/60 via-zinc-950 to-zinc-950 p-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-400">Forward strategy</p>
        <p className="text-2xl font-semibold text-white">Deterministic path to target</p>
      </div>

      <div className="mt-6">
        <RecommendationList items={recommendations} empty="Forward strategy requires verified telemetry." />
      </div>
    </section>
  );
}
