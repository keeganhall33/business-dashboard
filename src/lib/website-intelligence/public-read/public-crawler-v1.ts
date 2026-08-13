import { XMLParser } from "fast-xml-parser";
import {
  WEBSITE_PAGE_SNAPSHOT_VERSION_V1,
  WEBSITE_SNAPSHOT_VERSION_V1,
  type WebsitePageSnapshotV1,
  type WebsiteSnapshotV1
} from "./contracts";
import {
  extractCanonicalUrl,
  extractFirstH1,
  extractImages,
  extractInternalLinks,
  extractMetaDescription,
  extractTextSummary,
  extractTitle
} from "./html-extract";

export type PublicReadFetchV1 = (url: string, init: { method: "GET" | "HEAD" | "OPTIONS"; headers?: Record<string, string> }) => Promise<Response>;

export type WebsitePublicReadCrawlerOptionsV1 = {
  rootUrl: string;
  seedUrls?: string[];
  maxPages: number;
  maxDepth?: number;
  maxConcurrency?: number;
  timeoutMs?: number;
  linkCheckMaxPerPage?: number;
  fetchFn?: PublicReadFetchV1;
  nowFn?: () => number;
};

function normalizeRootUrl(input: string) {
  const u = new URL(input);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("rootUrl must be http(s)");
  // Force deterministic trailing slash.
  u.hash = "";
  u.search = "";
  u.pathname = u.pathname === "" ? "/" : u.pathname;
  return u;
}

function isSameHost(a: string, root: URL) {
  try {
    const u = new URL(a);
    return u.host === root.host && (u.protocol === "https:" || u.protocol === "http:");
  } catch {
    return false;
  }
}

export function extractSitemapUrlsFromRobotsTxt(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    const m = line.match(/^\s*Sitemap:\s*(\S+)\s*$/i);
    if (m?.[1]) out.push(m[1]);
  }
  return Array.from(new Set(out)).sort();
}

export function parseSitemapXmlUrls(xml: string): string[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const obj = parser.parse(xml);
  const urls: string[] = [];
  const collectLoc = (node: any) => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const n of node) collectLoc(n);
      return;
    }
    if (typeof node === "object") {
      if (typeof node.loc === "string") urls.push(node.loc);
      for (const k of Object.keys(node)) collectLoc(node[k]);
    }
  };
  collectLoc(obj);
  return Array.from(new Set(urls)).sort();
}

function countDuplicates(values: Array<string | null | undefined>) {
  const seen = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    const key = v.trim();
    if (!key) continue;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  let dup = 0;
  for (const n of seen.values()) if (n > 1) dup += n;
  return dup;
}

async function safeFetch(fetchFn: PublicReadFetchV1, url: string, method: "GET" | "HEAD" | "OPTIONS") {
  // Hard safety gate.
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") throw new Error("mutation methods not allowed");
  return fetchFn(url, { method, headers: { "user-agent": "business-dashboard/website-intelligence-v1" } });
}

