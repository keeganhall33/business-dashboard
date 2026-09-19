import {
  RELATIONSHIP_GRAPH_POPULATION_VERSION_V1,
  type RelationshipGraphPopulationResultV1,
  type RelationshipGraphRoleEdgeProposalV1
} from "@/lib/relationship-intelligence/relationship-graph-population-v1";

export const RELATIONSHIP_GRAPH_CANONICAL_REVIEW_HANDOFF_VERSION_V1 =
  "RELATIONSHIP_GRAPH_CANONICAL_REVIEW_HANDOFF_V1" as const;

export type RelationshipGraphCanonicalReviewDispositionV1 =
  | "READY_FOR_CANONICAL_REVIEW"
  | "VERIFY_REQUIRED";

export type RelationshipGraphCanonicalReviewHandoffV1 = Readonly<{
  handoffId: string;
  idempotencyKey: string;
  sourceProposalId: string;
  relationshipType: "PERSON_ROLE_AT_ORGANIZATION";
  canonicalPersonRef: string;
  canonicalOrganizationRef: string;
  title: string;
  decisionFunction: string;
  authorityClass: string;
  ecosystemRole: RelationshipGraphRoleEdgeProposalV1["ecosystemRole"];
  accessPath: RelationshipGraphRoleEdgeProposalV1["accessPath"];
  contactRoute: RelationshipGraphRoleEdgeProposalV1["contactRoute"];
  planningWindow: RelationshipGraphRoleEdgeProposalV1["planningWindow"];
  eventOrSeasonDate: RelationshipGraphRoleEdgeProposalV1["eventOrSeasonDate"];
  candidateIds: readonly string[];
  sourceRefs: readonly string[];
  evidenceRefs: readonly string[];
  observedThrough: string;
  truthState: "KNOWN";
  currentRoleVerified: true;
  canonicalState: "REVIEW_CANDIDATE_ONLY";
  writeAuthority: "NONE";
}>;

export type RelationshipGraphCanonicalReviewDecisionV1 = Readonly<{
  proposalId: string;
  disposition: RelationshipGraphCanonicalReviewDispositionV1;
  handoffId: string | null;
  reasonCodes: readonly string[];
  evidenceRefs: readonly string[];
}>;

export type CompileRelationshipGraphCanonicalReviewHandoffV1Input = Readonly<{
  population: RelationshipGraphPopulationResultV1;
  evaluatedAt: string | Date;
  maximumPopulationAgeMinutes: number;
}>;

export type RelationshipGraphCanonicalReviewHandoffResultV1 = Readonly<{
  version: typeof RELATIONSHIP_GRAPH_CANONICAL_REVIEW_HANDOFF_VERSION_V1;
  sourcePopulationVersion: typeof RELATIONSHIP_GRAPH_POPULATION_VERSION_V1;
  generatedAt: string;
  status: "READY" | "BLOCKED";
  issues: readonly string[];
  handoffs: readonly RelationshipGraphCanonicalReviewHandoffV1[];
  decisions: readonly RelationshipGraphCanonicalReviewDecisionV1[];
  counts: Readonly<{
    proposalsReviewed: number;
    readyForCanonicalReview: number;
    verificationRequired: number;
  }>;
  inferencePolicy: "EXACT_UPSTREAM_ROLE_PROPOSAL_ONLY_NO_RELATIONSHIP_ACCESS_SPONSORSHIP_CONTACT_OR_AUTHORITY_INFERENCE";
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    canonicalReviewQueueHandoffAllowed: true;
    relationshipGraphMutationAuthorized: false;
    crmMutationAuthorized: false;
    contactDiscoveryAuthorized: false;
    warmPathInferenceAuthorized: false;
    sponsorshipInferenceAuthorized: false;
    outreachAuthorized: false;
    externalActionAuthorized: false;
  }>;
}>;

const MINUTE_MS = 60_000;
const MAX_POPULATION_AGE_MINUTES = 10_080;
const MAX_PROPOSALS = 2_000;

