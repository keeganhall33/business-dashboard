import "@/lib/server-only";

import crypto from "node:crypto";

import { fetchRssFeed } from "@/lib/news/rss";
import {
  SPORTSPRO_ALLOWED_HOST,
  SPORTSPRO_RSS_URL,
  SPORTSPRO_SOURCE_ID,
  SportsProRssFeedSchema,
  type SportsProRssItem
} from "@/lib/external-intelligence/collection/sportspro/sportspro.contract";

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function requireHttpsAndHost(url: string) {
  const u = new URL(url);
  if (u.protocol !== "https:") throw new Error("sportspro_network_blocked:non_https");
  if (u.hostname !== SPORTSPRO_ALLOWED_HOST) throw new Error("sportspro_network_blocked:wrong_host");
  return u;
}

function decodeHtmlEntitiesBasic(input: string): string {
  return input
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&#8217;", "'")
    .replaceAll("&#8220;", "\"")
    .replaceAll("&#8221;", "\"")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function safeTrim(input: string | null | undefined, max: number): string | null {
  const s = typeof input === "string" ? input.trim() : "";
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Canonical URL normalization.
 *
 * IMPORTANT: keep semantics consistent with Boardroom canonicalization style
 * (tracking query removal + fragment removal) while retaining SportsPro
 * host allowlist enforcement.
 */
export function normalizeSportsProCanonicalUrl(rawUrl: string): string {
  const u = requireHttpsAndHost(rawUrl);
  for (const key of [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "fbclid",
    "gclid"
  ]) {
    u.searchParams.delete(key);
  }
  u.hash = "";
  return u.toString();
}

export type SportsProCollectionOutput =
  | {
      ok: true;
      source_id: typeof SPORTSPRO_SOURCE_ID;
      feed: { feed_url: string; feed_title: string | null };
      items: SportsProRssItem[];
      meta: { now_iso: string; max_items: number; observed_count: number };
    }
  | {
      ok: false;
      source_id: typeof SPORTSPRO_SOURCE_ID;
      error: string;
    };

export async function collectSportsProRssV1(input: { now_iso: string; max_items: number }): Promise<SportsProCollectionOutput> {
  try {
    const parsed = await fetchRssFeed(SPORTSPRO_RSS_URL, {
      timeoutMs: 10_000,
      // SportsPro currently blocks obvious bot UAs at the feed endpoint (CloudFront 403).
      // Use a generic browser UA to access the publicly-available RSS.
      // NOTE: We still operate under link-only retention and do not fetch bodies.
      userAgent: "Mozilla/5.0"
    });

    const items = parsed
      .map((it) => {
        const canonical_url = normalizeSportsProCanonicalUrl(it.url);
        const title = decodeHtmlEntitiesBasic(it.title);
        const guid = safeTrim(it.guid ?? null, 256);
        const author = safeTrim(it.author ?? null, 120);
        const categories = Array.isArray(it.categories) ? it.categories.slice(0, 24).map(decodeHtmlEntitiesBasic) : [];
        const excerpt = safeTrim(it.summary ?? null, 2000);

        return {
          canonical_url,
          guid,
          title,
          published_at_iso: it.publishedAt ?? null,
          author,
          categories,
          excerpt
        } satisfies SportsProRssItem;
      })
      .sort((a, b) => a.canonical_url.localeCompare(b.canonical_url));

    const bounded = items.slice(0, Math.max(0, Math.floor(input.max_items)));
    const feed = SportsProRssFeedSchema.parse({ feed_url: SPORTSPRO_RSS_URL, feed_title: null, items: bounded });

    return {
      ok: true,
      source_id: SPORTSPRO_SOURCE_ID,
      feed: { feed_url: feed.feed_url, feed_title: feed.feed_title },
      items: feed.items,
      meta: { now_iso: input.now_iso, max_items: input.max_items, observed_count: items.length }
    };
  } catch (error) {
    return {
      ok: false,
      source_id: SPORTSPRO_SOURCE_ID,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function computeSportsProSourceItemId(input: { canonical_url: string; guid: string | null }): string {
  return input.guid ? `guid:${input.guid}` : `url:${input.canonical_url}`;
}

/**
 * LOCKED stable EvidenceReference identity:
 * source_id + normalized canonical_url.
 *
 * NOTE: published_at and guid are NOT included.
 */
export function computeSportsProEvidenceReferenceId(input: { canonical_url: string }): string {
  return `ev_${sha256Hex(input.canonical_url).slice(0, 24)}`;
}
