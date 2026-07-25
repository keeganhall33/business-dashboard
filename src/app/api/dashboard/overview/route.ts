import { ok, serverError } from "@/lib/api/responses";
import { normalizeDeliverableLinks } from "@/lib/domain/deliverables";
import { enforceDashboardAuth } from "@/lib/auth/dashboard";
import { sanitizeDashboardPayloadForHtml } from "@/lib/dashboard/sanitize-html";
import {
  getActiveOpportunities,
  getAgentHealth,
  getLatestAgentDirective,
  getScoreboardMetricsForRange,
  getOpenTasks,
  getCommerceTelemetry,
  getAgentUpdates,
  getOrCreateAgentThread,
  getAgentMessages,
  getSystemState,
  getScheduledJobsWithLatestRuns,
  getTasksAwaitingApproval,
  getPendingAgentPlans,
  getDecisionsRequiringReview,
  getLatestFinanceSnapshot,
  getCollectorRelationships,
  getRecentTasks,
  listAgentKpis,
  listLatestAgentKpiReadingsByKpiKeys,
  listLatestAgentKpiReadingsByKpiKeysForRange,
  getIdeas,
  getRecentIdeaComments,
  getCeoQuestions,
  getRecentCeoQuestionComments,
  getDashboardSnapshots,
  getDashboardSnapshotHistoryForKey,
  type DashboardSnapshotRecord
} from "@/lib/supabase/queries";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getIndustryPulseSnapshot } from "@/lib/supabase/industryPulse";
import { loadLocalDashboardArtifacts } from "@/lib/local/artifacts";
import {
  RangePreset,
  type AgentHealth,
  type ChangeInsightsSnapshot,
  type CollectorTelemetrySnapshot,
  type DeliverableLink,
  type ProofOfWorkEntry,
  type WebsiteConversionSnapshot,
  type CloudflareTelemetrySnapshot,
  type MetaAdsSnapshot,
  type SocialIntelligenceSnapshot
} from "@/lib/types/dashboard";
import { agentKeys, agentDisplayNames } from "@/lib/types/requests";
import { buildChangeInsightsSnapshot } from "@/lib/dashboard/change-insights";
import { selectPreviousSnapshot } from "@/lib/dashboard/snapshot-selection";
import { buildPerformanceBaselineSnapshot, computePreviousInclusiveDateRange } from "@/lib/dashboard/performance-baseline";

export const runtime = "nodejs";

type PostgrestError = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message?: string | null;
};

function isMissingTableError(error: unknown, table: string) {
  if (!error || typeof error !== "object") return false;
  const pgError = error as PostgrestError;
  if (pgError.code !== "PGRST205") return false;
  const haystack = `${pgError.message ?? ""} ${pgError.hint ?? ""} ${pgError.details ?? ""}`.toLowerCase();
  return haystack.includes(`public.${table}`) || haystack.includes(`'${table}'`);
}

type ScoreboardMetricRow = {
  metric_key: string;
  metric_name: string;
  category: string | null;
  current_value: number | string | null;
  target_value: number | string | null;
  unit: string | null;
  owner_agent: string | null;
  measured_at: string | null;
  history?: ScoreboardMetricHistoryEntry[];
  stats?: ScoreboardMetricStats | null;
};

type ScoreboardMetricHistoryEntry = {
  measured_at: string;
  value: number | null;
};

type ScoreboardMetricStats = {
  average: number | null;
  min: number | null;
  max: number | null;
  changePercent: number | null;
};

// NOTE: previous-snapshot selection lives in src/lib/dashboard/snapshot-selection.ts

const HEADER_CARD_CONFIG = [
  { cardKey: "monthly_revenue", fallbackName: "Monthly Revenue", fallbackUnit: "usd" },
  { cardKey: "aov", fallbackName: "Average Order Value", fallbackUnit: "usd" },
  { cardKey: "conversion_rate", fallbackName: "Conversion Rate", fallbackUnit: "percent" }
] as const;

type TaskRow = {
  id: string;
  title: string;
  description?: string | null;
  agent_key: string;
  priority: string;
  status: string;
  expected_impact: string | null;
  impact_score: number | null;
  why_this_matters?: string | null;
  related_metric_keys?: string[] | null;
  requires_approval: boolean;
  approved_by_user?: boolean | null;
  expected_duration_days: number | null;
  created_at: string;
  execution_type?: string | null;
  result_summary?: string | null;
  deliverable_links?: unknown;
  completed_at?: string | null;
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
  notes_md?: string | null;
  source?: string | null;
  deliverables?: unknown;
  deliverable_links?: unknown;
};

const opportunityIdRegex = /opportunity id:\s*([a-z0-9_-]+)/gi;
const opportunityDedupeKey = (name: string | null | undefined, organization: string | null | undefined) =>
  `${(name ?? "").trim().toLowerCase()}|${(organization ?? "").trim().toLowerCase()}`;

function extractOpportunityIdsFromText(...texts: Array<string | null | undefined>) {
  const joined = texts
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n");
  if (!joined) return [];
  const matches = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = opportunityIdRegex.exec(joined)) !== null) {
    matches.add(match[1]);
  }
  return Array.from(matches);
}

function mergeDeliverableLinks(existing: DeliverableLink[], incoming: DeliverableLink[], limit = 4) {
  const combined = [...existing];
  const seen = new Set(existing.map((link) => link.url));
  for (const link of incoming) {
    if (!link.url || seen.has(link.url)) continue;
    seen.add(link.url);
    combined.push(link);
    if (combined.length >= limit) break;
  }
  return combined.slice(0, limit);
}

function extractUrls(text: string) {
  const urls: string[] = [];
  const regex = /https?:\/\/[^\s)\]]+/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    urls.push(match[0]);
  }
  return urls;
}

function buildSupportingDocs(entity: {
  source?: string | null;
  notes_md?: string | null;
  deliverables?: unknown;
  deliverable_links?: unknown;
}) {
  const candidates: Array<{ label: string; url: string }> = [];

  const deliverables = normalizeDeliverableLinks(entity.deliverables ?? entity.deliverable_links);
  deliverables.slice(0, 6).forEach((link) => {
    candidates.push({ label: link.label || "Deliverable", url: link.url });
  });

  if (entity.source) {
    const sourceUrls = extractUrls(entity.source);
    if (sourceUrls.length > 0) {
      candidates.push({ label: "Source", url: sourceUrls[0] });
    } else if (entity.source.startsWith("http")) {
      candidates.push({ label: "Source", url: entity.source });
    }
  }

  const noteUrls = entity.notes_md ? extractUrls(entity.notes_md) : [];
  noteUrls.slice(0, 6).forEach((url, idx) => {
    candidates.push({ label: `Doc ${idx + 1}`, url });
  });

  const seen = new Set<string>();
  const unique = candidates.filter((c) => {
    if (!c.url) return false;
    const key = c.url.trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.length > 0 ? unique : null;
}

async function fetchTasksLinkedToMetrics(metricKeys: string[], limitPerKey = 8) {
  const supabase = getSupabaseServerClient();
  const result = new Map<string, TaskRow[]>();
  if (!metricKeys.length) return result;

  await Promise.all(
    metricKeys.map(async (key) => {
      const { data, error } = await supabase
        .from("task_queue")
        .select("*")
        .contains("related_metric_keys", [key])
        .order("created_at", { ascending: false })
        .limit(limitPerKey);
      if (error && !isMissingTableError(error, "task_queue")) throw error;
      result.set(key, (data ?? []) as TaskRow[]);
    })
  );

  return result;
}

type ScheduledJobRow = {
  job_key: string;
  job_name: string;
  cron_expression: string;
  route_path: string;
  timezone?: string | null;
  is_active?: boolean | null;
  next_run_at: string | null;
  latestRun?: {
    status: string;
    started_at: string;
    finished_at: string | null;
    summary?: string | null;
    error_md?: string | null;
  } | null;
};

type AgentPlanRow = {
  id: string;
  agent_key: string;
  title: string;
  summary: string | null;
  detail_md: string | null;
  submitted_by: string | null;
  submitted_at: string;
};

type DecisionRow = {
  id: string;
  decision_type: string;
  title: string;
  summary: string;
  outcome_review_date: string | null;
  decided_by: string | null;
  created_at: string;
};

type FinanceSnapshotRow = {
  cash_on_hand: number | string | null;
  monthly_burn: number | string | null;
  projected_30d_revenue: number | string | null;
  survival_floor: number | string | null;
  updated_at?: string | null;
};

type CollectorRow = {
  id: string;
  collector_name: string;
  tier: string;
  relationship_status: string | null;
  last_outreach_at: string | null;
  last_touch_at?: string | null;
  next_move: string | null;
  next_move_due_at: string | null;
  estimated_value: number | null;
  notes_md?: string | null;
  source?: string | null;
  priority?: number | null;
  updated_at?: string | null;
  import_batch_id?: string | null;
  deliverables?: unknown;
  deliverable_links?: unknown;
};

type AgentKpiRow = {
  kpi_key: string;
  agent_key: string;
  kpi_name: string;
  description: string | null;
  target_value: number | string | null;
  unit: string | null;
  frequency: string | null;
  priority: string | null;
};

type AgentKpiReadingRow = {
  id: string;
  kpi_key: string;
  value: number | string | null;
  measured_at: string;
  source: string | null;
  notes: string | null;
};

type IdeaRow = {
  id: string;
  agent_key: string;
  idea_type: string;
  title: string;
  summary: string | null;
  expected_impact: number | null;
  status: string;
  requires_ceo_approval: boolean;
  approver: string | null;
  approved_at: string | null;
  linked_task_id: string | null;
  created_at: string;
  updated_at: string;
};

type IdeaCommentRow = {
  id: string;
  idea_id: string;
  commenter: string;
  comment: string;
  created_at: string;
};

type CeoQuestionRow = {
  id: string;
  asked_by: string;
  escalation_level: string;
  question: string;
  context: string | null;
  status: string;
  priority: string | null;
  owner_agent: string | null;
  due_at: string | null;
  answered_by: string | null;
  answered_at: string | null;
  escalated_by: string | null;
  created_at: string;
  updated_at: string;
};

type CeoQuestionCommentRow = {
  id: string;
  question_id: string;
  commenter: string;
  body: string;
  created_at: string;
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

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1
});

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0
});

