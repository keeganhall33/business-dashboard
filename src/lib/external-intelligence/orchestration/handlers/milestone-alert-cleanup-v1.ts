import "@/lib/server-only";

import { SportsMilestoneAlertsRepository } from "@/lib/external-intelligence/milestones/persistence/milestone-alerts.repository";

export async function runExpiredMilestoneAlertCleanupV1(input: { now_iso: string }) {
  const repo = new SportsMilestoneAlertsRepository();
  const invalidated = await repo.invalidateObsoletePending();
  const expired = await repo.expirePending({ now_iso: input.now_iso });
  return { invalidated, expired };
}

