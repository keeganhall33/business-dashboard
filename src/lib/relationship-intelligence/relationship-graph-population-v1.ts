import { createHash } from "node:crypto";

import type { DecisionMakerRoleProjectionV1 } from "@/lib/relationship-intelligence/decision-maker-role-freshness-v1";
import type {
  SponsorMapAccessPathV1,
  SponsorMapContactRouteV1,
  SponsorMapEcosystemRoleV1,
  SponsorMapQualificationDecisionV1
} from "@/lib/relationship-intelligence/sponsor-map-qualification-v1";

export const RELATIONSHIP_GRAPH_POPULATION_VERSION_V1 = "RELATIONSHIP_GRAPH_POPULATION_V1" as const;

export type RelationshipGraphPopulationDispositionV1 =
  | "PROPOSE_EDGE"
  | "MERGED_DUPLICATE"
  | "REVIEW_REQUIRED"
  | "SKIPPED";

export type RelationshipGraphPopulationReasonV1 =
  | "EDGE_READY"
  | "DUPLICATE_QUALIFIED_CANDIDATE_MERGED"
  | "SPONSOR_MAP_NOT_QUALIFIED"
  | "MISSING_CANONICAL_PERSON"
  | "MISSING_CANONICAL_ORGANIZATION"
  | "QUALIFIED_FIELD_NOT_KNOWN"
  | "QUALIFIED_FIELD_MISSING_EVIDENCE"
  | "MISSING_SOURCE_PROVENANCE"
  | "INVALID_SPONSOR_OBSERVED_AT"
  | "SPONSOR_OBSERVED_AT_IN_FUTURE"
  | "CONFLICTING_QUALIFIED_ROLE_CLAIMS"
  | "MISSING_ROLE_FRESHNESS_PROJECTION"
  | "AMBIGUOUS_ROLE_FRESHNESS_PROJECTION"
  | "ROLE_NOT_CURRENT_SUPPORTED"
  | "ROLE_AUTHORITY_NOT_USABLE"
  | "ROLE_ORGANIZATION_CONFLICT"
  | "ROLE_DECISION_FUNCTION_CONFLICT"
  | "ROLE_AUTHORITY_CONFLICT"
  | "ROLE_EVIDENCE_MISSING"
  | "INVALID_ROLE_OBSERVED_AT"
  | "ROLE_OBSERVED_AT_IN_FUTURE"
  | "ROLE_REVALIDATION_NOT_SATISFIED";

export type RelationshipGraphContextFieldV1<T> = Readonly<{
  state: "KNOWN" | "UNKNOWN" | "CONFLICTED";
  value: T | null;
  evidenceRefs: readonly string[];
}>;

export type RelationshipGraphRoleEdgeProposalV1 = Readonly<{
  proposalId: string;
  idempotencyKey: string;
  relationshipType: "PERSON_ROLE_AT_ORGANIZATION";
  canonicalPersonRef: string;
  canonicalOrganizationRef: string;
  title: string;
  decisionFunction: string;
  authorityClass: string;
  ecosystemRole: SponsorMapEcosystemRoleV1;
  accessPath: RelationshipGraphContextFieldV1<SponsorMapAccessPathV1>;
  contactRoute: RelationshipGraphContextFieldV1<SponsorMapContactRouteV1>;
  planningWindow: RelationshipGraphContextFieldV1<string>;
  eventOrSeasonDate: RelationshipGraphContextFieldV1<string>;
  candidateIds: readonly string[];
  sourceRefs: readonly string[];
  evidenceRefs: readonly string[];
  observedThrough: string;
  truthState: "KNOWN";
  currentRoleVerified: true;
  /** A WARM/COLD classification alone never identifies an introducer or creates a path edge. */
  warmPathEdgeCreated: false;
  /** This compiler never infers that two organizations have a sponsorship relationship. */
  sponsorshipRelationshipEdgeCreated: false;
  /** Public/authorized route classification is preserved without copying or inventing contact coordinates. */
  contactCoordinateIncluded: false;
  writeAuthority: "NONE";
}>;

