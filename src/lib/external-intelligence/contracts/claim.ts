import { computeContentHash } from "@/lib/external-intelligence/contracts/version-ref";
import type { EntityRef } from "@/lib/external-intelligence/contracts/entity-ref";
import type { ClaimVerificationState, ObservedVsInferred } from "@/lib/external-intelligence/contracts/enums";

export type ClaimRelevanceWindow = {
  start: string | null; // ISO-8601
  end: string | null; // ISO-8601
};

export type ClaimObjectLiteral = {
  kind: "literal";
  value: string | number | boolean | null;
  unit?: string | null;
};

export type ClaimObjectEntity = {
  kind: "entity";
  entity: EntityRef;
};

export type ClaimObject = ClaimObjectLiteral | ClaimObjectEntity;

export type Claim = {
  claim_id: string;

  // Deterministic identity for dedupe and history.
  claim_fingerprint: string;

  evidence_reference_id: string;

  subject: EntityRef | null; // nullable when entity is unresolved/ambiguous
  predicate: string;
  object: ClaimObject;

  event_time: string | null;
  announcement_time: string | null;
  retrieved_at: string;

  observed_vs_inferred: ObservedVsInferred;
  verification_state: ClaimVerificationState;

  extraction_confidence: {
    level: "high" | "medium" | "low";
    reasons: string[];
  };

  contradiction_state: "none" | "contradicted";
  correction_state: "none" | "corrected" | "retracted";

  relevance_window: ClaimRelevanceWindow;

  schema_version: string;
  interpretation_policy_version: string;
};

export function computeClaimFingerprint(input: Omit<Claim, "claim_fingerprint">): string {
  // Deterministic fingerprint based on canonical claim content.
  // Note: claim_id is excluded so the fingerprint can be used to derive ids.
  const stable = {
    evidence_reference_id: input.evidence_reference_id,
    subject_entity_id: input.subject?.entity_id ?? null,
    predicate: input.predicate,
    object:
      input.object.kind === "entity"
        ? { kind: "entity", entity_id: input.object.entity.entity_id }
        : { kind: "literal", value: input.object.value, unit: input.object.unit ?? null },
    event_time: input.event_time,
    announcement_time: input.announcement_time,
    observed_vs_inferred: input.observed_vs_inferred,
    verification_state: input.verification_state,
    relevance_window: input.relevance_window,
    schema_version: input.schema_version,
    interpretation_policy_version: input.interpretation_policy_version
  };
  return computeContentHash(stable);
}
