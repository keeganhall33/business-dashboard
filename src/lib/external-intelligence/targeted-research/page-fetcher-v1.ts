import type { FetchedPagePreviewV1, RetentionModeV1 } from "@/lib/external-intelligence/targeted-research/targeted-research-contracts-v1";

export type PageFetchResultV1 =
  | {
      ok: true;
      preview: FetchedPagePreviewV1;
      /**
       * EXECUTION-ONLY. Raw page HTML that may be inspected in-memory to derive bounded excerpts.
       * Must never be persisted, logged, or forwarded into Evidence/Claim payloads.
       */
      transient: { raw_html: string } | null;
      retention_mode: RetentionModeV1;
    }
  | { ok: false; http_status: number; error: string; final_url: string };

function isAllowedHttpUrlV1(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isHtmlContentTypeV1(contentType: string | null): boolean {
  if (!contentType) return false;
  const ct = contentType.toLowerCase();
  return ct.startsWith("text/html") || ct.startsWith("application/xhtml+xml");
}

function extractMetaTag(html: string, name: string): string | null {
  const re = new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
  const m = html.match(re);
  return m ? m[1]!.trim().slice(0, 240) : null;
}

function extractOgTag(html: string, property: string): string | null {
  const re = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
  const m = html.match(re);
  return m ? m[1]!.trim().slice(0, 240) : null;
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1]!.replace(/\s+/g, " ").trim().slice(0, 240) : null;
}

function extractJsonLdTypes(html: string): string[] {
  const out = new Set<string>();
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = (m[1] ?? "").trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const walk = (v: unknown) => {
        if (!v) return;
        if (Array.isArray(v)) {
          for (const x of v) walk(x);
          return;
        }
        if (typeof v === "object") {
          const obj = v as Record<string, unknown>;
          const t = obj["@type"];
          if (typeof t === "string") out.add(t);
          if (Array.isArray(t)) {
            for (const tt of t) if (typeof tt === "string") out.add(tt);
          }
          for (const k of Object.keys(obj)) walk(obj[k]);
        }
      };
      walk(parsed);
    } catch {
      // ignore malformed jsonld
    }
  }
  return Array.from(out).slice().sort((a, b) => a.localeCompare(b));
}

export async function fetchPagePreviewV1(input: {
  canonical_url: string;
  timeout_ms: number;
  max_bytes: number;
}): Promise<PageFetchResultV1> {
  if (!isAllowedHttpUrlV1(input.canonical_url)) {
    return { ok: false, http_status: 0, error: "unsupported_url_scheme", final_url: input.canonical_url };
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), input.timeout_ms);

  try {
    const res = await fetch(input.canonical_url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        // keep generic UA; no impersonation.
        "user-agent": "keegan-dashboard-targeted-research/1.0"
      }
    });

    const ct = res.headers.get("content-type");

    const buf = await res.arrayBuffer();
    const bytes = buf.byteLength;
    if (bytes > input.max_bytes) {
      return { ok: false, http_status: res.status, error: "response_too_large", final_url: res.url };
    }

    const bodyText = Buffer.from(buf).toString("utf8");

    // V1 retention for arbitrary web pages is metadata/structured only (no fulltext retention).
    const retention_mode: RetentionModeV1 = "structured_metadata";

    const preview: FetchedPagePreviewV1 = {
      canonical_url: input.canonical_url,
      http_status: res.status,
      final_url: res.url,
      content_type: ct,
      retention_mode,
      title: extractTitle(bodyText),
      meta_description: extractMetaTag(bodyText, "description"),
      og_site_name: extractOgTag(bodyText, "og:site_name"),
      og_title: extractOgTag(bodyText, "og:title"),
      jsonld_types: extractJsonLdTypes(bodyText)
    };

    if (!res.ok) {
      return { ok: false, http_status: res.status, error: "http_error", final_url: res.url };
    }

    const transient = isHtmlContentTypeV1(ct) ? { raw_html: bodyText } : null;
    return { ok: true, preview, transient, retention_mode };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, http_status: 0, error: msg.includes("aborted") ? "timeout" : "network_error", final_url: input.canonical_url };
  } finally {
    clearTimeout(t);
  }
}