export type RelationshipGraphPopulationDecisionV1 = Readonly<{
  candidateId: string;
  disposition: RelationshipGraphPopulationDispositionV1;
  proposalId: string | null;
  duplicateOfCandidateId: string | null;
  reasonCodes: readonly RelationshipGraphPopulationReasonV1[];
  evidenceRefs: readonly string[];
  requiresVerification: boolean;
}>;

export type RelationshipGraphPopulationResultV1 = Readonly<{
  version: typeof RELATIONSHIP_GRAPH_POPULATION_VERSION_V1;
  generatedAt: string;
  proposals: readonly RelationshipGraphRoleEdgeProposalV1[];
  decisions: readonly RelationshipGraphPopulationDecisionV1[];
  counts: Readonly<{
    candidatesReviewed: number;
    edgesProposed: number;
    duplicatesMerged: number;
    reviewRequired: number;
    skipped: number;
  }>;
  crmMutationPerformed: false;
  relationshipGraphMutationPerformed: false;
  warmPathEdgeCreated: false;
  sponsorshipRelationshipEdgeCreated: false;
  contactInfoInferred: false;
  externalResearchPerformed: false;
  externalActionPerformed: false;
}>;

export type CompileRelationshipGraphPopulationV1Input = Readonly<{
  sponsorDecisions: readonly SponsorMapQualificationDecisionV1[];
  roleProjections: readonly DecisionMakerRoleProjectionV1[];
  now: string | Date;
}>;

const REQUIRED_SPONSOR_FIELDS = [
  "ecosystemRole",
  "decisionFunction",
  "authorityClass",
  "accessPath",
  "contactRoute",
  "planningWindow"
] as const;

type QualifiedSponsorDecision = SponsorMapQualificationDecisionV1 & {
  canonicalPersonRef: string;
  canonicalOrganizationRef: string;
};

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function timestamp(value: string | Date, label: string): string {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return date.toISOString();
}

function refs(...groups: readonly (readonly string[])[]): readonly string[] {
  return Object.freeze(
    [...new Set(groups.flatMap((group) => group.map((value) => requiredText(value, "evidenceRef"))))]
      .sort((a, b) => a.localeCompare(b))
  );
}

function texts(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => requiredText(value, "value")))].sort((a, b) => a.localeCompare(b)));
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function stableId(value: unknown): string {
  const canonical = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(canonical);
    if (!item || typeof item !== "object") return item;
    return Object.fromEntries(
      Object.keys(item as Record<string, unknown>)
        .sort((a, b) => a.localeCompare(b))
        .map((key) => [key, canonical((item as Record<string, unknown>)[key])])
    );
  };
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex").slice(0, 24);
}

function candidateDecision(
  candidateId: string,
  disposition: RelationshipGraphPopulationDispositionV1,
  reasonCodes: readonly RelationshipGraphPopulationReasonV1[],
  evidenceRefs: readonly string[],
  proposalId: string | null = null,
  duplicateOfCandidateId: string | null = null
): RelationshipGraphPopulationDecisionV1 {
  return freezeDeep({
    candidateId,
    disposition,
    proposalId,
    duplicateOfCandidateId,
    reasonCodes: [...new Set(reasonCodes)],
    evidenceRefs: [...refs(evidenceRefs)],
    requiresVerification: disposition === "REVIEW_REQUIRED"
  });
}

function qualifiedFieldFailure(candidate: SponsorMapQualificationDecisionV1): RelationshipGraphPopulationReasonV1 | null {
  for (const key of REQUIRED_SPONSOR_FIELDS) {
    const field = candidate[key];
    if (field.state !== "KNOWN" || field.value == null || (typeof field.value === "string" && !field.value.trim())) {
      return "QUALIFIED_FIELD_NOT_KNOWN";
    }
    if (field.evidenceRefs.length === 0) return "QUALIFIED_FIELD_MISSING_EVIDENCE";
  }
  return null;
}

function coreClaimSignature(candidate: QualifiedSponsorDecision): string {
  return [candidate.ecosystemRole.value, candidate.decisionFunction.value, candidate.authorityClass.value].join("|");
}

