import crypto from "node:crypto";

const TAG_NULL = 0x4e; // 'N'
const TAG_STRING = 0x53; // 'S'
const TAG_ARRAY_STRING = 0x41; // 'A'

export type FingerprintV2Atom =
  | { kind: "null" }
  | { kind: "string"; value: string }
  | { kind: "array<string>"; value: string[] };

function int32be(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeInt32BE(value, 0);
  return buf;
}

function encodeNull(): Buffer {
  return Buffer.concat([Buffer.from([TAG_NULL]), int32be(-1)]);
}

function encodeString(value: string): Buffer {
  const bytes = Buffer.from(value, "utf8");
  return Buffer.concat([Buffer.from([TAG_STRING]), int32be(bytes.byteLength), bytes]);
}

function encodeArrayString(values: string[]): Buffer {
  const parts: Buffer[] = [Buffer.from([TAG_ARRAY_STRING]), int32be(values.length)];
  for (const v of values) parts.push(encodeString(v));
  return Buffer.concat(parts);
}

export function encodeFingerprintV2Atom(atom: FingerprintV2Atom): Buffer {
  switch (atom.kind) {
    case "null":
      return encodeNull();
    case "string":
      return encodeString(atom.value);
    case "array<string>":
      return encodeArrayString(atom.value);
    default: {
      const _exhaustive: never = atom;
      return _exhaustive;
    }
  }
}

export function encodeFingerprintV2Tuple(input: {
  prefix: string;
  tupleKind:
    | "evidence_retained_payload_v2"
    | "evidence_version_fingerprint_v2"
    | "claim_version_content_hash_v2";
  fields: FingerprintV2Atom[];
}): Buffer {
  const parts: Buffer[] = [];
  // Tuple framing: prefix + tupleKind + fields, each framed as STRING/NULL/ARRAY<STRING>.
  parts.push(encodeString(input.prefix));
  parts.push(encodeString(input.tupleKind));
  for (const f of input.fields) parts.push(encodeFingerprintV2Atom(f));
  return Buffer.concat(parts);
}

export function sha256Hex(bytes: Uint8Array): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export const EI_FINGERPRINT_CONTRACT_V2 = "ei_fingerprint_v2" as const;

// ------------------------------
// Evidence retained payload v2
// ------------------------------

export type EvidenceRetainedPayloadV2 =
  | {
      lane: "structured_metadata";
      identity_url: string;
      title: string;
      meta_description: string;
      og_site_name: string | null;
      og_title: string;
      jsonld_types: string[];
    }
  | {
      lane: "quote_only";
      source_url: string;
      quote_text: string;
      quote_context: string | null;
      title: string | null;
    }
  | {
      lane: "link_only";
      source_url: string;
      title: string;
      summary: string | null;
    };

export function createEvidenceRetainedPayloadHashV2(payload: EvidenceRetainedPayloadV2): string {
  const fields: FingerprintV2Atom[] = [];

  fields.push({ kind: "string", value: payload.lane });

  switch (payload.lane) {
    case "structured_metadata":
      fields.push({ kind: "string", value: payload.identity_url });
      fields.push({ kind: "string", value: payload.title });
      fields.push({ kind: "string", value: payload.meta_description });
      fields.push(
        payload.og_site_name === null ? { kind: "null" } : { kind: "string", value: payload.og_site_name }
      );
      fields.push({ kind: "string", value: payload.og_title });
      fields.push({ kind: "array<string>", value: payload.jsonld_types });
      break;
    case "quote_only":
      fields.push({ kind: "string", value: payload.source_url });
      fields.push({ kind: "string", value: payload.quote_text });
      fields.push(
        payload.quote_context === null ? { kind: "null" } : { kind: "string", value: payload.quote_context }
      );
      fields.push(payload.title === null ? { kind: "null" } : { kind: "string", value: payload.title });
      break;
    case "link_only":
      fields.push({ kind: "string", value: payload.source_url });
      fields.push({ kind: "string", value: payload.title });
      fields.push(payload.summary === null ? { kind: "null" } : { kind: "string", value: payload.summary });
      break;
    default: {
      const _exhaustive: never = payload;
      return _exhaustive;
    }
  }

  const bytes = encodeFingerprintV2Tuple({
    prefix: EI_FINGERPRINT_CONTRACT_V2,
    tupleKind: "evidence_retained_payload_v2",
    fields
  });
  return sha256Hex(bytes);
}

// ------------------------------
// Evidence version fingerprint v2
// ------------------------------

export type EvidenceVersionSemanticV2 = {
  schema_version: string;
  source_id: string;
  source_config_version: string;
  legal_policy_version: string;

  evidence_type: string;
  access_classification: string;
  retention_policy: string;

  source_set_id: string | null;
  source_artifact_identifier: string | null;
  source_url_or_reference: string;

  published_at: string | null;
  event_time: string | null;

  excerpt_or_summary_reference: string | null;
  source_credibility_prior: string;

  correction_status: string;
  retraction_status: string;
  supersedes_evidence_reference_id: string | null;

  // Must already be canonicalized upstream when semantically unordered.
  corroborating_evidence_reference_ids: string[];
  contradicting_evidence_reference_ids: string[];

  retained_payload_hash_v2: string;
};

