import { z } from "zod";

export const HOOPHALL_SOURCE_ID = "sports.basketball.hoophall.official" as const;
export const HOOPHALL_ALLOWED_HOST = "www.hoophall.com" as const;
export const HOOPHALL_NEWSROOM_URL = "https://www.hoophall.com/news/" as const;

export const HoophallNewsroomItemSchema = z
  .object({
    url: z.string().url(),
    headline: z.string().min(1).max(220),
    // Example: "Friday, August 07, 2026" (listing overline-title)
    listing_date_label: z.string().min(3).max(64).nullable(),
    // Short snippet from listing (not full article body).
    listing_description: z.string().min(1).max(1200).nullable()
  })
  .strict();

export type HoophallNewsroomItem = z.infer<typeof HoophallNewsroomItemSchema>;

export const HoophallNewsroomListingSchema = z
  .object({
    url: z.string().url(),
    items: z.array(HoophallNewsroomItemSchema)
  })
  .strict();

export type HoophallNewsroomListing = z.infer<typeof HoophallNewsroomListingSchema>;

export const HoophallArticleDetailSchema = z
  .object({
    url: z.string().url(),
    headline: z.string().min(1).max(220),
    // Example: "July 15, 2026" (detail overline-title)
    published_label: z.string().min(3).max(64).nullable(),
    // Minimal excerpt to support deterministic qualification.
    excerpt: z.string().min(1).max(1600).nullable()
  })
  .strict();

export type HoophallArticleDetail = z.infer<typeof HoophallArticleDetailSchema>;