function contextField<T>(
  values: readonly { value: T | null; evidenceRefs: readonly string[] }[]
): RelationshipGraphContextFieldV1<T> {
  const evidenceRefs = refs(...values.map((item) => item.evidenceRefs));
  const nonNull = values.map((item) => item.value).filter((value): value is T => value != null);
  if (nonNull.length === 0) return freezeDeep({ state: "UNKNOWN" as const, value: null, evidenceRefs: [...evidenceRefs] });

  const serialized = new Map<string, T>();
  for (const value of nonNull) serialized.set(JSON.stringify(value), value);
  if (serialized.size > 1) {
    return freezeDeep({ state: "CONFLICTED" as const, value: null, evidenceRefs: [...evidenceRefs] });
  }
  return freezeDeep({ state: "KNOWN" as const, value: [...serialized.values()][0], evidenceRefs: [...evidenceRefs] });
}

function groupEvidence(group: readonly QualifiedSponsorDecision[]): readonly string[] {
  return refs(
    ...group.map((candidate) => candidate.evidenceRefs),
    ...group.map((candidate) => candidate.ecosystemRole.evidenceRefs),
    ...group.map((candidate) => candidate.decisionFunction.evidenceRefs),
    ...group.map((candidate) => candidate.authorityClass.evidenceRefs),
    ...group.map((candidate) => candidate.accessPath.evidenceRefs),
    ...group.map((candidate) => candidate.contactRoute.evidenceRefs),
    ...group.map((candidate) => candidate.planningWindow.evidenceRefs),
    ...group.map((candidate) => candidate.eventOrSeasonDate?.evidenceRefs ?? [])
  );
}

function relationKey(candidate: QualifiedSponsorDecision): string {
  return `${candidate.canonicalPersonRef}\u0000${candidate.canonicalOrganizationRef}`;
}

function edgeId(personRef: string, organizationRef: string): string {
  return `relationship-role:${stableId({ personRef, organizationRef, relationshipType: "PERSON_ROLE_AT_ORGANIZATION" })}`;
}

