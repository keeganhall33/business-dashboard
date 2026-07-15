import type {
  DashboardActionItem,
  DashboardOverviewResponse,
  ExecutiveBrief,
  Opportunity,
  TelemetryHealth,
  TelemetryMetadata,
  TelemetrySource,
  TrendComparison,
  TelemetryHealthStatus
} from "@/lib/types/dashboard";

const SOURCES: TelemetrySource[] = ["woo", "ga4", "funnelkit", "meta"];

export type ExecutiveDriver = {
  id: string;
  title: string;
  summary: string;
  supporting: string[];
  confidence: string;
  tone: string;
  caveat?: string | null;
};

export type ExecutiveActionPlan = {
  id: string;
  priority: string;
  title: string;
  impact: string;
  confidence: string;
  owner: string | null;
  evidence: string;
  due: string | null;
  weight: number;
};

export type DataConfidenceRow = {
  source: TelemetrySource;
  status: string;
  freshness: string;
  coverage: string;
  lastSuccess: string | null;
  warning: string | null;
  includesPartialDay: boolean;
};

export type DataConfidenceSummary = {
  rows: DataConfidenceRow[];
  overall: { label: string; tone: string };
  includesPartialDay: boolean;
};

export function buildExecutiveDrivers(trends: TrendComparison[], limit = 3): ExecutiveDriver[] {
  if (!trends?.length) return [];
  const sorted = [...trends].sort((a, b) => scoreTrend(b) - scoreTrend(a));
  const claimed = new Set<string>();
  const drivers: ExecutiveDriver[] = [];

  for (const trend of sorted) {
    if (drivers.length >= limit) break;
    if (claimed.has(trend.id)) continue;
    const bucketKey = normalizeMetric(trend.metric);
    const cluster = sorted.filter((item) => !claimed.has(item.id) && normalizeMetric(item.metric) === bucketKey);
    if (!cluster.length) continue;
    const primary = cluster[0];
    claimed.add(primary.id);
    const supporting: string[] = [];
    for (const extra of cluster.slice(1)) {
      if (supporting.length >= 2) break;
      claimed.add(extra.id);
      supporting.push(`${extra.label} ${describeChange(extra)}`);
    }

    drivers.push({
      id: primary.id,
      title: `${primary.label} ${primary.direction === "down" ? "decline" : primary.direction === "up" ? "growth" : "steady"}`,
      summary: describeChange(primary),
      supporting,
      confidence: trendConfidence(primary),
      tone: toneClass(primary),
      caveat: primary.caveat ?? null
    });
  }

  return drivers;
}

export function buildExecutiveActions(data: DashboardOverviewResponse, limit = 7): ExecutiveActionPlan[] {
  const rows: ExecutiveActionPlan[] = [];

  (data.topActions ?? []).forEach((item, idx) => {
    rows.push({
      id: `top-${idx}`,
      priority: derivePriority(item),
      title: item.title,
      impact: item.detail ?? "Clarify expected impact",
      confidence: toneToConfidence(item.tone),
      owner: item.owner ?? null,
      evidence: item.status ?? "Top action",
      due: formatDue(item.dueAt),
      weight: priorityWeight(derivePriority(item)) + 2
    });
  });

  addPipelineActions(rows, data.pipelinePanel?.deals ?? []);
  addSchedulerAction(rows, data);
  addTelemetryActions(rows, data);
  addMarketingActions(rows, data);

  rows.sort((a, b) => b.weight - a.weight);
  return rows.slice(0, limit);
}

export function buildDataConfidence(metadata?: Partial<Record<TelemetrySource, TelemetryMetadata>> | null, health?: Partial<Record<TelemetrySource, TelemetryHealth>> | null, brief?: ExecutiveBrief | null): DataConfidenceSummary {
  const rows = SOURCES.map((source) => buildConfidenceRow(source, metadata?.[source], health?.[source]));
  const includesPartialDay = brief?.pacificWindow?.includesPartialDay ?? rows.some((row) => row.includesPartialDay);
  const overall = deriveOverallConfidence(rows);
  return { rows, includesPartialDay, overall };
}

export function summarizeExecutiveStatus(brief: ExecutiveBrief | null | undefined, fallbackRange: { startDate: string; endDate: string }) {
  const sentence = buildStatusSentence(brief);
  const pacificWindow = brief?.pacificWindow ?? fallbackRange;
  const confidence = deriveStatusConfidence(brief);
  const rangeLabel = formatPacificRange(pacificWindow);
  const includesPartialDay = Boolean(brief?.pacificWindow?.includesPartialDay);
  return { sentence, rangeLabel, confidence, includesPartialDay };
}

