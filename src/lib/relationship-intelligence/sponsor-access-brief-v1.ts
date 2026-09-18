import {
  qualifySponsorMapCandidatesV1,
  type SponsorMapCandidateV1,
  type SponsorMapQualificationDecisionV1
} from "@/lib/relationship-intelligence/sponsor-map-qualification-v1";
import {
  findRelationshipPathsV1,
  type CanonicalRelationshipEdgeRefV1,
  type CanonicalRelationshipEntityRefV1,
  type RelationshipPathfinderResultV1
} from "@/lib/relationship-intelligence/relationship-pathfinder-v1";

export const SPONSOR_ACCESS_BRIEF_VERSION_V1 = "SPONSOR_ACCESS_BRIEF_V1" as const;

export type SponsorAccessBriefStatusV1 =
  | "ACCESS_READY"
  | "PATH_BLOCKED"
  | "NO_SUPPORTED_PATH"
  | "RESEARCH_REQUIRED"
  | "VERIFY_REQUIRED"
  | "SUPPRESS";

export type SponsorAccessNextInternalActionV1 =
  | "PREPARE_INTRO_BRIEF"
  | "RESOLVE_PATH_BLOCKER"
  | "RESEARCH_ACCESS_PATH"
  | "RESEARCH_MISSING_SPONSOR_OR_ACCESS_EVIDENCE"
  | "VERIFY_CONFLICTED_OR_UNPROVEN_EVIDENCE"
  | "NONE";

export type SponsorAccessTargetMappingV1 = {
  candidateId: string;
  targetEntityId: string;
};

export type SponsorAccessBriefInputV1 = {
  sponsorCandidates: readonly SponsorMapCandidateV1[];
  candidateTargetMappings: readonly SponsorAccessTargetMappingV1[];
  sourceEntityId: string;
  entities: readonly CanonicalRelationshipEntityRefV1[];
  edges: readonly CanonicalRelationshipEdgeRefV1[];
  now: string | Date;
  maximumEvidenceAgeDays?: number;
  maxAlternatePaths?: number;
};

export type SponsorAccessBriefV1 = Readonly<{
  candidateId: string;
  status: SponsorAccessBriefStatusV1;
  canonicalOrganizationRef: string | null;
  canonicalPersonRef: string | null;
  targetEntityId: string | null;
  ecosystemRole: SponsorMapQualificationDecisionV1["ecosystemRole"];
  decisionFunction: SponsorMapQualificationDecisionV1["decisionFunction"];
  authorityClass: SponsorMapQualificationDecisionV1["authorityClass"];
  sponsorAccessPath: SponsorMapQualificationDecisionV1["accessPath"];
  contactRoute: SponsorMapQualificationDecisionV1["contactRoute"];
  planningWindow: SponsorMapQualificationDecisionV1["planningWindow"];
  eventOrSeasonDate: SponsorMapQualificationDecisionV1["eventOrSeasonDate"];
  relationshipPath: RelationshipPathfinderResultV1 | null;
  evidenceRefs: readonly string[];
  researchOrVerificationGaps: readonly string[];
  nextInternalAction: SponsorAccessNextInternalActionV1;
  reasonCodes: readonly string[];
}>;

export type SponsorAccessBriefResultV1 = Readonly<{
  version: typeof SPONSOR_ACCESS_BRIEF_VERSION_V1;
  generatedAt: string;
  sourceEntityId: string;
  briefs: readonly SponsorAccessBriefV1[];
  counts: Readonly<Record<SponsorAccessBriefStatusV1, number>>;
  actionAuthority: Readonly<{
    analysisOnly: true;
    internalPreparationAllowed: true;
    crmMutationAuthorized: false;
    contactDiscoveryAuthorized: false;
    outreachAuthorized: false;
    externalActionAuthorized: false;
  }>;
}>;

const MAX_MAPPINGS = 500;
const MAX_ALTERNATE_PATHS = 5;
const DECISION_CAPABLE_AUTHORITIES = new Set(["DECISION_MAKER", "BUDGET_OWNER"] as const);
const NON_COLD_ACCESS = new Set(["DIRECT", "WARM", "SECOND_DEGREE"] as const);

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function normalizedTimestamp(value: string | Date, label: string): string {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return date.toISOString();
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number, label: string): number {
  const candidate = value == null ? fallback : value;
  if (typeof candidate !== "number" || !Number.isInteger(candidate) || candidate < minimum || candidate > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return candidate;
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.filter((value) => value.trim().length > 0))].sort((a, b) => a.localeCompare(b)));
}

