import type { CommerceTelemetry, MetaAdsSnapshot } from "@/lib/types/dashboard";
import { buildMarketingInsights } from "@/lib/marketing-intelligence";
import { StatusChip } from "./ui/StatusChip";
import { RecommendationList } from "./ui/RecommendationList";

const percentFormatter = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 });

type Props = {
  telemetry?: CommerceTelemetry;
  meta?: MetaAdsSnapshot | null;
};

export function MarketingPerformancePanel({ telemetry, meta }: Props) {
  const insights = buildMarketingInsights({ commerceTelemetry: telemetry, metaAds: meta });
  const attentionAction = insights.actions[0];

  return (
    <section className="ui-glass rounded-3xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Marketing intelligence</div>
          <p className="mt-1 text-sm text-zinc-400">Answers what deserves attention, why it happened, and what to do next.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {insights.evidenceSources.map((source) => (
            <StatusChip key={source} label={source} tone="zinc" />
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <InsightCard title="What deserves attention" headline={insights.attentionHeadline} bullets={insights.attentionEvidence} />
        <InsightCard title="Why it happened" headline={attentionAction ? attentionAction.title : "Stable"} bullets={insights.drivers} />
        <InsightCard title="What happens next" headline={insights.outlook} />
      </div>

      <div className="mt-4">
        <RecommendationList items={insights.actions.map(mapMarketingAction)} empty="No marketing actions were surfaced for this range." />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {insights.metrics.map((metric) => (
          <MetricChip key={metric.label} label={metric.label} value={metric.value} delta={metric.delta} />
        ))}
      </div>
    </section>
  );
}

function InsightCard({ title, headline, bullets = [] }: { title: string; headline: string; bullets?: string[] }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">{title}</div>
      <p className="mt-2 text-sm text-zinc-100">{headline}</p>
      {bullets?.length ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-zinc-400">
          {bullets.slice(0, 3).map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function mapMarketingAction(action: ReturnType<typeof buildMarketingInsights>["actions"][number]) {
  return {
    id: action.id,
    title: action.title,
    whyNow: action.evidence,
    impact: action.expectedImpact,
    evidence: action.evidence,
    confidence: `${action.confidenceLabel} ${percentFormatter.format(action.confidence)}`,
    nextStep: action.recommendation,
    badges: [action.urgency]
  };
}

function MetricChip({ label, value, delta }: { label: string; value: string; delta?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <div className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">{label}</div>
      <div className="mt-2 text-xl font-semibold text-white">{value}</div>
      {delta ? <div className="text-xs text-zinc-400">Δ {delta}</div> : null}
    </div>
  );
}
