import { createOrUpdateAlert, makeAlertDedupeKey, resolveAlertByKey } from "./alerting";
import { escalateCeoQuestion, getCeoQuestions } from "@/lib/supabase/queries";

type DbCeoQuestionRow = {
  id: string;
  asked_by: string | null;
  question: string | null;
  due_at: string | null;
  status: string | null;
};

/**
 * Avery question desk:
 * - If a question is due/overdue and still open at escalation_level=avery, escalate to keegan.
 * - Always mirror escalations into system_alerts so they show up in the dashboard.
 */
export async function runAveryQuestionEscalations() {
  const nowIso = new Date().toISOString();
  const { items } = await getCeoQuestions({ status: "open", escalationLevel: "avery", limit: 200 });
  const rows = (items ?? []) as DbCeoQuestionRow[];
  const due = rows.filter((q) => q.due_at && q.due_at <= nowIso);

  let escalated = 0;
  let alertsCreatedOrUpdated = 0;

  for (const q of due) {
    const dedupeKey = makeAlertDedupeKey(["ceo_question", q.id]);

    await escalateCeoQuestion({ id: q.id as string, escalationLevel: "keegan", escalatedBy: "scheduler" });
    escalated++;

    const result = await createOrUpdateAlert({
      alertType: "ceo_question",
      severity: "high",
      title: "CEO question needs Keegan",
      summary: `${q.asked_by}: ${q.question}`,
      relatedAgentKey: q.asked_by ?? null,
      dedupeKey
    });
    if (result.action !== "unchanged") alertsCreatedOrUpdated++;
  }

  // If nothing is due, clear any prior rollup alert.
  const rollupKey = makeAlertDedupeKey(["ceo_question", "rollup"]);
  if (!due.length) {
    await resolveAlertByKey(rollupKey);
  } else {
    const result = await createOrUpdateAlert({
      alertType: "ceo_question",
      severity: "high",
      title: "CEO questions due",
      summary: `${due.length} CEO question(s) due; escalated to Keegan.`,
      dedupeKey: rollupKey
    });
    if (result.action !== "unchanged") alertsCreatedOrUpdated++;
  }

  return { dueCount: due.length, escalated, alertsCreatedOrUpdated };
}
