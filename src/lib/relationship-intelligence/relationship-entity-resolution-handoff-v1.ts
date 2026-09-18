export type RelationshipEntityTruthStateV1 =
  | "KNOWN"
  | "INFERRED"
  | "PARTIAL"
  | "STALE"
  | "CONFLICTED"
  | "UNKNOWN";

export type RelationshipEntityTypeV1 = "PERSON" | "ORGANIZATION";

export interface RelationshipEntityEvidenceFieldV1<T> {
  readonly state: RelationshipEntityTruthStateV1;
  readonly value: T | null;
  readonly evidenceRefs: readonly string[];
}

export interface RelationshipExternalIdentityV1 {
  /** Stable source-owned identity namespace, not a contact channel. */
  readonly namespace: string;
  /** Opaque source-owned identity. Email addresses and phone numbers are out of scope. */
  readonly value: string;
}

export interface RelationshipEntityCandidateV1 {
  readonly candidateId: string;
  readonly sourceRef: string;
  readonly observedAt: string;
  readonly evidenceRefs: readonly string[];
  readonly entityType: RelationshipEntityTypeV1;
  readonly displayName: RelationshipEntityEvidenceFieldV1<string>;
  readonly explicitCanonicalEntityRef?: RelationshipEntityEvidenceFieldV1<string> | null;
  readonly externalIdentity?: RelationshipEntityEvidenceFieldV1<RelationshipExternalIdentityV1> | null;
}

export interface RelationshipCanonicalEntityV1 {
  readonly canonicalEntityRef: string;
  readonly entityType: RelationshipEntityTypeV1;
  readonly externalIdentities: readonly RelationshipExternalIdentityV1[];
}

export type RelationshipEntityResolutionDispositionV1 =
  | "MATCH_EXISTING"
  | "CREATE_CANDIDATE"
  | "REVIEW_REQUIRED"
  | "BLOCKED";

export type RelationshipEntityResolutionReasonV1 =
  | "EXPLICIT_CANONICAL_REF_MATCH"
  | "EXACT_EXTERNAL_IDENTITY_MATCH"
  | "NEW_STABLE_IDENTITY_CANDIDATE"
  | "NAME_ONLY_RESOLUTION_FORBIDDEN"
  | "MISSING_SOURCE_PROVENANCE"
  | "MISSING_FIELD_EVIDENCE"
  | "EVIDENCE_NOT_KNOWN"
  | "OBSERVATION_STALE"
  | "OBSERVATION_IN_FUTURE"
  | "INVALID_OBSERVED_AT"
  | "UNSUPPORTED_CONTACT_IDENTITY"
  | "CANONICAL_REF_NOT_FOUND"
  | "CANONICAL_ENTITY_TYPE_CONFLICT"
  | "EXTERNAL_IDENTITY_TYPE_CONFLICT"
  | "AMBIGUOUS_EXTERNAL_IDENTITY"
  | "EXPLICIT_REF_EXTERNAL_IDENTITY_CONFLICT";

export interface RelationshipEntityResolutionDecisionV1 {
  readonly candidateId: string;
  readonly entityType: RelationshipEntityTypeV1;
  readonly displayName: string | null;
  readonly disposition: RelationshipEntityResolutionDispositionV1;
  readonly canonicalEntityRef: string | null;
  readonly externalIdentity: RelationshipExternalIdentityV1 | null;
  readonly evidenceRefs: readonly string[];
  readonly reasonCodes: readonly RelationshipEntityResolutionReasonV1[];
  /** This module plans a handoff only. It never mutates the CRM or relationship graph. */
  readonly writeAuthority: "NONE";
  readonly requiresHumanReview: boolean;
}

export interface RelationshipEntityResolutionHandoffV1 {
  readonly generatedAt: string;
  readonly decisions: readonly RelationshipEntityResolutionDecisionV1[];
  readonly crmMutationPerformed: false;
  readonly relationshipEdgeCreated: false;
  readonly contactInfoInferred: false;
  readonly externalActionPerformed: false;
}

export interface ResolveRelationshipEntitiesV1Input {
  readonly candidates: readonly RelationshipEntityCandidateV1[];
  readonly canonicalEntities: readonly RelationshipCanonicalEntityV1[];
  readonly now: string;
  readonly maxObservationAgeDays?: number;
}

const DEFAULT_MAX_OBSERVATION_AGE_DAYS = 45;
const DAY_MS = 24 * 60 * 60 * 1000;

function freezeArray<T>(items: readonly T[]): readonly T[] {
  return Object.freeze([...items]);
}

