import crypto from "node:crypto";

import type { EvidenceReference } from "@/lib/external-intelligence/contracts/evidence-reference";
import type { Claim } from "@/lib/external-intelligence/contracts/claim";
import { computeClaimFingerprint } from "@/lib/external-intelligence/contracts/claim";
import type { EntityRef } from "@/lib/external-intelligence/contracts/entity-ref";
import type { SportsMilestone } from "@/lib/external-intelligence/milestones/contracts";
import { computeMilestoneContentHash } from "@/lib/external-intelligence/milestones/contracts";

import { HOOPHALL_SOURCE_ID } from "@/lib/external-intelligence/collection/hoophall/hoophall.contract";

export type HoophallMilestoneCategory =
  | "hall_of_fame_finalist"
  | "hall_of_fame_induction"
  | "hall_of_fame_enshrinement"
  | "hall_of_fame_ceremony"
  | "jersey_or_honor_exhibition"
  | "major_hall_anniversary_event";

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function normalizeWhitespace(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

function extractFirstExplicitDateYmd(text: string): string | null {
  const t = normalizeWhitespace(text);
  const m = t.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\b/
  );
  if (!m) return null;
  const month = m[1];
  const day = Number(m[2]);
  const year = Number(m[3]);
  const monthMap = {
    January: 1,
    February: 2,
    March: 3,
    April: 4,
    May: 5,
    June: 6,
    July: 7,
    August: 8,
    September: 9,
    October: 10,
    November: 11,
    December: 12
  } as const;

  const mm = monthMap[month as keyof typeof monthMap] ?? null;
  if (!mm || day < 1 || day > 31) return null;
  const ymd = `${String(year).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  // Basic validity check.
  if (Number.isNaN(Date.parse(`${ymd}T00:00:00Z`))) return null;
  return ymd;
}

export function classifyHoophallCategory(input: { headline: string; snippet: string }): HoophallMilestoneCategory | null {
  const h = `${input.headline} ${input.snippet}`.toLowerCase();

  if (h.includes("enshrinement")) return "hall_of_fame_enshrinement";
  if (h.includes("induction") || h.includes("class of")) return "hall_of_fame_induction";
  if (h.includes("finalist")) return "hall_of_fame_finalist";
  if (h.includes("ceremony")) return "hall_of_fame_ceremony";
  if (h.includes("exhibit") || h.includes("exhibition") || h.includes("immersive")) return "jersey_or_honor_exhibition";
  if (h.includes("anniversary")) return "major_hall_anniversary_event";

  return null;
}

export function _testExtractFirstExplicitDateYmd(text: string) {
  return extractFirstExplicitDateYmd(text);
}

export function buildHoophallEvidenceReference(input: {
  url: string;
  headline: string;
  published_at_iso: string | null;
  collected_at_iso: string;
  content_hash_hex: string;
}): EvidenceReference {
  const evidence_reference_id = `ev_${sha256Hex(input.url).slice(0, 24)}`;
  return {
    evidence_reference_id,
    source_id: HOOPHALL_SOURCE_ID,
    source_config_version: "v1",
    source_set_id: null,

    source_artifact_identifier: null,
    source_url_or_reference: input.url,
    content_hash: input.content_hash_hex,

    retrieved_at: input.collected_at_iso,
    published_at: input.published_at_iso,
    event_time: null,

    evidence_type: "official_announcement",
    access_classification: "public",
    legal_policy_version: "b6.hoophall.link_only.v1",
    retention_policy: "link_only",

      excerpt_or_summary_reference: null,
      support_excerpts: [],
      source_credibility_prior: "high",
    correction_status: "none",
    retraction_status: "none",
    supersedes_evidence_reference_id: null,

    provenance_metadata: {
      headline: input.headline,
      collected_at: input.collected_at_iso,
      published_at: input.published_at_iso
    },

    credibility: { level: "high", bounded_score: null, reasons: ["official_newsroom"] },
    corroborating_evidence_reference_ids: [],
    contradicting_evidence_reference_ids: [],

    schema_version: "evidence_reference_v1"
  };
}

export function buildHoophallClaim(input: {
  evidence_reference_id: string;
  predicate: string;
  subject: EntityRef | null;
  object_date_ymd: string;
  retrieved_at_iso: string;
  announcement_time_iso: string | null;
}): Claim {
  const base: Omit<Claim, "claim_fingerprint"> = {
    claim_id: `cl_${sha256Hex(`${input.evidence_reference_id}|${input.predicate}|${input.object_date_ymd}`).slice(0, 24)}`,
    evidence_reference_id: input.evidence_reference_id,
    subject: input.subject,
    predicate: input.predicate,
    object: { kind: "literal", value: input.object_date_ymd, value_type: "string" },
    event_time: null,
    announcement_time: input.announcement_time_iso,
    retrieved_at: input.retrieved_at_iso,
    observed_vs_inferred: "observed",
    verification_state: "unverified",
    extraction_confidence: { level: "high", reasons: ["explicit_date_in_official_text"] },
    contradiction_state: "none",
    correction_state: "none",
    relevance_window: { start: null, end: null },
    schema_version: "claim_v1",
    interpretation_policy_version: "b6.hoophall.deterministic.v1"
  };
  const claim_fingerprint = computeClaimFingerprint(base);
  return { ...base, claim_fingerprint };
}

export function buildHoophallMilestone(input: {
  category: HoophallMilestoneCategory;
  milestone_date_ymd: string;
  evidence_url: string;
  evidence_label: string;
}): SportsMilestone {
  const milestone_type = "hall_of_fame_anniversary_or_eligibility" as const;
  // Minimal subject resolution for B6: organization-level milestone.
  const subject_entities = [
    {
      entity_type: "organization" as const,
      entity_id: "naismith_basketball_hall_of_fame",
      label: "Naismith Basketball Hall of Fame"
    }
  ];

  const milestone_id = `sports.hoophall.${input.category}.${input.milestone_date_ymd}`;

  const base = {
    schema_version: "sports_milestone_v1" as const,
    milestone_id,
    milestone_type,
    subject_entities,
    team: null,
    league: "basketball" as const,
    geographic_market: "us",
    original_event_date: null,
    milestone_date: input.milestone_date_ymd,
    anniversary_number: null,
    season_or_year: input.milestone_date_ymd.slice(0, 4),
    championship_or_achievement_type: input.category,
    historical_significance: "high" as const,
    fan_collector_relevance: "high" as const,
    partnership_potential: "medium" as const,
    licensing_rights_considerations: [],
    evidence_refs: [{ label: input.evidence_label, url: input.evidence_url }],
    source_ids: [HOOPHALL_SOURCE_ID],
    confidence: "high" as const,
    correction_status: "none" as const,
    review_status: "unreviewed" as const
  };

  const content_hash = computeMilestoneContentHash(base);
  return { ...base, content_hash };
}

export function qualifyHoophallItemToMilestone(input: {
  headline: string;
  listing_description: string | null;
  detail_excerpt: string | null;
}): { ok: false; reason: string } | { ok: true; category: HoophallMilestoneCategory; milestone_date_ymd: string } {
  const snippet = `${input.listing_description ?? ""} ${input.detail_excerpt ?? ""}`.trim();
  const category = classifyHoophallCategory({ headline: input.headline, snippet });
  if (!category) return { ok: false, reason: "unqualified_category" };

  const date = extractFirstExplicitDateYmd(snippet);
  if (!date) return { ok: false, reason: "missing_explicit_date" };

  return { ok: true, category, milestone_date_ymd: date };
}