export function createEvidenceVersionFingerprintV2(input: EvidenceVersionSemanticV2): string {
  const fields: FingerprintV2Atom[] = [
    { kind: "string", value: input.schema_version },
    { kind: "string", value: input.source_id },
    { kind: "string", value: input.source_config_version },
    { kind: "string", value: input.legal_policy_version },

    { kind: "string", value: input.evidence_type },
    { kind: "string", value: input.access_classification },
    { kind: "string", value: input.retention_policy },

    input.source_set_id === null ? { kind: "null" } : { kind: "string", value: input.source_set_id },
    input.source_artifact_identifier === null
      ? { kind: "null" }
      : { kind: "string", value: input.source_artifact_identifier },
    { kind: "string", value: input.source_url_or_reference },

    input.published_at === null ? { kind: "null" } : { kind: "string", value: input.published_at },
    input.event_time === null ? { kind: "null" } : { kind: "string", value: input.event_time },

    input.excerpt_or_summary_reference === null
      ? { kind: "null" }
      : { kind: "string", value: input.excerpt_or_summary_reference },
    { kind: "string", value: input.source_credibility_prior },

    { kind: "string", value: input.correction_status },
    { kind: "string", value: input.retraction_status },
    input.supersedes_evidence_reference_id === null
      ? { kind: "null" }
      : { kind: "string", value: input.supersedes_evidence_reference_id },

    { kind: "array<string>", value: input.corroborating_evidence_reference_ids },
    { kind: "array<string>", value: input.contradicting_evidence_reference_ids },

    { kind: "string", value: input.retained_payload_hash_v2 }
  ];

  const bytes = encodeFingerprintV2Tuple({
    prefix: EI_FINGERPRINT_CONTRACT_V2,
    tupleKind: "evidence_version_fingerprint_v2",
    fields
  });
  return sha256Hex(bytes);
}

// ------------------------------
// Claim version content hash v2
// ------------------------------

export type ClaimVersionSemanticV2 = {
  // NOTE: This mirrors the current Claim payload shape used by builders.
  claim_id: string;
  claim_fingerprint: string;
  evidence_reference_id: string;
  subject_entity_id: string | null;
  predicate: string;
  object_kind: "entity" | "literal";
  object_entity_id: string | null;
  object_literal_value: string | null;
  object_literal_unit: string | null;
  object_literal_value_type: string | null;
  object_literal_language: string | null;

  event_time: string | null;
  announcement_time: string | null;

  observed_vs_inferred: string;
  verification_state: string;

  extraction_confidence_level: string;
  extraction_confidence_reasons: string[];

  contradiction_state: string;
  correction_state: string;

  relevance_window_start: string | null;
  relevance_window_end: string | null;

  schema_version: string;
  interpretation_policy_version: string;
};

export function createClaimVersionContentHashV2(input: ClaimVersionSemanticV2): string {
  const fields: FingerprintV2Atom[] = [
    { kind: "string", value: input.claim_id },
    { kind: "string", value: input.claim_fingerprint },
    { kind: "string", value: input.evidence_reference_id },
    input.subject_entity_id === null ? { kind: "null" } : { kind: "string", value: input.subject_entity_id },
    { kind: "string", value: input.predicate },

    { kind: "string", value: input.object_kind },
    input.object_entity_id === null ? { kind: "null" } : { kind: "string", value: input.object_entity_id },
    input.object_literal_value === null ? { kind: "null" } : { kind: "string", value: input.object_literal_value },
    input.object_literal_unit === null ? { kind: "null" } : { kind: "string", value: input.object_literal_unit },
    input.object_literal_value_type === null
      ? { kind: "null" }
      : { kind: "string", value: input.object_literal_value_type },
    input.object_literal_language === null
      ? { kind: "null" }
      : { kind: "string", value: input.object_literal_language },

    input.event_time === null ? { kind: "null" } : { kind: "string", value: input.event_time },
    input.announcement_time === null ? { kind: "null" } : { kind: "string", value: input.announcement_time },

    { kind: "string", value: input.observed_vs_inferred },
    { kind: "string", value: input.verification_state },

    { kind: "string", value: input.extraction_confidence_level },
    { kind: "array<string>", value: input.extraction_confidence_reasons },

    { kind: "string", value: input.contradiction_state },
    { kind: "string", value: input.correction_state },

    input.relevance_window_start === null ? { kind: "null" } : { kind: "string", value: input.relevance_window_start },
    input.relevance_window_end === null ? { kind: "null" } : { kind: "string", value: input.relevance_window_end },

    { kind: "string", value: input.schema_version },
    { kind: "string", value: input.interpretation_policy_version }
  ];

  const bytes = encodeFingerprintV2Tuple({
    prefix: EI_FINGERPRINT_CONTRACT_V2,
    tupleKind: "claim_version_content_hash_v2",
    fields
  });
  return sha256Hex(bytes);
}
