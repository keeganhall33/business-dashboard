import { z } from "zod";

export const BOARDROOM_SOURCE_ID = "sports_business.boardroom" as const;
export const BOARDROOM_ALLOWED_HOST = "boardroom.tv" as const;
export const BOARDROOM_RSS_URL = "https://boardroom.tv/feed/" as const;

export const BoardroomRssItemSchema = z
  .object({
    canonical_url: z.string().url(),
    guid: z.string().min(1).max(256).nullable(),
    title: z.string().min(1).max(300),
    published_at_iso: z.string().datetime({ offset: true }).nullable(),
    author: z.string().min(1).max(120).nullable(),
    categories: z.array(z.string().min(1).max(120)),
    excerpt: z.string().min(1).max(2000).nullable(),
    rss_content_html: z.string().min(1).max(50_000).nullable()
  })
  .strict();

export type BoardroomRssItem = z.infer<typeof BoardroomRssItemSchema>;

export const BoardroomRssFeedSchema = z
  .object({
    feed_url: z.string().url(),
    feed_title: z.string().min(1).max(200).nullable(),
    items: z.array(BoardroomRssItemSchema)
  })
  .strict();

export type BoardroomRssFeed = z.infer<typeof BoardroomRssFeedSchema>;
