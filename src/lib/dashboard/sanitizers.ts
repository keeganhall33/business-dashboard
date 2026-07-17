import { computeRevenuePerVisitor } from "../metrics/revenue.ts";
import { isActivePipelineStatus } from "../pipeline/status.ts";
import { formatRangeLabel } from "../date/range.ts";
import type { ActionQueue, ActionQueueItem, ActionQueueSection, DashboardOverviewResponse, HeaderMetric } from "../types/dashboard";

const MAX_QUEUE_ITEM_AGE_DAYS = 21;
const WAR_ROOM_MAX_AGE_DAYS = 7;

export function sanitizeDashboardData(data: DashboardOverviewResponse): DashboardOverviewResponse {
  const pipelineDeals = data.pipelinePanel?.deals ?? [];
  const sanitizedPipelineDeals = pipelineDeals.filter((deal) => isActivePipelineStatus(deal.status));
  const topOpportunities = data.opportunityRadar?.topOpportunities ?? [];
  const sanitizedTopOpps = topOpportunities.filter((deal) => isActivePipelineStatus(deal.status));
  const warRoomEntries = (data.warRoom?.entries ?? []).filter((entry) => isRecent(entry.createdAt, WAR_ROOM_MAX_AGE_DAYS)).slice(0, 5);
  const proofOfWork = (data.proofOfWork ?? []).filter((entry) => isRecent(entry.completedAt, 21));
  const sanitizedQueue = data.actionQueue ? sanitizeActionQueue(data.actionQueue) : data.actionQueue;

  return {
    ...data,
    actionQueue: sanitizedQueue,
    pipelinePanel: data.pipelinePanel
      ? {
          ...data.pipelinePanel,
          deals: sanitizedPipelineDeals
        }
      : data.pipelinePanel,
    opportunityRadar: data.opportunityRadar
      ? {
          ...data.opportunityRadar,
          topOpportunities: sanitizedTopOpps
        }
      : data.opportunityRadar,
    warRoom: data.warRoom
      ? {
          ...data.warRoom,
          entries: warRoomEntries
        }
      : data.warRoom,
    proofOfWork
  };
}

export function sanitizeExecutiveInsights(insights: DashboardOverviewResponse["executiveInsights"]): {
  insights: DashboardOverviewResponse["executiveInsights"];
  partialDayNotice: string | null;
} {
  if (!insights) {
    return { insights: null, partialDayNotice: null };
  }
  const includesPartialDay = Boolean(insights.brief?.pacificWindow?.includesPartialDay);
  if (!includesPartialDay) {
    return { insights, partialDayNotice: null };
  }
  const safeWindow = insights.brief?.pacificWindow;
  const verifiedLabel = safeWindow ? formatRangeLabel(safeWindow, { includeYear: true }) : null;
  const notice = verifiedLabel
    ? `Data still ingesting — trends are preliminary. Last fully verified window ended ${verifiedLabel}.`
    : "Data still ingesting — trends are preliminary until the current day closes.";
  return {
    insights: { ...insights, trends: [] },
    partialDayNotice: notice
  };
}

export function ensureRevenuePerVisitorMetric(data: DashboardOverviewResponse): HeaderMetric[] {
  const metrics = Array.isArray(data.headerMetrics) ? data.headerMetrics.map((metric) => ({ ...metric })) : [];
  const hasMetric = metrics.some((metric) => metric.metricKey === "revenue_per_visitor");
  const revenueCandidates = [
    data.websiteConversion?.wooCommerce?.netRevenue,
    data.commerceTelemetry?.woo?.summary?.revenue,
    data.websiteConversion?.wooCommerce?.grossOrderRevenue
  ];
  const sessionCandidates = [
    data.websiteConversion?.ga4?.sessions,
    data.commerceTelemetry?.ga4?.summary?.sessions
  ];
  const revenue = firstNumber(revenueCandidates);
  const sessions = firstNumber(sessionCandidates);
  const value = computeRevenuePerVisitor(revenue, [sessions]);

  if (value == null) {
    return metrics;
  }

  const numericValue = Number(value.toFixed(2));

  if (hasMetric) {
    return metrics.map((metric) =>
      metric.metricKey === "revenue_per_visitor"
        ? { ...metric, currentValue: numericValue, unit: metric.unit ?? "usd_precise" }
        : metric
    );
  }

  return [
    ...metrics,
    {
      metricKey: "revenue_per_visitor",
      metricName: "Revenue per Visitor",
      category: "commerce",
      currentValue: numericValue,
      targetValue: 0,
      deltaPercent: null,
      status: "warning",
      unit: "usd_precise",
      ownerAgent: null,
      measuredAt: data.timestamp ?? null
    }
  ];
}

export function filterActionNoise(action: { title?: string | null; nextStep?: string | null }) {
  const normalized = action.title?.trim().toLowerCase() ?? "";
  const genericTitles = [
    "close the revenue gap",
    "increase monthly revenue",
    "increase aov",
    "increase conversion rate"
  ];
  if (genericTitles.includes(normalized)) {
    return false;
  }
  if (!action.nextStep || !action.nextStep.trim()) {
    return false;
  }
  const evidence = (action as { evidence?: string | null }).evidence;
  if (!evidence || !evidence.trim()) {
    return false;
  }
  return true;
}

function firstNumber(values: Array<number | null | undefined>) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value !== 0) {
      return value;
    }
  }
  return null;
}

function isRecent(iso: string | null | undefined, days: number) {
  if (!iso) return false;
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return false;
  const ageDays = (Date.now() - parsed) / 86400000;
  return ageDays <= days;
}

function sanitizeActionQueue(queue: ActionQueue): ActionQueue {
  const sanitizeSection = (section: ActionQueueSection): ActionQueueSection => {
    const items = (section.items ?? []).filter(isExecutableQueueItem);
    return { ...section, items };
  };

  return {
    ...queue,
    needsApprovalTasks: sanitizeSection(queue.needsApprovalTasks),
    pendingPlans: sanitizeSection(queue.pendingPlans),
    decisionsDue: sanitizeSection(queue.decisionsDue),
    invoicesToSend: sanitizeSection(queue.invoicesToSend)
  };
}

function isExecutableQueueItem(item: ActionQueueItem) {
  if (!item) return false;
  const created = item.createdAt ?? (item as { submittedAt?: string | null }).submittedAt ?? null;
  if (!created || !isRecent(created, MAX_QUEUE_ITEM_AGE_DAYS)) return false;
  if (!item.title || !item.summary) return false;
  const status = ((item as { status?: string | null }).status ?? item.priority ?? "").toString().toLowerCase();
  if (["on_hold", "completed", "invalid"].includes(status)) return false;
  const title = item.title.toLowerCase();
  if (title.includes("upper deck") || title.includes("topps")) return false;
  return true;
}
