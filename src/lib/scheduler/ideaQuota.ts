import { agentKeys } from "@/lib/types/requests";
import { getAgentDailyIdeaQuotaForDate } from "@/lib/supabase/queries";
import { createOrUpdateAlert, makeAlertDedupeKey, resolveAlertByKey } from "./alerting";
import type { EnforcementMode } from "@/lib/scheduler/enforcement";

type IdeaQuotaOptions = {
  date?: Date;
  source?: string;
  mode?: EnforcementMode;
};

export async function enforceDailyIdeaQuotas(input?: IdeaQuotaOptions) {
  const date = input?.date ?? new Date();
  const mode = input?.mode ?? "active";
  const allowAlerts = mode === "active";
  const rows = await getAgentDailyIdeaQuotaForDate({ date });
  const rowByAgent = new Map(rows.map((r) => [r.agent_key, r]));

  let alertsCreatedOrUpdated = 0;
  let alertsAttempted = 0;
  const missingAgents: string[] = [];
  const simulatedAlerts: Array<{ action: "create" | "resolve"; title: string; severity?: string }> = [];

  for (const agentKey of agentKeys) {
    const row = rowByAgent.get(agentKey);
    const met = row?.met_quota ?? false;
    const dedupeKey = makeAlertDedupeKey(["idea_quota", agentKey, date.toISOString().slice(0, 10)]);

    if (!met) {
      missingAgents.push(agentKey);
      alertsAttempted++;
      if (!allowAlerts) {
        simulatedAlerts.push({ action: "create", title: `Idea quota missed: ${agentKey}`, severity: "medium" });
      } else {
        const result = await createOrUpdateAlert({
          alertType: "idea_quota",
          severity: "medium",
          title: `Idea quota missed: ${agentKey}`,
          summary: `${agentKey} has not logged the daily idea quota for ${date.toISOString().slice(0, 10)} (required: 1).`,
          relatedAgentKey: agentKey,
          dedupeKey
        });
        if (result.action !== "unchanged") alertsCreatedOrUpdated++;
      }
    } else {
      alertsAttempted++;
      if (!allowAlerts) {
        simulatedAlerts.push({ action: "resolve", title: `Resolve idea quota alert: ${agentKey}`, severity: "info" });
      } else {
        await resolveAlertByKey(dedupeKey);
      }
    }
  }

  // A rollup alert makes it harder to miss at a glance.
  const rollupKey = makeAlertDedupeKey(["idea_quota", "rollup", date.toISOString().slice(0, 10)]);
  if (missingAgents.length) {
    alertsAttempted++;
    if (!allowAlerts) {
      simulatedAlerts.push({
        action: "create",
        title: "Daily idea quota missed",
        severity: missingAgents.length >= 2 ? "high" : "medium"
      });
    } else {
      const result = await createOrUpdateAlert({
        alertType: "idea_quota",
        severity: missingAgents.length >= 2 ? "high" : "medium",
        title: "Daily idea quota missed",
        summary: `Missing idea quota: ${missingAgents.join(", ")}.`,
        dedupeKey: rollupKey
      });
      if (result.action !== "unchanged") alertsCreatedOrUpdated++;
    }
  } else {
    alertsAttempted++;
    if (!allowAlerts) {
      simulatedAlerts.push({ action: "resolve", title: "Resolve idea quota rollup", severity: "info" });
    } else {
      await resolveAlertByKey(rollupKey);
    }
  }

  return {
    date: date.toISOString().slice(0, 10),
    missingAgents,
    alertsCreatedOrUpdated: allowAlerts ? alertsCreatedOrUpdated : 0,
    alertsAttempted,
    simulatedAlerts,
    mode
  };
}
