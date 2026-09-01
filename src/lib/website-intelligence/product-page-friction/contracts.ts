import { z } from "zod";

export const PRODUCT_PAGE_FRICTION_SNAPSHOT_VERSION_V1 = "ProductPageFrictionSnapshotV1" as const;

export const ProductPageFunnelStageV1Schema = z.enum([
  "PRODUCT_PAGE_INTEREST",
  "VALUE_SCARCITY_COMPREHENSION",
  "CHECKOUT_PROGRESSION",
  "TRACKING_COVERAGE"
]);
export type ProductPageFunnelStageV1 = z.infer<typeof ProductPageFunnelStageV1Schema>;

export const ProductPageTruthStateV1Schema = z.enum(["KNOWN", "INFERRED", "UNKNOWN", "STALE", "CONFLICTED"]);
export type ProductPageTruthStateV1 = z.infer<typeof ProductPageTruthStateV1Schema>;

export const ProductPageFreshnessV1Schema = z.enum(["FRESH", "STALE", "UNKNOWN"]);
export type ProductPageFreshnessV1 = z.infer<typeof ProductPageFreshnessV1Schema>;

export const ProductPageSeverityV1Schema = z.enum(["HIGH", "MEDIUM", "LOW", "UNKNOWN"]);
export type ProductPageSeverityV1 = z.infer<typeof ProductPageSeverityV1Schema>;

export const ProductPageConfidenceV1Schema = z.enum(["HIGH", "MEDIUM", "LOW", "UNKNOWN"]);
export type ProductPageConfidenceV1 = z.infer<typeof ProductPageConfidenceV1Schema>;

export const ProductPageFrictionEvidenceV1Schema = z
  .object({
    id: z.string(),
    funnel_stage: ProductPageFunnelStageV1Schema,
    observed_signal: z.string(),
    evidence_source: z.string(),
    source_freshness: ProductPageFreshnessV1Schema,
    truth_state: ProductPageTruthStateV1Schema,
    confidence: ProductPageConfidenceV1Schema,
    severity: ProductPageSeverityV1Schema,
    plausible_mechanism: z.string().nullable(),
    mechanism_truth_state: z.enum(["HYPOTHESIS", "UNKNOWN", "NOT_APPLICABLE"]),
    next_measurement: z.string(),
    recommended_test: z.string(),
    notes: z.array(z.string()).default([])
  })
  .strict();
export type ProductPageFrictionEvidenceV1 = z.infer<typeof ProductPageFrictionEvidenceV1Schema>;

export const ProductPageFrictionSnapshotV1Schema = z
  .object({
    v: z.literal(PRODUCT_PAGE_FRICTION_SNAPSHOT_VERSION_V1),
    generated_at: z.string(),
    source_mode: z.literal("DETERMINISTIC_FIXTURE"),
    page_scope: z.string(),
    evidence: z.array(ProductPageFrictionEvidenceV1Schema),
    projection: z
      .object({
        WHAT_CHANGED: z.string(),
        WHY_IT_MATTERS: z.string(),
        TOP_FRICTION: z.string(),
        NEXT_BEST_TEST: z.string(),
        CONFIDENCE: ProductPageConfidenceV1Schema,
        TRUTH_STATE: ProductPageTruthStateV1Schema
      })
      .strict(),
    guardrails: z
      .object({
        observed_evidence_separate_from_hypothesis: z.literal(true),
        no_live_site_change: z.literal(true),
        tracking_gap_preserved_as_unknown: z.literal(true)
      })
      .strict()
  })
  .strict();
export type ProductPageFrictionSnapshotV1 = z.infer<typeof ProductPageFrictionSnapshotV1Schema>;
