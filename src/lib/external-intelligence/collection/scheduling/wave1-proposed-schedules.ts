import { deepFreeze } from "@/lib/external-intelligence/config/freeze";
import type { PolicyRef } from "@/lib/external-intelligence/contracts/policy-ref";
import { sha256CanonicalJson } from "@/lib/external-intelligence/hashing/content-hash";
import type { SourceSchedulePolicy } from "@/lib/external-intelligence/collection/scheduling/source-schedule-policy";

function policyPins(policy_refs: PolicyRef[]) {
  return policy_refs
    .map((p) => ({ policy_name: p.policy_name, semantic_version: p.semantic_version, content_hash: p.content_hash }))
    .slice()
    .sort((a, b) => `${a.policy_name}@${a.semantic_version}`.localeCompare(`${b.policy_name}@${b.semantic_version}`));
}

function makePolicy(
  input: Omit<SourceSchedulePolicy, "schema_version" | "schedule_content_hash" | "governing_policy_refs"> & {
    governing_policy_refs: PolicyRef[];
  }
): SourceSchedulePolicy {
  const base = {
    ...input,
    schema_version: "source_schedule_policy_v1" as const,
    governing_policy_refs: policyPins(input.governing_policy_refs)
  };
  const schedule_content_hash = sha256CanonicalJson({ v: "source-schedule-policy/v1", ...base });
  return deepFreeze({ ...base, schedule_content_hash });
}

/**
 * Proposed, non-active cadences for Wave 1. These are planning inputs only.
 *
 * Every policy here is enabled=false and must remain so until eligibility + adapter readiness is proven.
 */
export function buildWave1ProposedSchedulePolicies(input: {
  registry_hash: string;
  policy_refs: PolicyRef[];
  eligibility_fingerprint_by_source_id: Record<string, string>;
  created_at: string;
}): SourceSchedulePolicy[] {
  const common = {
    schedule_policy_version: "v1.0.0",
    governing_registry_hash: input.registry_hash,
    governing_policy_refs: input.policy_refs,
    preferred_collection_window: { start_hour_local: 6, end_hour_local: 10 },
    timezone: "America/Los_Angeles",
    retry_policy: {
      strategy: "bounded_exponential" as const,
      maximum_attempts: 3,
      base_delay_seconds: 30,
      max_delay_seconds: 15 * 60
    },
    backoff_policy: { jitter: "full" as const, cooldown_seconds: 15 * 60 },
    timeout_seconds: 20,
    rate_limit_budget: { maximum_requests_per_minute: 30, maximum_requests_per_day: 5000 },
    overlap_policy: "no_overlap" as const,
    deduplication_window: "24h",
    priority: "medium" as const,
    enabled: false,
    created_at: input.created_at,
    review_by: "ops"
  };

  const getFp = (id: string) => input.eligibility_fingerprint_by_source_id[id] ?? sha256CanonicalJson({ v: "missing-fp", id });

  return [
    // Fast-changing sources (proposed cadence after approval)
    makePolicy({
      ...common,
      source_id: "sports_business.boardroom",
      source_config_version: "v1.0.0",
      cadence_type: "every_n_hours",
      cadence_interval: 6,
      freshness_sla: "24h",
      maximum_staleness: "72h",
      rate_limit_budget: { maximum_requests_per_minute: 10, maximum_requests_per_day: 200 },
      eligibility_fingerprint: getFp("sports_business.boardroom")
    }),
    makePolicy({
      ...common,
      source_id: "sports.major_leagues.official",
      source_config_version: "v1.0.0",
      cadence_type: "every_n_hours",
      cadence_interval: 6,
      freshness_sla: "24h",
      maximum_staleness: "72h",
      rate_limit_budget: { maximum_requests_per_minute: 10, maximum_requests_per_day: 200 },
      eligibility_fingerprint: getFp("sports.major_leagues.official")
    }),
    makePolicy({
      ...common,
      source_id: "ops.shipping.alerts",
      source_config_version: "v1.0.0",
      cadence_type: "every_n_hours",
      cadence_interval: 6,
      freshness_sla: "24h",
      maximum_staleness: "72h",
      rate_limit_budget: { maximum_requests_per_minute: 10, maximum_requests_per_day: 200 },
      eligibility_fingerprint: getFp("ops.shipping.alerts")
    }),

    // Moderate-change sources
    makePolicy({
      ...common,
      source_id: "search.google_trends",
      source_config_version: "v1.0.0",
      cadence_type: "daily",
      cadence_interval: 1,
      freshness_sla: "24h",
      maximum_staleness: "7d",
      rate_limit_budget: { maximum_requests_per_minute: 5, maximum_requests_per_day: 50 },
      eligibility_fingerprint: getFp("search.google_trends")
    }),
    makePolicy({
      ...common,
      source_id: "economics.fred",
      source_config_version: "v1.0.0",
      cadence_type: "weekly",
      cadence_interval: 1,
      freshness_sla: "30d",
      maximum_staleness: "90d",
      rate_limit_budget: { maximum_requests_per_minute: 10, maximum_requests_per_day: 200 },
      eligibility_fingerprint: getFp("economics.fred")
    }),
    makePolicy({
      ...common,
      source_id: "licensing.uspto.trademarks",
      source_config_version: "v1.0.0",
      cadence_type: "weekly",
      cadence_interval: 1,
      freshness_sla: "7d",
      maximum_staleness: "30d",
      rate_limit_budget: { maximum_requests_per_minute: 10, maximum_requests_per_day: 200 },
      eligibility_fingerprint: getFp("licensing.uspto.trademarks")
    }),

    // Calendar/milestones
    makePolicy({
      ...common,
      source_id: "calendar.sports.milestones",
      source_config_version: "v1.0.0",
      cadence_type: "monthly",
      cadence_interval: 1,
      freshness_sla: "30d",
      maximum_staleness: "180d",
      rate_limit_budget: { maximum_requests_per_minute: 1, maximum_requests_per_day: 5 },
      eligibility_fingerprint: getFp("calendar.sports.milestones")
    })
  ];
}