export async function crawlWebsitePublicReadV1(opts: WebsitePublicReadCrawlerOptionsV1): Promise<WebsiteSnapshotV1> {
  const root = normalizeRootUrl(opts.rootUrl);
  const now = opts.nowFn ?? (() => Date.now());
  const startedAt = now();
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const maxPages = Math.max(1, opts.maxPages);
  const maxDepth = Math.max(0, opts.maxDepth ?? 2);
  const maxConcurrency = Math.max(1, opts.maxConcurrency ?? 3);
  const linkCheckMaxPerPage = Math.max(0, opts.linkCheckMaxPerPage ?? 6);

  const fetchFn: PublicReadFetchV1 =
    opts.fetchFn ??
    (async (url, init) => {
      // Node 22 has global fetch.
      return fetch(url, init);
    });

  const seeds: string[] = [];
  const discoveredFrom: WebsiteSnapshotV1["crawl"]["discoveredFrom"] = [];
  for (const u of opts.seedUrls ?? []) {
    try {
      const url = new URL(u, root.toString()).toString();
      if (isSameHost(url, root)) seeds.push(url);
    } catch {
      // ignore
    }
  }
  if (seeds.length) discoveredFrom.push("INPUT");

  // robots.txt + sitemap discovery (best-effort, bounded).
  try {
    const robotsUrl = new URL("/robots.txt", root).toString();
    const r = await safeFetch(fetchFn, robotsUrl, "GET");
    if (r.ok) {
      const txt = await r.text();
      const sitemapUrls = extractSitemapUrlsFromRobotsTxt(txt);
      if (sitemapUrls.length) discoveredFrom.push("ROBOTS");
      // Fetch first sitemap only for Phase A foundation.
      const first = sitemapUrls[0];
      if (first) {
        const s = await safeFetch(fetchFn, first, "GET");
        if (s.ok) {
          const xml = await s.text();
          const urls = parseSitemapXmlUrls(xml)
            .filter((u) => isSameHost(u, root))
            .slice(0, Math.max(0, maxPages * 2));
          if (urls.length) discoveredFrom.push("SITEMAP");
          seeds.push(...urls);
        }
      }
    }
  } catch {
    // best-effort; keep crawler deterministic and safe.
  }

  if (!seeds.length) seeds.push(root.toString());
  const seedUrls = Array.from(new Set(seeds)).sort();

  type Q = { url: string; depth: number };
  const queue: Q[] = seedUrls.map((u) => ({ url: u, depth: 0 }));
  const seen = new Set<string>();
  const pages: WebsitePageSnapshotV1[] = [];
  let stoppedReason: WebsiteSnapshotV1["crawl"]["stoppedReason"] = null;

  const worker = async (item: Q) => {
    const url = item.url;
    if (seen.has(url)) return;
    seen.add(url);
    if (pages.length >= maxPages) return;
    if (now() - startedAt > timeoutMs) {
      stoppedReason = "TIMEOUT";
      return;
    }

    const redirectedFrom: string[] = [];
    let finalUrl: string | null = null;
    let status: number | null = null;
    let html: string | null = null;

    try {
      // Deterministic manual redirect following (bounded).
      let current = url;
      let res: Response | null = null;
      for (let i = 0; i < 6; i++) {
        res = await safeFetch(fetchFn, current, "GET");
        status = res.status;
        const isRedirect = status !== null && status >= 300 && status < 400;
        const loc = res.headers.get("location");
        if (!isRedirect || !loc) break;
        redirectedFrom.push(current);
        current = new URL(loc, current).toString();
      }
      finalUrl = current;
      // Use the last response body for extraction.
      if (res) {
        const ct = res.headers.get("content-type") ?? "";
        if (ct.includes("text/html") || ct.includes("application/xhtml") || ct === "") {
          html = await res.text();
        } else {
          html = null;
        }
      }
    } catch {
      status = null;
      finalUrl = null;
      html = null;
    }

    const base = finalUrl ?? url;
    const internalLinks = html ? extractInternalLinks(html, base).filter((u) => isSameHost(u, root)) : [];
    const imageRefs = html ? extractImages(html, base) : [];
    const brokenInternalLinks: string[] = [];

    // Bounded internal link HEAD checks.
    for (const link of internalLinks.slice(0, linkCheckMaxPerPage)) {
      try {
        const r = await safeFetch(fetchFn, link, "HEAD");
        // Treat redirects as not broken; only >= 400 is considered broken.
        if (r.status >= 400) brokenInternalLinks.push(link);
      } catch {
        brokenInternalLinks.push(link);
      }
    }

    const page: WebsitePageSnapshotV1 = {
      v: WEBSITE_PAGE_SNAPSHOT_VERSION_V1,
      url,
      finalUrl,
      status,
      redirectedFrom,
      title: html ? extractTitle(html) : null,
      metaDescription: html ? extractMetaDescription(html) : null,
      canonicalUrl: html ? extractCanonicalUrl(html) : null,
      h1: html ? extractFirstH1(html) : null,
      textSummary: html ? extractTextSummary(html, 320) : null,
      internalLinks,
      imageRefs,
      brokenInternalLinks
    };
    pages.push(page);

    // Expand queue deterministically.
    if (item.depth < maxDepth) {
      for (const next of internalLinks) queue.push({ url: next, depth: item.depth + 1 });
      if (internalLinks.length) discoveredFrom.push("LINKS");
    }
  };

  // Deterministic, bounded concurrency.
  while (queue.length && pages.length < maxPages && !stoppedReason) {
    if (now() - startedAt > timeoutMs) {
      stoppedReason = "TIMEOUT";
      break;
    }
    const batch = queue.splice(0, maxConcurrency);
    if (!batch.length) break;
    await Promise.all(batch.map(worker));
  }

  if (!stoppedReason) {
    if (pages.length >= maxPages) stoppedReason = "MAX_PAGES";
    else if (!queue.length) stoppedReason = "NO_MORE_URLS";
  }

  const missingAltCount = pages.reduce((n, p) => n + p.imageRefs.filter((i) => i.missingAlt).length, 0);
  const brokenLinkCount = pages.reduce((n, p) => n + p.brokenInternalLinks.length, 0);
  const duplicateTitleCount = countDuplicates(pages.map((p) => p.title));
  const duplicateMetaDescriptionCount = countDuplicates(pages.map((p) => p.metaDescription));

  return {
    v: WEBSITE_SNAPSHOT_VERSION_V1,
    capturedAt: new Date().toISOString(),
    rootUrl: root.toString(),
    safety: {
      readOnly: true,
      mutationDisabled: true,
      credentialsUsed: false,
      allowedMethods: ["GET", "HEAD", "OPTIONS"]
    },
    crawl: {
      seedUrls,
      discoveredFrom: Array.from(new Set(discoveredFrom)),
      maxPages,
      maxDepth,
      maxConcurrency,
      timeoutMs,
      stoppedReason
    },
    pages: pages.sort((a, b) => a.url.localeCompare(b.url)),
    totals: {
      pageCount: pages.length,
      changedPageCount: 0,
      brokenLinkCount,
      missingAltCount,
      duplicateTitleCount,
      duplicateMetaDescriptionCount
    },
    state: "UNKNOWN"
  };
}
