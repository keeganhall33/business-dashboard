import { DashboardOverviewResponse } from "@/lib/types/dashboard";
import { ExecutiveActionPlan } from "@/lib/dashboard/executive-layout";
import { formatMetricValue } from "@/lib/utils/format";

export function ExecutivePerspectivePanel({
  data,
  actions
}: {
  data: DashboardOverviewResponse;
  actions: ExecutiveActionPlan[];
}) {
  const topTrend = data.executiveInsights?.trends?.[0] ?? null;
  const opportunity = data.industryPulseSnapshot?.alerts?.[0] ?? null;
  const nextAction = actions[0] ?? null;

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-6">
      <div className="text-[11px] font-semibold uppercase tracking-[0.35em] text-zinc-500">Executive perspectives</div>
      <div className="mt-4 grid gap-4 lg:grid-cols-4">
        <PerspectiveCard
          title="What happened"
          headline={topTrend ? topTrend.label : "Insufficient evidence"}
          body={topTrend ? describeTrend(topTrend) : "No material change detected in the verified telemetry window."}
          provenance={topTrend ? `Source: ${topTrend.source.toUpperCase()}` : undefined}
        />
        <PerspectiveCard
          title="Why it happened"
          headline={topTrend?.caveat ? "Explained" : "Investigation required"}
          body={topTrend?.caveat ?? "No root-cause evidence available. Prioritize validated diagnostics."}
          provenance={topTrend ? `Metric: ${topTrend.metric}` : undefined}
        />
        <PerspectiveCard
          title="What to do next"
          headline={nextAction ? nextAction.title : "No executable actions"}
          body={nextAction ? nextAction.impact : "Add evidence-backed actions to drive forward progress."}
          provenance={nextAction ? formatActionProvenance(nextAction) : undefined}
        />
        <PerspectiveCard
          title="Opportunities we're missing"
          headline={opportunity ? opportunity.title : "No surfaced opportunity"}
          body={
            opportunity
              ? opportunity.whyItMatters
              : "Industry Pulse did not find a verified opportunity with clear commercial value in this window."
          }
          provenance={opportunity ? `Source: ${opportunity.source}` : undefined}
        />
      </div>
    </section>
  );
}

function PerspectiveCard({
  title,
  headline,
  body,
  provenance
}: {
  title: string;
  headline: string;
  body: string;
  provenance?: string;
}) {
  return (
    <article className="flex flex-col rounded-2xl border border-white/10 bg-black/30 p-4">
      <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">{title}</p>
      <h3 className="mt-2 text-lg font-semibold text-white">{headline}</h3>
      <p className="mt-2 text-sm text-zinc-300">{body}</p>
      {provenance ? <p className="mt-3 text-[11px] uppercase tracking-[0.2em] text-zinc-500">{provenance}</p> : null}
    </article>
  );
}

function describeTrend(trend: NonNullable<DashboardOverviewResponse["executiveInsights"]>["trends"][number]) {
  const percent = typeof trend.percentChange === "number" ? `${trend.percentChange.toFixed(1)}%` : null;
  const absolute = typeof trend.absoluteChange === "number" ? formatMetricValue(trend.absoluteChange, null) : null;
  const direction = trend.direction === "down" ? "declined" : trend.direction === "up" ? "grew" : "held steady";
  const pieces = [percent, absolute].filter(Boolean).join(" / ");
  return `${trend.label} ${direction}${pieces ? ` (${pieces})` : ""} vs previous period.`;
}

function formatActionProvenance(action: ExecutiveActionPlan) {
  const parts = [action.evidence, action.owner ? `Owner: ${action.owner}` : null, action.due ? `Due ${action.due}` : null].filter(
    Boolean
  );
  return parts.join(" • ") || "No provenance provided";
}
