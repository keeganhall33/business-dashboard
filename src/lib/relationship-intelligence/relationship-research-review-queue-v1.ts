import {
  RELATIONSHIP_RESEARCH_EVIDENCE_HANDOFF_V1_VERSION,
  type RelationshipResearchEvidenceCandidateV1,
  type RelationshipResearchEvidenceHandoffResultV1
} from "@/lib/relationship-intelligence/relationship-research-evidence-handoff-v1";

export const RELATIONSHIP_RESEARCH_REVIEW_QUEUE_V1_VERSION =
  "RELATIONSHIP_RESEARCH_REVIEW_QUEUE_V1" as const;

export type RelationshipResearchReviewLaneV1 =
  | "CANONICAL_REVIEW"
  | "VERIFY_EVIDENCE"
  | "CONTINUE_RESEARCH";

export type RelationshipResearchReviewQueueItemV1 = Readonly<{
  observationId: string;
  taskId: string;
  targetId: string;
  canonicalEntityRef: string;
  dimension: RelationshipResearchEvidenceCandidateV1["dimension"];
  evidenceNeed: RelationshipResearchEvidenceCandidateV1["evidenceNeed"];
  sourceClass: RelationshipResearchEvidenceCandidateV1["sourceClass"];
  observedAt: string;
  truthState: RelationshipResearchEvidenceCandidateV1["truthState"];
  claimRef: string;
  evidenceRefs: readonly string[];
  lane: RelationshipResearchReviewLaneV1;
  reasonCodes: readonly string[];
  canonicalFactPromotionAuthorized: false;
  relationshipGraphMutationAuthorized: false;
  crmMutationAuthorized: false;
  opportunityMutationAuthorized: false;
  outreachAuthorized: false;
  externalActionAuthorized: false;
}>;

export type RelationshipResearchReviewQueueInputV1 = Readonly<{
  handoff: RelationshipResearchEvidenceHandoffResultV1;
  evaluatedAt: string | Date;
  maximumHandoffAgeMinutes: number;
}>;

export type RelationshipResearchReviewQueueResultV1 = Readonly<{
  version: typeof RELATIONSHIP_RESEARCH_REVIEW_QUEUE_V1_VERSION;
  sourceVersion: typeof RELATIONSHIP_RESEARCH_EVIDENCE_HANDOFF_V1_VERSION;
  generatedAt: string;
  status: "READY" | "EMPTY" | "BLOCKED";
  issues: readonly string[];
  items: readonly RelationshipResearchReviewQueueItemV1[];
  counts: Readonly<{
    reviewed: number;
    canonicalReview: number;
    verifyEvidence: number;
    continueResearch: number;
  }>;
  orderingPolicy: "WORK_LANE_THEN_TARGET_DIMENSION_OBSERVED_AT_ID_NO_ECONOMIC_PRIORITY";
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    canonicalReviewPreparationAllowed: true;
    canonicalFactPromotionAuthorized: false;
    relationshipGraphMutationAuthorized: false;
    crmMutationAuthorized: false;
    opportunityMutationAuthorized: false;
    contactDiscoveryAuthorized: false;
    outreachAuthorized: false;
    externalActionAuthorized: false;
  }>;
}>;

const MINUTE_MS = 60_000;
const MAX_HANDOFF_AGE_MINUTES = 43_200;
const MAX_CANDIDATES = 2_000;

const LIMITATIONS = Object.freeze([
  "This queue organizes already-governed research evidence for internal review. It does not create canonical relationship, sponsorship, decision-maker, access-path, contact, planning-window, or opportunity facts.",
  "CANONICAL_REVIEW means only that the source handoff marked exact current KNOWN evidence ready for a separate canonical verifier. Queue placement is not fact promotion or confidence.",
  "VERIFY_EVIDENCE and CONTINUE_RESEARCH preserve upstream uncertainty. The queue never upgrades inferred, partial, stale, conflicted, or unknown evidence.",
  "Ordering is workflow-only. It does not establish commercial priority, monetary value, relationship strength, sponsor interest, decision authority, willingness to introduce Keegan, causality, likelihood, or expected outcome.",
  "No output authorizes graph, CRM, opportunity, provider, or external mutation; contact discovery; outreach; spend; contracting; publishing; or approval bypass."
] as const);

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  canonicalReviewPreparationAllowed: true as const,
  canonicalFactPromotionAuthorized: false as const,
  relationshipGraphMutationAuthorized: false as const,
  crmMutationAuthorized: false as const,
  opportunityMutationAuthorized: false as const,
  contactDiscoveryAuthorized: false as const,
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

function boundedAge(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > MAX_HANDOFF_AGE_MINUTES) {
    throw new Error(`maximumHandoffAgeMinutes must be an integer between 1 and ${MAX_HANDOFF_AGE_MINUTES}`);
  }
  return value;
}

