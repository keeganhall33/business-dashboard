import { z } from "zod";

// Phase A public-read foundation contracts.
// Hard safety: no credentials, no mutation methods, metadata-only extraction.

export const WEBSITE_SNAPSHOT_VERSION_V1 = "WebsiteSnapshotV1" as const;
export const WEBSITE_PAGE_SNAPSHOT_VERSION_V1 = "WebsitePageSnapshotV1" as const;

export const WebsitePublicReadSafetyV1Schema = z
  .object({
    readOnly: z.literal(true),
    mutationDisabled: z.literal(true),
    credentialsUsed: z.literal(false),
    allowedMethods: z.array(z.enum(["GET", "HEAD", "OPTIONS"])).min(1)
  })
  .strict();
export type WebsitePublicReadSafetyV1 = z.infer<typeof WebsitePublicReadSafetyV1Schema>;

export const WebsitePageSnapshotV1Schema = z
  .object({
    v: z.literal(WEBSITE_PAGE_SNAPSHOT_VERSION_V1),
    url: z.string(),
    finalUrl: z.string().nullable(),
    status: z.number().int().nullable(),
    redirectedFrom: z.array(z.string()).default([]),

    // Minimal public metadata
    title: z.string().nullable(),
    metaDescription: z.string().nullable(),
    canonicalUrl: z.string().nullable(),
    h1: z.string().nullable(),

    // Deterministic summaries (avoid storing raw full HTML by default)
    textSummary: z.string().nullable(),

    internalLinks: z.array(z.string()).default([]),
    imageRefs: z
      .array(
        z
          .object({
            src: z.string(),
            alt: z.string().nullable(),
            missingAlt: z.boolean()
          })
          .strict()
      )
      .default([]),

    brokenInternalLinks: z.array(z.string()).default([])
  })
  .strict();
export type WebsitePageSnapshotV1 = z.infer<typeof WebsitePageSnapshotV1Schema>;

export const WebsiteSnapshotV1Schema = z
  .object({
    v: z.literal(WEBSITE_SNAPSHOT_VERSION_V1),
    capturedAt: z.string(),
    rootUrl: z.string(),

    safety: WebsitePublicReadSafetyV1Schema,

    crawl: z
      .object({
        seedUrls: z.array(z.string()).default([]),
        discoveredFrom: z.array(z.enum(["INPUT", "ROBOTS", "SITEMAP", "LINKS"])).default([]),
        maxPages: z.number().int().positive(),
        maxDepth: z.number().int().min(0),
        maxConcurrency: z.number().int().positive(),
        timeoutMs: z.number().int().positive(),
        stoppedReason: z.enum(["MAX_PAGES", "TIMEOUT", "NO_MORE_URLS", "ERROR"]).nullable()
      })
      .strict(),

    pages: z.array(WebsitePageSnapshotV1Schema),

    totals: z
      .object({
        pageCount: z.number().int().min(0),
        changedPageCount: z.number().int().min(0).default(0),
        brokenLinkCount: z.number().int().min(0),
        missingAltCount: z.number().int().min(0),
        duplicateTitleCount: z.number().int().min(0),
        duplicateMetaDescriptionCount: z.number().int().min(0)
      })
      .strict(),

    // Surface an explicit UNKNOWN state for incomplete foundations.
    state: z.enum(["OK", "UNKNOWN"]).default("UNKNOWN")
  })
  .strict();
export type WebsiteSnapshotV1 = z.infer<typeof WebsiteSnapshotV1Schema>;