function addPipelineActions(rows: ExecutiveActionPlan[], deals: Opportunity[]) {
  const overdue = deals.filter((deal) => deal.nextStepDueAt && new Date(deal.nextStepDueAt).getTime() < Date.now());
  overdue.slice(0, 2).forEach((deal, idx) => {
    rows.push({
      id: `pipeline-${deal.id}-${idx}`,
      priority: "P1",
      title: `Advance ${deal.name || "pipeline"} (${deal.opportunityType})`,
      impact: `Unlock ${formatCurrency(deal.valueEstimate)} in pipeline value`,
      confidence: "High",
      owner: deal.ownerAgent ?? "Pipeline",
      evidence: `Next step overdue since ${formatDue(deal.nextStepDueAt) ?? "—"}`,
      due: "Now",
      weight: 90 - idx * 5
    });
  });
}

function addSchedulerAction(rows: ExecutiveActionPlan[], data: DashboardOverviewResponse) {
  const summary = data.schedulerSummary;
  if (!summary) return;
  if (summary.status === "LIVE" && summary.failingCount === 0) return;
  rows.push({
    id: "scheduler",
    priority: summary.status === "BROKEN" ? "P1" : "P2",
    title: summary.cronEnabled ? "Stabilize automation cadence" : "Re-enable cron",
    impact: summary.failingCount ? `${summary.failingCount} job(s) failing or stale` : "Automation off slows telemetry",
    confidence: summary.status === "BROKEN" ? "High" : "Medium",
    owner: "Operations",
    evidence: summary.source ?? "Scheduler telemetry",
    due: summary.status === "BROKEN" ? "Today" : "This week",
    weight: summary.status === "BROKEN" ? 95 : 70
  });
}

function addTelemetryActions(rows: ExecutiveActionPlan[], data: DashboardOverviewResponse) {
  const health = data.telemetryHealth;
  if (!health) return;
  const degraded = Object.values(health).filter((entry) => entry && entry.status !== "healthy");
  degraded.slice(0, 2).forEach((entry, idx) => {
    if (!entry) return;
    rows.push({
      id: `telemetry-${entry.source}-${idx}`,
      priority: entry.status === "critical" ? "P1" : "P2",
      title: `Repair ${entry.source.toUpperCase()} feed`,
      impact: entry.reasons?.[0] ?? "Data freshness at risk",
      confidence: entry.status === "critical" ? "High" : "Medium",
      owner: "Telemetry",
      evidence: entry.warningCodes?.join(", ") || "Health monitor",
      due: entry.status === "critical" ? "Now" : "24h",
      weight: entry.status === "critical" ? 92 : 75
    });
  });
}

function addMarketingActions(rows: ExecutiveActionPlan[], data: DashboardOverviewResponse) {
  const trends = data.executiveInsights?.trends ?? [];
  const inefficient = trends.filter((trend) => trend.metric.toLowerCase().includes("roas") || trend.metric.toLowerCase().includes("conversion"));
  inefficient.slice(0, 2).forEach((trend, idx) => {
    rows.push({
      id: `marketing-${trend.id}-${idx}`,
      priority: trend.direction === "down" ? "P1" : "P2",
      title: `Correct ${trend.label}`,
      impact: describeChange(trend),
      confidence: trend.magnitude === "major" ? "High" : "Medium",
      owner: "Marketing",
      evidence: trend.caveat ?? `${trend.metric} trend`,
      due: "This week",
      weight: trend.direction === "down" ? 80 : 60
    });
  });
}

function derivePriority(action: DashboardActionItem) {
  if (action.tone === "danger") return "P1";
  if (action.tone === "warning") return "P2";
  return "P3";
}

function toneToConfidence(tone: DashboardActionItem["tone"]) {
  if (tone === "danger") return "High";
  if (tone === "warning") return "Medium";
  return "Info";
}

function priorityWeight(priority: string) {
  if (priority === "P1") return 80;
  if (priority === "P2") return 60;
  return 40;
}

