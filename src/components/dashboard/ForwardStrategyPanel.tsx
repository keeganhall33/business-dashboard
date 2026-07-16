import type { DashboardOverviewResponse, ExecutiveInsightsPayload, HeaderMetric } from "@/lib/types/dashboard";
import { countRangeDays, elapsedRangeDays } from "@/lib/date/range";

function findMetric(metrics: HeaderMetric[], predicate: (metric: HeaderMetric) => boolean) {
  return metrics.find(predicate);
}

export function ForwardStrategyPanel({
  data
}: {
  data: DashboardOverviewResponse;
}) {
  const range = data.range;
  const totalDays = countRangeDays(range);
  const elapsedDays = elapsedRangeDays(range);

  const forwardActions = buildForwardActions(data, totalDays, elapsedDays);

  return (
    <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-950/60 via-zinc-950 to-zinc-950 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-400">Forward strategy</p>
          <p className="text-2xl font-semibold text-white">Deterministic path to target</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] ${forecastTone}`}>{forecastBadge}</span>
      </div>

      <ol className="mt-6 space-y-4">
        {forwardActions.map((action) => (
          <li key={action.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">{action.category}</p>
                <h3 className="mt-1 text-lg font-semibold text-white">{action.title}</h3>
              </div>
              <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] ${toneFromConfidence(action.confidence)}`}>
                {action.confidence}
              </span>
            </div>
            <p className="mt-2 text-sm text-zinc-300">{action.reason}</p>
            <div className="mt-3 grid gap-3 text-xs text-zinc-400 md:grid-cols-3">
              <div>
                <div className="font-semibold text-zinc-500">Expected impact</div>
                <div className="text-zinc-200">{action.expectedImpact}</div>
              </div>
              <div>
                <div className="font-semibold text-zinc-500">Evidence</div>
                <div>{action.evidence}</div>
              </div>
              <div>
                <div className="font-semibold text-zinc-500">Urgency</div>
                <div>{action.urgency}</div>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function summarizeTopOpportunity(insights?: ExecutiveInsightsPayload | null) {
  if (!insights?.trends?.length) return null;
  const positive = insights.trends.filter((trend) => trend.direction === "up" && trend.magnitude !== "minor");
  if (!positive.length) return null;
  const top = positive[0];
  const label = `${top.label} ${top.percentChange != null ? `${top.percentChange.toFixed(1)}%` : ""}`.trim();
  const explanation = top.caveat ?? "Sustain momentum by reinforcing the tactic that drove this lift.";
  const action = `Action: double down on ${top.label.toLowerCase()} within the next 7 days.`;
  return [label, explanation, action];
}

function formatDelta(value: number) {
  return value >= 0 ? `+$${Math.round(value).toLocaleString()}` : `-$${Math.abs(Math.round(value)).toLocaleString()}`;
}

function MetricTile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-black/30 p-4">
      <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {detail ? <p className="mt-1 text-sm text-zinc-400">{detail}</p> : null}
    </div>
  );
}

function buildForwardActions(
  data: DashboardOverviewResponse,
  totalDays: number,
  elapsedDays: number
): Array<{
  id: string;
  category: string;
  title: string;
  reason: string;
  expectedImpact: string;
  evidence: string;
  urgency: string;
  confidence: "high" | "medium" | "low";
}> {
  const actions: Array<{
    id: string;
    category: string;
    title: string;
    reason: string;
    expectedImpact: string;
    evidence: string;
    urgency: string;
    confidence: "high" | "medium" | "low";
  }> = [];

  const revenueMetric = findMetric(
    data.headerMetrics,
    (metric) => metric.metricKey.toLowerCase().includes("revenue") || metric.metricName.toLowerCase().includes("revenue")
  );
  const ordersMetric = findMetric(
    data.headerMetrics,
    (metric) => metric.metricKey.toLowerCase().includes("order") || metric.metricName.toLowerCase().includes("order")
  );
  const currentRevenue = revenueMetric?.currentValue ?? data.websiteConversion?.wooCommerce?.grossOrderRevenue ?? 0;
  const revenueTarget = revenueMetric?.targetValue ?? null;
  const paceRevenue = elapsedDays > 0 ? (currentRevenue / Math.max(elapsedDays, 1)) * totalDays : currentRevenue;
  if (revenueTarget != null) {
    const gap = revenueTarget - paceRevenue;
    if (gap > 0) {
      actions.push({
        id: "forward-revenue",
        category: "Revenue",
        title: "Close the revenue gap",
        reason: `Pace is tracking $${Math.round(gap).toLocaleString()} behind target for this window`,
        expectedImpact: `+$${Math.round(gap).toLocaleString()} if closed`,
        evidence: revenueMetric ? `${revenueMetric.metricName}` : "Woo revenue pace",
        urgency: "This week",
        confidence: "high"
      });
    }
  }

  const telemetryIssues = Object.values(data.telemetryHealth ?? {}).filter((entry) => entry && entry.status !== "healthy");
  telemetryIssues.slice(0, 1).forEach((issue) => {
    if (!issue) return;
    actions.push({
      id: `forward-telemetry-${issue.source}`,
      category: "Data",
      title: `Fix ${issue.source.toUpperCase()} telemetry`,
      reason: issue.reasons?.[0] ?? "Data coverage risk",
      expectedImpact: "Protect decision accuracy",
      evidence: issue.warningCodes?.join(", ") ?? issue.source,
      urgency: "Today",
      confidence: issue.status === "critical" ? "high" : "medium"
    });
  });

  const actionableInsight = data.executiveInsights?.trends?.find((trend) => trend.direction === "down" && trend.magnitude !== "minor");
  if (actionableInsight) {
    actions.push({
      id: `forward-insight-${actionableInsight.id}`,
      category: actionableInsight.source.toUpperCase(),
      title: `Stabilize ${actionableInsight.label}`,
      reason: describeTrend(actionableInsight),
      expectedImpact: "Recover funnel health",
      evidence: actionableInsight.metric,
      urgency: "This week",
      confidence: actionableInsight.magnitude === "major" ? "high" : "medium"
    });
  }

  return actions.slice(0, 3);
}

function toneFromConfidence(confidence: "high" | "medium" | "low") {
  if (confidence === "high") return "text-emerald-300 border-emerald-500/40";
  if (confidence === "medium") return "text-amber-300 border-amber-500/40";
  return "text-zinc-300 border-zinc-500/40";
}
