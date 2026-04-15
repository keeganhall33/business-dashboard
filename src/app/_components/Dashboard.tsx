"use client";

import { useEffect, useMemo, useState } from "react";

type MetricStatus = "healthy" | "warning" | "critical";

type HeaderMetric = {
  metricKey: string;
  metricName: string;
  category: string;
  currentValue: number;
  targetValue: number;
  deltaPercent: number | null;
  status: MetricStatus;
  unit: string | null;
};

type RevenueMetric = {
  metricKey: string;
  currentValue: number;
  targetValue: number;
  status: MetricStatus;
  unit: string | null;
};

type TaskSummary = {
  id: string;
  title: string;
  agentKey: string;
  priority: string;
  status: string;
  expectedImpact: string | null;
  impactScore: number | null;
  requiresApproval: boolean;
  deliverableSummary?: string | null;
};

type Opportunity = {
  id: string;
  name: string;
  organization: string | null;
  opportunityType: string;
  status: string;
  valueEstimate: number | null;
  prestigeScore: number | null;
  probabilityScore: number | null;
  ownerAgent: string | null;
  nextStep: string | null;
  nextStepDueAt: string | null;
};

type AgentHealth = {
  agentKey: string;
  lastRunAt: string | null;
  openTaskCount: number;
  completedTaskCount: number;
  health: "healthy" | "warning" | "stale";
};

type CommerceTelemetry = {
  range: { startDate: string; endDate: string };
  woo?: { summary?: Record<string, unknown> } | null;
  ga4?: { summary?: Record<string, unknown> } | null;
  funnel?: { series?: Array<Record<string, unknown>> } | null;
};

type DashboardOverview = {
  ok: boolean;
  timestamp: string;
  headerMetrics: HeaderMetric[];
  executiveCommand: {
    weeklyDirective: string;
    topPriorities: string[];
    biggestBottlenecks: string[];
    ceoRecommendation: string;
  };
  revenueEngine: {
    metrics: RevenueMetric[];
    moneyLeaks: string[];
    fastestPathToIncreaseRevenue: Array<{ move: string; estimatedImpact: string }>;
  };
  brandPower: {
    metrics: RevenueMetric[];
    whatIsWorking: string[];
    whatToDoNext: string[];
  };
  opportunityRadar: {
    activeCount: number;
    readyForOutreachCount: number;
    topOpportunities: Opportunity[];
    nextFiveMoves: string[];
  };
  tasks: TaskSummary[];
  systemHealth: {
    dataFreshnessHours: number | null;
    agentTaskCompletionRate: number | null;
    agents: AgentHealth[];
  };
  commerceTelemetry?: CommerceTelemetry | null;
};

const statusTone: Record<MetricStatus, string> = {
  healthy: "text-emerald-300 border-emerald-400/40",
  warning: "text-amber-300 border-amber-400/40",
  critical: "text-red-300 border-red-500/40",
};