function formatCurrency(value: number | null | undefined) {
  if (!value) return "$0";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatDue(iso: string | null | undefined) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function describeChange(trend: TrendComparison) {
  const percent = trend.percentChange != null ? `${trend.percentChange >= 0 ? "+" : ""}${trend.percentChange.toFixed(1)}%` : null;
  const absolute = trend.absoluteChange != null ? formatNumber(trend.absoluteChange) : null;
  const directionWord = trend.direction === "down" ? "down" : trend.direction === "up" ? "up" : "flat";
  if (percent && absolute) {
    return `${percent} (${absolute}) ${directionWord} vs prior`;
  }
  if (percent) return `${percent} ${directionWord} vs prior`;
  if (absolute) return `${absolute} ${directionWord} vs prior`;
  return `${directionWord} vs prior`;
}

function trendConfidence(trend: TrendComparison) {
  if (trend.magnitude === "major") return "High";
  if (trend.magnitude === "moderate") return "Medium";
  return "Low";
}

function toneClass(trend: TrendComparison) {
  if (trend.direction === "down") return "border-rose-500/40 text-rose-200";
  if (trend.direction === "up") return "border-emerald-500/40 text-emerald-200";
  return "border-zinc-600 text-zinc-200";
}

function scoreTrend(trend: TrendComparison) {
  const magnitudeScore = trend.magnitude === "major" ? 3 : trend.magnitude === "moderate" ? 2 : 1;
  const percent = Math.abs(trend.percentChange ?? 0);
  return magnitudeScore * 100 + percent;
}

function normalizeMetric(metric: string) {
  const cleaned = metric.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  const [head] = cleaned.split("_");
  return head || cleaned;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

function buildConfidenceRow(source: TelemetrySource, metadata?: TelemetryMetadata, health?: TelemetryHealth): DataConfidenceRow {
  return {
    source,
    status: describeStatus(health),
    freshness: describeFreshness(metadata?.freshnessStatus),
    coverage: describeCoverage(metadata?.coverageStatus),
    lastSuccess: metadata?.generatedAt ? formatTimestamp(metadata.generatedAt) : null,
    warning: deriveWarning(metadata, health),
    includesPartialDay: Boolean(metadata?.includesPartialDay)
  };
}

function describeStatus(health?: TelemetryHealth | null) {
  if (!health) return "Unknown";
  if (health.status === "healthy") return "Healthy";
  if (health.status === "warning") return "Warning";
  if (health.status === "critical") return "Critical";
  return "Unknown";
}

function describeFreshness(status?: TelemetryMetadata["freshnessStatus"]) {
  switch (status) {
    case "fresh":
      return "Fresh";
    case "stale":
      return "Stale";
    case "no_data":
      return "No data";
    default:
      return "Unknown";
  }
}

function describeCoverage(status?: TelemetryMetadata["coverageStatus"]) {
  switch (status) {
    case "complete":
      return "Complete";
    case "partial":
      return "Partial";
    default:
      return "Unknown";
  }
}

function formatTimestamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function deriveWarning(metadata?: TelemetryMetadata, health?: TelemetryHealth | null) {
  if (health?.reasons?.length) return health.reasons[0];
  if (metadata?.warningCodes?.length) return metadata.warningCodes[0];
  return null;
}

function deriveOverallConfidence(rows: DataConfidenceRow[]) {
  const score = rows.reduce((sum, row) => {
    if (row.status === "Critical") return sum + 0;
    if (row.status === "Warning") return sum + 1;
    if (row.status === "Healthy") return sum + 2;
    return sum + 1;
  }, 0);
  const maxScore = rows.length * 2;
  const ratio = maxScore === 0 ? 0 : score / maxScore;
  if (ratio >= 0.75) return { label: "High confidence", tone: "border-emerald-500/40 text-emerald-200" };
  if (ratio >= 0.45) return { label: "Moderate confidence", tone: "border-amber-500/40 text-amber-200" };
  return { label: "Low confidence", tone: "border-rose-500/40 text-rose-200" };
}

function buildStatusSentence(brief: ExecutiveBrief | null | undefined) {
  if (!brief) {
    return "Business steady with no verified anomalies in the current window.";
  }

  const topChange = brief.topChanges?.[0];
  const statusWord = topChange ? describeDirection(topChange.direction, topChange.magnitude) : "steady";
  const cause = topChange ? `${topChange.label} ${topChange.direction === "down" ? "fell" : topChange.direction === "up" ? "rose" : "held"}` : "no major shifts";
  const action = brief.attention ? `Recommended action: ${brief.attention}` : "Continue monitoring fundamentals.";

  return `Business ${statusWord}. ${cause}. ${action}`;
}

function describeDirection(direction: TrendComparison["direction"], magnitude: TrendComparison["magnitude"] | undefined) {
  if (direction === "flat") return "steady";
  const mag = magnitude ?? "minor";
  if (direction === "up") {
    return mag === "major" ? "growing fast" : mag === "moderate" ? "accelerating" : "ticking up";
  }
  return mag === "major" ? "under pressure" : mag === "moderate" ? "softening" : "easing";
}

function deriveStatusConfidence(brief: ExecutiveBrief | null | undefined) {
  if (!brief || !brief.sourceFreshness?.length) return "medium";
  const totalWeight = brief.sourceFreshness.reduce((sum, item) => sum + statusWeight(item.status), 0);
  const maxWeight = brief.sourceFreshness.length * 3;
  const ratio = maxWeight === 0 ? 0 : totalWeight / maxWeight;
  if (ratio >= 0.75) return "high";
  if (ratio >= 0.45) return "medium";
  return "low";
}

function statusWeight(status: TelemetryHealthStatus) {
  switch (status) {
    case "healthy":
      return 3;
    case "warning":
      return 2;
    case "critical":
      return 0;
    default:
      return 1;
  }
}

function formatPacificRange(range: { startDate: string; endDate: string }) {
  const start = formatPacificDate(range.startDate);
  const end = formatPacificDate(range.endDate);
  return `${start} – ${end} PT`;
}

function formatPacificDate(date: string) {
  const parsed = Date.parse(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed)) return date;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/Los_Angeles"
  }).format(parsed);
}
