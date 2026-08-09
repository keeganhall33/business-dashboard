import crypto from "node:crypto";

import { SupportExcerptV1Schema, type SupportExcerptV1 } from "@/lib/external-intelligence/contracts/support-excerpt-v1";

export const SUPPORT_EXCERPT_LIMITS_V1 = Object.freeze({
  max_excerpts: 3,
  max_chars_per_excerpt: 500,
  max_total_chars: 1000
});

export type BuildSupportExcerptsResultV1 =
  | {
      ok: true;
      excerpts: readonly SupportExcerptV1[];
      normalized_text_hashes: readonly string[];
      total_chars: number;
    }
  | { ok: false; error: string };

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function normalizeExcerptTextV1(input: string): string {
  // Deterministic whitespace normalization only.
  return input.replace(/\s+/g, " ").trim();
}

export function buildSupportExcerptsV1(input: {
  locator_type: "text_excerpt";
  texts: string[];
  locator_hint?: string | null;
}): BuildSupportExcerptsResultV1 {
  const locator_hint = input.locator_hint ?? null;

  const normalized = input.texts
    .map((t) => normalizeExcerptTextV1(t))
    .filter(Boolean);

  if (normalized.length === 0) return { ok: false, error: "empty_excerpts" };

  // Dedupe deterministically by normalized text hash.
  const seen = new Set<string>();
  const uniq: string[] = [];
  const hashes: string[] = [];

  for (const t of normalized) {
    const h = sha256Hex(t);
    if (seen.has(h)) continue;
    seen.add(h);
    uniq.push(t);
    hashes.push(h);
  }

  if (uniq.length > SUPPORT_EXCERPT_LIMITS_V1.max_excerpts) return { ok: false, error: "too_many_excerpts" };

  for (const t of uniq) {
    if (t.length > SUPPORT_EXCERPT_LIMITS_V1.max_chars_per_excerpt) return { ok: false, error: "excerpt_too_long" };
  }

  const total_chars = uniq.reduce((acc, s) => acc + s.length, 0);
  if (total_chars > SUPPORT_EXCERPT_LIMITS_V1.max_total_chars) return { ok: false, error: "total_excerpt_chars_exceeded" };

  const excerpts: SupportExcerptV1[] = uniq.map((t) => {
    const text_hash = sha256Hex(t);
    const ex: SupportExcerptV1 = {
      locator_type: "text_excerpt",
      text_hash,
      text: t,
      locator_hint,
      char_count: t.length,
      schema_version: "support_excerpt_v1"
    };
    SupportExcerptV1Schema.parse(ex);
    return Object.freeze(ex);
  });

  // Canonical ordering: by text_hash.
  const ordered = [...excerpts].sort((a, b) => a.text_hash.localeCompare(b.text_hash));

  return { ok: true, excerpts: Object.freeze(ordered), normalized_text_hashes: ordered.map((e) => e.text_hash), total_chars };
}