function formatMetricValue(value: number, unit: string | null) {
  if (unit === "usd" || unit === "$" || unit === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value ?? 0);
  }

  if (unit === "percent" || unit === "%") {
    return `${(value ?? 0).toFixed(1)}%`;
  }

  if (unit === "hours") {
    return `${Math.round(value ?? 0)}h`;
  }

  return new Intl.NumberFormat("en-US").format(value ?? 0);
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/dashboard/overview", { cache: "no-store" });
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        const payload = (await res.json()) as DashboardOverview;
        if (!cancelled) {
          setData(payload);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const numberFormatter = useMemo(() => new Intl.NumberFormat("en-US"), []);
  const commerceRangeLabel = useMemo(() => {
    const startDate = data?.commerceTelemetry?.range?.startDate;
    const endDate = data?.commerceTelemetry?.range?.endDate;
    if (!startDate || !endDate) return null;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return `${startDate} – ${endDate}`;
    }
    return `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`;
  }, [data?.commerceTelemetry?.range?.startDate, data?.commerceTelemetry?.range?.endDate]);

  const toMetricNumber = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  const formatCountValue = (value: unknown) => {
    const num = toMetricNumber(value);
    if (num == null) return "—";
    return numberFormatter.format(num);
  };

  const formatCurrencyValue = (value: unknown) => {
    const num = toMetricNumber(value);
    if (num == null) return "—";
    return formatMetricValue(num, "usd");
  };

  const formatPercentValue = (value: unknown) => {
    const num = toMetricNumber(value);
    if (num == null) return "—";
    return `${num.toFixed(2)}%`;
  };

  const wooSummary = data?.commerceTelemetry?.woo?.summary as Record<string, unknown> | undefined;
  const gaSummary = data?.commerceTelemetry?.ga4?.summary as Record<string, unknown> | undefined;
  const funnelStepsRaw = (data?.commerceTelemetry?.funnel?.series as Array<Record<string, unknown>> | undefined) ?? [];
  const funnelSteps = funnelStepsRaw.map((step, index) => {
    const funnelName =
      typeof step.funnelName === "string" && step.funnelName.length > 0 ? step.funnelName : `Funnel ${index + 1}`;
    const stepName =
      typeof step.stepName === "string" && step.stepName.length > 0 ? step.stepName : `Step ${index + 1}`;
    return {
      key: `${funnelName}-${stepName}-${index}`,
      funnelName,
      stepName,
      entries: step.entries,
      completions: step.completions,
      conversionRate: step.conversionRate
    };
  });

  const activeTasks = useMemo(() => data?.tasks ?? [], [data]);

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Operator Command</p>
            <h1 className="text-3xl font-semibold text-white mt-2">Executive Dashboard</h1>
            <p className="text-slate-400 text-sm mt-1">
              {loading
                ? "Loading live metrics..."
                : error
                  ? "Failed to load live data"
                  : `Data refreshed ${new Date(data?.timestamp ?? Date.now()).toLocaleTimeString()}`}
            </p>
          </div>
          <button
            className="px-4 py-2 rounded-xl border border-slate-700 text-sm text-slate-200 hover:border-white/50"
            onClick={() => window.location.reload()}
          >
            Refresh now
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-200">
            {error}
          </div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {(data?.headerMetrics ?? []).map((metric) => (
          <div
            key={metric.metricKey}
            className={`rounded-2xl border bg-gradient-to-br from-slate-900/60 to-slate-900/20 p-4 ${statusTone[metric.status]}`}
          >
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{metric.metricName}</p>
            <p className="mt-2 text-3xl font-semibold text-white">
              {formatMetricValue(metric.currentValue ?? 0, metric.unit)}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Target {formatMetricValue(metric.targetValue ?? 0, metric.unit)}
            </p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 lg:col-span-1">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Executive command</p>
          <p className="mt-3 text-lg text-white font-semibold leading-relaxed">
            {data?.executiveCommand.weeklyDirective ?? "Focus on revenue lift and prestige."}
          </p>
          <div className="mt-4 space-y-4 text-sm text-slate-200">
            <div>
              <p className="text-xs uppercase text-slate-500 tracking-[0.3em]">Top priorities</p>
              <ul className="mt-2 space-y-1">
                {data?.executiveCommand.topPriorities.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500 tracking-[0.3em]">Bottlenecks</p>
              <ul className="mt-2 space-y-1 text-slate-300">
                {data?.executiveCommand.biggestBottlenecks.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">CEO recommendation</p>
              <p className="mt-2 text-sm text-slate-100">
                {data?.executiveCommand.ceoRecommendation ?? "Protect pricing power and premium positioning."}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 lg:col-span-2">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Revenue engine</p>
          {commerceRangeLabel && (
            <p className="mt-1 text-xs text-slate-500">Window {commerceRangeLabel}</p>
          )}
          {data?.commerceTelemetry ? (
            <>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Woo snapshot</p>
                  <div className="mt-3 space-y-2 text-sm text-slate-200">
                    <div className="flex items-center justify-between">
                      <span>Revenue</span>
                      <span className="font-medium text-white">{formatCurrencyValue(wooSummary?.revenue)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Orders</span>
                      <span className="font-medium text-white">{formatCountValue(wooSummary?.orders)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>AOV</span>
                      <span className="font-medium text-white">{formatCurrencyValue(wooSummary?.avgOrderValue)}</span>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-500">GA4 snapshot</p>
                  <div className="mt-3 space-y-2 text-sm text-slate-200">
                    <div className="flex items-center justify-between">
                      <span>Sessions</span>
                      <span className="font-medium text-white">{formatCountValue(gaSummary?.sessions)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Engaged sessions</span>
                      <span className="font-medium text-white">{formatCountValue(gaSummary?.engagedSessions)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Revenue</span>
                      <span className="font-medium text-white">{formatCurrencyValue(gaSummary?.revenue)}</span>
                    </div>
                  </div>
                </div>
              </div>
              {funnelSteps.length > 0 && (
                <div className="mt-4 rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-500">FunnelKit top steps</p>
                  <div className="mt-3 space-y-3 text-sm text-slate-200">
                    {funnelSteps.slice(0, 3).map((step) => (
                      <div key={step.key} className="rounded-2xl border border-slate-800/40 bg-slate-900/40 p-3">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-white">{step.stepName}</p>
                          <span className="text-xs text-slate-400">{step.funnelName}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                          <span>Entries: {formatCountValue(step.entries)}</span>
                          <span>Completions: {formatCountValue(step.completions)}</span>
                          <span>CVR: {formatPercentValue(step.conversionRate)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {(data?.revenueEngine.metrics ?? []).map((metric) => (
                <div key={metric.metricKey} className={`rounded-2xl border bg-slate-900/50 p-4 ${statusTone[metric.status]}`}>
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{metric.metricKey.replaceAll("_", " ")}</p>
                  <p className="mt-2 text-2xl font-semibold text-white">
                    {formatMetricValue(metric.currentValue ?? 0, metric.unit)}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Target {formatMetricValue(metric.targetValue ?? 0, metric.unit)}
                  </p>
                </div>
              ))}
            </div>
          )}
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Money leaks</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-200">
                {(data?.revenueEngine.moneyLeaks ?? []).map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-red-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Fastest path</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-200">
                {(data?.revenueEngine.fastestPathToIncreaseRevenue ?? []).map((item) => (
                  <li key={item.move} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-teal-400" />
                    <div>
                      <p className="font-medium text-white">{item.move}</p>
                      <p className="text-slate-400 text-xs">{item.estimatedImpact}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Brand power</p>
          <div className="mt-4 space-y-3">
            {(data?.brandPower.metrics ?? []).map((metric) => (
              <div key={metric.metricKey} className={`rounded-2xl border bg-slate-900/40 p-4 ${statusTone[metric.status]}`}>
                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{metric.metricKey.replaceAll("_", " ")}</div>
                <p className="mt-2 text-xl font-semibold text-white">
                  {formatMetricValue(metric.currentValue ?? 0, metric.unit)}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Target {formatMetricValue(metric.targetValue ?? 0, metric.unit)}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Whats working</p>
              <ul className="mt-2 text-sm text-slate-200 space-y-1">
                {(data?.brandPower.whatIsWorking ?? []).map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-400" /> {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Next moves</p>
              <ul className="mt-2 text-sm text-slate-200 space-y-1">
                {(data?.brandPower.whatToDoNext ?? []).map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-400" /> {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 lg:col-span-2">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Opportunity radar</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Active</p>
              <p className="text-3xl font-semibold text-white mt-2">{data?.opportunityRadar.activeCount ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Ready for outreach</p>
              <p className="text-3xl font-semibold text-white mt-2">
                {data?.opportunityRadar.readyForOutreachCount ?? 0}
              </p>
            </div>
          </div>
          <div className="mt-6">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Top opportunities</p>
            <div className="mt-3 space-y-3">
              {(data?.opportunityRadar.topOpportunities ?? []).map((opp) => (
                <div key={opp.id} className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-4 text-sm text-slate-200">
                  <div className="flex items-center justify-between">
                    <p className="text-white font-medium">{opp.name}</p>
                    <span className="text-xs text-slate-400">{opp.status}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{opp.organization ?? opp.opportunityType}</p>
                  {opp.nextStep && (
                    <p className="text-xs text-slate-300 mt-2">Next: {opp.nextStep}</p>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 text-xs text-slate-400">
              <p className="uppercase tracking-[0.3em]">Next moves</p>
              <ol className="mt-2 space-y-1 text-slate-300 list-decimal list-inside">
                {(data?.opportunityRadar.nextFiveMoves ?? []).map((move) => (
                  <li key={move}>{move}</li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Task queue</p>
            <span className="text-xs text-slate-400">{activeTasks.length} open</span>
          </div>
          <div className="mt-4 space-y-3">
            {activeTasks.map((task) => (
              <div key={task.id} className="rounded-2xl border border-slate-800/60 bg-slate-900/50 p-4">
                <div className="flex items-center justify-between text-sm">
                  <p className="text-white font-medium">{task.title}</p>
                  <span className="text-xs uppercase tracking-[0.3em] text-slate-400">
                    {task.priority}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">Owner: {task.agentKey.toUpperCase()}</p>
                {task.expectedImpact && (
                  <p className="text-sm text-slate-200 mt-2">{task.expectedImpact}</p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300">
                    Status: {task.status}
                  </span>
                  {task.requiresApproval && task.status === "pending" && (
                    <span className="rounded-full bg-amber-600/20 border border-amber-400/40 px-2 py-0.5 text-amber-200">
                      Needs approval
                    </span>
                  )}
                </div>
              </div>
            ))}
            {activeTasks.length === 0 && !loading && (
              <p className="text-sm text-slate-400">No open tasks.</p>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">System health</p>
          <div className="mt-4 space-y-4 text-sm text-slate-300">
            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-4">
              <p className="text-xs text-slate-500 uppercase tracking-[0.3em]">Data freshness</p>
              <p className="text-2xl text-white font-semibold mt-2">
                {data?.systemHealth.dataFreshnessHours ?? "—"}h
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-4">
              <p className="text-xs text-slate-500 uppercase tracking-[0.3em]">Task completion rate</p>
              <p className="text-2xl text-white font-semibold mt-2">
                {data?.systemHealth.agentTaskCompletionRate ?? "—"}%
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Agents</p>
              <div className="mt-2 space-y-2">
                {(data?.systemHealth.agents ?? []).map((agent) => (
                  <div key={agent.agentKey} className="flex items-center justify-between rounded-xl border border-slate-800/60 bg-slate-900/30 px-3 py-2 text-xs">
                    <span className="text-slate-200 font-medium">{agent.agentKey.toUpperCase()}</span>
                    <span className="text-slate-400">{agent.health}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
