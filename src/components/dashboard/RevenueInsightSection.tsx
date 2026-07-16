import { buildRevenueIntelligence } from "@/lib/revenue-intelligence";
import type { RevenueAction } from "@/lib/revenue-intelligence";
import type { CommerceTelemetry, WebsiteConversionSnapshot } from "@/lib/types/dashboard";

export function RevenueInsightSection({ snapshot, telemetry }: { snapshot?: WebsiteConversionSnapshot | null; telemetry?: CommerceTelemetry }) {
  const intel = buildRevenueIntelligence({ snapshot, telemetry });
  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-black/30 p-4">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Revenue intelligence</div>
        <p className="mt-1 text-sm text-zinc-200">{intel.headline}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-zinc-400">
          {intel.supportingEvidence.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      {intel.metrics.length ? <MetricsGrid metrics={intel.metrics} /> : null}

      {intel.drivers.length ? (
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">Drivers</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-zinc-400">
            {intel.drivers.map((driver) => (
              <li key={driver}>{driver}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <InsightList title="Product insights" items={intel.productInsights} />
        <InsightList title="Customer insights" items={intel.customerInsights} />
      </div>

      <RevenueActionTable actions={intel.actions} />
    </section>
  );
}

function MetricsGrid({
  metrics
}: {
  metrics: Array<{ label: string; value: string; delta?: string; explanation?: string }>;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => (
        <div key={metric.label} className="rounded-xl border border-white/10 bg-black/40 p-3">
          <div className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">{metric.label}</div>
          <div className="mt-1 text-xl font-semibold text-white">{metric.value}</div>
          {metric.delta ? <div className="text-xs text-zinc-400">Δ {metric.delta}</div> : null}
          {metric.explanation ? <div className="text-[11px] text-zinc-500">{metric.explanation}</div> : null}
        </div>
      ))}
    </div>
  );
}

function InsightList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/40 p-3 text-xs text-zinc-500">
        <div className="font-semibold text-zinc-300">{title}</div>
        <p>No signals available.</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-3">
      <div className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">{title}</div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-zinc-400">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function RevenueActionTable({ actions }: { actions: RevenueAction[] }) {
  if (!actions.length) {
    return <p className="text-sm text-zinc-400">No revenue actions surfaced for this range.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm text-zinc-200">
        <thead className="bg-white/5 text-[11px] uppercase tracking-[0.3em] text-zinc-500">
          <tr>
            <th className="px-4 py-3">Urgency</th>
            <th className="px-4 py-3">Decision</th>
            <th className="px-4 py-3">Reason</th>
            <th className="px-4 py-3">Impact</th>
            <th className="px-4 py-3">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {actions.map((action) => (
            <tr key={action.id} className="border-t border-white/10">
              <td className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">{action.urgency}</td>
              <td className="px-4 py-3 font-semibold text-white">{action.title}</td>
              <td className="px-4 py-3 text-zinc-300">{action.reason}</td>
              <td className="px-4 py-3 text-zinc-300">{action.expectedImpact}</td>
              <td className="px-4 py-3 text-zinc-300">{`${action.confidenceLabel} ${formatPercent(action.confidence)}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 }).format(value);
}