const LIMITATIONS = Object.freeze([
  "A handoff is only an internal candidate for canonical review. It never writes a relationship edge to CRM or the relationship graph.",
  "Person, organization, title, decision function, authority class, ecosystem role, context fields, and evidence lineage are preserved from the exact upstream role proposal. This layer does not fuzzy-match or replace identities.",
  "A WARM access classification is context only. It does not identify an introducer, prove an introduction is available, or create a warm-path edge.",
  "Sponsor-side role context does not establish a sponsorship relationship, sponsor interest, budget, opportunity likelihood, timing certainty, or monetary value.",
  "A public or authorized contact-route classification is not contact information and this layer never invents or copies contact coordinates."
] as const);

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  canonicalReviewQueueHandoffAllowed: true as const,
  relationshipGraphMutationAuthorized: false as const,
  crmMutationAuthorized: false as const,
  contactDiscoveryAuthorized: false as const,
  warmPathInferenceAuthorized: false as const,
  sponsorshipInferenceAuthorized: false as const,
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
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > MAX_POPULATION_AGE_MINUTES) {
    throw new Error(`${label} must be an integer between 1 and ${MAX_POPULATION_AGE_MINUTES}`);
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

function uniqueSafeTexts(values: readonly string[], label: string): readonly string[] {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array`);
  return Object.freeze(
    [...new Set(values.map((value, index) => safeText(value, `${label}[${index}]`)))].sort((a, b) => a.localeCompare(b))
  );
}

function countsMatch(population: RelationshipGraphPopulationResultV1): boolean {
  if (!population.counts || typeof population.counts !== "object") return false;
  const decisions = population.decisions;
  return population.counts.candidatesReviewed === decisions.length
    && population.counts.edgesProposed === population.proposals.length
    && population.counts.edgesProposed === decisions.filter((item) => item.disposition === "PROPOSE_EDGE").length
    && population.counts.duplicatesMerged === decisions.filter((item) => item.disposition === "MERGED_DUPLICATE").length
    && population.counts.reviewRequired === decisions.filter((item) => item.disposition === "REVIEW_REQUIRED").length
    && population.counts.skipped === decisions.filter((item) => item.disposition === "SKIPPED").length;
}

function sourceIssues(
  population: RelationshipGraphPopulationResultV1,
  evaluatedAtMs: number,
  maximumPopulationAgeMinutes: number
): readonly string[] {
  const issues = new Set<string>();
  if (!population || typeof population !== "object" || Array.isArray(population)) return Object.freeze(["SOURCE_POPULATION_REQUIRED"]);
  if (population.version !== RELATIONSHIP_GRAPH_POPULATION_VERSION_V1) issues.add("SOURCE_POPULATION_VERSION_UNSUPPORTED");
  if (!Array.isArray(population.proposals)) issues.add("SOURCE_PROPOSALS_REQUIRED");
  else if (population.proposals.length > MAX_PROPOSALS) issues.add("SOURCE_PROPOSAL_LIMIT_EXCEEDED");
  if (!Array.isArray(population.decisions)) issues.add("SOURCE_DECISIONS_REQUIRED");

  const generatedAtMs = Date.parse(population.generatedAt);
  if (!Number.isFinite(generatedAtMs)) issues.add("SOURCE_GENERATED_AT_INVALID");
  else if (generatedAtMs > evaluatedAtMs) issues.add("SOURCE_GENERATED_IN_FUTURE");
  else if (evaluatedAtMs - generatedAtMs > maximumPopulationAgeMinutes * MINUTE_MS) issues.add("SOURCE_POPULATION_STALE");

  if (population.relationshipGraphMutationPerformed !== false) issues.add("UPSTREAM_GRAPH_MUTATION_NOT_ALLOWED");
  if (population.crmMutationPerformed !== false) issues.add("UPSTREAM_CRM_MUTATION_NOT_ALLOWED");
  if (population.warmPathEdgeCreated !== false) issues.add("UPSTREAM_WARM_PATH_CREATION_NOT_ALLOWED");
  if (population.sponsorshipRelationshipEdgeCreated !== false) issues.add("UPSTREAM_SPONSORSHIP_EDGE_CREATION_NOT_ALLOWED");
  if (population.contactInfoInferred !== false) issues.add("UPSTREAM_CONTACT_INFERENCE_NOT_ALLOWED");
  if (population.externalResearchPerformed !== false) issues.add("UPSTREAM_EXTERNAL_RESEARCH_NOT_ALLOWED");
  if (population.externalActionPerformed !== false) issues.add("UPSTREAM_EXTERNAL_ACTION_NOT_ALLOWED");

  if (Array.isArray(population.proposals) && Array.isArray(population.decisions) && !countsMatch(population)) {
    issues.add("SOURCE_COUNT_MISMATCH");
  }

  if (Array.isArray(population.proposals)) {
    const proposalIds = new Set<string>();
    const idempotencyKeys = new Set<string>();
    for (const [index, proposal] of population.proposals.entries()) {
      try {
        const proposalId = safeText(proposal.proposalId, `proposal ${index}.proposalId`);
        const idempotencyKey = safeText(proposal.idempotencyKey, `proposal ${index}.idempotencyKey`);
        if (proposalIds.has(proposalId)) issues.add("SOURCE_DUPLICATE_PROPOSAL_ID");
        if (idempotencyKeys.has(idempotencyKey)) issues.add("SOURCE_DUPLICATE_IDEMPOTENCY_KEY");
        proposalIds.add(proposalId);
        idempotencyKeys.add(idempotencyKey);
      } catch {
        issues.add("SOURCE_UNSAFE_OR_INVALID_IDENTITY");
      }
    }
  }

  if (Array.isArray(population.decisions)) {
    const candidateIds = new Set<string>();
    for (const [index, decision] of population.decisions.entries()) {
      try {
        const candidateId = safeText(decision.candidateId, `decision ${index}.candidateId`);
        if (candidateIds.has(candidateId)) issues.add("SOURCE_DUPLICATE_CANDIDATE_DECISION");
        candidateIds.add(candidateId);
      } catch {
        issues.add("SOURCE_UNSAFE_OR_INVALID_DECISION_IDENTITY");
      }
    }
  }

  return Object.freeze([...issues].sort((a, b) => a.localeCompare(b)));
}

function proposalIssues(
  proposal: RelationshipGraphRoleEdgeProposalV1,
  population: RelationshipGraphPopulationResultV1,
  evaluatedAtMs: number
): readonly string[] {
  const issues = new Set<string>();
  try {
    safeText(proposal.proposalId, "proposalId");
    safeText(proposal.idempotencyKey, "idempotencyKey");
    safeText(proposal.canonicalPersonRef, "canonicalPersonRef");
    safeText(proposal.canonicalOrganizationRef, "canonicalOrganizationRef");
    safeText(proposal.title, "title");
    safeText(proposal.decisionFunction, "decisionFunction");
    safeText(proposal.authorityClass, "authorityClass");
    const candidateIds = uniqueSafeTexts(proposal.candidateIds, "candidateIds");
    const sourceRefs = uniqueSafeTexts(proposal.sourceRefs, "sourceRefs");
    const evidenceRefs = uniqueSafeTexts(proposal.evidenceRefs, "evidenceRefs");
    if (candidateIds.length === 0) issues.add("CANDIDATE_LINEAGE_REQUIRED");
    if (sourceRefs.length === 0) issues.add("SOURCE_PROVENANCE_REQUIRED");
    if (evidenceRefs.length === 0) issues.add("EVIDENCE_REQUIRED");
  } catch {
    issues.add("UNSAFE_OR_INVALID_PROPOSAL_PROVENANCE");
  }

  if (proposal.relationshipType !== "PERSON_ROLE_AT_ORGANIZATION") issues.add("RELATIONSHIP_TYPE_UNSUPPORTED");
  if (proposal.truthState !== "KNOWN") issues.add("TRUTH_STATE_NOT_KNOWN");
  if (proposal.currentRoleVerified !== true) issues.add("CURRENT_ROLE_NOT_VERIFIED");
  if (proposal.writeAuthority !== "NONE") issues.add("UPSTREAM_WRITE_AUTHORITY_WIDENED");
  if (proposal.warmPathEdgeCreated !== false) issues.add("UPSTREAM_WARM_PATH_EDGE_CREATED");
  if (proposal.sponsorshipRelationshipEdgeCreated !== false) issues.add("UPSTREAM_SPONSORSHIP_EDGE_CREATED");
  if (proposal.contactCoordinateIncluded !== false) issues.add("UPSTREAM_CONTACT_COORDINATE_INCLUDED");

  const observedThroughMs = Date.parse(proposal.observedThrough);
  const populationGeneratedAtMs = Date.parse(population.generatedAt);
  if (!Number.isFinite(observedThroughMs)) issues.add("OBSERVED_THROUGH_INVALID");
  else {
    if (observedThroughMs > evaluatedAtMs) issues.add("OBSERVATION_IN_FUTURE");
    if (Number.isFinite(populationGeneratedAtMs) && observedThroughMs > populationGeneratedAtMs) {
      issues.add("OBSERVATION_AFTER_SOURCE_POPULATION");
    }
  }

  const proposalDecisions = population.decisions.filter((decision) => decision.proposalId === proposal.proposalId);
  const proposed = proposalDecisions.filter((decision) => decision.disposition === "PROPOSE_EDGE");
  if (proposed.length !== 1) issues.add("EXACT_PROPOSE_EDGE_DECISION_REQUIRED");
  else {
    if (proposed[0].requiresVerification) issues.add("SOURCE_PROPOSE_EDGE_REQUIRES_VERIFICATION");
    if (!proposed[0].reasonCodes.includes("EDGE_READY")) issues.add("SOURCE_EDGE_READY_REASON_REQUIRED");
  }

  const candidateIdSet = new Set(proposal.candidateIds);
  const decisionCandidateSet = new Set(proposalDecisions.map((decision) => decision.candidateId));
  if (candidateIdSet.size !== decisionCandidateSet.size || [...candidateIdSet].some((id) => !decisionCandidateSet.has(id))) {
    issues.add("CANDIDATE_DECISION_LINEAGE_MISMATCH");
  }
  for (const decision of proposalDecisions) {
    if (decision.disposition !== "PROPOSE_EDGE" && decision.disposition !== "MERGED_DUPLICATE") {
      issues.add("INELIGIBLE_DECISION_BOUND_TO_PROPOSAL");
    }
    if (decision.requiresVerification) issues.add("BOUND_DECISION_REQUIRES_VERIFICATION");
  }

  return Object.freeze([...issues].sort((a, b) => a.localeCompare(b)));
}

function decision(
  proposal: RelationshipGraphRoleEdgeProposalV1,
  disposition: RelationshipGraphCanonicalReviewDispositionV1,
  reasonCodes: readonly string[],
  handoffId: string | null
): RelationshipGraphCanonicalReviewDecisionV1 {
  return freezeDeep({
    proposalId: proposal.proposalId,
    disposition,
    handoffId,
    reasonCodes: [...new Set(reasonCodes)].sort((a, b) => a.localeCompare(b)),
    evidenceRefs: [...uniqueSafeTexts(proposal.evidenceRefs, "proposal.evidenceRefs")]
  });
}

export function compileRelationshipGraphCanonicalReviewHandoffV1(
  input: CompileRelationshipGraphCanonicalReviewHandoffV1Input
): RelationshipGraphCanonicalReviewHandoffResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  const generatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const maximumPopulationAgeMinutes = positiveBoundedInteger(input.maximumPopulationAgeMinutes, "maximumPopulationAgeMinutes");
  const evaluatedAtMs = Date.parse(generatedAt);
  const issues = sourceIssues(input.population, evaluatedAtMs, maximumPopulationAgeMinutes);

  if (issues.length > 0) {
    return freezeDeep({
      version: RELATIONSHIP_GRAPH_CANONICAL_REVIEW_HANDOFF_VERSION_V1,
      sourcePopulationVersion: RELATIONSHIP_GRAPH_POPULATION_VERSION_V1,
      generatedAt,
      status: "BLOCKED" as const,
      issues: [...issues],
      handoffs: [],
      decisions: [],
      counts: { proposalsReviewed: 0, readyForCanonicalReview: 0, verificationRequired: 0 },
      inferencePolicy: "EXACT_UPSTREAM_ROLE_PROPOSAL_ONLY_NO_RELATIONSHIP_ACCESS_SPONSORSHIP_CONTACT_OR_AUTHORITY_INFERENCE" as const,
      limitations: [...LIMITATIONS],
      authority: { ...AUTHORITY }
    });
  }

  const handoffs: RelationshipGraphCanonicalReviewHandoffV1[] = [];
  const decisions: RelationshipGraphCanonicalReviewDecisionV1[] = [];

  for (const proposal of [...input.population.proposals].sort((a, b) => a.proposalId.localeCompare(b.proposalId))) {
    const localIssues = proposalIssues(proposal, input.population, evaluatedAtMs);
    if (localIssues.length > 0) {
      decisions.push(decision(proposal, "VERIFY_REQUIRED", localIssues, null));
      continue;
    }

    const handoffId = `canonical-review:${proposal.idempotencyKey}`;
    handoffs.push(freezeDeep({
      handoffId,
      idempotencyKey: proposal.idempotencyKey,
      sourceProposalId: proposal.proposalId,
      relationshipType: proposal.relationshipType,
      canonicalPersonRef: proposal.canonicalPersonRef,
      canonicalOrganizationRef: proposal.canonicalOrganizationRef,
      title: proposal.title,
      decisionFunction: proposal.decisionFunction,
      authorityClass: proposal.authorityClass,
      ecosystemRole: proposal.ecosystemRole,
      accessPath: { ...proposal.accessPath, evidenceRefs: [...proposal.accessPath.evidenceRefs] },
      contactRoute: { ...proposal.contactRoute, evidenceRefs: [...proposal.contactRoute.evidenceRefs] },
      planningWindow: { ...proposal.planningWindow, evidenceRefs: [...proposal.planningWindow.evidenceRefs] },
      eventOrSeasonDate: { ...proposal.eventOrSeasonDate, evidenceRefs: [...proposal.eventOrSeasonDate.evidenceRefs] },
      candidateIds: [...proposal.candidateIds],
      sourceRefs: [...proposal.sourceRefs],
      evidenceRefs: [...proposal.evidenceRefs],
      observedThrough: proposal.observedThrough,
      truthState: "KNOWN" as const,
      currentRoleVerified: true as const,
      canonicalState: "REVIEW_CANDIDATE_ONLY" as const,
      writeAuthority: "NONE" as const
    }));
    decisions.push(decision(proposal, "READY_FOR_CANONICAL_REVIEW", ["EXACT_EVIDENCE_BACKED_ROLE_PROPOSAL_READY"], handoffId));
  }

  const orderedHandoffs = [...handoffs].sort((a, b) => a.handoffId.localeCompare(b.handoffId));
  const orderedDecisions = [...decisions].sort((a, b) => a.proposalId.localeCompare(b.proposalId));

  return freezeDeep({
    version: RELATIONSHIP_GRAPH_CANONICAL_REVIEW_HANDOFF_VERSION_V1,
    sourcePopulationVersion: RELATIONSHIP_GRAPH_POPULATION_VERSION_V1,
    generatedAt,
    status: "READY" as const,
    issues: [],
    handoffs: orderedHandoffs,
    decisions: orderedDecisions,
    counts: {
      proposalsReviewed: input.population.proposals.length,
      readyForCanonicalReview: orderedDecisions.filter((item) => item.disposition === "READY_FOR_CANONICAL_REVIEW").length,
      verificationRequired: orderedDecisions.filter((item) => item.disposition === "VERIFY_REQUIRED").length
    },
    inferencePolicy: "EXACT_UPSTREAM_ROLE_PROPOSAL_ONLY_NO_RELATIONSHIP_ACCESS_SPONSORSHIP_CONTACT_OR_AUTHORITY_INFERENCE" as const,
    limitations: [...LIMITATIONS],
    authority: { ...AUTHORITY }
  });
}
