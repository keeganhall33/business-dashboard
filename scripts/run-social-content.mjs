#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Request failed ${res.status}: ${text}`);
  }
  return res.json();
}

async function fetchJsonWithToken(url, token) {
  const target = new URL(url);
  target.searchParams.set("access_token", token);
  return fetchJson(target.toString());
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

function summarizePosts(posts) {
  if (!posts.length) {
    return {
      topPost: null,
      topFormat: null,
      topHookPattern: null,
      underperformingFormat: null,
      recommendedNextContent: null
    };
  }
  const scored = posts
    .map((post) => ({
      post,
      engagement:
        (post.metrics.likes ?? 0) +
        (post.metrics.comments ?? 0) +
        (post.metrics.shares ?? 0) +
        (post.metrics.saves ?? 0)
    }))
    .sort((a, b) => b.engagement - a.engagement);
  const top = scored[0].post;
  const bottom = scored[scored.length - 1].post;
  const topFormat = top.format;
  const underperformingFormat = bottom.format;
  const topHookPattern = top.hook?.split(" ").slice(0, 6).join(" ") || null;
  const recommendedNextContent = top.subject
    ? `Build a follow-up around ${top.subject} using ${top.format} format.`
    : `Create another ${top.format} leaning on the hook "${top.hook}".`;
  return {
    topPost: top.postId,
    topFormat,
    topHookPattern,
    underperformingFormat,
    recommendedNextContent
  };
}

async function resolvePageAndIgIds(baseToken) {
  const explicitPageId = process.env.META_PAGE_ID?.trim() || null;
  const explicitIgId = process.env.META_IG_BUSINESS_ID?.trim() || null;

  if (explicitPageId) {
    const igId = explicitIgId ?? (await fetchPageInstagramId(explicitPageId, baseToken));
    return { pageId: explicitPageId, pageToken: baseToken, igBusinessId: igId };
  }

  const accountsUrl = new URL("https://graph.facebook.com/v20.0/me/accounts");
  accountsUrl.searchParams.set("fields", "id,name,access_token,instagram_business_account");
  accountsUrl.searchParams.set("access_token", baseToken);
  const response = await fetchJson(accountsUrl.toString());
  const accounts = Array.isArray(response.data) ? response.data : [];
  if (!accounts.length) {
    throw new Error(
      "META_ACCESS_TOKEN has no accessible Facebook Pages. Ensure the token has pages_show_list + admin permissions, or set META_PAGE_ID and META_PAGE_ACCESS_TOKEN in 1Password."
    );
  }
  const preferred = accounts.find((acct) => acct.instagram_business_account) ?? accounts[0];
  return {
    pageId: preferred.id,
    pageToken: preferred.access_token ?? baseToken,
    igBusinessId: explicitIgId ?? preferred.instagram_business_account?.id ?? null
  };
}

async function fetchPageInstagramId(pageId, token) {
  const url = new URL(`https://graph.facebook.com/v20.0/${pageId}`);
  url.searchParams.set("fields", "instagram_business_account{id}");
  url.searchParams.set("access_token", token);
  const data = await fetchJson(url.toString());
  return data?.instagram_business_account?.id ?? null;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const supabaseEnabled = Boolean(supabaseUrl && supabaseServiceRoleKey);
const supabaseClient = supabaseEnabled
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null;

async function main() {
  const providedPageToken = process.env.META_PAGE_ACCESS_TOKEN?.trim();
  const fallbackToken = providedPageToken || process.env.META_ACCESS_TOKEN?.trim();
  if (!fallbackToken) {
    console.error("Missing env vars: provide META_PAGE_ACCESS_TOKEN or META_ACCESS_TOKEN via 1Password");
    process.exit(1);
  }

  const { pageId, pageToken, igBusinessId } = await resolvePageAndIgIds(fallbackToken);
  if (!igBusinessId) {
    throw new Error(
      `Unable to resolve Instagram Business account for Page ${pageId}. Ensure the Page is linked to IG Business and set META_IG_BUSINESS_ID if auto-discovery fails.`
    );
  }

  const lookbackDays = Number(process.env.SOCIAL_LOOKBACK_DAYS || 14);
  const limit = Number(process.env.SOCIAL_POST_LIMIT || 25);
  const since = new Date(Date.now() - lookbackDays * 86400 * 1000);

  const fields = ["id", "caption", "media_type", "permalink", "thumbnail_url", "timestamp"].join(",");
  const mediaUrl = new URL(`https://graph.facebook.com/v20.0/${igBusinessId}/media`);
  mediaUrl.searchParams.set("fields", fields);
  mediaUrl.searchParams.set("access_token", pageToken);
  mediaUrl.searchParams.set("limit", String(limit));

  const mediaData = await fetchJson(mediaUrl.toString());
  const media = Array.isArray(mediaData.data) ? mediaData.data : [];

  const posts = [];
  for (const mediaItem of media) {
    if (!mediaItem?.id) continue;
    const timestamp = new Date(mediaItem.timestamp);
    if (timestamp < since) continue;
    const metrics = await fetchMediaMetrics(mediaItem, pageToken);

    const hook = (mediaItem.caption ?? "").split(/\.|!|\n/)[0]?.trim() || mediaItem.caption || "";
    const subjectMatch = mediaItem.caption?.match(/#([A-Za-z0-9_]+)/);
    const subject = subjectMatch ? subjectMatch[1] : null;

    posts.push({
      platform: "instagram",
      postId: mediaItem.id,
      format: mediaItem.media_type?.toLowerCase() ?? "post",
      publishedAt: mediaItem.timestamp,
      caption: mediaItem.caption ?? "",
      hook,
      subject,
      artwork: subject || null,
      permalink: mediaItem.permalink,
      thumbnailUrl: mediaItem.thumbnail_url ?? null,
      metrics: mapMetrics(metrics),
      takeaway:
        metrics.reach && metrics.reach > 0
          ? `Reached ${metrics.reach} with ${Math.round(((metrics.likes ?? 0) / metrics.reach) * 1000) / 10}% like rate.`
          : ""
    });
  }

  const summary = summarizePosts(posts);
  const snapshot = {
    generatedAt: new Date().toISOString(),
    source: "meta_instagram",
    range: {
      from: since.toISOString(),
      to: new Date().toISOString()
    },
    accounts: [
      {
        platform: "instagram",
        accountName: process.env.SOCIAL_ACCOUNT_NAME ?? "instagram",
        accountId: igBusinessId,
        followers: null
      }
    ],
    posts,
    summary
  };

const outputPath = path.resolve(process.cwd(), "dashboard", "data", "social", "latest.json");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(snapshot, null, 2));
  console.log(`Wrote social snapshot with ${posts.length} posts to ${outputPath}`);
  await upsertSupabaseSnapshot(snapshot);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

async function upsertSupabaseSnapshot(snapshot) {
  if (!supabaseClient) return;
  try {
    const { error } = await supabaseClient
      .from("dashboard_snapshots")
      .upsert({
        key: "social_content",
        payload: snapshot,
        mode: snapshot.posts?.length ? "LIVE" : "PARTIAL",
        generated_at: snapshot.generatedAt ?? null
      });
    if (error) {
      console.error("[social-content] Supabase snapshot upsert failed:", error.message);
    } else {
      console.log("[social-content] Supabase dashboard snapshot updated (social_content)");
    }
  } catch (error) {
    console.error("[social-content] Supabase snapshot upsert threw:", error instanceof Error ? error.message : error);
  }
}

function chunk(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

function mediaMetricCandidates(media) {
  const base = ["reach", "likes", "comments", "shares", "saved", "total_interactions"];
  const type = (media.media_product_type || media.media_type || "").toLowerCase();
  if (type.includes("video") || type.includes("reel")) {
    return [...base, "views", "total_views", "ig_reels_avg_watch_time", "ig_reels_video_view_total_time"];
  }
  return base;
}

async function fetchMediaMetrics(media, token) {
  const candidates = mediaMetricCandidates(media);
  const metrics = {};
  for (const group of chunk(candidates, 5)) {
    const url = new URL(`https://graph.facebook.com/v20.0/${media.id}/insights`);
    url.searchParams.set("metric", group.join(","));
    url.searchParams.set("access_token", token);
    try {
      const data = await fetchJson(url.toString());
      for (const entry of data.data ?? []) {
        if (!metrics[entry.name]) {
          metrics[entry.name] = toNumber(entry.values?.[0]?.value) ?? null;
        }
      }
    } catch (error) {
      if (error.message?.includes("(#100)") || error.message?.includes("OAuthException")) {
        console.warn(`Metric group rejected for media ${media.id}: ${group.join(",")}`);
        continue;
      }
      throw error;
    }
  }
  return metrics;
}

function mapMetrics(raw) {
  const views = raw.views ?? raw.total_views ?? raw.video_views ?? null;
  const impressions = raw.impressions ?? null;
  const reach = raw.reach ?? null;
  const likes = raw.likes ?? null;
  const comments = raw.comments ?? null;
  const shares = raw.shares ?? null;
  const saves = raw.saved ?? raw.saves ?? null;
  const totalInteractions = raw.total_interactions ?? null;
  const engagementRate = computeEngagementRate({ reach, views, likes, comments, shares, saves, totalInteractions });
  return { views, impressions, reach, likes, comments, shares, saves, totalInteractions, engagementRate };
}

function computeEngagementRate({ reach, views, likes, comments, shares, saves, totalInteractions }) {
  const numerator = totalInteractions ?? (likes ?? 0) + (comments ?? 0) + (shares ?? 0) + (saves ?? 0);
  const denominator = reach && reach > 0 ? reach : views && views > 0 ? views : null;
  if (!denominator || denominator <= 0) return null;
  return numerator / denominator;
}
