import { createHash } from "node:crypto";

function clampText(s: string, maxLen: number) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > maxLen ? t.slice(0, maxLen).trimEnd() : t;
}

function decodeHtmlEntitiesBasic(s: string) {
  // Minimal decoding for fixtures; keep deterministic and dependency-free.
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  return clampText(decodeHtmlEntitiesBasic(m[1] ?? ""), 140) || null;
}

export function extractMetaDescription(html: string): string | null {
  const m = html.match(/<meta[^>]*name=["']description["'][^>]*>/i) || html.match(/<meta[^>]*content=["'][^"']*["'][^>]*name=["']description["'][^>]*>/i);
  if (!m) return null;
  const tag = m[0];
  const content = tag.match(/content=["']([^"']*)["']/i)?.[1];
  if (!content) return null;
  return clampText(decodeHtmlEntitiesBasic(content), 280) || null;
}

export function extractCanonicalUrl(html: string): string | null {
  const m = html.match(/<link[^>]*rel=["']canonical["'][^>]*>/i) || html.match(/<link[^>]*href=["'][^"']*["'][^>]*rel=["']canonical["'][^>]*>/i);
  if (!m) return null;
  const tag = m[0];
  return tag.match(/href=["']([^"']+)["']/i)?.[1] ?? null;
}

export function extractFirstH1(html: string): string | null {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m) return null;
  const text = stripHtml(m[1] ?? "");
  return clampText(decodeHtmlEntitiesBasic(text), 200) || null;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractTextSummary(html: string, maxLen = 320): string | null {
  const text = stripHtml(html);
  const t = clampText(decodeHtmlEntitiesBasic(text), maxLen);
  return t || null;
}

export function extractInternalLinks(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  const re = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = (m[1] ?? "").trim();
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    try {
      const u = new URL(href, baseUrl);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      out.push(u.toString());
    } catch {
      // ignore
    }
  }
  return Array.from(new Set(out)).sort();
}

export function extractImages(html: string, baseUrl: string): Array<{ src: string; alt: string | null; missingAlt: boolean }> {
  const out: Array<{ src: string; alt: string | null; missingAlt: boolean }> = [];
  const re = /<img\s+[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const srcRaw = tag.match(/src=["']([^"']+)["']/i)?.[1];
    if (!srcRaw) continue;
    try {
      const srcUrl = new URL(srcRaw, baseUrl).toString();
      const alt = tag.match(/alt=["']([^"']*)["']/i)?.[1] ?? null;
      const normalizedAlt = alt === null ? null : decodeHtmlEntitiesBasic(alt).trim();
      out.push({ src: srcUrl, alt: normalizedAlt, missingAlt: !normalizedAlt });
    } catch {
      // ignore
    }
  }
  // Keep deterministic order.
  return out.sort((a, b) => a.src.localeCompare(b.src));
}

export function fingerprintPageForDiff(input: {
  url: string;
  finalUrl: string | null;
  status: number | null;
  title: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  h1: string | null;
  internalLinks: string[];
  imageRefs: Array<{ src: string; alt: string | null; missingAlt: boolean }>;
  brokenInternalLinks: string[];
}) {
  const stable = JSON.stringify({
    url: input.url,
    finalUrl: input.finalUrl,
    status: input.status,
    title: input.title,
    metaDescription: input.metaDescription,
    canonicalUrl: input.canonicalUrl,
    h1: input.h1,
    internalLinks: [...input.internalLinks].sort(),
    imageRefs: [...input.imageRefs].map((x) => ({ ...x })).sort((a, b) => a.src.localeCompare(b.src)),
    brokenInternalLinks: [...input.brokenInternalLinks].sort()
  });
  return createHash("sha256").update(stable).digest("hex");
}

