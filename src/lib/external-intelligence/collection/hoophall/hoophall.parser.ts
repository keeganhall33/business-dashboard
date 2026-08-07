import { HoophallArticleDetailSchema, HoophallNewsroomListingSchema, type HoophallNewsroomItem } from "@/lib/external-intelligence/collection/hoophall/hoophall.contract";

function decodeBasicEntities(input: string): string {
  return input
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .trim();
}

function stripTags(input: string): string {
  return decodeBasicEntities(input.replaceAll(/<[^>]*>/g, " ").replaceAll(/\s+/g, " ").trim());
}

function firstMatch(input: string, re: RegExp): string | null {
  const m = input.match(re);
  return m?.[1] ? decodeBasicEntities(m[1]) : null;
}

export function parseHoophallNewsroomListing(input: { url: string; html: string }) {
  // We deliberately parse only the stable, classed containers discovered in live inspection:
  // - div.news-feed-list
  // - div.news-feed-item-wrapper
  // - span.overline-title (listing date)
  // - h5.article-title a[href] (headline + link)
  // - div.article-description (short snippet)
  const listCount = (input.html.match(/class="news-feed-list\b/g) ?? []).length;
  if (listCount !== 1) {
    throw new Error("hoophall_listing_structure_unexpected:missing_news_feed_list");
  }

  const wrappers = input.html.match(
    /<div\s+class="news-feed-item-wrapper[^"]*"\s*>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g
  );
  if (!wrappers || wrappers.length === 0) {
    throw new Error("hoophall_listing_structure_unexpected:no_item_wrappers");
  }

  const items: HoophallNewsroomItem[] = [];
  for (const block of wrappers) {
    const listingDate = firstMatch(block, /<span\s+class="overline-title[^"]*">\s*([\s\S]*?)\s*<\/span>/);
    const href = firstMatch(block, /<h5\s+class="article-title[^"]*">[\s\S]*?<a[^>]*href="([^"]+)"/);
    const headline = firstMatch(
      block,
      /<h5\s+class="article-title[^"]*">[\s\S]*?<a[^>]*href="[^"]+"[^>]*>\s*([\s\S]*?)\s*<\/a>/
    );
    const descRaw = firstMatch(block, /<div\s+class="article-description[^"]*">\s*([\s\S]*?)\s*<\/div>/);

    if (!href || !headline) {
      // Fail closed: listing must provide canonical article URL + headline.
      continue;
    }

    const listing_description = descRaw ? stripTags(descRaw).slice(0, 1200) : null;

    items.push({
      url: href,
      headline: stripTags(headline).slice(0, 220),
      listing_date_label: listingDate ? stripTags(listingDate).slice(0, 64) : null,
      listing_description
    });
  }

  // Deterministic ordering by URL.
  items.sort((a, b) => a.url.localeCompare(b.url));

  return HoophallNewsroomListingSchema.parse({ url: input.url, items });
}

export function parseHoophallArticleDetail(input: { url: string; html: string }) {
  // Stable selectors discovered in live inspection:
  // - div.hero-body.news > span.overline-title (published label)
  // - div.hero-body.news > h1 (headline)
  const heroCount = (input.html.match(/class="hero-body\s+news\b/g) ?? []).length;
  if (heroCount < 1) {
    throw new Error("hoophall_detail_structure_unexpected:missing_news_hero");
  }

  const heroBlock = firstMatch(input.html, /<div\s+class="hero-body\s+news[^"]*">([\s\S]*?)<\/div>/);
  if (!heroBlock) throw new Error("hoophall_detail_structure_unexpected:missing_hero_block");

  const published = firstMatch(heroBlock, /<span\s+class="overline-title[^"]*">\s*([\s\S]*?)\s*<\/span>/);
  const headline = firstMatch(heroBlock, /<h1>\s*([\s\S]*?)\s*<\/h1>/);
  if (!headline) throw new Error("hoophall_detail_structure_unexpected:missing_headline");

  // Minimal excerpt: first article-description-like block if present.
  const excerpt = firstMatch(input.html, /<div class="article-body">\s*([\s\S]*?)\s*<\/div>/);
  const excerptText = excerpt ? stripTags(excerpt).slice(0, 1600) : null;

  return HoophallArticleDetailSchema.parse({
    url: input.url,
    headline: stripTags(headline).slice(0, 220),
    published_label: published ? stripTags(published).slice(0, 64) : null,
    excerpt: excerptText
  });
}
