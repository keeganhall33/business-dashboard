import { z } from "zod";

import { deepFreeze } from "@/lib/external-intelligence/config/freeze";
import { sha256CanonicalJson } from "@/lib/external-intelligence/hashing/content-hash";

export const ProjectClassSchema = z.enum([
  "major_institutional_partnership",
  "athlete_or_talent_collaboration",
  "original_artwork_no_formal_partnership",
  "print_content_or_promo_opportunity",
  "today_relevance"
]);

export type ProjectClass = z.infer<typeof ProjectClassSchema>;

export const AlertLeadTimePolicySchema = z
  .object({
    schema_version: z.literal("alert_lead_time_policy_v1"),
    policy_version: z.string().min(1).max(64),

    horizons_days: z.array(z.number().int().min(0).max(3650)).min(1),

    horizons_by_project_class: z.record(ProjectClassSchema, z.array(z.number().int().min(0).max(3650)).min(1)),

    suppression_policy: z
      .object({
        schema_version: z.literal("alert_suppression_policy_v1"),
        policy_version: z.string().min(1).max(64)
      })
      .strict(),

    policy_content_hash: z.string().min(64).max(64)
  })
  .strict();

export type AlertLeadTimePolicy = z.infer<typeof AlertLeadTimePolicySchema>;

export function computeAlertLeadTimePolicyHash(policy: Omit<AlertLeadTimePolicy, "policy_content_hash">): string {
  return sha256CanonicalJson({ v: "alert-lead-time-policy/v1", ...policy });
}

export function parseAlertLeadTimePolicy(json: unknown): AlertLeadTimePolicy {
  const parsed = AlertLeadTimePolicySchema.parse(json);

  // Deterministic ordering.
  parsed.horizons_days = [...new Set(parsed.horizons_days)].sort((a, b) => a - b);
  for (const k of Object.keys(parsed.horizons_by_project_class) as ProjectClass[]) {
    parsed.horizons_by_project_class[k] = [...new Set(parsed.horizons_by_project_class[k]!)].sort((a, b) => a - b);
  }

  const { policy_content_hash, ...rest } = parsed;
  const expected = computeAlertLeadTimePolicyHash(rest);
  if (policy_content_hash !== expected) throw new Error("alert_lead_time_policy_hash_mismatch");

  return deepFreeze(parsed);
}
