import "@/lib/server-only";

import { createSystemAlert, getOpenAlertByDedupeKey } from "@/lib/supabase/queries";

export async function createDedupedOperationalAlertV1(input: {
  dedupeKey: string;
  severity: "low" | "medium" | "high";
  title: string;
  summary: string;
}) {
  const existing = await getOpenAlertByDedupeKey(input.dedupeKey);
  if (existing) return { created: false };
  await createSystemAlert({
    alertType: "orchestration_failure",
    severity: input.severity,
    title: input.title,
    summary: input.summary,
    dedupeKey: input.dedupeKey
  });
  return { created: true };
}
