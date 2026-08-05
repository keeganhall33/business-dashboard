import "@/lib/server-only";

import type { AlertLeadTimePolicy } from "@/lib/external-intelligence/milestones/alert-policy";
import type { SportsMilestoneCalendar } from "@/lib/external-intelligence/milestones/contracts";
import { buildMilestoneHorizonAlertsV2 } from "@/lib/external-intelligence/milestones/horizon-engine";
import { SportsMilestoneAlertsRepository } from "@/lib/external-intelligence/milestones/persistence/milestone-alerts.repository";

export type DailyMilestoneHorizonScanResult = {
  inserted_count: number;
  existing_count: number;
  invalidated_count: number;
  expired_count: number;
};

/**
 * B2 daily horizon scan (no notifications):
 * - generate deterministic alerts from approved lead-time policy
 * - upsert (idempotent)
 * - invalidate obsolete pending alerts after milestone corrections
 * - expire pending alerts at explicit timestamp
 */
export async function runDailyMilestoneHorizonScanV1(input: {
  now_ymd: string;
  now_iso: string;
  calendar: SportsMilestoneCalendar;
  lead_time_policy: AlertLeadTimePolicy;
  repo?: SportsMilestoneAlertsRepository;
}): Promise<DailyMilestoneHorizonScanResult> {
  const repo = input.repo ?? new SportsMilestoneAlertsRepository();

  const alerts = buildMilestoneHorizonAlertsV2({
    calendar: input.calendar,
    lead_time_policy: input.lead_time_policy,
    now_ymd: input.now_ymd
  });

  const upsert = await repo.upsertFromHorizonAlerts({
    alerts,
    lead_time_policy: input.lead_time_policy,
    now_ymd: input.now_ymd
  });

  const invalidated_count = await repo.invalidateObsoletePending();
  const expired_count = await repo.expirePending({ now_iso: input.now_iso });

  return {
    inserted_count: upsert.inserted_count,
    existing_count: upsert.existing_count,
    invalidated_count,
    expired_count
  };
}
