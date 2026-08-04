import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

import { canonicalJsonSha256Hex } from "@/lib/fusion-v1/canonical-json";

export const STRATEGIC_CONSTRAINTS_SCHEMA_VERSION = "strategic_constraints_v1" as const;

export const prohibitedActionCategorySchema = z.enum([
  "discounting",
  "mass_market_pricing",
  "open_edition_expansion",
  "unauthorized_scraping",
  "impersonation"
]);

export const blockedDomainSchema = z.enum(["meta_attribution"]);

export const strategicConstraintsV1Schema = z
  .object({
    schema_version: z.literal(STRATEGIC_CONSTRAINTS_SCHEMA_VERSION),
    config_version: z.string().min(1),
    premium_positioning: z
      .object({
        protected: z.literal(true),
        prohibited_action_categories: z.array(prohibitedActionCategorySchema).min(1),
        notes: z.array(z.string()).default([])
      })
      .strict(),
    scarcity: z
      .object({
        protected: z.literal(true),
        prohibited_action_categories: z.array(prohibitedActionCategorySchema).min(1),
        notes: z.array(z.string()).default([])
      })
      .strict(),
    licensing_ip: z
      .object({
        requires_review: z.literal(true),
        notes: z.array(z.string()).default([])
      })
      .strict(),
    blocked_domains: z.array(blockedDomainSchema),
    capacity: z
      .object({
        available_hours_today: z.number().nullable(),
        available_discretionary_budget_cents_today: z.number().nullable()
      })
      .strict(),
    prohibited_action_categories: z.array(prohibitedActionCategorySchema),
    mutually_exclusive_action_groups: z.record(z.string(), z.array(z.string()).min(2)).default({})
  })
  .strict();

export type StrategicConstraintsV1 = z.infer<typeof strategicConstraintsV1Schema>;

function normalizeForHash(input: StrategicConstraintsV1): StrategicConstraintsV1 {
  // Semantic equality: arrays represent sets for these fields.
  // Sort them so identical semantics hash identically.
  return {
    ...input,
    blocked_domains: [...input.blocked_domains].sort(),
    prohibited_action_categories: [...input.prohibited_action_categories].sort(),
    premium_positioning: {
      ...input.premium_positioning,
      prohibited_action_categories: [...input.premium_positioning.prohibited_action_categories].sort()
    },
    scarcity: {
      ...input.scarcity,
      prohibited_action_categories: [...input.scarcity.prohibited_action_categories].sort()
    },
    mutually_exclusive_action_groups: Object.fromEntries(
      Object.entries(input.mutually_exclusive_action_groups ?? {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, [...v].sort()])
    )
  };
}

export function parseStrategicConstraintsV1FromJsonString(json: string): {
  constraints: StrategicConstraintsV1;
  constraints_hash: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Strategic constraints JSON is malformed");
  }

  const constraints = strategicConstraintsV1Schema.parse(parsed);
  const normalized = normalizeForHash(constraints);
  const constraints_hash = canonicalJsonSha256Hex(normalized);
  return { constraints, constraints_hash };
}

export function loadStrategicConstraintsV1(input?: { repoRootDir?: string }): {
  constraints: StrategicConstraintsV1;
  constraints_hash: string;
  file_path: string;
} {
  const root = input?.repoRootDir ?? process.cwd();
  const file_path = path.join(root, "config/strategic_constraints_v1.json");
  const json = fs.readFileSync(file_path, "utf8");
  const { constraints, constraints_hash } = parseStrategicConstraintsV1FromJsonString(json);
  return { constraints, constraints_hash, file_path };
}