function sponsorEvidenceRefs(decision: SponsorMapQualificationDecisionV1): readonly string[] {
  return uniqueSorted([
    ...decision.evidenceRefs,
    ...decision.ecosystemRole.evidenceRefs,
    ...decision.decisionFunction.evidenceRefs,
    ...decision.authorityClass.evidenceRefs,
    ...decision.accessPath.evidenceRefs,
    ...decision.contactRoute.evidenceRefs,
    ...decision.planningWindow.evidenceRefs,
    ...(decision.eventOrSeasonDate?.evidenceRefs ?? [])
  ]);
}

function pathEvidenceRefs(path: RelationshipPathfinderResultV1 | null): readonly string[] {
  if (!path || path.status !== "PATHS_FOUND") return [];
  return uniqueSorted([
    ...(path.primaryPath?.evidenceRefs ?? []),
    ...path.alternatePaths.flatMap((alternate) => alternate.evidenceRefs)
  ]);
}

function mappingByCandidate(input: readonly SponsorAccessTargetMappingV1[]): ReadonlyMap<string, string> {
  if (!Array.isArray(input) || input.length > MAX_MAPPINGS) throw new Error(`candidateTargetMappings exceeds ${MAX_MAPPINGS}`);
  const mappings = new Map<string, string>();
  for (const [index, item] of input.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`candidateTargetMappings[${index}] must be an object`);
    const candidateId = requiredText(item.candidateId, `candidateTargetMappings[${index}].candidateId`);
    const targetEntityId = requiredText(item.targetEntityId, `candidateTargetMappings[${index}].targetEntityId`);
    if (mappings.has(candidateId)) throw new Error(`candidateTargetMappings contains duplicate candidateId ${candidateId}`);
    mappings.set(candidateId, targetEntityId);
  }
  return mappings;
}

function entityById(entities: readonly CanonicalRelationshipEntityRefV1[]): ReadonlyMap<string, CanonicalRelationshipEntityRefV1> {
  if (!Array.isArray(entities)) throw new Error("entities must be an array");
  const mapped = new Map<string, CanonicalRelationshipEntityRefV1>();
  for (const entity of entities) {
    const entityId = requiredText(entity?.entityId, "entity.entityId");
    if (mapped.has(entityId)) throw new Error(`entities contains duplicate entityId ${entityId}`);
    mapped.set(entityId, entity);
  }
  return mapped;
}

function sponsorDispositionStatus(decision: SponsorMapQualificationDecisionV1): SponsorAccessBriefStatusV1 | null {
  if (decision.disposition === "SUPPRESS") return "SUPPRESS";
  if (decision.disposition === "NEEDS_VERIFICATION") return "VERIFY_REQUIRED";
  if (decision.disposition === "NEEDS_RESEARCH") return "RESEARCH_REQUIRED";
  return null;
}

function nextAction(status: SponsorAccessBriefStatusV1): SponsorAccessNextInternalActionV1 {
  switch (status) {
    case "ACCESS_READY":
      return "PREPARE_INTRO_BRIEF";
    case "PATH_BLOCKED":
      return "RESOLVE_PATH_BLOCKER";
    case "NO_SUPPORTED_PATH":
      return "RESEARCH_ACCESS_PATH";
    case "RESEARCH_REQUIRED":
      return "RESEARCH_MISSING_SPONSOR_OR_ACCESS_EVIDENCE";
    case "VERIFY_REQUIRED":
      return "VERIFY_CONFLICTED_OR_UNPROVEN_EVIDENCE";
    case "SUPPRESS":
      return "NONE";
  }
}

