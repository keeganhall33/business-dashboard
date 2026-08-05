import "@/lib/server-only";

import { SportsMilestoneAlertsRepository } from "@/lib/external-intelligence/milestones/persistence/milestone-alerts.repository";

export async function runExpiredMilestoneAlertCleanupV1(input: { now_iso: string; signal?: AbortSignal }) {
  if (input.signal?.aborted) throw new Error("handler_aborted");
  const repo = new SportsMilestoneAlertsRepository();
  const invalidated = await repo.invalidateObsoletePending();
  if (input.signal?.aborted) throw new Error("handler_aborted");
  const expired = await repo.expirePending({ now_iso: input.now_iso });
  if (input.signal?.aborted) throw new Error("handler_aborted");
  return { invalidated, expired };
}