function freezeIdentity(identity: RelationshipExternalIdentityV1 | null): RelationshipExternalIdentityV1 | null {
  return identity ? Object.freeze({ namespace: identity.namespace, value: identity.value }) : null;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function uniqueEvidenceRefs(...groups: readonly (readonly string[])[]): readonly string[] {
  return freezeArray(
    [...new Set(groups.flatMap((group) => group.map((value) => value.trim()).filter(Boolean)))].sort()
  );
}

function isSupportedIdentity(identity: RelationshipExternalIdentityV1): boolean {
  const namespace = normalizeToken(identity.namespace);
  const value = identity.value.trim();
  if (!namespace || !value) return false;

  // Contact coordinates are deliberately excluded from entity resolution. They are mutable,
  // privacy-sensitive, and must not silently become identity keys.
  if (/email|e-mail|phone|mobile|sms|whatsapp/.test(namespace)) return false;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return false;
  if (/^\+?[\d\s().-]{7,}$/.test(value)) return false;
  return true;
}

function sameIdentity(a: RelationshipExternalIdentityV1, b: RelationshipExternalIdentityV1): boolean {
  return normalizeToken(a.namespace) === normalizeToken(b.namespace) && a.value.trim() === b.value.trim();
}

function fieldIsKnown<T>(field: RelationshipEntityEvidenceFieldV1<T> | null | undefined): field is RelationshipEntityEvidenceFieldV1<T> & { value: T } {
  return Boolean(field && field.state === "KNOWN" && field.value !== null);
}

function fieldHasEvidence<T>(field: RelationshipEntityEvidenceFieldV1<T> | null | undefined): boolean {
  return Boolean(field?.evidenceRefs.some((ref) => ref.trim().length > 0));
}

function decision(
  candidate: RelationshipEntityCandidateV1,
  disposition: RelationshipEntityResolutionDispositionV1,
  canonicalEntityRef: string | null,
  externalIdentity: RelationshipExternalIdentityV1 | null,
  reasonCodes: readonly RelationshipEntityResolutionReasonV1[],
  evidenceRefs: readonly string[]
): RelationshipEntityResolutionDecisionV1 {
  return Object.freeze({
    candidateId: candidate.candidateId,
    entityType: candidate.entityType,
    displayName: fieldIsKnown(candidate.displayName) ? candidate.displayName.value.trim() || null : null,
    disposition,
    canonicalEntityRef,
    externalIdentity: freezeIdentity(externalIdentity),
    evidenceRefs: uniqueEvidenceRefs(evidenceRefs),
    reasonCodes: freezeArray(reasonCodes),
    writeAuthority: "NONE" as const,
    requiresHumanReview: disposition !== "MATCH_EXISTING"
  });
}

export function resolveRelationshipEntityHandoffV1(
  input: ResolveRelationshipEntitiesV1Input
): RelationshipEntityResolutionHandoffV1 {
  const nowMs = Date.parse(input.now);
  if (!Number.isFinite(nowMs)) throw new Error("now must be a valid ISO timestamp");

  const maxAgeDays = input.maxObservationAgeDays ?? DEFAULT_MAX_OBSERVATION_AGE_DAYS;
  if (!Number.isFinite(maxAgeDays) || maxAgeDays <= 0) throw new Error("maxObservationAgeDays must be positive");

  const canonicalByRef = new Map(input.canonicalEntities.map((entity) => [entity.canonicalEntityRef, entity] as const));

  const decisions = input.candidates.map((candidate) => {
    const sourceEvidence = uniqueEvidenceRefs(candidate.evidenceRefs);
    if (!candidate.sourceRef.trim() || sourceEvidence.length === 0) {
      return decision(candidate, "BLOCKED", null, null, ["MISSING_SOURCE_PROVENANCE"], sourceEvidence);
    }

    const observedMs = Date.parse(candidate.observedAt);
    if (!Number.isFinite(observedMs)) {
      return decision(candidate, "BLOCKED", null, null, ["INVALID_OBSERVED_AT"], sourceEvidence);
    }
    if (observedMs > nowMs) {
      return decision(candidate, "BLOCKED", null, null, ["OBSERVATION_IN_FUTURE"], sourceEvidence);
    }
    if (nowMs - observedMs > maxAgeDays * DAY_MS) {
      return decision(candidate, "REVIEW_REQUIRED", null, null, ["OBSERVATION_STALE"], sourceEvidence);
    }

    if (!fieldIsKnown(candidate.displayName) || !candidate.displayName.value.trim()) {
      const reason: RelationshipEntityResolutionReasonV1 = fieldHasEvidence(candidate.displayName)
        ? "EVIDENCE_NOT_KNOWN"
        : "MISSING_FIELD_EVIDENCE";
      return decision(candidate, "REVIEW_REQUIRED", null, null, [reason], uniqueEvidenceRefs(sourceEvidence, candidate.displayName.evidenceRefs));
    }
    if (!fieldHasEvidence(candidate.displayName)) {
      return decision(candidate, "REVIEW_REQUIRED", null, null, ["MISSING_FIELD_EVIDENCE"], sourceEvidence);
    }

    const explicit = candidate.explicitCanonicalEntityRef;
    const identityField = candidate.externalIdentity;
    const knownIdentity = fieldIsKnown(identityField) ? identityField.value : null;

    if (knownIdentity && !isSupportedIdentity(knownIdentity)) {
      return decision(
        candidate,
        "BLOCKED",
        null,
        null,
        ["UNSUPPORTED_CONTACT_IDENTITY"],
        uniqueEvidenceRefs(sourceEvidence, candidate.displayName.evidenceRefs, identityField?.evidenceRefs ?? [])
      );
    }

    if ((explicit && explicit.state !== "UNKNOWN" && !fieldHasEvidence(explicit)) || (identityField && identityField.state !== "UNKNOWN" && !fieldHasEvidence(identityField))) {
      return decision(
        candidate,
        "REVIEW_REQUIRED",
        null,
        knownIdentity,
        ["MISSING_FIELD_EVIDENCE"],
        uniqueEvidenceRefs(sourceEvidence, candidate.displayName.evidenceRefs, explicit?.evidenceRefs ?? [], identityField?.evidenceRefs ?? [])
      );
    }

    if ((explicit && explicit.state !== "KNOWN" && explicit.state !== "UNKNOWN") || (identityField && identityField.state !== "KNOWN" && identityField.state !== "UNKNOWN")) {
      return decision(
        candidate,
        "REVIEW_REQUIRED",
        null,
        knownIdentity,
        ["EVIDENCE_NOT_KNOWN"],
        uniqueEvidenceRefs(sourceEvidence, candidate.displayName.evidenceRefs, explicit?.evidenceRefs ?? [], identityField?.evidenceRefs ?? [])
      );
    }

    const exactIdentityMatches = knownIdentity
      ? input.canonicalEntities.filter((entity) => entity.externalIdentities.some((identity) => sameIdentity(identity, knownIdentity)))
      : [];

    if (fieldIsKnown(explicit)) {
      const canonicalRef = explicit.value.trim();
      const existing = canonicalByRef.get(canonicalRef);
      const evidenceRefs = uniqueEvidenceRefs(sourceEvidence, candidate.displayName.evidenceRefs, explicit.evidenceRefs, identityField?.evidenceRefs ?? []);
      if (!existing) {
        return decision(candidate, "REVIEW_REQUIRED", null, knownIdentity, ["CANONICAL_REF_NOT_FOUND"], evidenceRefs);
      }
      if (existing.entityType !== candidate.entityType) {
        return decision(candidate, "BLOCKED", null, knownIdentity, ["CANONICAL_ENTITY_TYPE_CONFLICT"], evidenceRefs);
      }
      if (knownIdentity && exactIdentityMatches.length > 0 && !exactIdentityMatches.some((entity) => entity.canonicalEntityRef === canonicalRef)) {
        return decision(candidate, "BLOCKED", null, knownIdentity, ["EXPLICIT_REF_EXTERNAL_IDENTITY_CONFLICT"], evidenceRefs);
      }
      return decision(candidate, "MATCH_EXISTING", canonicalRef, knownIdentity, ["EXPLICIT_CANONICAL_REF_MATCH"], evidenceRefs);
    }

    if (!knownIdentity) {
      return decision(
        candidate,
        "REVIEW_REQUIRED",
        null,
        null,
        ["NAME_ONLY_RESOLUTION_FORBIDDEN"],
        uniqueEvidenceRefs(sourceEvidence, candidate.displayName.evidenceRefs)
      );
    }

    const evidenceRefs = uniqueEvidenceRefs(sourceEvidence, candidate.displayName.evidenceRefs, identityField?.evidenceRefs ?? []);
    if (exactIdentityMatches.some((entity) => entity.entityType !== candidate.entityType)) {
      return decision(candidate, "BLOCKED", null, knownIdentity, ["EXTERNAL_IDENTITY_TYPE_CONFLICT"], evidenceRefs);
    }

    const sameTypeMatches = exactIdentityMatches.filter((entity) => entity.entityType === candidate.entityType);
    if (sameTypeMatches.length > 1) {
      return decision(candidate, "REVIEW_REQUIRED", null, knownIdentity, ["AMBIGUOUS_EXTERNAL_IDENTITY"], evidenceRefs);
    }
    if (sameTypeMatches.length === 1) {
      return decision(candidate, "MATCH_EXISTING", sameTypeMatches[0].canonicalEntityRef, knownIdentity, ["EXACT_EXTERNAL_IDENTITY_MATCH"], evidenceRefs);
    }

    return decision(candidate, "CREATE_CANDIDATE", null, knownIdentity, ["NEW_STABLE_IDENTITY_CANDIDATE"], evidenceRefs);
  });

  return Object.freeze({
    generatedAt: input.now,
    decisions: freezeArray(decisions),
    crmMutationPerformed: false as const,
    relationshipEdgeCreated: false as const,
    contactInfoInferred: false as const,
    externalActionPerformed: false as const
  });
}
