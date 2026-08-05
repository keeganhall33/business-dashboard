import type { ProductionSourceRegistryEntry } from "@/lib/external-intelligence/config/production-source-registry.contract";
import type { SourceEligibilityResult } from "@/lib/external-intelligence/config/evaluate-source-eligibility";
import type { SourceSchedulePolicy } from "@/lib/external-intelligence/collection/scheduling/source-schedule-policy";

/**
 * Fail-closed schedule enablement guard.
 *
 * A schedule must remain disabled unless:
 * - source is currently eligible now
 * - implementation is operational
 * - environment is approved (captured in eligibility universal blockers)
 * - legal/access requirements satisfied (captured in eligibility universal blockers)
 */
export function canEnableScheduleNow(input: {
  schedule: SourceSchedulePolicy;
  source: ProductionSourceRegistryEntry;
  eligibility: SourceEligibilityResult;
}): { allowed: boolean; blocking_reasons: string[] } {
  const blocking: string[] = [];

  if (!input.eligibility.allowed_now) blocking.push("eligibility_not_allowed_now");

  if (input.source.implementation_status !== "operational") {
    blocking.push("implementation_not_operational");
  }

  // Schedule policy enablement flag must not override eligibility.
  if (!input.schedule.enabled) blocking.push("schedule_disabled");

  return { allowed: blocking.length === 0, blocking_reasons: blocking.sort((a, b) => a.localeCompare(b)) };
}
