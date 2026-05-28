import { XMLParser } from "fast-xml-parser";

export type FeedItem = {
  title: string;
  url: string;
  guid?: string | null;
  publishedAt?: string | null;
  summary?: string | null;
  sourceFeedUrl: string;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Some feeds have entities / bad chars; try to be forgiving.
  processEntities: true
});

function coerceArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function pickText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    // fast-xml-parser sometimes returns {"#text": "..."}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const maybe = value as any;
    if (typeof maybe["#text"] === "string") return maybe["#text"];
    if (typeof maybe["@_href"] === "string") return maybe["@_href"];
  }
  return null;
}

function normalizeUrl(url: string) {
  try {
    return new URL(url).toString();
  } catch {
    return url;
  }
}

export async function fetchRssFeed(feedUrl: string, opts?: { userAgent?: string; timeoutMs?: number }) {
  const res = await fetch(feedUrl, {
    headers: {
      "user-agent": opts?.userAgent ?? "business-dashboard-bot",
      accept: "application/rss+xml, application/atom+xml, text/xml, application/xml;q=0.9, */*;q=0.8"
    },
    signal: opts?.timeoutMs ? AbortSignal.timeout(opts.timeoutMs) : undefined
  });

  if (!res.ok) {
    throw new Error(`RSS fetch failed: ${feedUrl} -> ${res.status} ${res.statusText}`);
  }

  const xml = await res.text();
  return parseRssXml(xml, feedUrl);
}

export function parseRssXml(xml: string, sourceFeedUrl: string): FeedItem[] {
  const doc = parser.parse(xml);

  // RSS 2.0: { rss: { channel: { item: [...] } } }
  const rssItems = coerceArray(doc?.rss?.channel?.item);
  if (rssItems.length) {
    return rssItems.flatMap((item) => {
        const title = pickText(item?.title) ?? "";
        const link = pickText(item?.link) ?? "";
        const guid = pickText(item?.guid);
        const published = pickText(item?.pubDate) ?? pickText(item?.date);
        const summary = pickText(item?.description) ?? pickText(item?.["content:encoded"]);

        if (!title || !link) return [];
        return [
          {
          title: title.trim(),
          url: normalizeUrl(link.trim()),
          guid: guid?.trim() ?? null,
          publishedAt: published ? new Date(published).toISOString() : null,
          summary: summary?.trim() ?? null,
          sourceFeedUrl
          } satisfies FeedItem
        ];
      });
  }

  // Atom: { feed: { entry: [...] } }
  const atomEntries = coerceArray(doc?.feed?.entry);
  return atomEntries.flatMap((entry) => {
      const title = pickText(entry?.title) ?? "";

      // link may be {"@_href": "..."} or an array.
      const links = coerceArray(entry?.link);
      const linkHref =
        links
          .map((l) => pickText(l?.["@_href"] ?? l?.href ?? l))
          .find((x) => typeof x === "string" && x.length > 0) ?? "";

      const guid = pickText(entry?.id);
      const published = pickText(entry?.published) ?? pickText(entry?.updated);
      const summary = pickText(entry?.summary) ?? pickText(entry?.content);

      if (!title || !linkHref) return [];
      return [
        {
        title: title.trim(),
        url: normalizeUrl(linkHref.trim()),
        guid: guid?.trim() ?? null,
        publishedAt: published ? new Date(published).toISOString() : null,
        summary: summary?.trim() ?? null,
        sourceFeedUrl
        } satisfies FeedItem
      ];
    });
}