export function compileRelationshipGraphPopulationV1(
  input: CompileRelationshipGraphPopulationV1Input
): RelationshipGraphPopulationResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.sponsorDecisions)) throw new Error("sponsorDecisions must be an array");
  if (!Array.isArray(input.roleProjections)) throw new Error("roleProjections must be an array");

  const generatedAt = timestamp(input.now, "now");
  const nowMs = Date.parse(generatedAt);
  const decisions: RelationshipGraphPopulationDecisionV1[] = [];
  const eligible: QualifiedSponsorDecision[] = [];

  for (const candidate of [...input.sponsorDecisions].sort((a, b) => a.candidateId.localeCompare(b.candidateId))) {
    const candidateId = requiredText(candidate.candidateId, "candidateId");
    if (candidate.disposition !== "QUALIFIED_FOR_GRAPH") {
      decisions.push(candidateDecision(candidateId, "SKIPPED", ["SPONSOR_MAP_NOT_QUALIFIED"], candidate.evidenceRefs));
      continue;
    }
    if (!candidate.sourceRef.trim() || candidate.evidenceRefs.length === 0) {
      decisions.push(candidateDecision(candidateId, "REVIEW_REQUIRED", ["MISSING_SOURCE_PROVENANCE"], candidate.evidenceRefs));
      continue;
    }
    if (!candidate.canonicalOrganizationRef?.trim()) {
      decisions.push(candidateDecision(candidateId, "REVIEW_REQUIRED", ["MISSING_CANONICAL_ORGANIZATION"], candidate.evidenceRefs));
      continue;
    }
    if (!candidate.canonicalPersonRef?.trim()) {
      decisions.push(candidateDecision(candidateId, "REVIEW_REQUIRED", ["MISSING_CANONICAL_PERSON"], candidate.evidenceRefs));
      continue;
    }
    const fieldFailure = qualifiedFieldFailure(candidate);
    if (fieldFailure) {
      decisions.push(candidateDecision(candidateId, "REVIEW_REQUIRED", [fieldFailure], groupEvidence([candidate as QualifiedSponsorDecision])));
      continue;
    }
    const observedAtMs = Date.parse(candidate.observedAt);
    if (!Number.isFinite(observedAtMs)) {
      decisions.push(candidateDecision(candidateId, "REVIEW_REQUIRED", ["INVALID_SPONSOR_OBSERVED_AT"], groupEvidence([candidate as QualifiedSponsorDecision])));
      continue;
    }
    if (observedAtMs > nowMs) {
      decisions.push(candidateDecision(candidateId, "REVIEW_REQUIRED", ["SPONSOR_OBSERVED_AT_IN_FUTURE"], groupEvidence([candidate as QualifiedSponsorDecision])));
      continue;
    }
    eligible.push(candidate as QualifiedSponsorDecision);
  }

  const groups = new Map<string, QualifiedSponsorDecision[]>();
  for (const candidate of eligible) {
    const key = relationKey(candidate);
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }

  const rolesByPerson = new Map<string, DecisionMakerRoleProjectionV1[]>();
  for (const role of input.roleProjections) {
    const personRef = requiredText(role.canonicalPersonRef, "role.canonicalPersonRef");
    rolesByPerson.set(personRef, [...(rolesByPerson.get(personRef) ?? []), role]);
  }

  const proposals: RelationshipGraphRoleEdgeProposalV1[] = [];
  const orderedGroups = [...groups.values()].sort((left, right) => relationKey(left[0]).localeCompare(relationKey(right[0])));

  for (const rawGroup of orderedGroups) {
    const group = [...rawGroup].sort((a, b) => a.candidateId.localeCompare(b.candidateId));
    const first = group[0];
    const groupEvidenceRefs = groupEvidence(group);
    const coreSignatures = new Set(group.map(coreClaimSignature));
    if (coreSignatures.size !== 1) {
      for (const candidate of group) {
        decisions.push(candidateDecision(candidate.candidateId, "REVIEW_REQUIRED", ["CONFLICTING_QUALIFIED_ROLE_CLAIMS"], groupEvidenceRefs));
      }
      continue;
    }

    const roleMatches = rolesByPerson.get(first.canonicalPersonRef) ?? [];
    if (roleMatches.length === 0) {
      for (const candidate of group) {
        decisions.push(candidateDecision(candidate.candidateId, "REVIEW_REQUIRED", ["MISSING_ROLE_FRESHNESS_PROJECTION"], groupEvidenceRefs));
      }
      continue;
    }
    if (roleMatches.length !== 1) {
      for (const candidate of group) {
        decisions.push(candidateDecision(candidate.candidateId, "REVIEW_REQUIRED", ["AMBIGUOUS_ROLE_FRESHNESS_PROJECTION"], refs(groupEvidenceRefs, ...roleMatches.map((role) => role.evidenceRefs))));
      }
      continue;
    }

    const role = roleMatches[0];
    const roleEvidenceRefs = refs(role.evidenceRefs);
    const failures: RelationshipGraphPopulationReasonV1[] = [];
    if (role.disposition !== "CURRENT_ROLE_SUPPORTED") failures.push("ROLE_NOT_CURRENT_SUPPORTED");
    if (!role.authorityUsableForGraph) failures.push("ROLE_AUTHORITY_NOT_USABLE");
    if (role.canonicalOrganizationRef !== first.canonicalOrganizationRef) failures.push("ROLE_ORGANIZATION_CONFLICT");
    if (role.decisionFunction !== first.decisionFunction.value) failures.push("ROLE_DECISION_FUNCTION_CONFLICT");
    if (role.authorityClass !== first.authorityClass.value) failures.push("ROLE_AUTHORITY_CONFLICT");
    if (roleEvidenceRefs.length === 0) failures.push("ROLE_EVIDENCE_MISSING");

    const roleObservedAtMs = role.observedAt == null ? Number.NaN : Date.parse(role.observedAt);
    if (!Number.isFinite(roleObservedAtMs)) failures.push("INVALID_ROLE_OBSERVED_AT");
    else if (roleObservedAtMs > nowMs) failures.push("ROLE_OBSERVED_AT_IN_FUTURE");

    const latestSponsorObservedAtMs = Math.max(...group.map((candidate) => Date.parse(candidate.observedAt)));
    if (role.authorityRevalidationRequired && (!Number.isFinite(roleObservedAtMs) || latestSponsorObservedAtMs < roleObservedAtMs)) {
      failures.push("ROLE_REVALIDATION_NOT_SATISFIED");
    }

    if (failures.length > 0) {
      const evidence = refs(groupEvidenceRefs, roleEvidenceRefs);
      for (const candidate of group) {
        decisions.push(candidateDecision(candidate.candidateId, "REVIEW_REQUIRED", failures, evidence));
      }
      continue;
    }

    const proposalId = edgeId(first.canonicalPersonRef, first.canonicalOrganizationRef);
    const candidateIds = texts(group.map((candidate) => candidate.candidateId));
    const sourceRefs = texts(group.map((candidate) => candidate.sourceRef));
    const evidenceRefs = refs(groupEvidenceRefs, roleEvidenceRefs);
    const observedThroughMs = Math.max(latestSponsorObservedAtMs, roleObservedAtMs);

    const proposal = freezeDeep({
      proposalId,
      idempotencyKey: proposalId,
      relationshipType: "PERSON_ROLE_AT_ORGANIZATION" as const,
      canonicalPersonRef: first.canonicalPersonRef,
      canonicalOrganizationRef: first.canonicalOrganizationRef,
      title: requiredText(role.title, "role.title"),
      decisionFunction: requiredText(role.decisionFunction, "role.decisionFunction"),
      authorityClass: requiredText(role.authorityClass, "role.authorityClass"),
      ecosystemRole: first.ecosystemRole.value as SponsorMapEcosystemRoleV1,
      accessPath: contextField(group.map((candidate) => ({ value: candidate.accessPath.value, evidenceRefs: candidate.accessPath.evidenceRefs }))),
      contactRoute: contextField(group.map((candidate) => ({ value: candidate.contactRoute.value, evidenceRefs: candidate.contactRoute.evidenceRefs }))),
      planningWindow: contextField(group.map((candidate) => ({ value: candidate.planningWindow.value, evidenceRefs: candidate.planningWindow.evidenceRefs }))),
      eventOrSeasonDate: contextField(group.map((candidate) => ({ value: candidate.eventOrSeasonDate?.value ?? null, evidenceRefs: candidate.eventOrSeasonDate?.evidenceRefs ?? [] }))),
      candidateIds: [...candidateIds],
      sourceRefs: [...sourceRefs],
      evidenceRefs: [...evidenceRefs],
      observedThrough: new Date(observedThroughMs).toISOString(),
      truthState: "KNOWN" as const,
      currentRoleVerified: true as const,
      warmPathEdgeCreated: false as const,
      sponsorshipRelationshipEdgeCreated: false as const,
      contactCoordinateIncluded: false as const,
      writeAuthority: "NONE" as const
    });
    proposals.push(proposal);

    decisions.push(candidateDecision(first.candidateId, "PROPOSE_EDGE", ["EDGE_READY"], evidenceRefs, proposalId));
    for (const duplicate of group.slice(1)) {
      decisions.push(candidateDecision(
        duplicate.candidateId,
        "MERGED_DUPLICATE",
        ["DUPLICATE_QUALIFIED_CANDIDATE_MERGED"],
        evidenceRefs,
        proposalId,
        first.candidateId
      ));
    }
  }

  const orderedDecisions = [...decisions].sort((a, b) => a.candidateId.localeCompare(b.candidateId));
  return freezeDeep({
    version: RELATIONSHIP_GRAPH_POPULATION_VERSION_V1,
    generatedAt,
    proposals: [...proposals].sort((a, b) => a.proposalId.localeCompare(b.proposalId)),
    decisions: orderedDecisions,
    counts: {
      candidatesReviewed: input.sponsorDecisions.length,
      edgesProposed: proposals.length,
      duplicatesMerged: orderedDecisions.filter((item) => item.disposition === "MERGED_DUPLICATE").length,
      reviewRequired: orderedDecisions.filter((item) => item.disposition === "REVIEW_REQUIRED").length,
      skipped: orderedDecisions.filter((item) => item.disposition === "SKIPPED").length
    },
    crmMutationPerformed: false as const,
    relationshipGraphMutationPerformed: false as const,
    warmPathEdgeCreated: false as const,
    sponsorshipRelationshipEdgeCreated: false as const,
    contactInfoInferred: false as const,
    externalResearchPerformed: false as const,
    externalActionPerformed: false as const
  });
}