function containsCredentialMaterial(value: string): boolean {
  return /op:\/\//i.test(value)
    || /bearer\s+[a-z0-9._~-]+/i.test(value)
    || /(?:password|secret|token|api[_-]?key)\s*[=:]/i.test(value)
    || /[?&](?:access_token|token|api_key|key)=/i.test(value);
}

function containsContactCoordinate(value: string): boolean {
  return /mailto:/i.test(value)
    || /tel:/i.test(value)
    || /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value);
}

function safeOpaqueRef(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  const normalized = value.trim();
  if (containsCredentialMaterial(normalized)) throw new Error(`${label} must not contain credential material`);
  if (containsContactCoordinate(normalized)) throw new Error(`${label} must not contain raw contact coordinates`);
  return normalized;
}

function safeRefs(value: readonly string[], label: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must contain at least one reference`);
  const refs = value.map((item, index) => safeOpaqueRef(item, `${label}[${index}]`));
  return Object.freeze([...new Set(refs)].sort((a, b) => a.localeCompare(b)));
}

function sourceCountsMatch(handoff: RelationshipResearchEvidenceHandoffResultV1): boolean {
  if (!handoff.counts || typeof handoff.counts !== "object") return false;
  return handoff.counts.observationsReviewed === handoff.candidates.length
    && handoff.counts.readyForCanonicalReview === handoff.candidates.filter((item) => item.disposition === "READY_FOR_CANONICAL_REVIEW").length
    && handoff.counts.verificationRequired === handoff.candidates.filter((item) => item.disposition === "VERIFY_REQUIRED").length
    && handoff.counts.researchRequired === handoff.candidates.filter((item) => item.disposition === "RESEARCH_REQUIRED").length;
}

function sourceIssues(
  handoff: RelationshipResearchEvidenceHandoffResultV1,
  evaluatedAtMs: number,
  maximumHandoffAgeMinutes: number
): readonly string[] {
  const issues = new Set<string>();
  if (!handoff || typeof handoff !== "object" || Array.isArray(handoff)) return Object.freeze(["SOURCE_HANDOFF_REQUIRED"]);
  if (handoff.version !== RELATIONSHIP_RESEARCH_EVIDENCE_HANDOFF_V1_VERSION) issues.add("SOURCE_HANDOFF_VERSION_UNSUPPORTED");
  if (handoff.status === "BLOCKED") issues.add("SOURCE_HANDOFF_BLOCKED");
  if (!Array.isArray(handoff.issues) || handoff.issues.length > 0) issues.add("SOURCE_HANDOFF_HAS_ISSUES");
  if (!Array.isArray(handoff.candidates)) issues.add("SOURCE_HANDOFF_CANDIDATES_REQUIRED");
  else if (handoff.candidates.length > MAX_CANDIDATES) issues.add("SOURCE_HANDOFF_CANDIDATE_LIMIT_EXCEEDED");

  const generatedAtMs = Date.parse(handoff.generatedAt);
  if (!Number.isFinite(generatedAtMs)) issues.add("SOURCE_HANDOFF_GENERATED_AT_INVALID");
  else if (generatedAtMs > evaluatedAtMs) issues.add("SOURCE_HANDOFF_GENERATED_IN_FUTURE");
  else if (evaluatedAtMs - generatedAtMs > maximumHandoffAgeMinutes * MINUTE_MS) issues.add("SOURCE_HANDOFF_STALE");

  if (handoff.matchingPolicy !== "EXACT_PLAN_TASK_AND_CANONICAL_TARGET_ONLY") issues.add("SOURCE_HANDOFF_MATCHING_POLICY_WIDENED");
  if (!handoff.authority || handoff.authority.canonicalReviewPreparationAllowed !== true) issues.add("SOURCE_HANDOFF_CANONICAL_REVIEW_PREPARATION_NOT_ALLOWED");
  if (handoff.authority?.canonicalFactPromotionAuthorized !== false) issues.add("SOURCE_HANDOFF_FACT_PROMOTION_AUTHORITY_WIDENED");
  if (handoff.authority?.relationshipGraphMutationAuthorized !== false) issues.add("SOURCE_HANDOFF_GRAPH_AUTHORITY_WIDENED");
  if (handoff.authority?.crmMutationAuthorized !== false) issues.add("SOURCE_HANDOFF_CRM_AUTHORITY_WIDENED");
  if (handoff.authority?.opportunityMutationAuthorized !== false) issues.add("SOURCE_HANDOFF_OPPORTUNITY_AUTHORITY_WIDENED");
  if (handoff.authority?.contactDiscoveryAuthorized !== false) issues.add("SOURCE_HANDOFF_CONTACT_DISCOVERY_AUTHORITY_WIDENED");
  if (handoff.authority?.outreachAuthorized !== false) issues.add("SOURCE_HANDOFF_OUTREACH_AUTHORITY_WIDENED");
  if (handoff.authority?.externalActionAuthorized !== false) issues.add("SOURCE_HANDOFF_EXTERNAL_ACTION_AUTHORITY_WIDENED");

  if (Array.isArray(handoff.candidates) && !sourceCountsMatch(handoff)) issues.add("SOURCE_HANDOFF_COUNT_MISMATCH");
  return Object.freeze([...issues].sort((a, b) => a.localeCompare(b)));
}

function laneFor(candidate: RelationshipResearchEvidenceCandidateV1): RelationshipResearchReviewLaneV1 {
  if (candidate.disposition === "READY_FOR_CANONICAL_REVIEW") return "CANONICAL_REVIEW";
  if (candidate.disposition === "VERIFY_REQUIRED") return "VERIFY_EVIDENCE";
  return "CONTINUE_RESEARCH";
}

function candidateIssues(
  candidate: RelationshipResearchEvidenceCandidateV1,
  sourceGeneratedAtMs: number,
  index: number
): readonly string[] {
  const issues = new Set<string>();
  try {
    safeOpaqueRef(candidate.observationId, `candidates[${index}].observationId`);
    safeOpaqueRef(candidate.taskId, `candidates[${index}].taskId`);
    safeOpaqueRef(candidate.targetId, `candidates[${index}].targetId`);
    safeOpaqueRef(candidate.canonicalEntityRef, `candidates[${index}].canonicalEntityRef`);
    safeOpaqueRef(candidate.claimRef, `candidates[${index}].claimRef`);
    safeRefs(candidate.evidenceRefs, `candidates[${index}].evidenceRefs`);
    if (!Array.isArray(candidate.reasonCodes) || candidate.reasonCodes.length === 0) {
      issues.add("CANDIDATE_REASON_CODES_REQUIRED");
    } else {
      candidate.reasonCodes.forEach((reason, reasonIndex) => safeOpaqueRef(reason, `candidates[${index}].reasonCodes[${reasonIndex}]`));
    }
  } catch {
    issues.add("CANDIDATE_UNSAFE_OR_INVALID_PROVENANCE");
  }

  const observedAtMs = Date.parse(candidate.observedAt);
  if (!Number.isFinite(observedAtMs)) issues.add("CANDIDATE_OBSERVED_AT_INVALID");
  else if (observedAtMs > sourceGeneratedAtMs) issues.add("CANDIDATE_OBSERVED_AFTER_SOURCE_HANDOFF");

  if (candidate.disposition === "READY_FOR_CANONICAL_REVIEW" && candidate.truthState !== "KNOWN") {
    issues.add("CANONICAL_REVIEW_REQUIRES_KNOWN_TRUTH");
  }
  if (candidate.disposition === "RESEARCH_REQUIRED" && candidate.truthState !== "UNKNOWN") {
    issues.add("RESEARCH_REQUIRED_MUST_PRESERVE_UNKNOWN_TRUTH");
  }
  if (candidate.canonicalFactPromotionAuthorized !== false
    || candidate.relationshipInferenceAuthorized !== false
    || candidate.sponsorshipInferenceAuthorized !== false
    || candidate.decisionAuthorityInferenceAuthorized !== false
    || candidate.warmAccessInferenceAuthorized !== false
    || candidate.planningWindowInferenceAuthorized !== false
    || candidate.contactCoordinateExposureAuthorized !== false
    || candidate.opportunityCreationAuthorized !== false) {
    issues.add("CANDIDATE_AUTHORITY_WIDENED");
  }

  return Object.freeze([...issues].sort((a, b) => a.localeCompare(b)));
}

function blocked(generatedAt: string, issues: readonly string[]): RelationshipResearchReviewQueueResultV1 {
  return freezeDeep({
    version: RELATIONSHIP_RESEARCH_REVIEW_QUEUE_V1_VERSION,
    sourceVersion: RELATIONSHIP_RESEARCH_EVIDENCE_HANDOFF_V1_VERSION,
    generatedAt,
    status: "BLOCKED" as const,
    issues: [...new Set(issues)].sort((a, b) => a.localeCompare(b)),
    items: [],
    counts: { reviewed: 0, canonicalReview: 0, verifyEvidence: 0, continueResearch: 0 },
    orderingPolicy: "WORK_LANE_THEN_TARGET_DIMENSION_OBSERVED_AT_ID_NO_ECONOMIC_PRIORITY" as const,
    limitations: [...LIMITATIONS],
    authority: { ...AUTHORITY }
  });
}

function laneOrder(lane: RelationshipResearchReviewLaneV1): number {
  if (lane === "CANONICAL_REVIEW") return 0;
  if (lane === "VERIFY_EVIDENCE") return 1;
  return 2;
}

export function buildRelationshipResearchReviewQueueV1(
  input: RelationshipResearchReviewQueueInputV1
): RelationshipResearchReviewQueueResultV1 {
  const evaluatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(evaluatedAt);
  const maximumHandoffAgeMinutes = boundedAge(input.maximumHandoffAgeMinutes);
  const source = input.handoff;
  const baseIssues = sourceIssues(source, evaluatedAtMs, maximumHandoffAgeMinutes);
  if (baseIssues.length > 0) return blocked(evaluatedAt, baseIssues);

  if (source.status === "NO_OBSERVATIONS") {
    if (source.candidates.length !== 0 || source.counts.observationsReviewed !== 0) {
      return blocked(evaluatedAt, ["SOURCE_NO_OBSERVATIONS_STATE_INCONSISTENT"]);
    }
    return freezeDeep({
      version: RELATIONSHIP_RESEARCH_REVIEW_QUEUE_V1_VERSION,
      sourceVersion: RELATIONSHIP_RESEARCH_EVIDENCE_HANDOFF_V1_VERSION,
      generatedAt: evaluatedAt,
      status: "EMPTY" as const,
      issues: [],
      items: [],
      counts: { reviewed: 0, canonicalReview: 0, verifyEvidence: 0, continueResearch: 0 },
      orderingPolicy: "WORK_LANE_THEN_TARGET_DIMENSION_OBSERVED_AT_ID_NO_ECONOMIC_PRIORITY" as const,
      limitations: [...LIMITATIONS],
      authority: { ...AUTHORITY }
    });
  }

  const sourceGeneratedAtMs = Date.parse(source.generatedAt);
  const observationIds = new Set<string>();
  const itemIssues = new Set<string>();
  const items: RelationshipResearchReviewQueueItemV1[] = [];

  source.candidates.forEach((candidate, index) => {
    const issues = candidateIssues(candidate, sourceGeneratedAtMs, index);
    issues.forEach((issue) => itemIssues.add(issue));
    if (issues.length > 0) return;
    if (observationIds.has(candidate.observationId)) {
      itemIssues.add("SOURCE_HANDOFF_DUPLICATE_OBSERVATION_ID");
      return;
    }
    observationIds.add(candidate.observationId);

    items.push({
      observationId: candidate.observationId,
      taskId: candidate.taskId,
      targetId: candidate.targetId,
      canonicalEntityRef: candidate.canonicalEntityRef,
      dimension: candidate.dimension,
      evidenceNeed: candidate.evidenceNeed,
      sourceClass: candidate.sourceClass,
      observedAt: candidate.observedAt,
      truthState: candidate.truthState,
      claimRef: candidate.claimRef,
      evidenceRefs: [...candidate.evidenceRefs],
      lane: laneFor(candidate),
      reasonCodes: [...candidate.reasonCodes],
      canonicalFactPromotionAuthorized: false,
      relationshipGraphMutationAuthorized: false,
      crmMutationAuthorized: false,
      opportunityMutationAuthorized: false,
      outreachAuthorized: false,
      externalActionAuthorized: false
    });
  });

  if (itemIssues.size > 0) return blocked(evaluatedAt, [...itemIssues]);

  items.sort((left, right) =>
    laneOrder(left.lane) - laneOrder(right.lane)
    || left.targetId.localeCompare(right.targetId)
    || left.dimension.localeCompare(right.dimension)
    || left.observedAt.localeCompare(right.observedAt)
    || left.observationId.localeCompare(right.observationId)
  );

  const counts = {
    reviewed: items.length,
    canonicalReview: items.filter((item) => item.lane === "CANONICAL_REVIEW").length,
    verifyEvidence: items.filter((item) => item.lane === "VERIFY_EVIDENCE").length,
    continueResearch: items.filter((item) => item.lane === "CONTINUE_RESEARCH").length
  };

  return freezeDeep({
    version: RELATIONSHIP_RESEARCH_REVIEW_QUEUE_V1_VERSION,
    sourceVersion: RELATIONSHIP_RESEARCH_EVIDENCE_HANDOFF_V1_VERSION,
    generatedAt: evaluatedAt,
    status: "READY" as const,
    issues: [],
    items,
    counts,
    orderingPolicy: "WORK_LANE_THEN_TARGET_DIMENSION_OBSERVED_AT_ID_NO_ECONOMIC_PRIORITY" as const,
    limitations: [...LIMITATIONS],
    authority: { ...AUTHORITY }
  });
}
