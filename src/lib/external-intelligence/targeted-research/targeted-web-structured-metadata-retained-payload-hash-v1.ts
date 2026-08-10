import { sha256CanonicalJson } from "@/lib/external-intelligence/hashing/content-hash";
import { canonicalizeUrlV1 } from "@/lib/external-intelligence/targeted-research/url-canonicalization-v1";

function normalizeTextV1(s: string | null): string | null {
  if (s === null) return null;
  const t = String(s).replace(/\s+/g, " ").trim();
  return t.length ? t : null;
}

function normalizeJsonLdTypesV1(types: string[]): string[] {
  return [...new Set((types ?? []).filter((t) => typeof t === "string" && t.trim().length > 0).map((t) => t.trim()))]
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Canonical retained payload projection for TARGETED_WEB structured_metadata retention.
 *
 * Purpose:
 * - Cryptographically bind to *claim-supporting retained fields* (title/meta/og/jsonld_types).
 * - Exclude fetch diagnostics and volatile observation metadata.
 * - Avoid redirect-churn by using the canonical evidence identity URL.
 */
export function projectTargetedWebStructuredMetadataRetainedPayloadV1(input: {
  /** Canonical evidence identity URL (already resolved/canonicalized at the policy boundary). */
  identity_url: string;
  title: string | null;
  meta_description: string | null;
  og_site_name: string | null;
  og_title: string | null;
  jsonld_types: string[];
}): {
  v: "targeted_web_structured_metadata_payload_v1";
  identity_canonical_url: string;
  title: string | null;
  meta_description: string | null;
  og_site_name: string | null;
  og_title: string | null;
  jsonld_types: string[];
} {
  const canon = canonicalizeUrlV1(input.identity_url);
  return {
    v: "targeted_web_structured_metadata_payload_v1",
    identity_canonical_url: canon.canonical_url,
    title: normalizeTextV1(input.title),
    meta_description: normalizeTextV1(input.meta_description),
    og_site_name: normalizeTextV1(input.og_site_name),
    og_title: normalizeTextV1(input.og_title),
    jsonld_types: normalizeJsonLdTypesV1(input.jsonld_types ?? [])
  };
}

export function createTargetedWebStructuredMetadataRetainedPayloadHashV1(input: {
  identity_url: string;
  title: string | null;
  meta_description: string | null;
  og_site_name: string | null;
  og_title: string | null;
  jsonld_types: string[];
}): string {
  const projection = projectTargetedWebStructuredMetadataRetainedPayloadV1(input);
  return sha256CanonicalJson(projection);
}

