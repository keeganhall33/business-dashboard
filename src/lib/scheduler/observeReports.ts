import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { EnforcementMode } from "./enforcement";
import { classifyAlertTitle, type AlertEligibility } from "./alertPolicy";

export type SimulatedAlert = {
  action: "create" | "resolve";
  title: string;
  severity?: string;
  dedupeKey?: string;
};

export type SimulatedTask = {
  title: string;
  reason?: string;
  severity?: string;
};

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"] as const;
const SEVERITY_RANK = Object.fromEntries(
  SEVERITY_ORDER.map((sev, idx) => [sev, SEVERITY_ORDER.length - idx])
);

type ObserveReport = {
  jobKey: string;
  mode: EnforcementMode;
  generatedAt: string;
  simulatedAlertCount: number;
  simulatedTaskCount: number;
  severityBreakdown: Record<string, number>;
  suppressedBySeverity: Record<string, number>;
  topIssues: string[];
  resolveSummary?: string | null;
  needsManualReview: boolean;
  notes: string[];
  sampleAlerts: SimulatedAlert[];
  sampleTasks: SimulatedTask[];
  eligibleAlerts: Array<{ title: string; severity: string; reason?: string }>;
  groupedAlerts: Array<{ title: string; severity: string; count: number }>;
  manualReviewAlerts: Array<{ title: string; severity: string; reason?: string }>;
  blockedAlerts: Array<{ title: string; severity: string; reason: string }>;
  suppressedSummary?: string;
  classificationCounts: Record<AlertEligibility, number>;
};

function normalizeSeverity(severity?: string) {
  if (!severity) return "info";
  const lower = severity.toLowerCase();
  return (SEVERITY_ORDER as readonly string[]).includes(lower) ? lower : "info";
}

function summarizeAlerts(alerts: SimulatedAlert[]) {
  const severityBreakdown: Record<string, number> = Object.fromEntries(
    SEVERITY_ORDER.map((sev) => [sev, 0])
  );
  const suppressedBySeverity: Record<string, number> = Object.fromEntries(
    SEVERITY_ORDER.map((sev) => [sev, 0])
  );

  type Group = { title: string; severity: string; count: number };
  const createGroups = new Map<string, Group>();
  let resolveCount = 0;

  for (const alert of alerts) {
    const severity = normalizeSeverity(alert.severity);
    if (alert.action === "create") {
      severityBreakdown[severity] = (severityBreakdown[severity] ?? 0) + 1;
      const key = `${severity}:${alert.title}`;
      const group = createGroups.get(key) ?? { title: alert.title, severity, count: 0 };
      group.count += 1;
      createGroups.set(key, group);
    } else {
      resolveCount += 1;
    }
  }

  const sortedGroups = Array.from(createGroups.values()).sort((a, b) => {
    if (SEVERITY_RANK[b.severity] !== SEVERITY_RANK[a.severity]) {
      return SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    }
    return b.count - a.count;
  });

  const limit = 5;
  const topGroups = sortedGroups.slice(0, limit);
  const suppressedGroups = sortedGroups.slice(limit);
  for (const group of suppressedGroups) {
    suppressedBySeverity[group.severity] = (suppressedBySeverity[group.severity] ?? 0) + group.count;
  }

  const topIssues = topGroups.map((group) => `${group.title} (${group.severity}) x${group.count}`);
  const sampleAlerts = topGroups.map((group) => ({
    action: "create" as const,
    title: group.title,
    severity: group.severity
  }));

  const resolveSummary = resolveCount > 0 ? `Would resolve ${resolveCount} existing alerts.` : null;
  const needsManualReview =
    topGroups.some((group) => group.severity === "critical" || group.severity === "high") ||
    suppressedGroups.some((group) => group.severity === "critical" || group.severity === "high");

  const eligibleAlerts: Array<{ title: string; severity: string; reason?: string }> = [];
  const groupedAlerts: Array<{ title: string; severity: string; count: number }> = [];
  const manualReviewAlerts: Array<{ title: string; severity: string; reason?: string }> = [];
  const blockedAlerts: Array<{ title: string; severity: string; reason: string }> = [];
  const classificationCounts: Record<AlertEligibility, number> = {
    eligible_for_alert_only: 0,
    grouped_only: 0,
    manual_review_only: 0,
    suppressed: 0,
    blocked: 0
  };

  function pushClassification(group: Group, classification: AlertEligibility, reason?: string) {
    classificationCounts[classification] = (classificationCounts[classification] ?? 0) + group.count;
    if (classification === "eligible_for_alert_only") {
      eligibleAlerts.push({ title: group.title, severity: group.severity, reason });
    } else if (classification === "grouped_only" || classification === "suppressed") {
      groupedAlerts.push({ title: group.title, severity: group.severity, count: group.count });
    } else if (classification === "manual_review_only") {
      manualReviewAlerts.push({ title: group.title, severity: group.severity, reason });
    } else if (classification === "blocked") {
      blockedAlerts.push({ title: group.title, severity: group.severity, reason: reason ?? "Blocked" });
    }
  }

  for (const group of topGroups) {
    const { classification, reason } = classifyAlertTitle(group.title);
    pushClassification(group, classification, reason);
  }

  for (const group of suppressedGroups) {
    const { classification } = classifyAlertTitle(group.title);
    classificationCounts[classification] = (classificationCounts[classification] ?? 0) + group.count;
    if (classification === "eligible_for_alert_only") {
      pushClassification(group, "grouped_only", "Exceeds top issue cap");
    } else {
      pushClassification(group, classification);
    }
  }

  return {
    severityBreakdown,
    suppressedBySeverity,
    topIssues,
    sampleAlerts,
    resolveSummary,
    needsManualReview,
    eligibleAlerts,
    groupedAlerts,
    manualReviewAlerts,
    blockedAlerts,
    suppressedSummary:
      suppressedGroups.length > 0
        ? `${suppressedGroups.length} additional alert categories suppressed.`
        : undefined,
    classificationCounts
  };
}

