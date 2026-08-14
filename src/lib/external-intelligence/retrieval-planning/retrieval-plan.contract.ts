import { z } from "zod";

import type {
  ExternalSourceUniverseEntryV1,
  SourceAvailabilityV1,
  SourceTierClassificationV1
} from "@/lib/external-intelligence/source-tier/source-tier-registry";

// Deterministic, planning-only contract.
// This does NOT perform external acquisition and must never imply a live fetch.

export const RETRIEVAL_PLAN_VERSION_V1 = "RetrievalPlanV1" as const;
export const RETRIEVAL_INTENT_VERSION_V1 = "RetrievalIntentV1" as const;

export type RetrievalIntentStatusV1 = "PLANNED" | "SKIP_UNAVAILABLE" | "SOURCE_COVERAGE_GAP";

export type RetrievalIntentV1 = {
  v: typeof RETRIEVAL_INTENT_VERSION_V1;
  source_id: string;

  // Metadata-only enrichment.
  tier: SourceTierClassificationV1;
  availability: SourceAvailabilityV1;
  freshness: ExternalSourceUniverseEntryV1["freshness"];

  // Planning output.
  status: RetrievalIntentStatusV1;
  access_mode: "READ_ONLY";
  expected_evidence_type: string;
  freshness_expectation: string;
  reason_tags: string[];
};

export type RetrievalPlanV1 = {
  v: typeof RETRIEVAL_PLAN_VERSION_V1;
  planned_at: string;
  intents: RetrievalIntentV1[];
};

const SourceTierClassificationV1Schema = z.union([
  z
    .object({
      kind: z.literal("TIER"),
      tier: z.enum([
        "TIER_A_FIRST_PARTY_OR_OFFICIAL_API",
        "TIER_B_PRIMARY_EXTERNAL",
        "TIER_C_HIGH_QUALITY_SECONDARY",
        "TIER_D_OPEN_WEB_DISCOVERY",
        "TIER_E_PAID_OR_LICENSED"
      ]),
      reasons: z.array(z.string()).default([])
    })
    .strict(),
  z
    .object({
      kind: z.literal("SOURCE_COVERAGE_GAP"),
      missing: z.array(z.string()).default([]),
      reasons: z.array(z.string()).default([])
    })
    .strict()
]);

const SourceAvailabilityV1Schema = z.enum(["available", "degraded", "unavailable", "unknown"]);

export const RetrievalIntentV1Schema = z
  .object({
    v: z.literal(RETRIEVAL_INTENT_VERSION_V1),
    source_id: z.string().min(3).max(128),

    tier: SourceTierClassificationV1Schema,
    availability: SourceAvailabilityV1Schema,
    freshness: z
      .object({
        expected_cadence: z.string(),
        freshness_threshold: z.string()
      })
      .strict()
      .nullable(),

    status: z.enum(["PLANNED", "SKIP_UNAVAILABLE", "SOURCE_COVERAGE_GAP"]),
    access_mode: z.literal("READ_ONLY"),
    expected_evidence_type: z.string().min(1).max(64),
    freshness_expectation: z.string().min(1).max(64),
    reason_tags: z.array(z.string().min(1).max(64)).default([])
  })
  .strict();

export const RetrievalPlanV1Schema = z
  .object({
    v: z.literal(RETRIEVAL_PLAN_VERSION_V1),
    planned_at: z.string(),
    intents: z.array(RetrievalIntentV1Schema)
  })
  .strict();

