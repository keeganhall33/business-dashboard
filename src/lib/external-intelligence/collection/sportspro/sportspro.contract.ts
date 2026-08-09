import { z } from "zod";

export const SPORTSPRO_SOURCE_ID = "sports_business.sportspro" as const;
export const SPORTSPRO_ALLOWED_HOST = "www.sportspro.com" as const;
export const SPORTSPRO_RSS_URL = "https://www.sportspro.com/feed/" as const;

export const SportsProRssItemSchema = z
  .object({
    canonical_url: z.string().url(),
    guid: z.string().min(1).max(256).nullable(),
    title: z.string().min(1).max(300),
    published_at_iso: z.string().min(1).nullable(),
    author: z.string().min(1).max(120).nullable(),
    categories: z.array(z.string().min(1).max(120)).max(24),
    excerpt: z.string().min(1).max(2000).nullable()
  })
  .strict();

export type SportsProRssItem = z.infer<typeof SportsProRssItemSchema>;

export const SportsProRssFeedSchema = z
  .object({
    feed_url: z.string().url(),
    feed_title: z.string().min(1).max(240).nullable(),
    items: z.array(SportsProRssItemSchema)
  })
  .strict();