export async function writeObserveReport(jobKey: string, options: {
  mode: EnforcementMode;
  alerts?: SimulatedAlert[];
  tasks?: SimulatedTask[];
  notes?: string[];
}) {
  const alerts = [...(options.alerts ?? [])];
  const tasks = [...(options.tasks ?? [])];
  const generatedAt = new Date().toISOString();
  const notes = [...(options.notes ?? [])];
  const {
    severityBreakdown: aggregatedSeverity,
    suppressedBySeverity,
    topIssues: aggregatedTopIssues,
    sampleAlerts,
    resolveSummary,
    needsManualReview: needsManualReviewFromAlerts,
    eligibleAlerts,
    groupedAlerts,
    manualReviewAlerts,
    blockedAlerts,
    suppressedSummary,
    classificationCounts
  } = summarizeAlerts(alerts);

  const needsManualReview =
    needsManualReviewFromAlerts || tasks.length > 0 || alerts.length > 30;

  if (alerts.length > 30) {
    notes.push(`High alert volume (${alerts.length}) detected; consider grouping before enabling alerts.`);
  }
  if (tasks.length > 0) {
    notes.push(`${tasks.length} tasks would have been created; review before enabling task creation.`);
  }
  if (resolveSummary) {
    notes.push(resolveSummary);
  }
  const suppressedTotal = Object.values(suppressedBySeverity).reduce((sum, count) => sum + count, 0);
  if (suppressedTotal > 0) {
    const suppressedDetails = Object.entries(suppressedBySeverity)
      .filter(([, count]) => count > 0)
      .map(([sev, count]) => `${sev}:${count}`)
      .join(", ");
    notes.push(`Suppressed ${suppressedTotal} additional alerts (${suppressedDetails}).`);
  }

  const report: ObserveReport = {
    jobKey,
    mode: options.mode,
    generatedAt,
    simulatedAlertCount: alerts.length,
    simulatedTaskCount: tasks.length,
    severityBreakdown: aggregatedSeverity,
    suppressedBySeverity,
    topIssues: aggregatedTopIssues,
    resolveSummary,
    needsManualReview: needsManualReview || needsManualReviewFromAlerts,
    notes,
    sampleAlerts,
    sampleTasks: tasks.slice(0, 5),
    eligibleAlerts,
    groupedAlerts,
    manualReviewAlerts,
    blockedAlerts,
    suppressedSummary,
    classificationCounts
  };

  const supabase = getSupabaseServerClient();
  const key = `scheduler_observe_${jobKey}`;
  await supabase
    .from("system_state")
    .upsert({ key, value_json: report }, { onConflict: "key" });
  return report;
}
