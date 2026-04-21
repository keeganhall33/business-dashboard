import { agentKeys } from "@/lib/types/requests";
import { getAgentDailyIdeaQuotaForDate } from "@/lib/supabase/queries";
import { createOrUpdateAlert, makeAlertDedupeKey, resolveAlertByKey } from "./alerting";

export async function enforceDailyIdeaQuotas(input?: { date?: Date; source?: string }) {
  const date = input?.date ?? new Date();
  const rows = await getAgentDailyIdeaQuotaForDate({ date });
  const rowByAgent = new Map(rows.map((r) => [r.agent_key, r]));

  let alertsCreatedOrUpdated = 0;
  const missingAgents: string[] = [];

  for (const agentKey of agentKeys) {
    const row = rowByAgent.get(agentKey);
    const met = row?.met_quota ?? false;
    const dedupeKey = makeAlertDedupeKey(["idea_quota", agentKey, date.toISOString().slice(0, 10)]);

    if (!met) {
      missingAgents.push(agentKey);
      const result = await createOrUpdateAlert({
        alertType: "idea_quota",
        severity: "medium",
        title: `Idea quota missed: ${agentKey}`,
        summary: `${agentKey} has not logged the daily idea quota for ${date.toISOString().slice(0, 10)} (required: 1).`,
        relatedAgentKey: agentKey,
        dedupeKey
      });
      if (result.action !== "unchanged") alertsCreatedOrUpdated++;
    } else {
      await resolveAlertByKey(dedupeKey);
    }
  }

  // A rollup alert makes it harder to miss at a glance.
  const rollupKey = makeAlertDedupeKey(["idea_quota", "rollup", date.toISOString().slice(0, 10)]);
  if (missingAgents.length) {
    const result = await createOrUpdateAlert({
      alertType: "idea_quota",
      severity: missingAgents.length >= 2 ? "high" : "medium",
      title: "Daily idea quota missed",
      summary: `Missing idea quota: ${missingAgents.join(", ")}.`,
      dedupeKey: rollupKey
    });
    if (result.action !== "unchanged") alertsCreatedOrUpdated++;
  } else {
    await resolveAlertByKey(rollupKey);
  }

  return {
    date: date.toISOString().slice(0, 10),
    missingAgents,
    alertsCreatedOrUpdated
  };
}