function buildBrief(
  decision: SponsorMapQualificationDecisionV1,
  targetEntityId: string | null,
  entitiesById: ReadonlyMap<string, CanonicalRelationshipEntityRefV1>,
  sourceEntityId: string,
  entities: readonly CanonicalRelationshipEntityRefV1[],
  edges: readonly CanonicalRelationshipEdgeRefV1[],
  generatedAt: string,
  maxAlternatePaths: number
): SponsorAccessBriefV1 {
  const inheritedStatus = sponsorDispositionStatus(decision);
  let status = inheritedStatus;
  const gaps = new Set<string>(decision.coverageGaps);
  const reasons = new Set<string>(decision.reasonCodes);
  let relationshipPath: RelationshipPathfinderResultV1 | null = null;

  if (status == null) {
    if (!decision.canonicalPersonRef) {
      status = "RESEARCH_REQUIRED";
      gaps.add("CANONICAL_PERSON_REQUIRED_FOR_ACCESS_PATH");
      reasons.add("SPONSOR_CANDIDATE_HAS_NO_CANONICAL_PERSON");
    } else if (!targetEntityId) {
      status = "RESEARCH_REQUIRED";
      gaps.add("TARGET_ENTITY_MAPPING_REQUIRED");
      reasons.add("NO_EXPLICIT_CANDIDATE_TO_TARGET_MAPPING");
    } else {
      const targetEntity = entitiesById.get(targetEntityId);
      if (!targetEntity) {
        status = "SUPPRESS";
        gaps.add("TARGET_ENTITY_NOT_IN_CANONICAL_GRAPH");
        reasons.add("TARGET_ENTITY_MAPPING_IS_NOT_CANONICAL");
      } else if (requiredText(targetEntity.canonicalRef, `${targetEntityId}.canonicalRef`) !== decision.canonicalPersonRef) {
        status = "VERIFY_REQUIRED";
        gaps.add("CANONICAL_PERSON_TARGET_MISMATCH");
        reasons.add("CANDIDATE_AND_GRAPH_TARGET_IDENTITY_CONFLICT");
      } else {
        relationshipPath = findRelationshipPathsV1({
          sourceEntityId,
          targetEntityId,
          entities,
          edges,
          generatedAt,
          requiresDecisionAuthority: true,
          maxAlternatePaths
        });

        if (relationshipPath.status === "NO_SUPPORTED_PATH") {
          for (const action of relationshipPath.noPath?.informationGainActions ?? []) gaps.add(action);
          if (decision.accessPath.value && NON_COLD_ACCESS.has(decision.accessPath.value as "DIRECT" | "WARM" | "SECOND_DEGREE")) {
            status = "VERIFY_REQUIRED";
            gaps.add("SPONSOR_ACCESS_PATH_NOT_GRAPH_PROVEN");
            reasons.add("NON_COLD_ACCESS_REQUIRES_CANONICAL_GRAPH_PROOF");
          } else {
            status = "NO_SUPPORTED_PATH";
            gaps.add("NO_EVIDENCE_SUPPORTED_RELATIONSHIP_PATH");
            reasons.add("CANONICAL_GRAPH_HAS_NO_SUPPORTED_PATH");
          }
        } else if (!relationshipPath.primaryPath) {
          status = "NO_SUPPORTED_PATH";
          gaps.add("NO_EVIDENCE_SUPPORTED_RELATIONSHIP_PATH");
          reasons.add("CANONICAL_GRAPH_HAS_NO_PRIMARY_PATH");
        } else if (relationshipPath.primaryPath.readiness === "RESEARCH_REQUIRED") {
          status = "RESEARCH_REQUIRED";
          gaps.add("RELATIONSHIP_PATH_REQUIRES_RESEARCH");
          if (!relationshipPath.primaryPath.authorityBoundary.decisionAuthorityConfirmed) gaps.add("DECISION_AUTHORITY_NOT_CONFIRMED");
          reasons.add("CANONICAL_PATH_NOT_YET_DECISION_READY");
        } else if (relationshipPath.primaryPath.readiness === "BLOCKED") {
          status = "PATH_BLOCKED";
          for (const blocker of relationshipPath.primaryPath.blockers) gaps.add(`PATH_BLOCKER:${blocker}`);
          reasons.add("SUPPORTED_PATH_HAS_ACTIVE_BLOCKER");
        } else {
          const sponsorAuthority = decision.authorityClass.value;
          const graphConfirmsDecisionAuthority = relationshipPath.primaryPath.authorityBoundary.decisionAuthorityConfirmed;
          const sponsorAuthorityDecisionCapable = sponsorAuthority != null && DECISION_CAPABLE_AUTHORITIES.has(sponsorAuthority as "DECISION_MAKER" | "BUDGET_OWNER");
          const sponsorAccess = decision.accessPath.value;
          const sponsorClaimsNonColdAccess = sponsorAccess != null && NON_COLD_ACCESS.has(sponsorAccess as "DIRECT" | "WARM" | "SECOND_DEGREE");

          if (!graphConfirmsDecisionAuthority) {
            status = "RESEARCH_REQUIRED";
            gaps.add("DECISION_AUTHORITY_NOT_CONFIRMED");
            reasons.add("GRAPH_PATH_DOES_NOT_CONFIRM_DECISION_AUTHORITY");
          } else if (!sponsorAuthorityDecisionCapable) {
            status = "VERIFY_REQUIRED";
            gaps.add("AUTHORITY_CONFLICT_WITH_GRAPH");
            reasons.add("SPONSOR_AUTHORITY_AND_GRAPH_AUTHORITY_DISAGREE");
          } else if (sponsorAccess === "COLD") {
            status = "VERIFY_REQUIRED";
            gaps.add("ACCESS_PATH_CONFLICT_WITH_GRAPH");
            reasons.add("SPONSOR_MAP_COLD_BUT_CANONICAL_GRAPH_SUPPORTS_PATH");
          } else if (!sponsorClaimsNonColdAccess) {
            status = "RESEARCH_REQUIRED";
            gaps.add("NON_COLD_ACCESS_NOT_EVIDENCED");
            reasons.add("ACCESS_READY_REQUIRES_EVIDENCED_NON_COLD_ACCESS");
          } else {
            status = "ACCESS_READY";
            reasons.add("SPONSOR_DECISION_AUTHORITY_AND_CANONICAL_ACCESS_PATH_SUPPORTED");
          }
        }
      }
    }
  }

  const resolvedStatus = status ?? "SUPPRESS";
  return freezeDeep({
    candidateId: decision.candidateId,
    status: resolvedStatus,
    canonicalOrganizationRef: decision.canonicalOrganizationRef,
    canonicalPersonRef: decision.canonicalPersonRef,
    targetEntityId,
    ecosystemRole: decision.ecosystemRole,
    decisionFunction: decision.decisionFunction,
    authorityClass: decision.authorityClass,
    sponsorAccessPath: decision.accessPath,
    contactRoute: decision.contactRoute,
    planningWindow: decision.planningWindow,
    eventOrSeasonDate: decision.eventOrSeasonDate,
    relationshipPath,
    evidenceRefs: uniqueSorted([...sponsorEvidenceRefs(decision), ...pathEvidenceRefs(relationshipPath)]),
    researchOrVerificationGaps: uniqueSorted([...gaps]),
    nextInternalAction: nextAction(resolvedStatus),
    reasonCodes: uniqueSorted([...reasons])
  });
}

