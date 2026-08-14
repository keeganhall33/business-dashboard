import { z } from "zod";

// Fixture-only, deterministic performance intelligence contracts.
// IMPORTANT: This slice does not run live measurements. It only classifies
// already-available snapshot signals (or preserves UNKNOWN when unavailable).

export const WEBSITE_PERFORMANCE_SNAPSHOT_VERSION_V1 = "WebsitePerformanceSnapshotV1" as const;
export const PERFORMANCE_OPPORTUNITY_VERSION_V1 = "PerformanceOpportunityV1" as const;

export const WebsitePerformanceSnapshotV1Schema = z
  .object({
    v: z.literal(WEBSITE_PERFORMANCE_SNAPSHOT_VERSION_V1),
    capturedAt: z.string(),
    rootUrl: z.string(),

    // Signal availability state (do not fabricate).
    state: z.enum(["OK", "UNKNOWN"]).default("UNKNOWN"),

    signals: z
      .object({
        brokenInternalLinks: z
          .object({
            count: z.number().int().min(0).nullable(),
            exampleUrls: z.array(z.string()).default([])
          })
          .strict(),
        missingAlt: z
          .object({
            count: z.number().int().min(0).nullable(),
            examplePageUrls: z.array(z.string()).default([])
          })
          .strict(),
        duplicateTitles: z
          .object({
            count: z.number().int().min(0).nullable(),
            examplePageUrls: z.array(z.string()).default([])
          })
          .strict(),
        duplicateMetaDescriptions: z
          .object({
            count: z.number().int().min(0).nullable(),
            examplePageUrls: z.array(z.string()).default([])
          })
          .strict()
      })
      .strict()
  })
  .strict();
export type WebsitePerformanceSnapshotV1 = z.infer<typeof WebsitePerformanceSnapshotV1Schema>;

export const PerformanceOpportunityV1Schema = z
  .object({
    v: z.literal(PERFORMANCE_OPPORTUNITY_VERSION_V1),
    id: z.string(),
    kind: z.enum([
      "BROKEN_INTERNAL_LINKS",
      "MISSING_ALT_TEXT",
      "DUPLICATE_TITLES",
      "DUPLICATE_META_DESCRIPTIONS"
    ]),
    title: z.string(),
    severity: z.enum(["HIGH", "MEDIUM", "LOW"]),

    // Preserve UNKNOWN explicitly when inputs are missing or snapshot is UNKNOWN.
    signalState: z.enum(["KNOWN", "UNKNOWN"]),
    count: z.number().int().min(0).nullable(),

    details: z
      .object({
        exampleUrls: z.array(z.string()).default([]),
        notes: z.array(z.string()).default([])
      })
      .strict()
  })
  .strict();
export type PerformanceOpportunityV1 = z.infer<typeof PerformanceOpportunityV1Schema>;

