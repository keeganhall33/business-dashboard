import crypto from "node:crypto";

import type { EvidenceReference } from "@/lib/external-intelligence/contracts/evidence-reference";
import { BOARDROOM_SOURCE_ID } from "@/lib/external-intelligence/collection/boardroom/boardroom.contract";

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function safeExcerpt(input: string | null | undefined, maxChars: number) {
  const s = typeof input === "string" ? input.trim() : "";
  if (!s) return null;
  return s.length > maxChars ? s.slice(0, maxChars) : s;
}

export function buildBoardroomEvidenceReference(input: {
  evidence_reference_id: string;
  canonical_url: string;
  guid: string | null;
  source_item_id: string;
  title: string;
  published_at_iso: string | null;
  collected_at_iso: string;
  author: string | null;
  categories: string[];
  excerpt: string | null;
  rss_content_html: string | null;
  feed_url: string;
  rss_position: number;
}): EvidenceReference {
  const contentForHash = `${input.canonical_url}\n${input.title}\n${input.published_at_iso ?? ""}\n${
    input.excerpt ?? ""
  }\n${input.rss_content_html ?? ""}`;

  const content_hash = sha256Hex(contentForHash);

  return {
    evidence_reference_id: input.evidence_reference_id,
    source_id: BOARDROOM_SOURCE_ID,
    source_config_version: "v1",
    source_set_id: null,

    source_artifact_identifier: input.guid,
    source_url_or_reference: input.canonical_url,
    content_hash,

    retrieved_at: input.collected_at_iso,
    published_at: input.published_at_iso,
    event_time: null,

    evidence_type: "report",
    access_classification: "public",
    legal_policy_version: "boardroom.rss.link_only.v1",
    retention_policy: "link_only",

    excerpt_or_summary_reference: null,
    source_credibility_prior: "medium",
    correction_status: "none",
    retraction_status: "none",
    supersedes_evidence_reference_id: null,

    provenance_metadata: {
      feed_url: input.feed_url,
      canonical_url: input.canonical_url,
      guid: input.guid,
      source_item_id: input.source_item_id,
      rss_position: input.rss_position,
      title: input.title,
      published_at: input.published_at_iso,
      collected_at: input.collected_at_iso,
      author: input.author,
      categories: input.categories,
      excerpt: safeExcerpt(input.excerpt, 1200),
      rss_content_present: Boolean(input.rss_content_html),
      rss_content_html_excerpt: safeExcerpt(input.rss_content_html, 2000)
    },

    credibility: { level: "medium", bounded_score: null, reasons: ["publisher_rss"] },
    corroborating_evidence_reference_ids: [],
    contradicting_evidence_reference_ids: [],

    schema_version: "evidence_reference_v1"
  };
}

