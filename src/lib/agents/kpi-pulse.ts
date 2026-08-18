import type { ScoreboardMetric } from "./shared";
import {
  createAgentKpiReading,
  getLatestAgentKpiReading,
  upsertAgentKpiDefinition
} from "@/lib/supabase/queries";

function parseNumeric(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const cleaned = value.replace(/[%,$]/g, "").trim();
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function utcDay(value: string) {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export async function recordDailyAgentKpis(input: {
  agentKey: string;
  metrics: ScoreboardMetric[];
}) {
  const owned = input.metrics.filter(
    (metric) => (metric.owner_agent ?? "").toLowerCase() === input.agentKey.toLowerCase()
  );
  const fallbackKeys = new Set(["aov", "conversion_rate", "monthly_revenue", "pipeline_count"]);
  const fallback = input.metrics.filter((metric) => fallbackKeys.has(metric.metric_key));
  const candidates = [...owned, ...fallback]
    .filter((metric, index, all) => all.findIndex((candidate) => candidate.metric_key === metric.metric_key) === index)
    .slice(0, 3);

  let kpisLogged = 0;

  for (const metric of candidates) {
    const kpiKey = `${input.agentKey}:${metric.metric_key}`;
    await upsertAgentKpiDefinition({
      kpiKey,
      agentKey: input.agentKey,
      kpiName: metric.metric_name ?? metric.metric_key,
      description: `Autotracked from scoreboard metric '${metric.metric_key}'.`,
      targetValue: parseNumeric(metric.target_value),
      unit: metric.unit,
      frequency: "daily",
      priority: "medium"
    });

    const measuredAtIso = metric.measured_at ?? new Date().toISOString();
    const latest = await getLatestAgentKpiReading(kpiKey);
    if (
      typeof latest?.measured_at === "string" &&
      utcDay(latest.measured_at) === utcDay(measuredAtIso)
    ) {
      continue;
    }

    await createAgentKpiReading({
      kpiKey,
      value: parseNumeric(metric.current_value),
      measuredAtIso,
      source: "scoreboard",
      notes: null
    });
    kpisLogged++;
  }

  return { kpisLogged };
}
