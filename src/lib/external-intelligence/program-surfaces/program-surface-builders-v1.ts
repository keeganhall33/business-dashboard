import type { VersionRef } from "@/lib/external-intelligence/contracts/version-ref";
import type { EntityRef } from "@/lib/external-intelligence/contracts/entity-ref";
import type { Claim } from "@/lib/external-intelligence/contracts/claim";
import { computeClaimFingerprint } from "@/lib/external-intelligence/contracts/claim";
import { canonicalizeClaimQualifiersV2, type ClaimQualifierV2 } from "@/lib/external-intelligence/contracts/claim-qualifiers-v2";
import { buildDeterministicClaimIdV2Object } from "@/lib/external-intelligence/contracts/claim-id-v2";
import type { ExternalSourceClassV1 } from "@/lib/external-intelligence/targeted-research/targeted-research-contracts-v1";
import {
  PROGRAM_SURFACE_POLICY_VERSION_V1,
  PROGRAM_SURFACE_PREDICATE_POLICY_V1,
  type ProgramSurfaceEvidenceDomainV1,
  type ProgramSurfaceObjectValueV1,
  type ProgramSurfacePredicateV1,
  assertAllowedQualifierKeysProgramSurfaceV1,
  assertProgramSurfaceObjectAllowedV1,
  assertProgramSurfaceQualifierValuesV1,
  assertProgramSurfaceSourceEligibleV1
} from "@/lib/external-intelligence/program-surfaces/program-surface-policy-v1";

function assertOrganizationEntityRef(ref: EntityRef) {
  if (ref.entity_type !== "organization") throw new Error("subject_must_be_organization");
}

function normalizeConfidence(input: string): "low" | "medium" | "high" {
  const s = input.trim();
  if (s !== "low" && s !== "medium" && s !== "high") throw new Error("invalid_normalization_confidence");
  return s;
}

export type ProgramSurfaceNormalizationConfidenceV1 = "low" | "medium" | "high";

export type ProgramSurfaceClaimBuildResultV1 =
  | {
      status: "eligible";
      persistence_eligible: true;
      claim: Claim;
    }
  | {
      status: "preview";
      persistence_eligible: false;
      claim: Claim;
      reason: "normalization_confidence_not_high";
    };

export function buildProgramSurfaceClaimV1(input: {
  evidence_version_ref: VersionRef;
  retrieved_at_iso: string;

  subject: EntityRef;
  predicate: ProgramSurfacePredicateV1;
  object_value: ProgramSurfaceObjectValueV1;

  normalization_confidence: ProgramSurfaceNormalizationConfidenceV1;

  evidence_domain: ProgramSurfaceEvidenceDomainV1;
  external_source_class: ExternalSourceClassV1;

  qualifiers?: ClaimQualifierV2[] | null;
}): ProgramSurfaceClaimBuildResultV1 {
  if (input.evidence_version_ref.object_type !== "evidence_reference") throw new Error("object_type_mismatch");

  assertOrganizationEntityRef(input.subject);

  const policy = PROGRAM_SURFACE_PREDICATE_POLICY_V1[input.predicate];
  if (!policy) throw new Error("unknown_predicate");

  assertProgramSurfaceSourceEligibleV1({
    predicate: input.predicate,
    evidence_domain: input.evidence_domain,
    external_source_class: input.external_source_class
  });

  assertProgramSurfaceObjectAllowedV1({ predicate: input.predicate, object_value: input.object_value });

  const conf = normalizeConfidence(input.normalization_confidence);
  if (conf === "low") throw new Error("low_confidence_suppressed");

  const qualifiers = canonicalizeClaimQualifiersV2(input.qualifiers ?? []);
  assertAllowedQualifierKeysProgramSurfaceV1({ predicate: input.predicate, qualifiers });
  assertProgramSurfaceQualifierValuesV1({ predicate: input.predicate, qualifiers });

  const claim_id = buildDeterministicClaimIdV2Object({
    evidence_reference_id: input.evidence_version_ref.object_id,
    predicate: input.predicate,
    subject: input.subject,
    object: {
      kind: "literal",
      value_type: "string",
      value: input.object_value,
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
    predicate: input.predicate,
    object: { kind: "literal", value_type: "string", value: input.object_value, unit: null, language: null },

    qualifiers,

    event_time: null,
    announcement_time: null,
    retrieved_at: input.retrieved_at_iso,

    observed_vs_inferred: "observed",
    verification_state: "unverified",
    extraction_confidence: {
      level: conf,
      reasons: ["program_surface_builder_v1"]
    },

    contradiction_state: "none",
    correction_state: "none",

    relevance_window: { start: null, end: null },

    schema_version: "claim_v2",
    interpretation_policy_version: `${PROGRAM_SURFACE_POLICY_VERSION_V1}.${input.predicate}`
  };

  const claim_fingerprint = computeClaimFingerprint(base);
  const claim = Object.freeze({ ...base, claim_fingerprint });

  if (conf !== "high") {
    return {
      status: "preview",
      persistence_eligible: false,
      claim,
      reason: "normalization_confidence_not_high"
    };
  }

  return { status: "eligible", persistence_eligible: true, claim };
}