const DEFAULT_EXECUTIVE_DIRECTIVE =
  "Shift focus to pricing power, conversion lift, and partnership pipeline expansion immediately.";
const DEFAULT_EXECUTIVE_PRIORITIES = [
  "Increase AOV via premium tiered pricing",
  "Fix homepage and product page conversion bottlenecks",
  "Expand active partnership conversations"
];
const DEFAULT_EXECUTIVE_BOTTLENECKS = [
  "AOV is far below target",
  "Conversion rate is underperforming",
  "Pipeline is too thin"
];
const DEFAULT_EXECUTIVE_RECOMMENDATION =
  "Do not chase volume. Increase pricing power, strengthen luxury messaging, and build the partnership machine.";
const SURVIVAL_STALE_DAYS = 7;
const DEFAULT_BRAND_POWER_WINS = [
  "Authority-based storytelling performs better than generic art promotion.",
  "Collaboration-driven content has stronger prestige impact."
];
const DEFAULT_BRAND_POWER_ACTIONS = [
  "Reposition homepage and campaign copy around Impossible in Pencil.",
  "Create a collector-status narrative series."
];
const REVENUE_DIAG_METRICS = ["monthly_revenue", "aov", "conversion_rate", "revenue_per_visitor"];

function formatMetricValue(value: number | null | undefined, unit: string | null | undefined) {
  if (value == null || Number.isNaN(value)) return null;
  if (unit === "usd") {
    return currencyFormatter.format(value);
  }
  if (unit === "percent") {
    return `${percentFormatter.format(value)}%`;
  }
  return numberFormatter.format(value);
}

function metricSeverity(metric: ScoreboardMetricRow) {
  const current = toNumber(metric.current_value);
  const target = toNumber(metric.target_value);
  if (current == null || target == null || target === 0) return 0;
  return (target - current) / Math.abs(target);
}

function describePriority(metric: ScoreboardMetricRow) {
  const name = metric.metric_name ?? metric.metric_key;
  const current =
    formatMetricValue(toNumber(metric.current_value), metric.unit) ?? (toNumber(metric.current_value)?.toString() ?? "n/a");
  const target =
    formatMetricValue(toNumber(metric.target_value), metric.unit) ?? (toNumber(metric.target_value)?.toString() ?? "n/a");
  const status = statusFromGap(toNumber(metric.current_value), toNumber(metric.target_value));
  const statusLabel = status === "critical" ? "critical" : status === "warning" ? "off track" : "healthy";
  if (status === "healthy") {
    return `${name}: ${statusLabel}. Maintain ${current} (target ${target}).`;
  }
  return `${name}: ${statusLabel}. Move from ${current} toward ${target}.`;
}

function describeBottleneck(metric: ScoreboardMetricRow) {
  const status = statusFromGap(toNumber(metric.current_value), toNumber(metric.target_value));
  if (status === "healthy") return null;
  const name = metric.metric_name ?? metric.metric_key;
  const current =
    formatMetricValue(toNumber(metric.current_value), metric.unit) ?? (toNumber(metric.current_value)?.toString() ?? "n/a");
  const target =
    formatMetricValue(toNumber(metric.target_value), metric.unit) ?? (toNumber(metric.target_value)?.toString() ?? "n/a");
  return `${name} is ${status === "critical" ? "far below" : "below"} target (${current} vs ${target}).`;
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function isMetricOffTrack(metric: ScoreboardMetricRow) {
  const status = statusFromGap(toNumber(metric.current_value), toNumber(metric.target_value));
  return status === "critical" || status === "warning";
}

function dedupeOpportunityRows(opportunities: OpportunityRow[]) {
  const seen = new Set<string>();
  const unique: OpportunityRow[] = [];
  for (const opportunity of opportunities) {
    const key = opportunityDedupeKey(opportunity.name, opportunity.organization);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(opportunity);
  }
  return unique;
}

function describeBrandWin(metric: ScoreboardMetricRow) {
  const name = metric.metric_name ?? metric.metric_key;
  const current =
    formatMetricValue(toNumber(metric.current_value), metric.unit) ?? (toNumber(metric.current_value)?.toString() ?? "n/a");
  const target =
    formatMetricValue(toNumber(metric.target_value), metric.unit) ?? (toNumber(metric.target_value)?.toString() ?? "n/a");
  return `${name} is on track (${current} vs ${target}). Keep amplifying this narrative.`;
}

function describeRevenueLeak(metric: ScoreboardMetricRow) {
  const status = statusFromGap(toNumber(metric.current_value), toNumber(metric.target_value));
  if (status === "healthy") return null;
  const name = metric.metric_name ?? metric.metric_key;
  const current =
    formatMetricValue(toNumber(metric.current_value), metric.unit) ?? (toNumber(metric.current_value)?.toString() ?? "n/a");
  const target =
    formatMetricValue(toNumber(metric.target_value), metric.unit) ?? (toNumber(metric.target_value)?.toString() ?? "n/a");
  const descriptor = status === "critical" ? "far below" : "below";
  return `${name} is ${descriptor} target (${current} vs ${target}).`;
}

function describeRevenueFastPath(metric: ScoreboardMetricRow) {
  const name = metric.metric_name ?? metric.metric_key;
  const current =
    formatMetricValue(toNumber(metric.current_value), metric.unit) ?? (toNumber(metric.current_value)?.toString() ?? "n/a");
  const target =
    formatMetricValue(toNumber(metric.target_value), metric.unit) ?? (toNumber(metric.target_value)?.toString() ?? "n/a");
  return {
    move: `Increase ${name}`,
    estimatedImpact: `Move from ${current} toward ${target}`
  };
}

function describeOpportunityMove(opportunity: OpportunityRow) {
  const name = opportunity.name ?? "Untitled";
  const org = opportunity.organization ? ` (${opportunity.organization})` : "";
  const step = opportunity.next_step?.trim() || "Define next step";
  const due = opportunity.next_step_due_at ? formatDueDate(opportunity.next_step_due_at) : "no due date";
  return `${name}${org}: ${step} (${due})`;
}

function formatDueDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "no due date";
  const diffDays = Math.round((date.getTime() - Date.now()) / 86400000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(diffDays) < 14) {
    return formatter.format(diffDays, "day");
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getPriorityMetrics(
  preferredKeys: string[],
  metricByKey: Map<string, ScoreboardMetricRow>,
  count = 3
) {
  const selected: ScoreboardMetricRow[] = [];
  for (const key of preferredKeys) {
    const metric = metricByKey.get(key);
    if (isScoreboardMetricRow(metric) && !selected.some((m) => m.metric_key === metric.metric_key)) {
      selected.push(metric);
    }
  }
  selected.sort((a, b) => metricSeverity(b) - metricSeverity(a));
  if (selected.length >= count) {
    return selected.slice(0, count);
  }
  const sorted = Array.from(metricByKey.values())
    .filter(isScoreboardMetricRow)
    .sort((a, b) => metricSeverity(b) - metricSeverity(a));
  for (const metric of sorted) {
    if (selected.some((m) => m.metric_key === metric.metric_key)) continue;
    selected.push(metric);
    if (selected.length >= count) break;
  }
  selected.sort((a, b) => metricSeverity(b) - metricSeverity(a));
  return selected.slice(0, count);
}

function hoursSince(iso: string | null | undefined) {
  if (!iso) return null;
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return null;
  const diffMs = Date.now() - timestamp;
  if (!Number.isFinite(diffMs) || diffMs < 0) return 0;
  return diffMs / 36e5;
}

function normalizeAgentHealth(agent: AgentHealth): AgentHealth {
  const hoursSinceRun = hoursSince(agent.lastRunAt);
  let health: AgentHealth["health"] = "healthy";

  if (hoursSinceRun == null || hoursSinceRun > 24) {
    health = "unhealthy";
  } else if (agent.openTaskCount >= 25) {
    health = "warning";
  }

  return {
    ...agent,
    health
  };
}

function mapTaskRowToSummary(task: TaskRow) {
  return {
    id: task.id,
    title: task.title,
    agentKey: task.agent_key,
    priority: task.priority,
    status: task.status,
    expectedImpact: task.expected_impact,
    impactScore: task.impact_score,
    requiresApproval: task.requires_approval,
    approvedByUser: Boolean(task.approved_by_user),
    description: task.description ?? null,
    deliverableSummary: task.result_summary ?? null,
    deliverableLinks: normalizeDeliverableLinks(task.deliverable_links),
    whyThisMatters: task.why_this_matters ?? null,
    relatedMetricKeys: task.related_metric_keys ?? null,
    expectedDurationDays: task.expected_duration_days,
    createdAt: task.created_at ?? null,
    completedAt: task.completed_at ?? null
  };
}

function buildSurvivalStrip(snapshot: FinanceSnapshotRow | null) {
  const floor = toNumber(snapshot?.survival_floor) ?? 7000;
  const cash = toNumber(snapshot?.cash_on_hand);
  const burn = toNumber(snapshot?.monthly_burn);
  const projection = toNumber(snapshot?.projected_30d_revenue);
  const runwayDays = cash != null && burn != null && burn > 0 ? Math.round((cash / burn) * 30) : null;
  const configured = cash != null || burn != null || projection != null;
  const updatedAt = typeof snapshot?.updated_at === "string" ? snapshot?.updated_at : null;
  const updatedHours = updatedAt ? hoursSince(updatedAt) : null;
  const isStale = updatedHours == null ? true : updatedHours / 24 > SURVIVAL_STALE_DAYS;
  return {
    configured,
    cashOnHand: cash,
    survivalFloor: floor,
    monthlyBurn: burn,
    projected30dRevenue: projection,
    runwayDays,
    lastUpdatedAt: updatedAt,
    isStale
  };
}

function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isIsoDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function resolveRange(rangeParam: string | null, startParam: string | null, endParam: string | null) {
  const presets: Record<string, { preset: RangePreset; days: number }> = {
    today: { preset: "today", days: 1 },
    yesterday: { preset: "yesterday", days: 1 },
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

  const normalized = (rangeParam ?? "").toLowerCase();
  const today = new Date();

  if (normalized === "month_to_date") {
    const endDate = formatIsoDate(today);
    const startDate = formatIsoDate(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));
    return { preset: "month_to_date" as RangePreset, startDate, endDate };
  }

  if (normalized === "previous_month") {
    const year = today.getUTCFullYear();
    const month = today.getUTCMonth();
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0));
    return { preset: "previous_month" as RangePreset, startDate: formatIsoDate(start), endDate: formatIsoDate(end) };
  }

  if (normalized === "year_to_date") {
    const endDate = formatIsoDate(today);
    const startDate = formatIsoDate(new Date(Date.UTC(today.getUTCFullYear(), 0, 1)));
    return { preset: "year_to_date" as RangePreset, startDate, endDate };
  }

  const fallback = presets[normalized] ?? presets["30d"];

  const end = new Date(today);
  if (fallback.preset === "yesterday") {
    end.setUTCDate(end.getUTCDate() - 1);
  }

  const endDate = formatIsoDate(end);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (fallback.days - 1));
  const startDate = formatIsoDate(start);
  return { preset: fallback.preset, startDate, endDate };
}

