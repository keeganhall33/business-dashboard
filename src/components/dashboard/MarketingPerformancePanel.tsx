import type { CommerceTelemetry, MetaAdsSnapshot } from "@/lib/types/dashboard";
import { buildMarketingInsights } from "@/lib/marketing-intelligence";
import { StatusChip } from "./ui/StatusChip";

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

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/20">
        <ActionTable actions={insights.actions} />
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

function ActionTable({ actions }: { actions: ReturnType<typeof buildMarketingInsights>["actions"] }) {
  if (!actions.length) {
    return <p className="p-4 text-sm text-zinc-400">No marketing actions were surfaced for this range.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm text-zinc-200">
        <thead className="bg-white/5 text-[11px] uppercase tracking-[0.3em] text-zinc-500">
          <tr>
            <th className="px-4 py-3">Priority</th>
            <th className="px-4 py-3">Decision</th>
            <th className="px-4 py-3">Recommendation</th>
            <th className="px-4 py-3">Evidence</th>
            <th className="px-4 py-3">Impact</th>
            <th className="px-4 py-3">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {actions.map((action) => (
            <tr key={action.id} className="border-t border-white/10">
              <td className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">{action.urgency}</td>
              <td className="px-4 py-3 font-semibold text-white">{action.title}</td>
              <td className="px-4 py-3 text-zinc-300">{action.recommendation}</td>
              <td className="px-4 py-3 text-zinc-400">{action.evidence}</td>
              <td className="px-4 py-3 text-zinc-300">{action.expectedImpact}</td>
              <td className="px-4 py-3 text-zinc-300">{percentFormatter.format(action.confidence)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
