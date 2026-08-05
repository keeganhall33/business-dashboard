import { z } from "zod";

import { deepFreeze } from "@/lib/external-intelligence/config/freeze";
import { sha256CanonicalJson } from "@/lib/external-intelligence/hashing/content-hash";

const SourceIdSchema = z.string().min(3).max(128);
const VersionSchema = z.string().min(1).max(64);

export const CadenceTypeSchema = z.enum([
  "hourly",
  "every_n_hours",
  "daily",
  "weekly",
  "monthly",
  "event_driven",
  "manual",
  "disabled"
]);

export const RetryPolicySchema = z
  .object({
    strategy: z.enum(["none", "bounded_exponential"]),
    maximum_attempts: z.number().int().min(0).max(20),
    base_delay_seconds: z.number().int().min(0).max(3600),
    max_delay_seconds: z.number().int().min(0).max(24 * 3600)
  })
  .strict();

export const BackoffPolicySchema = z
  .object({
    jitter: z.enum(["none", "full"]),
    cooldown_seconds: z.number().int().min(0).max(7 * 24 * 3600)
  })
  .strict();

export const RateLimitBudgetSchema = z
  .object({
    maximum_requests_per_minute: z.number().int().min(0).max(600),
    maximum_requests_per_day: z.number().int().min(0).max(100000)
  })
  .strict();

export const SourceSchedulePolicySchema = z
  .object({
    schema_version: z.literal("source_schedule_policy_v1"),

    source_id: SourceIdSchema,
    source_config_version: VersionSchema,

    schedule_policy_version: VersionSchema,

    governing_registry_hash: z.string().min(64).max(64),
    governing_policy_refs: z.array(
      z
        .object({
          policy_name: z.string().min(1).max(64),
          semantic_version: z.string().min(1).max(64),
          content_hash: z.string().min(64).max(64)
        })
        .strict()
    ),

    cadence_type: CadenceTypeSchema,
    cadence_interval: z.number().int().min(0).max(24 * 30),

    preferred_collection_window: z
      .object({
        start_hour_local: z.number().int().min(0).max(23),
        end_hour_local: z.number().int().min(0).max(23)
      })
      .strict(),

    timezone: z.string().min(1).max(64),

    freshness_sla: z.string().min(1).max(32),
    maximum_staleness: z.string().min(1).max(32),

    retry_policy: RetryPolicySchema,
    backoff_policy: BackoffPolicySchema,
    timeout_seconds: z.number().int().min(1).max(300),

    rate_limit_budget: RateLimitBudgetSchema,

    overlap_policy: z.enum(["no_overlap", "allow_overlap"]),
    deduplication_window: z.string().min(1).max(32),

    priority: z.enum(["low", "medium", "high"]),

    enabled: z.boolean(),
    eligibility_fingerprint: z.string().min(64).max(64),

    created_at: z.string().datetime(),
    review_by: z.string().min(1).max(64),

    schedule_content_hash: z.string().min(64).max(64)
  })
  .strict();

export type SourceSchedulePolicy = z.infer<typeof SourceSchedulePolicySchema>;

export function computeSourceSchedulePolicyHash(policy: Omit<SourceSchedulePolicy, "schedule_content_hash">): string {
  return sha256CanonicalJson({ v: "source-schedule-policy/v1", ...policy });
}

export function parseSourceSchedulePolicy(json: unknown): SourceSchedulePolicy {
  const parsed = SourceSchedulePolicySchema.parse(json);

  // Deterministic ordering.
  parsed.governing_policy_refs = parsed.governing_policy_refs
    .slice()
    .sort((a, b) => `${a.policy_name}@${a.semantic_version}`.localeCompare(`${b.policy_name}@${b.semantic_version}`));

  // Fail-closed: content hash must match.
  const { schedule_content_hash, ...rest } = parsed;
  const expected = computeSourceSchedulePolicyHash(rest);
  if (schedule_content_hash !== expected) {
    throw new Error(`schedule_content_hash_mismatch:${parsed.source_id}`);
  }

  return deepFreeze(parsed);
}
