import crypto from "node:crypto";

import type { Claim } from "@/lib/external-intelligence/contracts/claim";
import { computeClaimFingerprint } from "@/lib/external-intelligence/contracts/claim";
import { buildDeterministicClaimIdV2 } from "@/lib/external-intelligence/contracts/claim-id-v2";
import {
  canonicalizeClaimQualifiersV2,
  type ClaimQualifierV2
} from "@/lib/external-intelligence/contracts/claim-qualifiers-v2";
import type { EntityRef } from "@/lib/external-intelligence/contracts/entity-ref";
import { buildProvisionalEntityRefV1 } from "@/lib/external-intelligence/entities/provisional-entity-ref-v1";
import { getPredicateQualifierPolicyV2 } from "@/lib/external-intelligence/qualification/predicate-qualifier-policy-v2";

export type GeneralizedClaimQualifierStatusV2 = "qualified" | "not_qualified" | "unsupported" | "error";

export type GeneralizedClaimQualifierResultV2 = {
  status: GeneralizedClaimQualifierStatusV2;
  reason_codes: string[];
  claims: Claim[];
  diagnostics: {
    supporting_phrases: Array<{ claim_id: string; supporting_phrase: string }>;
  };
};

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function stripHtmlToText(input: string): string {
  const withoutTags = input.replace(/<[^>]*>/g, " ");
  return normalizeWhitespace(
    withoutTags
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#8217;/g, "'")
      .replace(/&#8216;/g, "'")
      .replace(/&#8220;/g, '"')
      .replace(/&#8221;/g, '"')
  );
}

function isSpeculativeAppointmentTextV2(text: string): boolean {
  const t = text.toLowerCase();
  const needles = [
    "could be appointed",
    "may be appointed",
    "expected to be appointed",
    "plans to appoint",
    "set to appoint",
    "candidate for",
    "in talks",
    "considering"
  ];
  return needles.some((n) => t.includes(n));
}

type AppointmentExtractionV2 = {
  appointing_org: string;
  appointed_entity: string;
  appointment_role: string;
  supporting_phrase: string;
};

function extractAppointedFromTextV2(text: string): AppointmentExtractionV2 | null {
  const t = normalizeWhitespace(text);
  if (!t) return null;

  if (isSpeculativeAppointmentTextV2(t)) return null;

  // Reject obvious non-business noun usage.
  if (/\bappointment\s+(scheduled|booking|booked)\b/i.test(t)) return null;
  if (/\bdoctor'?s\s+appointment\b/i.test(t)) return null;

  // Pattern A: {A} appointed as {B}'s {ROLE}
  {
    const m = t.match(/^(.+?)\s+appointed\s+as\s+(.+?)'s\s+(.+?)(?:\s+in\s+.+)?$/i);
    if (m?.[1] && m?.[2] && m?.[3]) {
      const appointed_entity = normalizeWhitespace(m[1]);
      const appointing_org = normalizeWhitespace(m[2]);
      const appointment_role = normalizeWhitespace(m[3]);
      if (appointing_org && appointed_entity && appointment_role) {
        return { appointing_org, appointed_entity, appointment_role, supporting_phrase: m[0] };
      }
    }
  }

  // Pattern B: {A} appointed as {ROLE} for {B}
  {
    const m = t.match(/^(.+?)\s+appointed\s+as\s+(.+?)\s+for\s+(.+?)(?:\s+for\s+.+)?$/i);
    if (m?.[1] && m?.[2] && m?.[3]) {
      const appointed_entity = normalizeWhitespace(m[1]);
      const appointment_role = normalizeWhitespace(m[2]);
      const appointing_org = normalizeWhitespace(m[3]);
      if (appointing_org && appointed_entity && appointment_role) {
        return { appointing_org, appointed_entity, appointment_role, supporting_phrase: m[0] };
      }
    }
  }

  return null;
}

function buildAppointedClaimV2(input: {
  evidence_reference_id: string;
  source_id: string;
  appointing_org: string;
  appointed_entity: string;
  appointment_role: string;
  supporting_phrase: string;
  retrieved_at_iso: string;
}): Claim {
  const subject: EntityRef = buildProvisionalEntityRefV1({
    canonical_name: input.appointing_org,
    entity_type: "organization",
    source_id: input.source_id,
    evidence_reference_id: input.evidence_reference_id
  });

  const object: EntityRef = buildProvisionalEntityRefV1({
    canonical_name: input.appointed_entity,
    entity_type: "organization",
    source_id: input.source_id,
    evidence_reference_id: input.evidence_reference_id
  });

  const predicate = "appointed";
  const policy = getPredicateQualifierPolicyV2(predicate);
  if (!policy) throw new Error("unsupported_predicate_policy");

  const qualifiers: ClaimQualifierV2[] = canonicalizeClaimQualifiersV2([
    { key: "appointment_role", value_type: "string", value: input.appointment_role }
  ]);

  const claim_id = buildDeterministicClaimIdV2({
    evidence_reference_id: input.evidence_reference_id,
    predicate,
    subject,
    object,
    qualifiers,
    identity_keys: [...policy.identity_keys]
  });

  const base: Omit<Claim, "claim_fingerprint"> = {
    claim_id,
    evidence_reference_id: input.evidence_reference_id,
    subject,
    predicate,
    object: { kind: "entity", entity: object },
    qualifiers,
    event_time: null,
    announcement_time: null,
    retrieved_at: input.retrieved_at_iso,
    observed_vs_inferred: "observed",
    verification_state: "unverified",
    extraction_confidence: {
      level: "high",
      reasons: ["explicit_appointment_language_in_persisted_title_or_excerpt"]
    },
    contradiction_state: "none",
    correction_state: "none",
    relevance_window: { start: null, end: null },
    schema_version: "claim_v2",
    interpretation_policy_version: "generalized_claim_v2.appointed.deterministic.v1"
  };

  const claim_fingerprint = computeClaimFingerprint(base);
  return Object.freeze({ ...base, claim_fingerprint });
}

export function qualifyGeneralizedClaimsV2(input: {
  evidence_reference_id: string;
  source_id: string;
  title: string | null;
  excerpt: string | null;
  retrieved_at_iso: string;
}): GeneralizedClaimQualifierResultV2 {
  try {
    const titleText = input.title ? stripHtmlToText(input.title) : "";
    const excerptText = input.excerpt ? stripHtmlToText(input.excerpt) : "";

    if (!titleText && !excerptText) {
      return { status: "not_qualified", reason_codes: ["missing_text"], claims: [], diagnostics: { supporting_phrases: [] } };
    }

    const appt = extractAppointedFromTextV2(titleText) ?? extractAppointedFromTextV2(excerptText);
    if (!appt) {
      return {
        status: "not_qualified",
        reason_codes: ["no_explicit_appointment"],
        claims: [],
        diagnostics: { supporting_phrases: [] }
      };
    }

    if (!appt.appointment_role) {
      return {
        status: "not_qualified",
        reason_codes: ["appointment_role_unresolved"],
        claims: [],
        diagnostics: { supporting_phrases: [] }
      };
    }
    if (!appt.appointing_org) {
      return {
        status: "not_qualified",
        reason_codes: ["appointment_subject_unresolved"],
        claims: [],
        diagnostics: { supporting_phrases: [] }
      };
    }
    if (!appt.appointed_entity) {
      return {
        status: "not_qualified",
        reason_codes: ["appointment_object_unresolved"],
        claims: [],
        diagnostics: { supporting_phrases: [] }
      };
    }

    const claim = buildAppointedClaimV2({
      evidence_reference_id: input.evidence_reference_id,
      source_id: input.source_id,
      appointing_org: appt.appointing_org,
      appointed_entity: appt.appointed_entity,
      appointment_role: appt.appointment_role,
      supporting_phrase: appt.supporting_phrase,
      retrieved_at_iso: input.retrieved_at_iso
    });

    return {
      status: "qualified",
      reason_codes: ["explicit_appointment_language"],
      claims: [claim],
      diagnostics: { supporting_phrases: [{ claim_id: claim.claim_id, supporting_phrase: appt.supporting_phrase }] }
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message.slice(0, 160) : String(error).slice(0, 160);
    return { status: "error", reason_codes: [`error:${msg}`], claims: [], diagnostics: { supporting_phrases: [] } };
  }
}

export function __test__sha256Hex(input: string): string {
  return sha256Hex(input);
}