function isoRangeBoundsFromDateRange(range: { startDate: string; endDate: string }) {
  // start/end are YYYY-MM-DD in UTC. Treat endDate as inclusive.
  const start = new Date(`${range.startDate}T00:00:00.000Z`);
  const endInclusive = new Date(`${range.endDate}T00:00:00.000Z`);
  const endExclusive = new Date(endInclusive);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return {
    startIso: start.toISOString(),
    endIsoExclusive: endExclusive.toISOString(),
    durationMs: endExclusive.getTime() - start.getTime(),
    start,
    endExclusive
  };
}

export async function GET(request: Request) {
  const authResponse = enforceDashboardAuth(request);
  if (authResponse) return authResponse;

  try {
    // Local dev fallback: load a seed snapshot from JSON instead of Supabase.
    // This is intentionally temporary so the UI can render without env/network.
    if ((process.env.DASHBOARD_DATA_SOURCE ?? "").toLowerCase() === "seed") {
      // NOTE: dynamic import to prevent Next/Turbopack from tracing node:fs into the
      // default (Supabase) runtime path.
      const { loadDashboardOverviewFromSeed } = await import("@/lib/dashboard/seed");
      const seeded = await loadDashboardOverviewFromSeed();
      const artifacts = await loadLocalDashboardArtifacts();
      return ok(
        sanitizeDashboardPayloadForHtml({
          ...seeded,
          websiteConversion: artifacts.websiteSnapshot,
          metaAds: artifacts.metaSnapshot,
          executiveSummary: artifacts.executiveSummary,
          industryPulse: artifacts.industrySnapshot,
          socialIntelligence: artifacts.socialSnapshot,
          cloudflare: artifacts.cloudflareSnapshot,
          leadIntelligence: artifacts.leadSnapshot,
          agentStatusPanel: artifacts.agentStatus,
          automationStatusPanel: artifacts.automationStatus,
          dataSourceAccess: artifacts.dataSourceMatrix,
          topActions: artifacts.topActions,
          blockedItems: artifacts.blockedItems
        })
      );
    }

    // E2E test harness: allow Playwright/Cypress to run without Supabase env + network.
    // NOTE: keep payload shape stable with the real endpoint.
    if (process.env.E2E_TEST === "1") {
      const now = new Date();
      const responseRange = { preset: "30d" as const, startDate: "2026-05-01", endDate: "2026-05-30" };

      const iso = (daysFromNow: number) => {
        const d = new Date(now);
        d.setUTCDate(d.getUTCDate() + daysFromNow);
        return d.toISOString();
      };

      return ok(
        sanitizeDashboardPayloadForHtml({
          ok: true,
          timestamp: now.toISOString(),
          range: responseRange,
          headerMetrics: [
          {
            metricKey: "kpi_mrr",
            metricName: "MRR",
            category: "Revenue",
            currentValue: 42000,
            targetValue: 50000,
            deltaPercent: 6.2,
            status: "on_track",
            unit: "USD",
            ownerAgent: "avery",
            measuredAt: now.toISOString()
          },
          {
            metricKey: "kpi_cash",
            metricName: "Cash on hand",
            category: "Survival",
            currentValue: 12000,
            targetValue: 7000,
            deltaPercent: null,
            status: "healthy",
            unit: "USD",
            ownerAgent: "ops",
            measuredAt: now.toISOString()
          },
          {
            metricKey: "kpi_pipeline",
            metricName: "Pipeline",
            category: "Partnerships",
            currentValue: 125000,
            targetValue: 150000,
            deltaPercent: -3.1,
            status: "warning",
            unit: "USD",
            ownerAgent: "avery",
            measuredAt: now.toISOString()
          },
          {
            metricKey: "kpi_velocity",
            metricName: "Weekly ship velocity",
            category: "Execution",
            currentValue: 8,
            targetValue: 10,
            deltaPercent: null,
            status: "warning",
            unit: "items",
            ownerAgent: "jeeves",
            measuredAt: now.toISOString()
          }
        ],
        executiveCommand: {
          weeklyDirective: "E2E fixture",
          topPriorities: [],
          biggestBottlenecks: [],
          ceoRecommendation: "E2E fixture"
        },
        warRoom: {
          mode: "war_room",
          reason: "E2E: revenue alert",
          lastUpdated: now.toISOString(),
          entries: [
            {
              id: "wr-1",
              title: "Conversion drop",
              summary: "Session → checkout funnel broke on mobile.",
              detailMd: null,
              createdAt: now.toISOString()
            }
          ]
        },
        revenueEngine: { metrics: [], moneyLeaks: [], fastestPathToIncreaseRevenue: [] },
        brandPower: { metrics: [], whatIsWorking: [], whatToDoNext: [] },
        opportunityRadar: { activeCount: 0, readyForOutreachCount: 0, topOpportunities: [], nextFiveMoves: [] },
        pipelinePanel: {
          collectors: [
            {
              id: "collector-e2e-1",
              name: "Tier A — Modern Art Museum",
              tier: "A",
              status: "warm",
              lastOutreachAt: iso(-3),
              nextMove: "Send licensing deck + propose intro call",
              nextMoveDueAt: iso(2),
              estimatedValue: 60000,
              supportingDocs: [
                { label: "Email thread", url: "https://example.com/email" },
                { label: "Deck", url: "https://example.com/deck" }
              ]
            },
            {
              id: "collector-e2e-2",
              name: "Tier B — Private Collector",
              tier: "B",
              status: "drift risk",
              lastOutreachAt: iso(-10),
              nextMove: "Follow up on referral",
              nextMoveDueAt: iso(1),
              estimatedValue: 25000,
              supportingDocs: [{ label: "Notes", url: "https://example.com/notes" }]
            }
          ],
          deals: [
            {
              id: "deal-e2e-1",
              name: "Licensing — Capsule drop",
              organization: "Studio X",
              opportunityType: "licensing",
              status: "negotiation",
              valueEstimate: 40000,
              prestigeScore: 9,
              probabilityScore: 0.55,
              ownerAgent: "avery",
              nextStep: "Send term sheet",
              nextStepDueAt: iso(3),
              supportingDocs: [{ label: "Contract draft", url: "https://example.com/contract" }]
            }
          ]
        },
        survivalStrip: {
          configured: true,
          cashOnHand: 12000,
          survivalFloor: 7000,
          monthlyBurn: 6000,
          projected30dRevenue: 15000,
          runwayDays: 60
        },
        tasks: [
          {
            id: "task-fixture-1",
            title: "Approve campaign creative",
            agentKey: "avery",
            priority: "high",
            status: "pending",
            expectedImpact: "Unblocks conversion fixes this week.",
            impactScore: null,
            requiresApproval: true,
            approvedByUser: false,
            description: "Review the creative and approve/reject.",
            deliverableSummary: "Draft creative is ready.",
            deliverableLinks: [{ label: "Figma", url: "https://example.com/figma" }],
            whyThisMatters: "Approval gate",
            relatedMetricKeys: [],
            expectedDurationDays: 2,
            createdAt: now.toISOString(),
            completedAt: null
          }
        ],
        proofOfWork: [
          {
            taskId: "task-fixture-1",
            taskTitle: "Approve campaign creative",
            agentKey: "avery",
            completedAt: now.toISOString(),
            summary: "Draft creative is ready.",
            deliverableLinks: [{ label: "Figma", url: "https://example.com/figma" }]
          }
        ],
        schedulerJobs: [],
        agentSla: [],
        approvalBottlenecks: { pendingCount: 1, oldestPendingHours: 2.5, tasks: [] },
        actionQueue: {
          needsApprovalTasks: {
            label: "Task approvals",
            count: 1,
            items: [
              {
                id: "task-approval-1",
                itemType: "task",
                title: "Approve ad spend",
                summary: "Increase budget by $500",
                createdAt: now.toISOString(),
                dueAt: null,
                actor: "avery",
                priority: "high"
              }
            ]
          },
          pendingPlans: { label: "Plans awaiting review", count: 0, items: [] },
          decisionsDue: { label: "Decisions to revisit", count: 0, items: [] },
          invoicesToSend: { label: "Invoices to send", count: 0, items: [] }
        },
        systemHealth: { dataFreshnessHours: 0, agentTaskCompletionRate: 100, agents: [] },
        agentUpdateFeed: [],
        commerceTelemetry: { range: responseRange },
        agentKpis: [],
        ideaBoard: {
          columns: {
            proposed: [
              {
                id: "idea-1",
                agentKey: "avery",
                agentName: "Avery",
                ideaType: "major",
                title: "Raise prices on premium prints",
                summary: "Test tiered pricing: standard vs collector edition.",
                expectedImpact: 8,
                requiresCeoApproval: true,
                linkedTaskId: null,
                approvedAt: null,
                approver: null,
                updatedAt: now.toISOString(),
                createdAt: now.toISOString()
              }
            ],
            in_review: [],
            approved: [],
            rejected: [],
            in_progress: [],
            shipped: [],
            archived: []
          },
          linkedTasks: {},
          recentComments: [
            {
              id: "idea-comment-1",
              ideaId: "idea-1",
              commenter: "noah",
              comment: "This unlocks AOV immediately.",
              createdAt: now.toISOString()
            }
          ]
        },
        ceoQuestionDesk: { openQuestions: [], escalations: [], recentComments: [] }
      }));
    }

    const url = new URL(request.url);
    const rangeParam = url.searchParams.get("range");
    const startParam = url.searchParams.get("start");
    const endParam = url.searchParams.get("end");
    const range = resolveRange(rangeParam, startParam, endParam);

    const previousRangeForBaseline = computePreviousInclusiveDateRange({
      startDate: range.startDate,
      endDate: range.endDate
    });

    const previousCommerceTelemetryPromise = previousRangeForBaseline
      ? getCommerceTelemetry({ startDate: previousRangeForBaseline.startDate, endDate: previousRangeForBaseline.endDate }).catch(() => null)
      : Promise.resolve(null);

    const [
      metrics,
      tasks,
      opportunities,
      directive,
      agentHealth,
      commerceTelemetry,
      operatingMode,
      schedulerControlState,
      schedulerStatusState,
      schedulerJobsRaw,
      tasksAwaitingApproval,
      pendingPlans,
      decisionsDue,
      financeSnapshot,
      collectorRows,
      recentTasks,
      kpiDefinitions,
      ideaResult,
      recentIdeaComments,
      ceoQuestionResult,
      recentCeoComments,
      industryPulseResult,
      localArtifacts,
      dashboardSnapshotRows
    ] = await Promise.all([
      getScoreboardMetricsForRange(range) as Promise<ScoreboardMetricRow[]>,
      getOpenTasks(50) as Promise<TaskRow[]>,
      getActiveOpportunities(25) as Promise<OpportunityRow[]>,
      getLatestAgentDirective(),
      getAgentHealth(),
      getCommerceTelemetry({ startDate: range.startDate, endDate: range.endDate }),
      getSystemState("operating_mode"),
      getSystemState("scheduler_control"),
      getSystemState("scheduler_status"),
      getScheduledJobsWithLatestRuns(),
      getTasksAwaitingApproval(25),
      getPendingAgentPlans(15),
      getDecisionsRequiringReview({ withinDays: 21, limit: 20 }),
      getLatestFinanceSnapshot(),
      getCollectorRelationships(60),
      getRecentTasks(500),
      listAgentKpis({ limit: 250 }) as Promise<AgentKpiRow[]>,
      getIdeas({ limit: 250 }) as Promise<{ items: IdeaRow[]; count: number }>,
      getRecentIdeaComments(30) as Promise<IdeaCommentRow[]>,
      getCeoQuestions({ limit: 250 }) as Promise<{ items: CeoQuestionRow[]; count: number }>,
      getRecentCeoQuestionComments(30) as Promise<CeoQuestionCommentRow[]>,
      getIndustryPulseSnapshot({ day: range.endDate, days: 14, limit: 5 }),
      loadLocalDashboardArtifacts(),
      getDashboardSnapshots(["website", "cloudflare", "meta", "social"])
    ]);

    const snapshotRows = dashboardSnapshotRows as DashboardSnapshotRecord[];
    const snapshotMap = new Map(snapshotRows.map((row) => [row.key, row]));
    const websiteSnapshot =
      (snapshotMap.get("website")?.payload as WebsiteConversionSnapshot | null) ?? localArtifacts.websiteSnapshot;
    const cloudflareSnapshot =
      (snapshotMap.get("cloudflare")?.payload as CloudflareTelemetrySnapshot | null) ?? localArtifacts.cloudflareSnapshot;
    const metaSnapshot = (snapshotMap.get("meta")?.payload as MetaAdsSnapshot | null) ?? localArtifacts.metaSnapshot;
    const socialSnapshot = (snapshotMap.get("social")?.payload as SocialIntelligenceSnapshot | null) ?? localArtifacts.socialSnapshot;

    let changeInsights: ChangeInsightsSnapshot | null = null;
    try {
      const metaHistory = await getDashboardSnapshotHistoryForKey("meta", { limit: 4 });

      const currentMetaCutoff = snapshotMap.get("meta")?.generated_at ?? metaSnapshot?.generatedAt ?? null;
      const metaPrevious = selectPreviousSnapshot<MetaAdsSnapshot>(metaHistory, currentMetaCutoff)?.payload ?? null;

      changeInsights =
        buildChangeInsightsSnapshot({
          websiteCurrent: websiteSnapshot,
          websitePrevious: null,
          metaCurrent: metaSnapshot,
          metaPrevious,
          maxInsights: 5
        }) ?? null;
    } catch {
      // Best-effort: do not fail the overview route due to history lookup errors.
      changeInsights = null;
    }

    const kpiKeys = (kpiDefinitions as AgentKpiRow[]).map((kpi) => kpi.kpi_key);

    const { startIso, endIsoExclusive, durationMs } = isoRangeBoundsFromDateRange(range);
    const prevEndExclusive = new Date(startIso);
    const prevStart = new Date(prevEndExclusive.getTime() - durationMs);

    const [kpiReadings, priorKpiReadings] = await Promise.all([
      listLatestAgentKpiReadingsByKpiKeysForRange(kpiKeys, { startIso, endIsoExclusive }) as Promise<AgentKpiReadingRow[]>,
      listLatestAgentKpiReadingsByKpiKeysForRange(kpiKeys, {
        startIso: prevStart.toISOString(),
        endIsoExclusive: prevEndExclusive.toISOString()
      }) as Promise<AgentKpiReadingRow[]>
    ]);

    // Fallback: if there are zero readings in the selected range (fresh tables), use global latest.
    // This keeps the strip from looking empty while still preferring true range-based deltas.
    const effectiveCurrentReadings = kpiReadings.length
      ? kpiReadings
      : ((await listLatestAgentKpiReadingsByKpiKeys(kpiKeys)) as AgentKpiReadingRow[]);

    const latestReadingByKey = new Map(effectiveCurrentReadings.map((r) => [r.kpi_key, r]));
    const priorReadingByKey = new Map(priorKpiReadings.map((r) => [r.kpi_key, r]));

    const agentKpis = agentKeys.map((agentKey) => {
      const defs = (kpiDefinitions as AgentKpiRow[]).filter((kpi) => kpi.agent_key === agentKey);
      return {
        agentKey,
        agentName: agentDisplayNames[agentKey as keyof typeof agentDisplayNames] ?? agentKey,
        kpis: defs.map((kpi) => {
          const latest = latestReadingByKey.get(kpi.kpi_key);
          const prior = priorReadingByKey.get(kpi.kpi_key);
          return {
            kpiKey: kpi.kpi_key,
            kpiName: kpi.kpi_name,
            description: kpi.description,
            targetValue: toNumber(kpi.target_value),
            unit: kpi.unit,
            frequency: kpi.frequency,
            priority: kpi.priority,
            latestReading: latest
              ? {
                  id: latest.id,
                  value: toNumber(latest.value),
                  measuredAt: latest.measured_at,
                  source: latest.source,
                  notes: latest.notes
                }
              : null,
            priorReading: prior
              ? {
                  id: prior.id,
                  value: toNumber(prior.value),
                  measuredAt: prior.measured_at,
                  source: prior.source,
                  notes: prior.notes
                }
              : null
          };
        })
      };
    });

    const ideas = (ideaResult as { items: IdeaRow[] }).items;

    const ideaBoardStatuses = [
      "proposed",
      "in_review",
      "approved",
      "rejected",
      "in_progress",
      "shipped",
      "archived"
    ];
    const seenIdeaKeys = new Set<string>();
    const ideaBoard = ideaBoardStatuses.reduce<Record<string, unknown>>((acc, status) => {
      acc[status] = ideas
        .filter((idea) => {
          if (idea.status !== status) return false;
          const key = `${idea.agent_key}|${idea.status}|${(idea.title ?? "").trim().toLowerCase()}`;
          if (seenIdeaKeys.has(key)) return false;
          seenIdeaKeys.add(key);
          return true;
        })
        .slice(0, 50)
        .map((idea) => ({
          id: idea.id,
          agentKey: idea.agent_key,
          agentName: agentDisplayNames[idea.agent_key as keyof typeof agentDisplayNames] ?? idea.agent_key,
          ideaType: idea.idea_type,
          title: idea.title,
          summary: idea.summary,
          expectedImpact: idea.expected_impact,
          requiresCeoApproval: idea.requires_ceo_approval,
          linkedTaskId: idea.linked_task_id,
          approvedAt: idea.approved_at,
          approver: idea.approver,
          updatedAt: idea.updated_at,
          createdAt: idea.created_at
        }));
      return acc;
    }, {});

    const ceoQuestions = (ceoQuestionResult as { items: CeoQuestionRow[] }).items;
    const openQuestions = ceoQuestions
      .filter((q) => ["open", "needs_followup"].includes(q.status))
      .slice(0, 25)
      .map((q) => ({
        id: q.id,
        askedBy: q.asked_by,
        escalationLevel: q.escalation_level,
        question: q.question,
        context: q.context,
        status: q.status,
        priority: q.priority,
        ownerAgent: q.owner_agent,
        dueAt: q.due_at,
        createdAt: q.created_at,
        updatedAt: q.updated_at
      }));
    const escalations = ceoQuestions
      .filter((q) => q.escalation_level === "keegan" && ["open", "needs_followup"].includes(q.status))
      .slice(0, 25)
      .map((q) => ({
        id: q.id,
        askedBy: q.asked_by,
        question: q.question,
        status: q.status,
        priority: q.priority,
        dueAt: q.due_at,
        escalatedBy: q.escalated_by,
        updatedAt: q.updated_at
      }));

    const ceoQuestionDesk = {
      openQuestions,
      escalations,
      recentComments: (recentCeoComments as CeoQuestionCommentRow[]).map((c) => ({
        id: c.id,
        questionId: c.question_id,
        commenter: c.commenter,
        body: c.body,
        createdAt: c.created_at
      }))
    };

    const [warRoomThread, agentUpdateBuckets] = await Promise.all([
      getOrCreateAgentThread({ agentKey: "avery", threadType: "war_room", title: "Executive War Room" }),
      Promise.all(agentKeys.map((key) => getAgentUpdates(key, 5)))
    ]);
    const warRoomMessages = await getAgentMessages(warRoomThread.id, 5);

    const metricByKey = new Map(metrics.map((m) => [m.metric_key, { ...m }]));
    metricByKey.delete("active_brand_conversations");

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

    const headerMetrics = HEADER_CARD_CONFIG.map((card) => {
      const metric = metricByKey.get(card.cardKey);
      if (!metric) {
        return {
          metricKey: card.cardKey,
          metricName: card.fallbackName,
          category: "general",
          currentValue: 0,
          targetValue: 0,
          deltaPercent: null,
          status: "warning" as const,
          unit: card.fallbackUnit ?? null,
          ownerAgent: null,
          measuredAt: null
        };
      }

      const currentValue = toNumber(metric.current_value) ?? 0;
      const targetValue = toNumber(metric.target_value) ?? 0;
      return {
        metricKey: metric.metric_key,
        metricName: metric.metric_name ?? card.fallbackName,
        category: metric.category ?? "general",
        currentValue,
        targetValue,
        deltaPercent: metric.stats?.changePercent ?? null,
        status: statusFromGap(toNumber(metric.current_value), toNumber(metric.target_value)),
        unit: metric.unit ?? card.fallbackUnit ?? null,
        ownerAgent: metric.owner_agent ?? null,
        measuredAt: metric.measured_at ?? null
      };
    });

    const operatingModeJson = (operatingMode?.value_json as Record<string, unknown> | undefined) ?? {};
    const directiveMetricKeys = Array.isArray(directive?.related_metric_keys)
      ? (directive?.related_metric_keys as string[])
      : [];
    const priorityMetrics = getPriorityMetrics(directiveMetricKeys, metricByKey);
    const offTrackPriorityMetrics = priorityMetrics.filter(isMetricOffTrack);
    const prioritySourceMetrics = offTrackPriorityMetrics.length ? offTrackPriorityMetrics : priorityMetrics;
    const topPriorities = dedupeStrings(prioritySourceMetrics.map((metric) => describePriority(metric)).filter(Boolean)).slice(
      0,
      3
    );

    const bottleneckMetrics: ScoreboardMetricRow[] = [...offTrackPriorityMetrics];
    if (bottleneckMetrics.length < 2) {
      const additional = Array.from(metricByKey.values())
        .filter(isScoreboardMetricRow)
        .sort((a, b) => metricSeverity(b) - metricSeverity(a));
      for (const metric of additional) {
        if (bottleneckMetrics.some((m) => m.metric_key === metric.metric_key)) continue;
        if (!isMetricOffTrack(metric)) continue;
        bottleneckMetrics.push(metric);
        if (bottleneckMetrics.length >= 3) break;
      }
    }

    const bottleneckStatements = dedupeStrings(
      [
        typeof operatingModeJson.reason === "string" ? (operatingModeJson.reason as string) : null,
        ...bottleneckMetrics
          .map((metric) => describeBottleneck(metric))
          .filter((statement): statement is string => Boolean(statement))
      ].filter(Boolean) as string[]
    ).slice(0, 3);

    const executiveCommand = {
      weeklyDirective: directive?.summary?.trim() || DEFAULT_EXECUTIVE_DIRECTIVE,
      topPriorities: topPriorities.length ? topPriorities : DEFAULT_EXECUTIVE_PRIORITIES,
      biggestBottlenecks: bottleneckStatements.length ? bottleneckStatements : DEFAULT_EXECUTIVE_BOTTLENECKS,
      ceoRecommendation: directive?.detail_md?.trim() || DEFAULT_EXECUTIVE_RECOMMENDATION
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
        unit: m.unit ?? null,
        history: (m.history ?? null)
          ? (m.history ?? []).map((h) => ({ measuredAt: h.measured_at, value: h.value }))
          : null,
        stats: (m.stats ?? null)
          ? {
              average: m.stats?.average ?? null,
              min: m.stats?.min ?? null,
              max: m.stats?.max ?? null,
              changePercent: m.stats?.changePercent ?? null
            }
          : null
      }));

    const revenueDiagRows = REVENUE_DIAG_METRICS.map((key) => metricByKey.get(key)).filter(isScoreboardMetricRow);
    const revenueLeaks = dedupeStrings(
      revenueDiagRows
        .map((metric) => describeRevenueLeak(metric))
        .filter((value): value is string => Boolean(value))
    ).slice(0, 3);
    const fastestPaths = revenueDiagRows
      .filter((metric) => isMetricOffTrack(metric))
      .slice(0, 3)
      .map((metric) => describeRevenueFastPath(metric));

    const revenueEngine = {
      metrics: revenueEngineMetrics,
      moneyLeaks: revenueLeaks,
      fastestPathToIncreaseRevenue: fastestPaths,
      isDiagnosticEmpty: revenueLeaks.length === 0 && fastestPaths.length === 0
    };

    const brandPowerMetricRows = ["social_growth_monthly", "engagement_rate", "cultural_relevance_score"]
      .map((key) => metricByKey.get(key))
      .filter(isScoreboardMetricRow);

    const brandPowerMetrics = brandPowerMetricRows.map((m) => ({
      metricKey: m.metric_key,
      currentValue: toNumber(m.current_value) ?? 0,
      targetValue: toNumber(m.target_value) ?? 0,
      status: statusFromGap(toNumber(m.current_value), toNumber(m.target_value)),
      unit: m.unit ?? null
    }));

    const brandWins = dedupeStrings(
      brandPowerMetricRows
        .filter((metric) => statusFromGap(toNumber(metric.current_value), toNumber(metric.target_value)) === "healthy")
        .map((metric) => describeBrandWin(metric))
    ).slice(0, 3);

    const brandOpportunities = dedupeStrings(
      brandPowerMetricRows
        .map((metric) => describeBottleneck(metric))
        .filter((statement): statement is string => Boolean(statement))
    ).slice(0, 3);

    const brandPower = {
      metrics: brandPowerMetrics,
      whatIsWorking: brandWins.length ? brandWins : DEFAULT_BRAND_POWER_WINS,
      whatToDoNext: brandOpportunities.length ? brandOpportunities : DEFAULT_BRAND_POWER_ACTIONS
    };

    const warRoomStateJson = operatingModeJson;
    const dedupedEntries: Array<{
      id: string;
      title: string;
      summary: string;
      detailMd: string | null;
      createdAt: string;
    }> = [];
    const seenWarRoom = new Set<string>();
    for (const message of [...warRoomMessages].reverse()) {
      const title = ((message.metadata as Record<string, unknown> | null)?.title as string | undefined) ?? "War room note";
      const summary = message.body;
      const dedupeKey = `${title}|${summary}`;
      if (seenWarRoom.has(dedupeKey)) continue;
      seenWarRoom.add(dedupeKey);
      dedupedEntries.push({
        id: message.id,
        title,
        summary,
        detailMd: ((message.metadata as Record<string, unknown> | null)?.detailMd as string | undefined) ?? null,
        createdAt: message.created_at
      });
    }
    dedupedEntries.reverse();

    const triggerReason = typeof warRoomStateJson.reason === "string" ? warRoomStateJson.reason : null;
    const triggerTimestamp =
      typeof warRoomStateJson.activatedAt === "string" ? warRoomStateJson.activatedAt : warRoomMessages[0]?.created_at ?? null;
    const reasonAlreadyLogged = triggerReason
      ? dedupedEntries.some((entry) => entry.summary.trim() === triggerReason.trim())
      : true;
    if (triggerReason && !reasonAlreadyLogged) {
      dedupedEntries.unshift({
        id: `war-room-reason-${triggerTimestamp ?? Date.now().toString()}`,
        title: "War room trigger",
        summary: triggerReason,
        detailMd: null,
        createdAt: triggerTimestamp ?? new Date().toISOString()
      });
    }

    const warRoom = {
      mode: (warRoomStateJson.mode as "normal" | "war_room" | undefined) ?? "normal",
      reason: (warRoomStateJson.reason as string | null) ?? null,
      lastUpdated: (warRoomStateJson.activatedAt as string | null) ?? null,
      entries: dedupedEntries
    };

    const agentUpdateFeed = agentUpdateBuckets
      .flat()
      .map((row) => ({
        id: row.id,
        agentKey: row.agent_key,
        agentName: agentDisplayNames[row.agent_key as keyof typeof agentDisplayNames] ?? row.agent_key,
        updateType: row.update_type,
        title: row.title,
        summary: row.summary,
        priority: row.priority,
        createdAt: row.created_at
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 12);

    const schedulerJobs = (schedulerJobsRaw as ScheduledJobRow[]).map((job) => {
      const lastRun = job.latestRun ?? null;
      const durationSeconds = lastRun?.finished_at
        ? Math.max(0, (new Date(lastRun.finished_at).getTime() - new Date(lastRun.started_at).getTime()) / 1000)
        : null;
      return {
        jobKey: job.job_key,
        jobName: job.job_name,
        cronExpression: job.cron_expression,
        routePath: job.route_path,
        timezone: job.timezone ?? null,
        isActive: job.is_active ?? true,
        lastRunAt: lastRun?.started_at ?? null,
        lastStatus: lastRun?.status ?? null,
        lastDurationSeconds: durationSeconds,
        lastSummary: lastRun?.summary ?? null,
        lastError: lastRun?.error_md ?? null,
        nextRunAt: job.next_run_at ?? null,
        source: "supabase"
      };
    });
    const failingCount = schedulerJobs.filter((job) => job.lastStatus === "failed").length;
    const missingTelemetryCount = schedulerJobs.filter((job) => !job.lastRunAt).length;
    const schedulerControlJson = (schedulerControlState?.value_json as Record<string, unknown> | undefined) ?? {};
    const cronEnabled = typeof schedulerControlJson.cronEnabled === "boolean" ? schedulerControlJson.cronEnabled : false;
    const schedulerStatusJson = (schedulerStatusState?.value_json as Record<string, unknown> | undefined) ?? null;
    const schedulerSummary = schedulerStatusJson
      ? {
          status: (schedulerStatusJson.status as "LIVE" | "PARTIAL" | "BROKEN" | undefined) ?? (cronEnabled ? "PARTIAL" : "BROKEN"),
          cronEnabled:
            typeof schedulerStatusJson.cronEnabled === "boolean" ? Boolean(schedulerStatusJson.cronEnabled) : cronEnabled,
          jobCount: typeof schedulerStatusJson.jobCount === "number" ? schedulerStatusJson.jobCount : schedulerJobs.length,
          failingCount:
            typeof schedulerStatusJson.failingCount === "number" ? schedulerStatusJson.failingCount : failingCount,
          missingTelemetryCount:
            typeof schedulerStatusJson.missingTelemetryCount === "number"
              ? schedulerStatusJson.missingTelemetryCount
              : missingTelemetryCount,
          lastUpdatedAt:
            schedulerStatusState?.updated_at ??
            (typeof schedulerStatusJson.lastUpdatedAt === "string" ? schedulerStatusJson.lastUpdatedAt : null),
          source: typeof schedulerStatusJson.source === "string" ? schedulerStatusJson.source : "scheduler-status-script"
        }
      : {
          status:
            schedulerJobs.length === 0
              ? "BROKEN"
              : cronEnabled && failingCount === 0 && missingTelemetryCount === 0
                ? "LIVE"
                : "PARTIAL",
          cronEnabled,
          jobCount: schedulerJobs.length,
          failingCount,
          missingTelemetryCount,
          lastUpdatedAt: new Date().toISOString(),
          source: "derived"
        };

    const openTaskRows = tasks as TaskRow[];
    const recentTaskRows = recentTasks as TaskRow[];
    const completedTaskRows = recentTaskRows.filter((task) => task.status === "completed");

    const taskRowMap = new Map<string, TaskRow>();
    [...openTaskRows, ...completedTaskRows].forEach((task) => {
      taskRowMap.set(task.id, task);
    });
    const allTaskRows = Array.from(taskRowMap.values());

    const opportunityEvidenceById = new Map<string, DeliverableLink[]>();

    for (const task of allTaskRows) {
      if (task.status !== "completed") continue;
      const links = normalizeDeliverableLinks(task.deliverable_links);
      if (!links.length) continue;
      const linkedIds = extractOpportunityIdsFromText(task.description, task.result_summary);
      if (!linkedIds.length) continue;
      linkedIds.forEach((id) => {
        const existing = opportunityEvidenceById.get(id) ?? [];
        opportunityEvidenceById.set(id, mergeDeliverableLinks(existing, links));
      });
    }

    const ideaBoardLinkedTasks = allTaskRows.reduce<
      Record<
        string,
        {
          id: string;
          title: string;
          status: string;
          priority: string;
          requiresApproval: boolean;
          approvedByUser?: boolean | null;
          dueAt?: string | null;
          expectedDurationDays?: number | null;
          description?: string | null;
          deliverableLinks?: Array<{ label: string; url: string }> | null;
          updatedAt?: string | null;
        }
      >
    >((acc, task) => {
      acc[task.id] = {
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        requiresApproval: task.requires_approval,
        approvedByUser: task.approved_by_user ?? null,
        dueAt: null,
        expectedDurationDays: task.expected_duration_days,
        description: task.description ?? null,
        deliverableLinks: normalizeDeliverableLinks(task.deliverable_links),
        updatedAt: task.created_at ?? null
      };
      return acc;
    }, {});

    const nowMs = Date.now();
    const tasksByAgent = allTaskRows.reduce<Record<string, TaskRow[]>>((acc, task) => {
      acc[task.agent_key] = acc[task.agent_key] ?? [];
      acc[task.agent_key].push(task);
      return acc;
    }, {});

    const agentSla = agentHealth
      .map((agent) => {
        const agentTasks = tasksByAgent[agent.agentKey] ?? [];
        const openCount = agentTasks.filter((task) => task.status !== "completed").length;
        const inProgressCount = agentTasks.filter((task) => task.status === "in_progress").length;
        const minutesSinceRun = agent.lastRunAt ? Math.round((nowMs - new Date(agent.lastRunAt).getTime()) / 60000) : null;
        const nextRunDueAt = agent.lastRunAt
          ? new Date(new Date(agent.lastRunAt).getTime() + 24 * 60 * 60 * 1000).toISOString()
          : null;
        return {
          agentKey: agent.agentKey,
          lastRunAt: agent.lastRunAt,
          minutesSinceRun,
          nextRunDueAt,
          inProgressShare: openCount > 0 ? Math.round((inProgressCount / openCount) * 100) : null
        };
      })
      .sort((a, b) => (b.minutesSinceRun ?? 0) - (a.minutesSinceRun ?? 0));

    const approvalsSorted = [...(tasksAwaitingApproval as TaskRow[])].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const oldestPendingHours = approvalsSorted.length
      ? Number(((nowMs - new Date(approvalsSorted[0].created_at).getTime()) / 36e5).toFixed(1))
      : null;
    const approvalBottlenecks = {
      pendingCount: approvalsSorted.length,
      oldestPendingHours,
      tasks: approvalsSorted.slice(0, 5).map(mapTaskRowToSummary)
    };

    const approvalQueueItems = approvalsSorted.slice(0, 5).map((task) => ({
      id: task.id,
      itemType: "task" as const,
      title: task.title,
      summary: task.expected_impact,
      createdAt: task.created_at,
      dueAt: null,
      actor: task.agent_key,
      priority: task.priority
    }));

    const planQueueItems = (pendingPlans as AgentPlanRow[]).slice(0, 5).map((plan) => ({
      id: plan.id,
      itemType: "plan" as const,
      title: plan.title,
      summary: plan.summary,
      createdAt: plan.submitted_at,
      dueAt: null,
      actor: plan.submitted_by ?? plan.agent_key,
      priority: null
    }));

    const decisionQueueItems = (decisionsDue as DecisionRow[]).slice(0, 5).map((decision) => ({
      id: decision.id,
      itemType: "decision" as const,
      title: decision.title,
      summary: decision.summary,
      createdAt: decision.created_at,
      dueAt: decision.outcome_review_date,
      actor: decision.decided_by ?? decision.decision_type,
      priority: null
    }));

    const invoiceQueueItems = allTaskRows
      .filter((task) => {
        const haystack = `${task.title} ${task.expected_impact ?? ""}`.toLowerCase();
        return haystack.includes("invoice") || (task.execution_type ?? "").toLowerCase().includes("invoice");
      })
      .slice(0, 5)
      .map((task) => ({
        id: task.id,
        itemType: "invoice" as const,
        title: task.title,
        summary: task.expected_impact,
        createdAt: task.created_at,
        dueAt: null,
        actor: task.agent_key,
        priority: task.priority
      }));

    const actionQueue = {
      needsApprovalTasks: {
        label: "Task approvals",
        count: approvalQueueItems.length,
        items: approvalQueueItems
      },
      pendingPlans: {
        label: "Plans awaiting review",
        count: planQueueItems.length,
        items: planQueueItems
      },
      decisionsDue: {
        label: "Decisions to revisit",
        count: decisionQueueItems.length,
        items: decisionQueueItems
      },
      invoicesToSend: {
        label: "Invoices to send",
        count: invoiceQueueItems.length,
        items: invoiceQueueItems
      }
    };

    const survivalStrip = buildSurvivalStrip((financeSnapshot ?? null) as FinanceSnapshotRow | null);

    const collectorSummaries = (collectorRows as CollectorRow[]).map((collector) => ({
      id: collector.id,
      name: collector.collector_name,
      tier: collector.tier,
      status: collector.relationship_status,
      lastOutreachAt: collector.last_touch_at ?? collector.last_outreach_at,
      nextMove: collector.next_move,
      nextMoveDueAt: collector.next_move_due_at,
      estimatedValue: collector.estimated_value,
      supportingDocs: buildSupportingDocs(collector)
    }));

    const collectorTelemetry = buildCollectorTelemetry(collectorRows as CollectorRow[]);

    const normalizedOpportunities = dedupeOpportunityRows(opportunities as OpportunityRow[]);

    const pipelineDeals: {
      id: string;
      name: string;
      organization: string | null;
      opportunityType: string;
      status: string;
      valueEstimate: number | null;
      prestigeScore: number | null;
      probabilityScore: number | null;
      ownerAgent: string;
      nextStep: string | null;
      nextStepDueAt: string | null;
      supportingDocs: Array<{ label: string; url: string }> | null;
    }[] = [];
    const seenPipelineDeals = new Set<string>();
    for (const opportunity of normalizedOpportunities) {
      if (["won", "lost", "parked"].includes(opportunity.status)) continue;
      const dedupeKey = `${opportunity.name}|${opportunity.organization ?? ""}`.toLowerCase();
      if (seenPipelineDeals.has(dedupeKey)) continue;
      seenPipelineDeals.add(dedupeKey);
      const pipelineDocs = buildSupportingDocs(opportunity) ?? opportunityEvidenceById.get(opportunity.id) ?? null;

      pipelineDeals.push({
        id: opportunity.id,
        name: opportunity.name,
        organization: opportunity.organization,
        opportunityType: opportunity.opportunity_type,
        status: opportunity.status,
        valueEstimate: opportunity.value_estimate,
        prestigeScore: opportunity.prestige_score,
        probabilityScore: opportunity.probability_score,
        ownerAgent: opportunity.owner_agent,
        nextStep: opportunity.next_step,
        nextStepDueAt: opportunity.next_step_due_at,
        supportingDocs: pipelineDocs ? pipelineDocs.slice(0, 4) : null
      });
      if (pipelineDeals.length >= 6) break;
    }

    const activeCount = normalizedOpportunities.filter((o) => !["won", "lost", "parked"].includes(o.status)).length;
    const readyForOutreachCount = normalizedOpportunities.filter((o) => o.status === "ready_for_outreach").length;

    const sortedOpportunities = normalizedOpportunities.slice().sort((a, b) => (b.prestige_score ?? 0) - (a.prestige_score ?? 0));
    const seenTopOpportunities = new Set<string>();
    const topOpportunities: {
      id: string;
      name: string;
      organization: string | null;
      opportunityType: string;
      status: string;
      valueEstimate: number | null;
      prestigeScore: number | null;
      probabilityScore: number | null;
      ownerAgent: string;
      nextStep: string | null;
      nextStepDueAt: string | null;
      supportingDocs: Array<{ label: string; url: string }> | null;
    }[] = [];

    for (const opportunity of sortedOpportunities) {
      const dedupeKey = `${opportunity.name}|${opportunity.organization ?? ""}`.toLowerCase();
      if (seenTopOpportunities.has(dedupeKey)) continue;
      seenTopOpportunities.add(dedupeKey);

      const docsFromOpportunity = buildSupportingDocs(opportunity);
      const fallbackDocs = opportunityEvidenceById.get(opportunity.id);

      topOpportunities.push({
        id: opportunity.id,
        name: opportunity.name,
        organization: opportunity.organization,
        opportunityType: opportunity.opportunity_type,
        status: opportunity.status,
        valueEstimate: opportunity.value_estimate,
        prestigeScore: opportunity.prestige_score,
        probabilityScore: opportunity.probability_score,
        ownerAgent: opportunity.owner_agent,
        nextStep: opportunity.next_step,
        nextStepDueAt: opportunity.next_step_due_at,
        supportingDocs: docsFromOpportunity ?? (fallbackDocs ? fallbackDocs.slice(0, 4) : null)
      });

      if (topOpportunities.length >= 5) break;
    }

    const upcomingMoves = normalizedOpportunities
      .filter((opportunity) => !["won", "lost", "parked"].includes(opportunity.status))
      .map((opportunity) => ({
        label: describeOpportunityMove(opportunity),
        dueAt: opportunity.next_step_due_at ?? null
      }))
      .filter((item) => Boolean(item.label));

    upcomingMoves.sort((a, b) => {
      if (a.dueAt && b.dueAt) return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      if (a.dueAt) return -1;
      if (b.dueAt) return 1;
      return 0;
    });

    const nextFiveMoves = dedupeStrings(upcomingMoves.map((item) => item.label).filter(Boolean)).slice(0, 5);

    const opportunityRadar = {
      activeCount,
      readyForOutreachCount,
      topOpportunities,
      nextFiveMoves
    };

    const pipelinePanel = {
      collectors: collectorSummaries,
      deals: pipelineDeals
    };

    const taskSummaries = allTaskRows.map(mapTaskRowToSummary);
    const scoreboardRefreshJob = schedulerJobs.find((job) => job.jobKey === "scoreboard-refresh");
    const freshnessHoursRaw = hoursSince(scoreboardRefreshJob?.lastRunAt ?? null);
    const dataFreshnessHours = freshnessHoursRaw == null ? null : Math.max(0, Math.round(freshnessHoursRaw));

    const totalTasksForRate = taskSummaries.length;
    const completedTasksForRate = taskSummaries.filter((task) => task.status === "completed").length;
    const agentTaskCompletionRate =
      totalTasksForRate > 0 ? Math.round((completedTasksForRate / totalTasksForRate) * 100) : null;

    const systemHealth = {
      dataFreshnessHours,
      agentTaskCompletionRate,
      agents: (agentHealth as AgentHealth[]).map(normalizeAgentHealth)
    };
    const proofOfWorkEntries: ProofOfWorkEntry[] = taskSummaries
      .filter((task) => {
        if (task.status !== "completed") return false;
        const hasSummary = typeof task.deliverableSummary === "string" && task.deliverableSummary.trim().length > 0;
        const hasLinks = Boolean(task.deliverableLinks && task.deliverableLinks.length > 0);
        return hasSummary || hasLinks;
      })
      .sort((a, b) => {
        const aTime = a.completedAt ?? a.createdAt ?? "";
        const bTime = b.completedAt ?? b.createdAt ?? "";
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      })
      .slice(0, 8)
      .map((task) => ({
        taskId: task.id,
        taskTitle: task.title,
        agentKey: task.agentKey ?? null,
        completedAt: task.completedAt ?? task.createdAt ?? null,
        summary: task.deliverableSummary ?? task.expectedImpact ?? null,
        deliverableLinks: task.deliverableLinks ?? []
      }));
    const metricTaskMap = new Map<
      string,
      {
        tactics: string[];
        evidence: Array<{ label: string; url: string }>;
      }
    >();

    const appendTaskToMetricMap = (summary: ReturnType<typeof mapTaskRowToSummary>) => {
      const keys = summary.relatedMetricKeys ?? [];
      if (!Array.isArray(keys) || keys.length === 0) return;
      for (const key of keys) {
        if (!key) continue;
        const existing = metricTaskMap.get(key) ?? { tactics: [], evidence: [] };
        if (summary.title && !existing.tactics.includes(summary.title)) existing.tactics.push(summary.title);
        (summary.deliverableLinks ?? []).forEach((link) => {
          if (!existing.evidence.some((e) => e.url === link.url)) existing.evidence.push(link);
        });
        metricTaskMap.set(key, existing);
      }
    };

    taskSummaries.forEach(appendTaskToMetricMap);

    const missingMetricKeys = revenueEngine.metrics
      .map((metric) => metric.metricKey)
      .filter((key) => !metricTaskMap.has(key));

    if (missingMetricKeys.length) {
      const supplemental = await fetchTasksLinkedToMetrics(missingMetricKeys, 8);
      supplemental.forEach((rows) => {
        rows.forEach((row) => appendTaskToMetricMap(mapTaskRowToSummary(row)));
      });
    }

    const revenueEngineEnriched = {
      ...revenueEngine,
      metrics: revenueEngine.metrics.map((metric) => {
        const base = metricByKey.get(metric.metricKey);
        const mapping = metricTaskMap.get(metric.metricKey);
        return {
          ...metric,
          ownerAgent: base?.owner_agent ?? null,
          tactics: mapping?.tactics?.slice(0, 3) ?? null,
          evidence: mapping?.evidence?.slice(0, 4) ?? null
        };
      })
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

    const previousTelemetry = await previousCommerceTelemetryPromise;
    const previousPayload = previousTelemetry && previousRangeForBaseline
      ? {
          range: { preset: responseRange.preset, startDate: previousRangeForBaseline.startDate, endDate: previousRangeForBaseline.endDate },
          woo: previousTelemetry.woo ?? undefined,
          ga4: previousTelemetry.ga4 ?? undefined,
          funnel: previousTelemetry.funnel ?? undefined
        }
      : null;

    const performanceBaseline =
      previousPayload && previousRangeForBaseline
        ? buildPerformanceBaselineSnapshot({
            range: responseRange,
            currentTelemetry: commercePayload,
            previousTelemetry: previousPayload
          })
        : null;

    return ok({
      ok: true,
      timestamp: new Date().toISOString(),
      range: responseRange,
      headerMetrics,
      executiveCommand,
      warRoom,
      revenueEngine: revenueEngineEnriched,
      brandPower,
      opportunityRadar,
      pipelinePanel,
      collectorTelemetry,
      survivalStrip,
      tasks: taskSummaries,
      proofOfWork: proofOfWorkEntries,
      schedulerJobs,
      schedulerSummary,
      agentSla,
      approvalBottlenecks,
      actionQueue,
      systemHealth,
      agentUpdateFeed,
      commerceTelemetry: commercePayload,
      websiteConversion: websiteSnapshot,
      metaAds: metaSnapshot,
      changeInsights,
      performanceBaseline,
      executiveSummary: localArtifacts.executiveSummary,
      socialIntelligence: socialSnapshot,
      cloudflare: cloudflareSnapshot,
      leadIntelligence: localArtifacts.leadSnapshot,
      agentStatusPanel: localArtifacts.agentStatus,
      automationStatusPanel: localArtifacts.automationStatus,
      dataSourceAccess: localArtifacts.dataSourceMatrix,
      topActions: localArtifacts.topActions,
      blockedItems: localArtifacts.blockedItems,
      agentKpis,
      ideaBoard: {
        columns: ideaBoard,
        linkedTasks: ideaBoardLinkedTasks,
        recentComments: (recentIdeaComments as IdeaCommentRow[]).map((c) => ({
          id: c.id,
          ideaId: c.idea_id,
          commenter: c.commenter,
          comment: c.comment,
          createdAt: c.created_at
        }))
      },
      ceoQuestionDesk,
      industryPulse: industryPulseResult?.snapshot
        ? {
            day: industryPulseResult.snapshot.day,
            refreshedAtIso: industryPulseResult.snapshot.refreshedAtIso,
            items: industryPulseResult.snapshot.items.map((item) => ({
              id: item.id,
              day: industryPulseResult.snapshot.day,
              source: item.source,
              headline: item.headline,
              summary: item.summary,
              collabIdea: item.collabIdea,
              whyNow: item.whyNow,
              contactName: item.contactName,
              contactEmail: item.contactEmail,
               contactEmailSource: item.contactEmailSource,
              contactConfidence: item.contactConfidence,
              contactStatus: item.contactStatus,
              sourceUrl: item.sourceUrl
            }))
          }
        : undefined
    });
  } catch (error) {
    console.error("overview error raw", error);
    console.error("overview error json", JSON.stringify(error, null, 2));
    return serverError("Failed to load overview", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

function buildCollectorTelemetry(rows: CollectorRow[]): CollectorTelemetrySnapshot {
  const safeRows = Array.isArray(rows) ? rows : [];
  const totalRecords = safeRows.length;
  const wooRecords = safeRows.filter((row) => (row.source ?? "").toLowerCase() === "woocommerce_orders");
  const manualRecords = totalRecords - wooRecords.length;
  const estimatedValueUsd = roundCurrency(
    safeRows.reduce((sum, row) => sum + Number(row.estimated_value ?? 0), 0)
  );

  const tierCounts = ensureKeys(
    countOccurrences(safeRows.map((row) => (row.tier ?? "Unknown").toUpperCase())),
    ["A", "B"]
  );
  const priorityCounts = ensureKeys(countOccurrences(safeRows.map((row) => priorityLabel(row.priority))), ["critical", "high", "medium", "unknown"]);
  const relationshipCounts = ensureKeys(
    countOccurrences(safeRows.map((row) => normalizeRelationship(row.relationship_status))),
    ["active", "recent", "quiet", "dormant"]
  );

  const wooSliceValueUsd = roundCurrency(
    wooRecords.reduce((sum, row) => sum + Number(row.estimated_value ?? 0), 0)
  );

  const touchIsos = safeRows
    .map((row) => row.last_touch_at ?? row.last_outreach_at ?? null)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).toISOString())
    .sort();
  const newestTouch = touchIsos[touchIsos.length - 1] ?? null;
  const oldestTouch = touchIsos[0] ?? null;
  const freshnessDays = newestTouch ? Math.round(((Date.now() - new Date(newestTouch).getTime()) / 86400000) * 10) / 10 : null;
  const freshnessDaysRounded = freshnessDays != null ? Math.max(0, Math.round(freshnessDays)) : null;
  const freshnessCopy = freshnessDaysRounded != null ? `Most recent touch ${freshnessDaysRounded}d ago` : "Most recent touch —";

  const lastImportedAt = wooRecords
    .map((row) => row.updated_at ?? row.last_touch_at ?? row.last_outreach_at ?? null)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).toISOString())
    .sort()
    .pop() ?? null;

  const status = wooRecords.length > 0 ? "PARTIAL" : "BROKEN";
  const statusLabel = wooRecords.length > 0 ? "PARTIAL · Woo import · stale touchpoints" : "BROKEN · collectors unavailable";
  const statusDetail = wooRecords.length > 0 ? "Imported slice only; touchpoints remain stale" : "No collector datasets loaded";

  return {
    status,
    statusLabel,
    statusDetail,
    freshnessCopy,
    totals: {
      totalRecords,
      wooRecords: wooRecords.length,
      manualRecords,
      estimatedValueUsd
    },
    wooSliceValueUsd,
    tiers: tierCounts,
    priorities: priorityCounts,
    relationships: relationshipCounts,
    lastTouch: {
      newest: newestTouch,
      oldest: oldestTouch,
      freshnessDays,
      freshnessDaysRounded
    },
    lastImportedAt,
    sourceNote: `${wooRecords.length} WooCommerce imports + ${manualRecords} manual records. No outreach implied.`
  };
}

function countOccurrences(values: Array<string | null | undefined>) {
  return values.reduce<Record<string, number>>((acc, value) => {
    const key = (value ?? "unknown").trim();
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function ensureKeys(counts: Record<string, number>, keys: string[]) {
  const next = { ...counts };
  keys.forEach((key) => {
    if (!(key in next)) next[key] = 0;
  });
  return next;
}

function priorityLabel(score: number | null | undefined) {
  if (score === 3) return "critical";
  if (score === 2) return "high";
  if (score === 1) return "medium";
  if (score === 0) return "low";
  return "unknown";
}

function normalizeRelationship(status: string | null | undefined) {
  if (!status) return "unknown";
  const normalized = status.toLowerCase();
  if (normalized.includes("active")) return "active";
  if (normalized.includes("recent")) return "recent";
  if (normalized.includes("dormant")) return "dormant";
  if (normalized.includes("quiet")) return "quiet";
  return normalized;
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}
