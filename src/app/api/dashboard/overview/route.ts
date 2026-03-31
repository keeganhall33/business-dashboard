import { ok, serverError } from "@/lib/api/responses";
import {
  getActiveOpportunities,
  getAgentHealth,
  getLatestAgentDirective,
  getScoreboardMetricsForRange,
  getOpenTasks,
  getCommerceTelemetry
} from "@/lib/supabase/queries";
import { RangePreset } from "@/lib/types/dashboard";

type ScoreboardMetricRow = {
  metric_key: string;
  metric_name: string;
  category: string | null;
  current_value: number | string | null;
  target_value: number | string | null;
  unit: string | null;
  owner_agent: string | null;
  measured_at: string | null;
};

type TaskRow = {
  id: string;
  title: string;
  agent_key: string;
  priority: string;
  status: string;
  expected_impact: string | null;
  impact_score: number | null;
  requires_approval: boolean;
};

type OpportunityRow = {
  id: string;
  name: string;
  organization: string | null;
  opportunity_type: string;
  status: string;
  value_estimate: number | null;
  prestige_score: number | null;
  probability_score: number | null;
  owner_agent: string;
  next_step: string | null;
  next_step_due_at: string | null;
};

function isScoreboardMetricRow(value: ScoreboardMetricRow | undefined | null): value is ScoreboardMetricRow {
  return Boolean(value);
}

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function statusFromGap(current: number | null, target: number | null) {
  if (current == null || target == null || target === 0) return "warning" as const;
  const ratio = current / target;
  if (ratio < 0.6) return "critical" as const;
  if (ratio < 0.9) return "warning" as const;
  return "healthy" as const;
}

