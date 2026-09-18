import {
  SPONSOR_MAP_QUALIFICATION_VERSION,
  type SponsorMapQualificationDecisionV1,
  type SponsorMapQualificationResultV1
} from "@/lib/relationship-intelligence/sponsor-map-qualification-v1";
import type { CanonicalRelationshipEntityRefV1 } from "@/lib/relationship-intelligence/relationship-pathfinder-v1";
import type { SponsorAccessTargetMappingV1 } from "@/lib/relationship-intelligence/sponsor-access-brief-v1";

export const SPONSOR_ACCESS_TARGET_RESOLUTION_VERSION_V1 = "SPONSOR_ACCESS_TARGET_RESOLUTION_V1" as const;

export type SponsorAccessTargetResolutionDispositionV1 =
  | "MAPPED_EXACT_CANONICAL_PERSON"
  | "RESEARCH_REQUIRED"
  | "VERIFY_REQUIRED"
  | "SUPPRESS";

export type SponsorAccessTargetResolutionDecisionV1 = Readonly<{
  candidateId: string;
  canonicalPersonRef: string | null;
  disposition: SponsorAccessTargetResolutionDispositionV1;
  targetEntityId: string | null;
  evidenceRefs: readonly string[];
  reasonCodes: readonly string[];
}>;

export type SponsorAccessTargetResolutionInputV1 = Readonly<{
  sponsorMap: SponsorMapQualificationResultV1;
  entities: readonly CanonicalRelationshipEntityRefV1[];
  evaluatedAt: string | Date;
  maximumProjectionAgeMinutes: number;
}>;

export type SponsorAccessTargetResolutionResultV1 = Readonly<{
  version: typeof SPONSOR_ACCESS_TARGET_RESOLUTION_VERSION_V1;
  sourceSponsorMapVersion: typeof SPONSOR_MAP_QUALIFICATION_VERSION;
  generatedAt: string;
  status: "READY" | "BLOCKED";
  issues: readonly string[];
  mappings: readonly SponsorAccessTargetMappingV1[];
  decisions: readonly SponsorAccessTargetResolutionDecisionV1[];
  counts: Readonly<{
    candidatesReviewed: number;
    mapped: number;
    researchRequired: number;
    verificationRequired: number;
    suppressed: number;
  }>;
  matchingPolicy: "EXACT_CANONICAL_PERSON_REF_ONLY";
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    identityJoinOnly: true;
    relationshipInferenceAuthorized: false;
    warmAccessInferenceAuthorized: false;
    decisionAuthorityInferenceAuthorized: false;
    contactDiscoveryAuthorized: false;
    crmMutationAuthorized: false;
    relationshipGraphMutationAuthorized: false;
    outreachAuthorized: false;
    externalActionAuthorized: false;
  }>;
}>;

const MINUTE_MS = 60_000;
const MAX_PROJECTION_AGE_MINUTES = 10_080;
const MAX_ENTITIES = 2_000;
const MAX_CANDIDATES = 1_000;

const LIMITATIONS = Object.freeze([
  "This resolver performs an exact identity join only: a sponsor-map candidate can be mapped to a graph target only when its canonical person ref exactly equals one and only one canonical graph entity ref.",
  "A target mapping does not prove a relationship path, warm access, willingness to introduce Keegan, decision authority, sponsor interest, contact coordinates, timing, budget, or opportunity quality.",
  "Missing or duplicated canonical graph identity remains research or verification work. Labels, names, titles, organizations, source count, and textual similarity are never used as substitutes for the exact canonical ref.",
  "The output is compatible with SponsorAccessBriefV1 target mappings but grants no CRM, graph, contact-discovery, outreach, or external-action authority."
] as const);

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  identityJoinOnly: true as const,
  relationshipInferenceAuthorized: false as const,
  warmAccessInferenceAuthorized: false as const,
  decisionAuthorityInferenceAuthorized: false as const,
  contactDiscoveryAuthorized: false as const,
  crmMutationAuthorized: false as const,
  relationshipGraphMutationAuthorized: false as const,
  outreachAuthorized: false as const,
  externalActionAuthorized: false as const
});

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function timestamp(value: string | Date, label: string): string {
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return parsed.toISOString();
}

function positiveBoundedInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > MAX_PROJECTION_AGE_MINUTES) {
    throw new Error(`${label} must be an integer between 1 and ${MAX_PROJECTION_AGE_MINUTES}`);
  }
  return value;
}

function hasCredentialMaterial(value: string): boolean {
  return /op:\/\//i.test(value)
    || /bearer\s+[a-z0-9._~-]+/i.test(value)
    || /(?:password|secret|token|api[_-]?key)\s*[=:]/i.test(value)
    || /[?&](?:access_token|token|api_key|key)=/i.test(value);
}

function safeText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  const normalized = value.trim();
  if (hasCredentialMaterial(normalized)) throw new Error(`${label} must not contain credential material`);
  return normalized;
}

function safeNullableText(value: unknown, label: string): string | null {
  if (value == null) return null;
  return safeText(value, label);
}

function safeRefs(values: readonly string[], label: string): readonly string[] {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array`);
  return Object.freeze(
    [...new Set(values.map((value, index) => safeText(value, `${label}[${index}]`)))].sort((a, b) => a.localeCompare(b))
  );
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b)));
}

function countsMatchSponsorMap(source: SponsorMapQualificationResultV1): boolean {
  const decisions = source.decisions;
  return source.counts.reviewed === decisions.length
    && source.counts.qualifiedForGraph === decisions.filter((item) => item.disposition === "QUALIFIED_FOR_GRAPH").length
    && source.counts.needsResearch === decisions.filter((item) => item.disposition === "NEEDS_RESEARCH").length
    && source.counts.needsVerification === decisions.filter((item) => item.disposition === "NEEDS_VERIFICATION").length
    && source.counts.suppressed === decisions.filter((item) => item.disposition === "SUPPRESS").length;
}

function sourceIssues(
  source: SponsorMapQualificationResultV1,
  evaluatedAtMs: number,
  maximumProjectionAgeMinutes: number
): readonly string[] {
  const issues = new Set<string>();
  if (!source || typeof source !== "object" || Array.isArray(source)) return Object.freeze(["SPONSOR_MAP_REQUIRED"]);
  if (source.version !== SPONSOR_MAP_QUALIFICATION_VERSION) issues.add("SPONSOR_MAP_VERSION_UNSUPPORTED");
  if (!Array.isArray(source.decisions)) issues.add("SPONSOR_MAP_DECISIONS_REQUIRED");
  else if (source.decisions.length > MAX_CANDIDATES) issues.add("SPONSOR_MAP_DECISION_LIMIT_EXCEEDED");

  const generatedAtMs = Date.parse(source.generatedAt);
  if (!Number.isFinite(generatedAtMs)) issues.add("SPONSOR_MAP_GENERATED_AT_INVALID");
  else if (generatedAtMs > evaluatedAtMs) issues.add("SPONSOR_MAP_GENERATED_IN_FUTURE");
  else if (evaluatedAtMs - generatedAtMs > maximumProjectionAgeMinutes * MINUTE_MS) issues.add("SPONSOR_MAP_STALE");

  if (source.externalResearchPerformed !== false) issues.add("SPONSOR_MAP_EXTERNAL_RESEARCH_NOT_ALLOWED");
  if (source.crmMutationPerformed !== false) issues.add("SPONSOR_MAP_CRM_MUTATION_NOT_ALLOWED");
  if (source.externalActionPerformed !== false) issues.add("SPONSOR_MAP_EXTERNAL_ACTION_NOT_ALLOWED");
  if (Array.isArray(source.decisions) && !countsMatchSponsorMap(source)) issues.add("SPONSOR_MAP_COUNT_MISMATCH");

  if (Array.isArray(source.decisions)) {
    const candidateIds = new Set<string>();
    for (const [index, decision] of source.decisions.entries()) {
      try {
        const candidateId = safeText(decision.candidateId, `decision ${index}.candidateId`);
        safeNullableText(decision.canonicalPersonRef, `decision ${index}.canonicalPersonRef`);
        safeNullableText(decision.canonicalOrganizationRef, `decision ${index}.canonicalOrganizationRef`);
        safeText(decision.sourceRef, `decision ${index}.sourceRef`);
        safeRefs(decision.evidenceRefs, `decision ${index}.evidenceRefs`);
        if (candidateIds.has(candidateId)) issues.add("SPONSOR_MAP_DUPLICATE_CANDIDATE_ID");
        candidateIds.add(candidateId);
      } catch {
        issues.add("SPONSOR_MAP_UNSAFE_OR_INVALID_PROVENANCE");
      }
    }
  }

  return uniqueSorted([...issues]);
}

function entityIndexes(entities: readonly CanonicalRelationshipEntityRefV1[]) {
  if (!Array.isArray(entities)) throw new Error("entities must be an array");
  if (entities.length > MAX_ENTITIES) throw new Error(`entities exceeds ${MAX_ENTITIES}`);

  const byId = new Map<string, CanonicalRelationshipEntityRefV1>();
  const byCanonicalRef = new Map<string, CanonicalRelationshipEntityRefV1[]>();

  for (const [index, entity] of entities.entries()) {
    if (!entity || typeof entity !== "object" || Array.isArray(entity)) throw new Error(`entities[${index}] must be an object`);
    const entityId = safeText(entity.entityId, `entities[${index}].entityId`);
    const canonicalRef = safeText(entity.canonicalRef, `entities[${index}].canonicalRef`);
    safeText(entity.label, `entities[${index}].label`);
    if (byId.has(entityId)) throw new Error(`duplicate entityId ${entityId}`);
    byId.set(entityId, entity);
    byCanonicalRef.set(canonicalRef, [...(byCanonicalRef.get(canonicalRef) ?? []), entity]);
  }

  return { byId, byCanonicalRef } as const;
}

function decisionFromCandidate(
  candidate: SponsorMapQualificationDecisionV1,
  byCanonicalRef: ReadonlyMap<string, readonly CanonicalRelationshipEntityRefV1[]>
): { decision: SponsorAccessTargetResolutionDecisionV1; mapping: SponsorAccessTargetMappingV1 | null } {
  const candidateId = safeText(candidate.candidateId, "candidate.candidateId");
  const evidenceRefs = safeRefs(candidate.evidenceRefs, `${candidateId}.evidenceRefs`);
  const canonicalPersonRef = safeNullableText(candidate.canonicalPersonRef, `${candidateId}.canonicalPersonRef`);

  if (candidate.disposition === "SUPPRESS") {
    return {
      decision: freezeDeep({
        candidateId,
        canonicalPersonRef,
        disposition: "SUPPRESS" as const,
        targetEntityId: null,
        evidenceRefs: [...evidenceRefs],
        reasonCodes: uniqueSorted(candidate.reasonCodes)
      }),
      mapping: null
    };
  }

  if (candidate.disposition === "NEEDS_VERIFICATION") {
    return {
      decision: freezeDeep({
        candidateId,
        canonicalPersonRef,
        disposition: "VERIFY_REQUIRED" as const,
        targetEntityId: null,
        evidenceRefs: [...evidenceRefs],
        reasonCodes: uniqueSorted(candidate.reasonCodes)
      }),
      mapping: null
    };
  }

  if (candidate.disposition === "NEEDS_RESEARCH") {
    return {
      decision: freezeDeep({
        candidateId,
        canonicalPersonRef,
        disposition: "RESEARCH_REQUIRED" as const,
        targetEntityId: null,
        evidenceRefs: [...evidenceRefs],
        reasonCodes: uniqueSorted(candidate.reasonCodes)
      }),
      mapping: null
    };
  }

  if (!canonicalPersonRef) {
    return {
      decision: freezeDeep({
        candidateId,
        canonicalPersonRef: null,
        disposition: "RESEARCH_REQUIRED" as const,
        targetEntityId: null,
        evidenceRefs: [...evidenceRefs],
        reasonCodes: uniqueSorted([...candidate.reasonCodes, "CANONICAL_PERSON_REQUIRED_FOR_ACCESS_TARGET"])
      }),
      mapping: null
    };
  }

  const matches = byCanonicalRef.get(canonicalPersonRef) ?? [];
  if (matches.length === 0) {
    return {
      decision: freezeDeep({
        candidateId,
        canonicalPersonRef,
        disposition: "RESEARCH_REQUIRED" as const,
        targetEntityId: null,
        evidenceRefs: [...evidenceRefs],
        reasonCodes: uniqueSorted([...candidate.reasonCodes, "CANONICAL_PERSON_NOT_PRESENT_IN_RELATIONSHIP_GRAPH"])
      }),
      mapping: null
    };
  }

  if (matches.length > 1) {
    return {
      decision: freezeDeep({
        candidateId,
        canonicalPersonRef,
        disposition: "VERIFY_REQUIRED" as const,
        targetEntityId: null,
        evidenceRefs: [...evidenceRefs],
        reasonCodes: uniqueSorted([...candidate.reasonCodes, "CANONICAL_PERSON_HAS_MULTIPLE_GRAPH_ENTITIES"])
      }),
      mapping: null
    };
  }

  const targetEntityId = safeText(matches[0].entityId, "matched entityId");
  return {
    decision: freezeDeep({
      candidateId,
      canonicalPersonRef,
      disposition: "MAPPED_EXACT_CANONICAL_PERSON" as const,
      targetEntityId,
      evidenceRefs: [...evidenceRefs],
      reasonCodes: uniqueSorted([...candidate.reasonCodes, "EXACT_CANONICAL_PERSON_REF_MATCHED_ONE_GRAPH_ENTITY"])
    }),
    mapping: freezeDeep({ candidateId, targetEntityId })
  };
}

export function resolveSponsorAccessTargetsV1(
  input: SponsorAccessTargetResolutionInputV1
): SponsorAccessTargetResolutionResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  const generatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(generatedAt);
  const maximumProjectionAgeMinutes = positiveBoundedInteger(input.maximumProjectionAgeMinutes, "maximumProjectionAgeMinutes");
  const issues = sourceIssues(input.sponsorMap, evaluatedAtMs, maximumProjectionAgeMinutes);
  const { byCanonicalRef } = entityIndexes(input.entities);

  if (issues.length > 0) {
    return freezeDeep({
      version: SPONSOR_ACCESS_TARGET_RESOLUTION_VERSION_V1,
      sourceSponsorMapVersion: SPONSOR_MAP_QUALIFICATION_VERSION,
      generatedAt,
      status: "BLOCKED" as const,
      issues: [...issues],
      mappings: [],
      decisions: [],
      counts: {
        candidatesReviewed: Array.isArray(input.sponsorMap?.decisions) ? input.sponsorMap.decisions.length : 0,
        mapped: 0,
        researchRequired: 0,
        verificationRequired: 0,
        suppressed: 0
      },
      matchingPolicy: "EXACT_CANONICAL_PERSON_REF_ONLY" as const,
      limitations: [...LIMITATIONS],
      authority: { ...AUTHORITY }
    });
  }

  const reviewed = input.sponsorMap.decisions.map((candidate) => decisionFromCandidate(candidate, byCanonicalRef));
  const decisions = reviewed.map((item) => item.decision).sort((a, b) => a.candidateId.localeCompare(b.candidateId));
  const mappings = reviewed
    .map((item) => item.mapping)
    .filter((item): item is SponsorAccessTargetMappingV1 => item != null)
    .sort((a, b) => a.candidateId.localeCompare(b.candidateId));

  return freezeDeep({
    version: SPONSOR_ACCESS_TARGET_RESOLUTION_VERSION_V1,
    sourceSponsorMapVersion: SPONSOR_MAP_QUALIFICATION_VERSION,
    generatedAt,
    status: "READY" as const,
    issues: [],
    mappings,
    decisions,
    counts: {
      candidatesReviewed: decisions.length,
      mapped: decisions.filter((item) => item.disposition === "MAPPED_EXACT_CANONICAL_PERSON").length,
      researchRequired: decisions.filter((item) => item.disposition === "RESEARCH_REQUIRED").length,
      verificationRequired: decisions.filter((item) => item.disposition === "VERIFY_REQUIRED").length,
      suppressed: decisions.filter((item) => item.disposition === "SUPPRESS").length
    },
    matchingPolicy: "EXACT_CANONICAL_PERSON_REF_ONLY" as const,
    limitations: [...LIMITATIONS],
    authority: { ...AUTHORITY }
  });
}
