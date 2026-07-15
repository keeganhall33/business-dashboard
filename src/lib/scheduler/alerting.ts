import {
  createSystemAlert,
  getOpenAlertByDedupeKey,
  incrementAlertEscalation,
  resolveSystemAlert
} from "../supabase/queries.ts";

export type AlertSeverity = "critical" | "high" | "medium" | "low";

export type AlertInput = {
  alertType: string;
  severity: AlertSeverity;
  title: string;
  summary: string;
  relatedAgentKey?: string | null;
  relatedTaskId?: string | null;
  relatedMetricKey?: string | null;
  dedupeKey: string;
};

const severityRank: Record<AlertSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

export function makeAlertDedupeKey(parts: Array<string | null | undefined>) {
  return parts
    .filter((part): part is string => Boolean(part && part.trim().length > 0))
    .map((part) => part.trim().toLowerCase())
    .join(":");
}

export async function createOrUpdateAlert(input: AlertInput) {
  const existing = await getOpenAlertByDedupeKey(input.dedupeKey);

  if (!existing) {
    const created = await createSystemAlert({
      alertType: input.alertType,
      severity: input.severity,
      title: input.title,
      summary: input.summary,
      relatedAgentKey: input.relatedAgentKey,
      relatedTaskId: input.relatedTaskId,
      relatedMetricKey: input.relatedMetricKey,
      dedupeKey: input.dedupeKey
    });

    return { action: "created" as const, alert: created };
  }

  const currentSeverity = existing.severity as AlertSeverity;
  const shouldEscalate = severityRank[input.severity] > severityRank[currentSeverity];
  const summaryChanged = existing.summary !== input.summary;

  if (shouldEscalate || summaryChanged) {
    const updated = await incrementAlertEscalation(existing.id, {
      severity: shouldEscalate ? input.severity : currentSeverity,
      summary: input.summary
    });

    return {
      action: shouldEscalate ? ("escalated" as const) : ("refreshed" as const),
      alert: updated
    };
  }

  return { action: "unchanged" as const, alert: existing };
}

export async function resolveAlertByKey(dedupeKey: string) {
  const resolved = await resolveSystemAlert(dedupeKey);
  return {
    action: resolved.length > 0 ? ("resolved" as const) : ("noop" as const),
    resolvedCount: resolved.length
  };
}
