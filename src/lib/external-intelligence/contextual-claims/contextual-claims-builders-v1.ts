import type { VersionRef } from "@/lib/external-intelligence/contracts/version-ref";
import type { EntityRef } from "@/lib/external-intelligence/contracts/entity-ref";
import type { Claim } from "@/lib/external-intelligence/contracts/claim";
import { computeClaimFingerprint } from "@/lib/external-intelligence/contracts/claim";
import { canonicalizeClaimQualifiersV2, type ClaimQualifierV2 } from "@/lib/external-intelligence/contracts/claim-qualifiers-v2";
import { buildDeterministicClaimIdV2Object } from "@/lib/external-intelligence/contracts/claim-id-v2";
import {
  assertAllowedQualifierKeysV1,
  BUSINESS_DOMAIN_VALUES_V1,
  CLASSIFICATION_KINDS_V1,
  CONTEXTUAL_CLAIMS_POLICY_VERSION_V1,
  CONTEXTUAL_CLAIM_QUALIFIER_POLICY_V1,
  ORGANIZATION_TYPE_VALUES_V1,
  SERVICE_SCOPE_VALUES_V1,
  type BusinessDomainV1,
  type ClassificationKindV1,
  type OrganizationTypeV1,
  type ServiceScopeV1
} from "@/lib/external-intelligence/contextual-claims/contextual-claims-policy-v1";

function assertOrganizationEntityRef(ref: EntityRef) {
  if (ref.entity_type !== "organization") throw new Error("subject_must_be_organization");
}

function assertValueInSet<T extends readonly string[]>(val: string, set: T): val is T[number] {
  return (set as readonly string[]).includes(val);
}

function normalizeOptionalLabel(input: string | null | undefined): string | null {
  if (input == null) return null;
  const s = input.replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (s.length > 240) throw new Error("label_too_long");
  return s;
}

function normalizeConfidence(input: string | null | undefined): "low" | "medium" | "high" | null {
  if (input == null) return null;
  const s = input.trim();
  if (!s) return null;
  if (s !== "low" && s !== "medium" && s !== "high") throw new Error("invalid_normalization_confidence");
  return s;
}

export function buildClassifiedAsClaimV1(input: {
  evidence_version_ref: VersionRef;
  retrieved_at_iso: string;

  subject: EntityRef;

  classification_kind: ClassificationKindV1;
  classification_value: OrganizationTypeV1 | BusinessDomainV1;

  source_label?: string | null;
  normalization_policy_version?: string | null;
  normalization_confidence?: "low" | "medium" | "high" | null;
}): Claim {
  if (input.evidence_version_ref.object_type !== "evidence_reference") throw new Error("object_type_mismatch");

  assertOrganizationEntityRef(input.subject);

  if (!assertValueInSet(input.classification_kind, CLASSIFICATION_KINDS_V1)) {
    throw new Error("invalid_classification_kind");
  }

  // Enforce value taxonomy based on kind.
  if (input.classification_kind === "organization_type") {
    if (!assertValueInSet(input.classification_value, ORGANIZATION_TYPE_VALUES_V1)) throw new Error("invalid_organization_type");
  }
  if (input.classification_kind === "business_domain") {
    if (!assertValueInSet(input.classification_value, BUSINESS_DOMAIN_VALUES_V1)) throw new Error("invalid_business_domain");
  }

  const predicate = "classified_as" as const;

  const qualifiers: ClaimQualifierV2[] = canonicalizeClaimQualifiersV2(
    [
      { key: "classification_kind", value_type: "string", value: input.classification_kind },
      ...(normalizeOptionalLabel(input.source_label) ? [{ key: "source_label", value_type: "string", value: normalizeOptionalLabel(input.source_label)! }] : []),
      ...(normalizeOptionalLabel(input.normalization_policy_version)
        ? [{ key: "normalization_policy_version", value_type: "string", value: normalizeOptionalLabel(input.normalization_policy_version)! }]
        : []),
      ...(normalizeConfidence(input.normalization_confidence)
        ? [{ key: "normalization_confidence", value_type: "string", value: normalizeConfidence(input.normalization_confidence)! }]
        : [])
    ]
      // canonicalizeClaimQualifiersV2 expects unique keys; list building above ensures no duplicates.
  );

  assertAllowedQualifierKeysV1({ predicate, qualifiers });

  const policy = CONTEXTUAL_CLAIM_QUALIFIER_POLICY_V1.classified_as;

  const claim_id = buildDeterministicClaimIdV2Object({
    evidence_reference_id: input.evidence_version_ref.object_id,
    predicate,
    subject: input.subject,
    object: {
      kind: "literal",
      value_type: "string",
      value: input.classification_value,
      unit: null,
      language: null
    },
    qualifiers,
    identity_keys: [...policy.identity_qualifier_keys]
  });

  const base: Omit<Claim, "claim_fingerprint"> = {
    claim_id,
    evidence_reference_id: input.evidence_version_ref.object_id,

    subject: input.subject,
    predicate,
    object: { kind: "literal", value_type: "string", value: input.classification_value, unit: null, language: null },

    qualifiers,

    event_time: null,
    announcement_time: null,
    retrieved_at: input.retrieved_at_iso,

    observed_vs_inferred: "observed",
    verification_state: "unverified",
    extraction_confidence: {
      level: "high",
      reasons: ["contextual_claim_builder_v1"]
    },

    contradiction_state: "none",
    correction_state: "none",

    relevance_window: { start: null, end: null },

    schema_version: "claim_v2",
    interpretation_policy_version: `${CONTEXTUAL_CLAIMS_POLICY_VERSION_V1}.${predicate}`
  };

  const claim_fingerprint = computeClaimFingerprint(base);
  return Object.freeze({ ...base, claim_fingerprint });
}