export function buildSponsorAccessBriefsV1(input: SponsorAccessBriefInputV1): SponsorAccessBriefResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  const generatedAt = normalizedTimestamp(input.now, "now");
  const sourceEntityId = requiredText(input.sourceEntityId, "sourceEntityId");
  const maxAlternatePaths = boundedInteger(input.maxAlternatePaths, 3, 0, MAX_ALTERNATE_PATHS, "maxAlternatePaths");
  const mappings = mappingByCandidate(input.candidateTargetMappings);
  const entitiesById = entityById(input.entities);
  if (!entitiesById.has(sourceEntityId)) throw new Error("sourceEntityId must reference a supplied canonical entity");
  if (!Array.isArray(input.edges)) throw new Error("edges must be an array");

  const qualified = qualifySponsorMapCandidatesV1({
    candidates: input.sponsorCandidates,
    now: generatedAt,
    maximumEvidenceAgeDays: input.maximumEvidenceAgeDays
  });

  const briefs = qualified.decisions.map((decision) =>
    buildBrief(
      decision,
      mappings.get(decision.candidateId) ?? null,
      entitiesById,
      sourceEntityId,
      input.entities,
      input.edges,
      generatedAt,
      maxAlternatePaths
    )
  );

  const counts: Record<SponsorAccessBriefStatusV1, number> = {
    ACCESS_READY: 0,
    PATH_BLOCKED: 0,
    NO_SUPPORTED_PATH: 0,
    RESEARCH_REQUIRED: 0,
    VERIFY_REQUIRED: 0,
    SUPPRESS: 0
  };
  for (const brief of briefs) counts[brief.status] += 1;

  return freezeDeep({
    version: SPONSOR_ACCESS_BRIEF_VERSION_V1,
    generatedAt,
    sourceEntityId,
    briefs,
    counts,
    actionAuthority: {
      analysisOnly: true,
      internalPreparationAllowed: true,
      crmMutationAuthorized: false,
      contactDiscoveryAuthorized: false,
      outreachAuthorized: false,
      externalActionAuthorized: false
    }
  });
}
