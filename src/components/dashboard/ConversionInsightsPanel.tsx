import type {
  DataLabel,
  FunnelMetricInsight,
  MarketingActionInsight,
  ProductCallout
} from "@/lib/dashboard/website-decisions";
import { StatusChip } from "./ui/StatusChip";

const STATUS_TONE: Record<string, Parameters<typeof StatusChip>[0]["tone"]> = {
  good: "emerald",
  watch: "amber",
  risk: "rose",
  missing: "zinc"
};

type Props = {
  funnelMetrics: FunnelMetricInsight[];
  marketingActions: MarketingActionInsight[];
  productCallouts: ProductCallout[];
  dataLabels: DataLabel[];
};

export function ConversionInsightsPanel({ funnelMetrics, marketingActions, productCallouts, dataLabels }: Props) {
  if (!funnelMetrics.length) return null;

  return (
    <section className="rounded-3xl border border-white/10 bg-black/20 p-6" data-testid="conversion-insights-panel">
      <header className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Website conversion pulse</p>
          <p className="text-sm text-zinc-400">Interpretation of every funnel stage plus actions to move revenue.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {dataLabels.map((label) => (
            <StatusChip key={label.id} label={label.label} tone={label.tone} />
          ))}
        </div>
      </header>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          {funnelMetrics.map((metric) => (
            <article key={metric.key} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-zinc-500">
                <span>{metric.label}</span>
                <StatusChip label={metric.status === "good" ? "Healthy" : metric.status === "watch" ? "Needs focus" : metric.status === "risk" ? "Critical" : "Missing"} tone={STATUS_TONE[metric.status]} />
              </div>
              <p className="mt-2 text-2xl font-semibold text-white">{metric.valueLabel}</p>
              {metric.rateLabel ? <p className="text-xs text-zinc-400">{metric.rateLabel}</p> : null}
              <p className="mt-2 text-sm text-zinc-300">{metric.summary}</p>
              <p className="mt-1 text-sm text-emerald-200">Next move: {metric.action}</p>
            </article>
          ))}
        </div>
        <div className="space-y-4">
          {marketingActions.length ? (
            <article className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Marketing actions</p>
              <ul className="mt-3 space-y-3">
                {marketingActions.map((action) => (
                  <li key={action.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
                    <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-zinc-500">
                      <span>{action.channel}</span>
                      <span className="text-zinc-400">{action.confidence} confidence</span>
                    </div>
                    <p className="mt-1 text-sm text-white">{action.recommendation}</p>
                    <p className="text-xs text-zinc-400">{action.reason}</p>
                  </li>
                ))}
              </ul>
            </article>
          ) : null}
          {productCallouts.length ? (
            <article className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Product spotlight</p>
              <ul className="mt-3 space-y-3">
                {productCallouts.map((callout) => (
                  <li key={callout.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
                    <p className="text-sm font-semibold text-white">{callout.label}</p>
                    <p className="text-xs text-zinc-400">{callout.summary}</p>
                    <p className="mt-1 text-sm text-emerald-200">Action: {callout.recommendedAction}</p>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">Source: {callout.source}</p>
                  </li>
                ))}
              </ul>
            </article>
          ) : null}
        </div>
      </div>
    </section>
  );
}