function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isIsoDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function resolveRange(rangeParam: string | null, startParam: string | null, endParam: string | null) {
  const presets: Record<string, { preset: RangePreset; days: number }> = {
    "7d": { preset: "7d", days: 7 },
    "30d": { preset: "30d", days: 30 },
    "90d": { preset: "90d", days: 90 }
  };

  if (rangeParam === "custom" && isIsoDate(startParam) && isIsoDate(endParam)) {
    const startDate = startParam;
    const endDate = endParam;
    if (startDate <= endDate) {
      return { preset: "custom" as RangePreset, startDate, endDate };
    }
  }

  const fallback = presets[rangeParam ?? ""] ?? presets["30d"];
  const today = new Date();
  const endDate = formatIsoDate(today);
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - (fallback.days - 1));
  const startDate = formatIsoDate(start);
  return { preset: fallback.preset, startDate, endDate };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rangeParam = url.searchParams.get("range");
    const startParam = url.searchParams.get("start");
    const endParam = url.searchParams.get("end");
    const range = resolveRange(rangeParam, startParam, endParam);

    const [metrics, tasks, opportunities, directive, agentHealth, commerceTelemetry] = await Promise.all([
      getScoreboardMetricsForRange(range) as Promise<ScoreboardMetricRow[]>,
      getOpenTasks(50) as Promise<TaskRow[]>,
      getActiveOpportunities(25) as Promise<OpportunityRow[]>,
      getLatestAgentDirective(),
      getAgentHealth(),
      getCommerceTelemetry({ startDate: range.startDate, endDate: range.endDate })
    ]);

    const metricByKey = new Map(metrics.map((m) => [m.metric_key, { ...m }]));

    if (commerceTelemetry) {
      const wooSummary = (commerceTelemetry as Record<string, unknown>).woo as Record<string, unknown> | undefined;
      const gaSummary = (commerceTelemetry as Record<string, unknown>).ga4 as Record<string, unknown> | undefined;
      const wooSummaryData = (wooSummary?.summary ?? {}) as Record<string, unknown>;
      const gaSummaryData = (gaSummary?.summary ?? {}) as Record<string, unknown>;
      const wooRevenue = toNumber(wooSummaryData.revenue);
      const wooOrders = toNumber(wooSummaryData.orders);
      const wooAov = toNumber(wooSummaryData.avgOrderValue);
      const gaSessions = toNumber(gaSummaryData.sessions);

      const conversionRate =
        wooOrders != null && gaSessions != null && gaSessions > 0 ? (wooOrders / gaSessions) * 100 : null;
      const revenuePerVisitor =
        wooRevenue != null && gaSessions != null && gaSessions > 0 ? wooRevenue / gaSessions : null;

      const overrides: Array<{ key: string; value: number | null; unit: string }> = [
        { key: "monthly_revenue", value: wooRevenue, unit: "usd" },
        { key: "aov", value: wooAov, unit: "usd" },
        { key: "conversion_rate", value: conversionRate, unit: "percent" },
        { key: "revenue_per_visitor", value: revenuePerVisitor, unit: "usd" }
      ];

      overrides.forEach(({ key, value, unit }) => {
        if (value == null || Number.isNaN(value)) return;
        const metric = metricByKey.get(key);
        if (metric) {
          metric.current_value = value;
          metric.unit = unit;
          metric.measured_at = ((commerceTelemetry as Record<string, unknown>).endDate as string | undefined) ?? metric.measured_at;
        }
      });
    }

    const headerMetricKeys = [
      "monthly_revenue",
      "aov",
      "conversion_rate",
      "active_brand_conversations"
    ];

    const headerMetrics = headerMetricKeys
      .map((key) => {
        const m = metricByKey.get(key);
        if (!m) return null;
        const currentValue = toNumber(m.current_value) ?? 0;
        const targetValue = toNumber(m.target_value) ?? 0;
        return {
          metricKey: m.metric_key,
          metricName: m.metric_name,
          category: m.category ?? "general",
          currentValue,
          targetValue,
          deltaPercent: 0,
          status: statusFromGap(toNumber(m.current_value), toNumber(m.target_value)),
          unit: m.unit ?? null,
          ownerAgent: m.owner_agent ?? null,
          measuredAt: m.measured_at ?? null
        };
      })
      .filter(Boolean);

    const executiveCommand = {
      weeklyDirective:
        directive?.summary ??
        "Shift focus to pricing power, conversion lift, and partnership pipeline expansion immediately.",
      topPriorities: [
        "Increase AOV via premium tiered pricing",
        "Fix homepage and product page conversion bottlenecks",
        "Expand active partnership conversations"
      ],
      biggestBottlenecks: ["AOV is far below target", "Conversion rate is underperforming", "Pipeline is too thin"],
      ceoRecommendation: "Do not chase volume. Increase pricing power, strengthen luxury messaging, and build the partnership machine."
    };

    const revenueEngineMetrics = [
      "monthly_revenue",
      "aov",
      "revenue_per_visitor",
      "conversion_rate"
    ]
      .map((key) => metricByKey.get(key))
      .filter(isScoreboardMetricRow)
      .map((m) => ({
        metricKey: m.metric_key,
        currentValue: toNumber(m.current_value) ?? 0,
        targetValue: toNumber(m.target_value) ?? 0,
        status: statusFromGap(toNumber(m.current_value), toNumber(m.target_value)),
        unit: m.unit ?? null
      }));

    const revenueEngine = {
      metrics: revenueEngineMetrics,
      moneyLeaks: [
        "Low AOV is the single largest revenue constraint.",
        "High cart abandonment is reducing recovered sales.",
        "Weak conversion rate is suppressing total revenue."
      ],
      fastestPathToIncreaseRevenue: [
        { move: "Raise AOV via premium offer architecture", estimatedImpact: "+$15K to +$20K / month" },
        { move: "Recover 10% of abandoned carts", estimatedImpact: "+$4K to +$7K / month" }
      ]
    };

    const brandPower = {
      metrics: ["social_growth_monthly", "engagement_rate", "cultural_relevance_score"]
        .map((key) => metricByKey.get(key))
        .filter(isScoreboardMetricRow)
        .map((m) => ({
          metricKey: m.metric_key,
          currentValue: toNumber(m.current_value) ?? 0,
          targetValue: toNumber(m.target_value) ?? 0,
          status: statusFromGap(toNumber(m.current_value), toNumber(m.target_value)),
          unit: m.unit ?? null
        })),
      whatIsWorking: [
        "Authority-based storytelling performs better than generic art promotion.",
        "Collaboration-driven content has stronger prestige impact."
      ],
      whatToDoNext: [
        "Reposition homepage and campaign copy around Impossible in Pencil.",
        "Create a collector-status narrative series."
      ]
    };

    const activeCount = opportunities.filter((o) => !["won", "lost", "parked"].includes(o.status)).length;
    const readyForOutreachCount = opportunities.filter((o) => o.status === "ready_for_outreach").length;

    const topOpportunities = opportunities
      .slice()
      .sort((a, b) => (b.prestige_score ?? 0) - (a.prestige_score ?? 0))
      .slice(0, 5)
      .map((o) => ({
        id: o.id,
        name: o.name,
        organization: o.organization,
        opportunityType: o.opportunity_type,
        status: o.status,
        valueEstimate: o.value_estimate,
        prestigeScore: o.prestige_score,
        probabilityScore: o.probability_score,
        ownerAgent: o.owner_agent,
        nextStep: o.next_step,
        nextStepDueAt: o.next_step_due_at
      }));

    const opportunityRadar = {
      activeCount,
      readyForOutreachCount,
      topOpportunities,
      nextFiveMoves: [
        "Build 25-brand target list",
        "Prioritize 10 high-prestige targets",
        "Prepare pitch angles by category",
        "Draft outreach assets for approval",
        "Track response readiness by opportunity"
      ]
    };

    const systemHealth = {
      dataFreshnessHours: 6,
      agentTaskCompletionRate: 62,
      agents: agentHealth
    };

    const responseRange = {
      preset: range.preset,
      startDate: range.startDate,
      endDate: range.endDate
    };

    const commercePayload = commerceTelemetry
      ? {
          range: responseRange,
          woo: commerceTelemetry.woo ?? undefined,
          ga4: commerceTelemetry.ga4 ?? undefined,
          funnel: commerceTelemetry.funnel ?? undefined
        }
      : {
          range: responseRange
        };

    return ok({
      ok: true,
      timestamp: new Date().toISOString(),
      range: responseRange,
      headerMetrics,
      executiveCommand,
      revenueEngine,
      brandPower,
      opportunityRadar,
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        agentKey: t.agent_key,
        priority: t.priority,
        status: t.status,
        expectedImpact: t.expected_impact,
        impactScore: t.impact_score,
        requiresApproval: t.requires_approval
      })),
      systemHealth,
      commerceTelemetry: commercePayload
    });
  } catch (error) {
    return serverError("Failed to load overview", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
