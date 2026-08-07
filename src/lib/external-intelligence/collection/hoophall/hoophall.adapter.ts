import "@/lib/server-only";

import crypto from "node:crypto";

import { HOOPHALL_ALLOWED_HOST, HOOPHALL_NEWSROOM_URL, HOOPHALL_SOURCE_ID } from "@/lib/external-intelligence/collection/hoophall/hoophall.contract";
import { parseHoophallArticleDetail, parseHoophallNewsroomListing } from "@/lib/external-intelligence/collection/hoophall/hoophall.parser";

type FetchResult = { final_url: string; status: number; content_type: string | null; body_utf8: string; bytes: number };

function requireHttpsAndHost(url: string) {
  const u = new URL(url);
  if (u.protocol !== "https:") throw new Error("hoophall_network_blocked:non_https");
  if (u.hostname !== HOOPHALL_ALLOWED_HOST) throw new Error("hoophall_network_blocked:wrong_host");
  return u;
}

async function fetchBoundedHtml(input: {
  url: string;
  fetch: typeof fetch;
  timeout_ms: number;
  max_bytes: number;
}): Promise<FetchResult> {
  const u = requireHttpsAndHost(input.url);

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), input.timeout_ms);
  try {
    // Deny redirects by inspecting 3xx manually.
    const res = await input.fetch(u.toString(), {
      method: "GET",
      redirect: "manual",
      signal: ac.signal,
      headers: {
        // No arbitrary headers; we just request HTML.
        accept: "text/html,application/xhtml+xml"
      }
    });

    // If redirect, fail closed unless same-host https and no chain.
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error("hoophall_network_blocked:redirect_missing_location");
      const target = new URL(loc, u.toString());
      requireHttpsAndHost(target.toString());
      // We refuse to follow redirects in B6 to avoid chains.
      throw new Error("hoophall_network_blocked:redirect_not_allowed");
    }

    if (res.status !== 200) throw new Error(`hoophall_http_error:${res.status}`);
    const contentType = res.headers.get("content-type");
    if (contentType && !contentType.toLowerCase().includes("text/html")) {
      throw new Error("hoophall_unexpected_content_type");
    }

    const ab = await res.arrayBuffer();
    const bytes = ab.byteLength;
    if (bytes > input.max_bytes) throw new Error("hoophall_response_too_large");
    const body = Buffer.from(ab).toString("utf8");
    return { final_url: u.toString(), status: res.status, content_type: contentType, body_utf8: body, bytes };
  } finally {
    clearTimeout(t);
  }
}

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export type HoophallCollectionOutput = {
  status: "skipped" | "succeeded" | "failed";
  reason?: string;
  listing: { status: number; bytes: number; final_url: string } | null;
  observed_item_count: number;
  detail_fetches: number;
};

/**
 * Source-specific collector (B6):
 * - fetch newsroom listing
 * - deterministically parse
 * - optionally fetch up to N detail pages
 * - do not persist here; persistence happens in the orchestration handler.
 */
export async function collectHoophallNewsroomV1(input: {
  now_iso: string;
  fetch: typeof fetch;
  detail_fetch_cap: number;
}) {
  try {
    const listingRes = await fetchBoundedHtml({
      url: HOOPHALL_NEWSROOM_URL,
      fetch: input.fetch,
      timeout_ms: 10_000,
      max_bytes: 1_500_000
    });

    const listing = parseHoophallNewsroomListing({ url: listingRes.final_url, html: listingRes.body_utf8 });

    // Deterministic selection: stable order by URL, then take first N for potential detail fetch.
    const candidates = listing.items.slice().sort((a, b) => a.url.localeCompare(b.url));

    // Detail fetch only if listing description does not already contain an explicit YYYY or full date.
    const details: Array<{ url: string; headline: string; published_label: string | null; excerpt: string | null; raw_hash: string }> = [];
    let detail_fetches = 0;
    for (const item of candidates) {
      if (detail_fetches >= input.detail_fetch_cap) break;
      const needsDetail = !(item.listing_description ?? "").match(/\b\w+\s+\d{1,2},\s+\d{4}\b/);
      if (!needsDetail) continue;
      requireHttpsAndHost(item.url);
      const detailRes = await fetchBoundedHtml({ url: item.url, fetch: input.fetch, timeout_ms: 10_000, max_bytes: 1_500_000 });
      const parsed = parseHoophallArticleDetail({ url: detailRes.final_url, html: detailRes.body_utf8 });
      details.push({
        url: parsed.url,
        headline: parsed.headline,
        published_label: parsed.published_label,
        excerpt: parsed.excerpt,
        raw_hash: sha256Hex(detailRes.body_utf8)
      });
      detail_fetches += 1;
    }

    return {
      ok: true as const,
      source_id: HOOPHALL_SOURCE_ID,
      listing,
      listing_raw_hash: sha256Hex(listingRes.body_utf8),
      details,
      meta: {
        now_iso: input.now_iso,
        listing_status: listingRes.status,
        listing_bytes: listingRes.bytes,
        listing_final_url: listingRes.final_url
      }
    };
  } catch (error) {
    return {
      ok: false as const,
      source_id: HOOPHALL_SOURCE_ID,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

