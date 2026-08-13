import { deepFreeze } from "@/lib/external-intelligence/config/freeze";
import { loadProductionSourceRegistryV1 } from "@/lib/external-intelligence/config/load-production-source-registry";
import {
  classifyAvailabilityV1,
  classifySourceTierV1,
  type SourceAvailabilityV1,
  type SourceTierClassificationV1
} from "@/lib/external-intelligence/source-tier/source-tier-registry";

export type SourceHealthState =
  | "not_configured"
  | "disabled"
  | "blocked"
  | "healthy"
  | "due"
  | "overdue"
  | "stale"
  | "credential_missing"
  | "terms_expired"
  | "access_revoked"
  | "repeated_failure";

export type SourceHealthRecord = {
  source_id: string;
  source_config_version: string;
  health_state: SourceHealthState;
  blocker_codes: string[];
  warning_codes: string[];
  evaluated_at: string;

  // Read-only enrichment (does not affect selection outcomes).
  source_tier: SourceTierClassificationV1;
  availability: SourceAvailabilityV1;
  freshness: { expected_cadence: string; freshness_threshold: string } | null;
};

/**
 * Deterministic daily watchdog evaluation.
 * B2: does not enqueue collection; produces health records only.
 */
export function evaluateDailyWatchdogV1(input: {
  now_iso: string;
  // Provided status facts; B2 does not execute collectors.
  schedule_enabled_by_source_id: Record<string, boolean>;
  allowed_now_by_source_id: Record<string, boolean>;
  adapter_operational_by_source_id: Record<string, boolean>;
}): SourceHealthRecord[] {
  const { file: registry } = loadProductionSourceRegistryV1();
  const now = input.now_iso;

  const out: SourceHealthRecord[] = [];

  for (const s of registry.sources.slice().sort((a, b) => a.source_id.localeCompare(b.source_id))) {
    const blockers: string[] = [];

    const scheduleEnabled = input.schedule_enabled_by_source_id[s.source_id] ?? false;
    const allowedNow = input.allowed_now_by_source_id[s.source_id] ?? false;
    const adapterOperational = input.adapter_operational_by_source_id[s.source_id] ?? false;

    if (!s.enabled) blockers.push("source_disabled");
    if (!allowedNow) blockers.push("not_eligible_now");
    if (!adapterOperational) blockers.push("adapter_not_operational");

    let health_state: SourceHealthState = "healthy";
    if (!s.enabled) health_state = "disabled";
    else if (!allowedNow || !adapterOperational) health_state = "blocked";
    else if (!scheduleEnabled) health_state = "not_configured";

    out.push({
      source_id: s.source_id,
      source_config_version: s.source_config_version,
      health_state,
      blocker_codes: blockers.slice().sort((a, b) => a.localeCompare(b)),
      warning_codes: [],
      evaluated_at: now,

      source_tier: classifySourceTierV1(s),
      availability: classifyAvailabilityV1(s),
      freshness: s.expected_cadence && s.freshness_threshold ? { expected_cadence: s.expected_cadence, freshness_threshold: s.freshness_threshold } : null
    });
  }

  return deepFreeze(out);
}
