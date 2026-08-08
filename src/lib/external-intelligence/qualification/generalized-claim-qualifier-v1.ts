import type { Claim } from "@/lib/external-intelligence/contracts/claim";
import { computeClaimFingerprint } from "@/lib/external-intelligence/contracts/claim";
import type { EntityRef } from "@/lib/external-intelligence/contracts/entity-ref";
import { buildProvisionalEntityRefV1 } from "@/lib/external-intelligence/entities/provisional-entity-ref-v1";

import crypto from "node:crypto";

export type GeneralizedClaimQualifierStatusV1 = "qualified" | "not_qualified" | "unsupported" | "error";

export type GeneralizedClaimQualifierResultV1 = {
  status: GeneralizedClaimQualifierStatusV1;
  reason_codes: string[];
  claims: Array<Claim & { supporting_phrase: string }>;
};

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function stripHtmlToText(input: string): string {
  // Minimal, deterministic HTML stripping for RSS excerpts.
  // NOTE: We intentionally avoid fetching bodies; only persisted excerpt/title are used.
  const withoutTags = input.replace(/<[^>]*>/g, " ");
  return normalizeWhitespace(
    withoutTags
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      // Boardroom commonly uses these numeric entities in titles/excerpts.
      .replace(/&#8217;/g, "'")
      .replace(/&#8216;/g, "'")
      .replace(/&#8220;/g, '"')
      .replace(/&#8221;/g, '"')
  );
}

function cleanExtractedEntityNameV1(name: string): string {
  // We only have title+excerpt, so extra trailing clause text is common.
  // Precision-first trimming: remove obvious continuations after a proper-noun entity.
  let n = normalizeWhitespace(name);

  // Trim at common continuation tokens when they appear as lowercase words.
  // Example (BR-1): "Google's DeepMind may make business sense" -> "Google's DeepMind"
  n = n.replace(/\s+(may|might|can|could|should|would|but|as|which|that)\b[\s\S]*$/i, (full, kw) => {
    // Only apply when the keyword is lowercase in the original match window.
    // (We avoid trimming when the keyword is part of a proper name.)
    return /\s+[a-z]/.test(` ${kw}`) ? "" : full;
  });

  // Remove trailing punctuation.
  n = n.replace(/[\s\]\)\"'”]+$/g, "");
  n = n.replace(/^[\[\(\"'“]+/g, "");

  return normalizeWhitespace(n);
}

function normalizeKnownPossessiveArtifactsV1(name: string): string {
  // Narrow, defensible normalization:
  // Boardroom excerpt includes "Google's DeepMind" for the proper name "Google DeepMind".
  // We *only* normalize this exact observed form to avoid broad possessive rewriting.
  const n = normalizeWhitespace(name);
  if (n === "Google's DeepMind") return "Google DeepMind";
  return n;
}

function buildDeterministicClaimIdV1(input: {
  evidence_reference_id: string;
  predicate: string;
  subject: EntityRef;
  object: EntityRef;
}): string {
  // Evidence-scoped deterministic identity (consistent with Hoophall style).
  const key = `${input.evidence_reference_id}|${input.predicate}|${input.subject.entity_id}|${input.object.entity_id}`;
  return `cl_${sha256Hex(key).slice(0, 24)}`;
}

type PartnershipExtraction = { subject_name: string; object_name: string; supporting_phrase: string };

function extractPartneredWithFromTextV1(text: string): PartnershipExtraction | null {
  const t = normalizeWhitespace(text);
  if (!t) return null;

  // Hard rejects (precision-first): speculative / negated / near-miss.
  const rejectPhrases = [
    /\bmay\s+partner\b/i,
    /\bcould\s+partner\b/i,
    /\bplans\s+to\s+partner\b/i,
    /\bconsidering\s+(a\s+)?partnership\b/i,
    /\bpotential\s+partnership\b/i,
    /\btalks?\s+about\s+(a\s+)?partnership\b/i,
    /\bnot\s+a\s+partnership\b/i,
    /\bno\s+partnership\b/i,
    /\bwith\s+help\s+from\b/i,
    /\bpowered\s+by\b/i,
    /\bworking\s+with\b/i,
    /\bsupported\s+by\b/i,
    /\bin\s+collaboration\s+with\b/i,
    /\busing\b/i
  ];
  if (rejectPhrases.some((re) => re.test(t))) return null;

  // Accepted explicit forms.
  // 1) X partnered with Y
  {
    const m = t.match(/\b(.+?)\s+partnered\s+with\s+(.+?)\b/i);
    if (m?.[1] && m?.[2]) {
      const subject_name = normalizeWhitespace(m[1]);
      const object_name = normalizeWhitespace(m[2]);
      if (subject_name && object_name) return { subject_name, object_name, supporting_phrase: m[0] };
    }
  }

  // 2) partnership between X and Y
  {
    const m = t.match(/\bpartnership\s+between\s+(.+?)\s+and\s+(.+?)\b/i);
    if (m?.[1] && m?.[2]) {
      const subject_name = normalizeWhitespace(m[1]);
      const object_name = normalizeWhitespace(m[2]);
      if (subject_name && object_name) return { subject_name, object_name, supporting_phrase: m[0] };
    }
  }

  // 3) X announced a partnership with Y
  {
    const m = t.match(/\b(.+?)\s+announced\s+(a\s+)?partnership\s+with\s+(.+?)\b/i);
    if (m?.[1] && m?.[3]) {
      const subject_name = normalizeWhitespace(m[1]);
      const object_name = normalizeWhitespace(m[3]);
      if (subject_name && object_name) return { subject_name, object_name, supporting_phrase: m[0] };
    }
  }

  // 4) X's ... partnership with Y
  // e.g. "A24's $75 million partnership with Google's DeepMind"
  {
    // Strict subject capture to avoid title false-positives (e.g. "It's").
    // V1: only admit when the subject is a single explicit token (A24, Nike, etc.).
    const m = t.match(/\b([A-Z0-9][A-Za-z0-9&.-]{1,})'s\s+[^.]*?\bpartnership\s+with\s+([^.;,]+)/i);
    if (m?.[1] && m?.[2]) {
      const subject_name = normalizeWhitespace(m[1]);
      const object_name = normalizeWhitespace(m[2]);
      if (subject_name && object_name) return { subject_name, object_name, supporting_phrase: m[0] };
    }
  }

  // 5) X partnership with Y
  {
    const m = t.match(/\b(.+?)\s+partnership\s+with\s+(.+?)\b/i);
    if (m?.[1] && m?.[2]) {
      const subject_name = normalizeWhitespace(m[1]);
      const object_name = normalizeWhitespace(m[2]);
      // Guard: avoid cases like "$75 million partnership with Y" (missing subject).
      if (subject_name && object_name && !/^\$?\d/.test(subject_name)) {
        return { subject_name, object_name, supporting_phrase: m[0] };
      }
    }
  }

  return null;
}

export function qualifyGeneralizedClaimsV1(input: {
  evidence_reference_id: string;
  source_id: string;
  title: string | null;
  excerpt: string | null;
  retrieved_at_iso: string;
}): GeneralizedClaimQualifierResultV1 {
  try {
    const titleText = input.title ? stripHtmlToText(input.title) : "";
    const excerptText = input.excerpt ? stripHtmlToText(input.excerpt) : "";

    if (!titleText && !excerptText) {
      return { status: "not_qualified", reason_codes: ["missing_text"], claims: [] };
    }

    // Precision-first: prefer excerpt/description over headline to avoid false matches (e.g. "It's" in titles).
    const partnered = extractPartneredWithFromTextV1(excerptText) ?? extractPartneredWithFromTextV1(titleText);
    if (!partnered) {
      return { status: "not_qualified", reason_codes: ["no_explicit_partnership"], claims: [] };
    }

    const subjectName = normalizeKnownPossessiveArtifactsV1(cleanExtractedEntityNameV1(partnered.subject_name));
    const objectName = normalizeKnownPossessiveArtifactsV1(cleanExtractedEntityNameV1(partnered.object_name));

    if (!subjectName || !objectName) {
      return { status: "not_qualified", reason_codes: ["missing_subject_or_object"], claims: [] };
    }

    const subject = buildProvisionalEntityRefV1({
      canonical_name: subjectName,
      entity_type: "organization",
      source_id: input.source_id,
      evidence_reference_id: input.evidence_reference_id
    });

    const object = buildProvisionalEntityRefV1({
      canonical_name: objectName,
      entity_type: "organization",
      source_id: input.source_id,
      evidence_reference_id: input.evidence_reference_id
    });

    const predicate = "partnered_with";

    const base: Omit<Claim, "claim_fingerprint"> = {
      claim_id: buildDeterministicClaimIdV1({
        evidence_reference_id: input.evidence_reference_id,
        predicate,
        subject,
        object
      }),
      evidence_reference_id: input.evidence_reference_id,
      subject,
      predicate,
      object: { kind: "entity", entity: object },
      event_time: null,
      announcement_time: null,
      retrieved_at: input.retrieved_at_iso,
      observed_vs_inferred: "observed",
      verification_state: "unverified",
      extraction_confidence: { level: "high", reasons: ["explicit_partnership_language_in_persisted_excerpt"] },
      contradiction_state: "none",
      correction_state: "none",
      relevance_window: { start: null, end: null },
      schema_version: "claim_v1",
      interpretation_policy_version: "generalized_claim_v1.partnered_with.deterministic.v1"
    };

    const claim_fingerprint = computeClaimFingerprint(base);
    const claim: Claim & { supporting_phrase: string } = {
      ...base,
      claim_fingerprint,
      supporting_phrase: partnered.supporting_phrase
    };

    return { status: "qualified", reason_codes: [], claims: [claim] };
  } catch (error) {
    const msg = error instanceof Error ? error.message.slice(0, 160) : String(error).slice(0, 160);
    return { status: "error", reason_codes: [`error:${msg}`], claims: [] };
  }
}