export function buildProvidesServiceToClaimV1(input: {
  evidence_version_ref: VersionRef;
  retrieved_at_iso: string;

  provider: EntityRef;
  client: EntityRef;

  service_scope: ServiceScopeV1;
  service_scope_label?: string | null;
  normalization_policy_version?: string | null;
  normalization_confidence?: "low" | "medium" | "high" | null;
}): Claim {
  if (input.evidence_version_ref.object_type !== "evidence_reference") throw new Error("object_type_mismatch");

  assertOrganizationEntityRef(input.provider);
  assertOrganizationEntityRef(input.client);

  if (!assertValueInSet(input.service_scope, SERVICE_SCOPE_VALUES_V1)) throw new Error("invalid_service_scope");

  const predicate = "provides_service_to" as const;

  const qualifiers: ClaimQualifierV2[] = canonicalizeClaimQualifiersV2([
    { key: "service_scope", value_type: "string", value: input.service_scope },
    ...(normalizeOptionalLabel(input.service_scope_label)
      ? [{ key: "service_scope_label", value_type: "string", value: normalizeOptionalLabel(input.service_scope_label)! }]
      : []),
    ...(normalizeOptionalLabel(input.normalization_policy_version)
      ? [{
          key: "normalization_policy_version",
          value_type: "string",
          value: normalizeOptionalLabel(input.normalization_policy_version)!
        }]
      : []),
    ...(normalizeConfidence(input.normalization_confidence)
      ? [{ key: "normalization_confidence", value_type: "string", value: normalizeConfidence(input.normalization_confidence)! }]
      : [])
  ]);

  assertAllowedQualifierKeysV1({ predicate, qualifiers });

  const policy = CONTEXTUAL_CLAIM_QUALIFIER_POLICY_V1.provides_service_to;

  const claim_id = buildDeterministicClaimIdV2Object({
    evidence_reference_id: input.evidence_version_ref.object_id,
    predicate,
    subject: input.provider,
    object: { kind: "entity", entity_id: input.client.entity_id },
    qualifiers,
    identity_keys: [...policy.identity_qualifier_keys]
  });

  const base: Omit<Claim, "claim_fingerprint"> = {
    claim_id,
    evidence_reference_id: input.evidence_version_ref.object_id,

    subject: input.provider,
    predicate,
    object: { kind: "entity", entity: input.client },

    qualifiers,

    event_time: null,
    announcement_time: null,
    retrieved_at: input.retrieved_at_iso,

    observed_vs_inferred: "observed",
    verification_state: "unverified",
    extraction_confidence: {
      level: "high",
      reasons: ["contextual_claim_builder_v1"]
    },

    contradiction_state: "none",
    correction_state: "none",

    relevance_window: { start: null, end: null },

    schema_version: "claim_v2",
    interpretation_policy_version: `${CONTEXTUAL_CLAIMS_POLICY_VERSION_V1}.${predicate}`
  };

  const claim_fingerprint = computeClaimFingerprint(base);
  return Object.freeze({ ...base, claim_fingerprint });
}
