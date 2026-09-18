import {
  RELATIONSHIP_SIGNAL_DELTA_VERSION,
  type RelationshipSignalDeltaDecisionV1,
  type RelationshipSignalDeltaResultV1
} from "@/lib/relationship-intelligence/relationship-signal-delta-v1";

export const RELATIONSHIP_GRAPH_CHANGE_PROPOSAL_VERSION_V1 =
  "RELATIONSHIP_GRAPH_CHANGE_PROPOSAL_V1" as const;

export type RelationshipGraphChangeOperationV1 = "ADD_RELATIONSHIP" | "END_RELATIONSHIP";

export type RelationshipGraphChangeReviewDispositionV1 =
  | "PROPOSE_ADD"
  | "PROPOSE_END"
  | "NO_CHANGE"
  | "VERIFY_REQUIRED"
  | "SUPPRESS";

export type RelationshipGraphChangeProposalV1 = Readonly<{
  proposalId: string;
  operation: RelationshipGraphChangeOperationV1;
  sourceDeltaId: string;
  sourceSignalId: string;
  sourceEventKey: string;
  sourceRef: string;
  observedAt: string;
  subjectEntityRef: string;
  objectEntityRef: string;
  relationshipKind: RelationshipSignalDeltaDecisionV1["relationshipKind"];
  relationshipStatus: RelationshipSignalDeltaDecisionV1["relationshipStatus"];
  matchedRelationshipRef: string | null;
  signalEvidenceRefs: readonly string[];
  matchedRelationshipEvidenceRefs: readonly string[];
  truthState: "KNOWN";
  confidence: "NOT_ESTABLISHED";
  sponsorInterest: "NOT_ESTABLISHED";
  decisionAuthority: "NOT_ESTABLISHED";
  opportunityImplication: "NOT_ESTABLISHED";
  monetaryValue: null;
  writeAuthority: "NONE";
}>;

export type RelationshipGraphChangeReviewDecisionV1 = Readonly<{
  deltaId: string;
  signalId: string;
  disposition: RelationshipGraphChangeReviewDispositionV1;
  proposalId: string | null;
  evidenceRefs: readonly string[];
  reasonCodes: readonly string[];
}>;

export type RelationshipGraphChangeProposalInputV1 = Readonly<{
  projection: RelationshipSignalDeltaResultV1;
  evaluatedAt: string | Date;
  maximumProjectionAgeMinutes: number;
}>;

export type RelationshipGraphChangeProposalResultV1 = Readonly<{
  version: typeof RELATIONSHIP_GRAPH_CHANGE_PROPOSAL_VERSION_V1;
  sourceProjectionVersion: typeof RELATIONSHIP_SIGNAL_DELTA_VERSION;
  generatedAt: string;
  status: "READY" | "BLOCKED";
  issues: readonly string[];
  proposals: readonly RelationshipGraphChangeProposalV1[];
  decisions: readonly RelationshipGraphChangeReviewDecisionV1[];
  counts: Readonly<{
    decisionsReviewed: number;
    addsProposed: number;
    endsProposed: number;
    noChange: number;
    verificationRequired: number;
    suppressed: number;
  }>;
  inferencePolicy: "EXACT_CANONICAL_DELTA_ONLY_NO_DIRECTION_KIND_OPPORTUNITY_OR_VALUE_INFERENCE";
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    internalGraphChangeReviewAllowed: true;
    relationshipGraphMutationAuthorized: false;
    crmMutationAuthorized: false;
    opportunityMutationAuthorized: false;
    contactDiscoveryAuthorized: false;
    outreachAuthorized: false;
    externalActionAuthorized: false;
  }>;
}>;

const MINUTE_MS = 60_000;
const MAX_PROJECTION_AGE_MINUTES = 10_080;
const MAX_DECISIONS = 2_000;

const LIMITATIONS = Object.freeze([
  "This layer converts only an already-governed exact-identity relationship delta into an internal graph-change proposal. A proposal is not canonical relationship truth and performs no graph or CRM write.",
  "Signal type, relationship kind, direction, status, entity identity, and evidence lineage are preserved exactly. This layer never reverses an edge, fuzzy-matches an entity, or infers a different relationship kind.",
  "A sponsorship signal can propose SPONSOR_OF only when the upstream delta already carries exact KNOWN SPONSOR_OF evidence with semantically consistent status. It never establishes sponsor interest, budget, decision authority, or an opportunity.",
  "Event attendance or a generic relationship signal is not enough to create a durable relationship edge. Those cases require verification or a more specific evidence-backed classification.",
  "Multiple sources, relationship age, or a proposed graph change never establish confidence, commercial value, likelihood, intent, or causality."
] as const);

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  internalGraphChangeReviewAllowed: true as const,
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

function countsMatchProjection(projection: RelationshipSignalDeltaResultV1): boolean {
  if (!projection.counts || typeof projection.counts !== "object") return false;
  const decisions = projection.decisions;
  return projection.counts.reviewed === decisions.length
    && projection.counts.newRelationshipCandidates === decisions.filter((item) => item.disposition === "NEW_RELATIONSHIP_CANDIDATE").length
    && projection.counts.updateRelationshipCandidates === decisions.filter((item) => item.disposition === "UPDATE_RELATIONSHIP_CANDIDATE").length
    && projection.counts.noMaterialChange === decisions.filter((item) => item.disposition === "NO_MATERIAL_CHANGE").length
    && projection.counts.needsVerification === decisions.filter((item) => item.disposition === "NEEDS_VERIFICATION").length
    && projection.counts.suppressed === decisions.filter((item) => item.disposition === "SUPPRESS").length;
}

function projectionIssues(
  projection: RelationshipSignalDeltaResultV1,
  evaluatedAtMs: number,
  maximumProjectionAgeMinutes: number
): readonly string[] {
  const issues = new Set<string>();
  if (!projection || typeof projection !== "object" || Array.isArray(projection)) return Object.freeze(["SOURCE_PROJECTION_REQUIRED"]);
  if (projection.version !== RELATIONSHIP_SIGNAL_DELTA_VERSION) issues.add("SOURCE_PROJECTION_VERSION_UNSUPPORTED");
  if (!Array.isArray(projection.decisions)) issues.add("SOURCE_PROJECTION_DECISIONS_REQUIRED");
  else if (projection.decisions.length > MAX_DECISIONS) issues.add("SOURCE_PROJECTION_DECISION_LIMIT_EXCEEDED");

  const generatedAtMs = Date.parse(projection.generatedAt);
  if (!Number.isFinite(generatedAtMs)) issues.add("SOURCE_PROJECTION_GENERATED_AT_INVALID");
  else if (generatedAtMs > evaluatedAtMs) issues.add("SOURCE_PROJECTION_GENERATED_IN_FUTURE");
  else if (evaluatedAtMs - generatedAtMs > maximumProjectionAgeMinutes * MINUTE_MS) issues.add("SOURCE_PROJECTION_STALE");

  if (projection.matchingPolicy !== "EXACT_CANONICAL_DIRECTION_AND_RELATIONSHIP_KIND_ONLY") {
    issues.add("SOURCE_MATCHING_POLICY_NOT_EXACT");
  }
  if (projection.relationshipKindInferencePerformed !== false) issues.add("UPSTREAM_RELATIONSHIP_KIND_INFERENCE_NOT_ALLOWED");
  if (projection.opportunityInferencePerformed !== false) issues.add("UPSTREAM_OPPORTUNITY_INFERENCE_NOT_ALLOWED");
  if (projection.graphMutationPerformed !== false) issues.add("UPSTREAM_GRAPH_MUTATION_NOT_ALLOWED");
  if (projection.crmMutationPerformed !== false) issues.add("UPSTREAM_CRM_MUTATION_NOT_ALLOWED");
  if (projection.externalActionPerformed !== false) issues.add("UPSTREAM_EXTERNAL_ACTION_NOT_ALLOWED");

  if (Array.isArray(projection.decisions) && !countsMatchProjection(projection)) issues.add("SOURCE_PROJECTION_COUNT_MISMATCH");

  if (Array.isArray(projection.decisions)) {
    const deltaIds = new Set<string>();
    const idempotencyKeys = new Set<string>();
    for (const [index, decision] of projection.decisions.entries()) {
      try {
        const deltaId = safeText(decision.deltaId, `decision ${index}.deltaId`);
        const idempotencyKey = safeText(decision.idempotencyKey, `decision ${index}.idempotencyKey`);
        safeText(decision.signalId, `decision ${index}.signalId`);
        safeText(decision.sourceEventKey, `decision ${index}.sourceEventKey`);
        safeText(decision.sourceRef, `decision ${index}.sourceRef`);
        safeRefs(decision.evidenceRefs, `decision ${index}.evidenceRefs`);
        safeRefs(decision.matchedRelationshipEvidenceRefs, `decision ${index}.matchedRelationshipEvidenceRefs`);
        safeNullableText(decision.subjectEntityRef, `decision ${index}.subjectEntityRef`);
        safeNullableText(decision.objectEntityRef, `decision ${index}.objectEntityRef`);
        safeNullableText(decision.matchedRelationshipRef, `decision ${index}.matchedRelationshipRef`);
        if (deltaIds.has(deltaId)) issues.add("SOURCE_PROJECTION_DUPLICATE_DELTA_ID");
        if (idempotencyKeys.has(idempotencyKey)) issues.add("SOURCE_PROJECTION_DUPLICATE_IDEMPOTENCY_KEY");
        deltaIds.add(deltaId);
        idempotencyKeys.add(idempotencyKey);
      } catch {
        issues.add("SOURCE_PROJECTION_UNSAFE_OR_INVALID_PROVENANCE");
      }
    }
  }

  return Object.freeze([...issues].sort((a, b) => a.localeCompare(b)));
}

function semanticIssue(decision: RelationshipSignalDeltaDecisionV1): string | null {
  switch (decision.signalType) {
    case "SPONSORSHIP_ANNOUNCEMENT":
    case "SPONSORSHIP_RENEWAL":
      if (decision.relationshipKind !== "SPONSOR_OF") return "SPONSORSHIP_SIGNAL_REQUIRES_SPONSOR_OF_KIND";
      if (decision.relationshipStatus !== "ACTIVE") return "SPONSORSHIP_ANNOUNCEMENT_OR_RENEWAL_REQUIRES_ACTIVE_STATUS";
      return null;
    case "SPONSORSHIP_END":
      if (decision.relationshipKind !== "SPONSOR_OF") return "SPONSORSHIP_SIGNAL_REQUIRES_SPONSOR_OF_KIND";
      if (decision.relationshipStatus !== "ENDED") return "SPONSORSHIP_END_REQUIRES_ENDED_STATUS";
      return null;
    case "EXECUTIVE_ROLE_CHANGE":
      return decision.relationshipKind === "EMPLOYED_BY" ? null : "EXECUTIVE_ROLE_CHANGE_REQUIRES_EMPLOYED_BY_KIND";
    case "REPRESENTATION_CHANGE":
      return decision.relationshipKind === "REPRESENTS" || decision.relationshipKind === "MANAGES" || decision.relationshipKind === "CLIENT_OF"
        ? null
        : "REPRESENTATION_CHANGE_REQUIRES_REPRESENTATION_KIND";
    case "AGENCY_CLIENT_ANNOUNCEMENT":
      if (decision.relationshipStatus !== "ACTIVE") return "AGENCY_CLIENT_ANNOUNCEMENT_REQUIRES_ACTIVE_STATUS";
      return decision.relationshipKind === "REPRESENTS" || decision.relationshipKind === "MANAGES" || decision.relationshipKind === "CLIENT_OF"
        ? null
        : "AGENCY_CLIENT_ANNOUNCEMENT_REQUIRES_REPRESENTATION_KIND";
    case "PARTNERSHIP_ANNOUNCEMENT":
      if (decision.relationshipKind !== "PARTNER_OF") return "PARTNERSHIP_ANNOUNCEMENT_REQUIRES_PARTNER_OF_KIND";
      return decision.relationshipStatus === "ACTIVE" ? null : "PARTNERSHIP_ANNOUNCEMENT_REQUIRES_ACTIVE_STATUS";
    case "LICENSING_DEAL":
      if (decision.relationshipKind !== "LICENSES" && decision.relationshipKind !== "RIGHTSHOLDER_FOR") {
        return "LICENSING_DEAL_REQUIRES_LICENSING_KIND";
      }
      return decision.relationshipStatus === "ACTIVE" ? null : "LICENSING_DEAL_REQUIRES_ACTIVE_STATUS";
    case "TALENT_BRAND_CAMPAIGN":
      if (decision.relationshipKind !== "CAMPAIGN_WITH") return "TALENT_BRAND_CAMPAIGN_REQUIRES_CAMPAIGN_WITH_KIND";
      return decision.relationshipStatus === "ACTIVE" ? null : "TALENT_BRAND_CAMPAIGN_REQUIRES_ACTIVE_STATUS";
    case "FOUNDATION_CHARITY_EVENT":
      return "EVENT_SIGNAL_DOES_NOT_ESTABLISH_DURABLE_RELATIONSHIP";
    case "OTHER_RELATIONSHIP_SIGNAL":
      return "OTHER_RELATIONSHIP_SIGNAL_REQUIRES_SPECIFIC_CLASSIFICATION";
  }
}

function upstreamDecisionIssues(
  decision: RelationshipSignalDeltaDecisionV1,
  projectionGeneratedAtMs: number,
  evaluatedAtMs: number
): readonly string[] {
  const issues = new Set<string>();
  const observedAtMs = Date.parse(decision.observedAt);
  if (!Number.isFinite(observedAtMs)) issues.add("OBSERVED_AT_INVALID");
  else {
    if (observedAtMs > projectionGeneratedAtMs) issues.add("OBSERVATION_AFTER_SOURCE_PROJECTION");
    if (observedAtMs > evaluatedAtMs) issues.add("OBSERVATION_IN_FUTURE");
  }

  if (decision.disposition === "NEW_RELATIONSHIP_CANDIDATE") {
    if (decision.changeClass !== "ADD_RELATIONSHIP") issues.add("NEW_CANDIDATE_MUST_BE_ADD_RELATIONSHIP");
    if (decision.matchedRelationshipRef != null) issues.add("NEW_CANDIDATE_MUST_NOT_HAVE_MATCHED_RELATIONSHIP");
  } else if (decision.disposition === "UPDATE_RELATIONSHIP_CANDIDATE") {
    if (decision.changeClass !== "END_RELATIONSHIP") issues.add("UPDATE_CANDIDATE_MUST_BE_END_RELATIONSHIP");
    if (!decision.matchedRelationshipRef) issues.add("UPDATE_CANDIDATE_REQUIRES_MATCHED_RELATIONSHIP");
    if (decision.matchedRelationshipEvidenceRefs.length === 0) issues.add("UPDATE_CANDIDATE_REQUIRES_MATCHED_RELATIONSHIP_EVIDENCE");
  } else if (decision.disposition === "NO_MATERIAL_CHANGE") {
    if (decision.changeClass !== "CONFIRM_EXISTING") issues.add("NO_CHANGE_MUST_CONFIRM_EXISTING");
    if (!decision.matchedRelationshipRef) issues.add("NO_CHANGE_REQUIRES_MATCHED_RELATIONSHIP");
  } else if (decision.changeClass !== "NONE") {
    issues.add("NON_CANDIDATE_DISPOSITION_MUST_NOT_PROPOSE_CHANGE_CLASS");
  }

  if (decision.disposition === "NEW_RELATIONSHIP_CANDIDATE" || decision.disposition === "UPDATE_RELATIONSHIP_CANDIDATE") {
    if (decision.truthState !== "KNOWN") issues.add("GRAPH_CHANGE_REQUIRES_KNOWN_TRUTH");
    if (!decision.subjectEntityRef || !decision.objectEntityRef) issues.add("GRAPH_CHANGE_REQUIRES_EXACT_ENTITY_ANCHORS");
    if (decision.subjectEntityRef && decision.subjectEntityRef === decision.objectEntityRef) issues.add("SELF_RELATIONSHIP_REQUIRES_VERIFICATION");
    if (decision.relationshipKind === "UNKNOWN") issues.add("GRAPH_CHANGE_REQUIRES_KNOWN_RELATIONSHIP_KIND");
    if (decision.relationshipStatus === "UNKNOWN") issues.add("GRAPH_CHANGE_REQUIRES_KNOWN_RELATIONSHIP_STATUS");
    if (decision.evidenceRefs.length === 0) issues.add("GRAPH_CHANGE_REQUIRES_SIGNAL_EVIDENCE");
  }

  return uniqueSorted([...issues]);
}

function reviewDecision(
  decision: RelationshipSignalDeltaDecisionV1,
  projectionGeneratedAtMs: number,
  evaluatedAtMs: number
): { review: RelationshipGraphChangeReviewDecisionV1; proposal: RelationshipGraphChangeProposalV1 | null } {
  const evidenceRefs = safeRefs(decision.evidenceRefs, `${decision.deltaId}.evidenceRefs`);
  const base = {
    deltaId: safeText(decision.deltaId, "decision.deltaId"),
    signalId: safeText(decision.signalId, "decision.signalId"),
    evidenceRefs: [...evidenceRefs]
  };

  if (decision.disposition === "SUPPRESS") {
    return {
      review: freezeDeep({ ...base, disposition: "SUPPRESS" as const, proposalId: null, reasonCodes: uniqueSorted(decision.reasonCodes) }),
      proposal: null
    };
  }
  if (decision.disposition === "NEEDS_VERIFICATION") {
    return {
      review: freezeDeep({ ...base, disposition: "VERIFY_REQUIRED" as const, proposalId: null, reasonCodes: uniqueSorted(decision.reasonCodes) }),
      proposal: null
    };
  }
  if (decision.disposition === "NO_MATERIAL_CHANGE") {
    const consistency = upstreamDecisionIssues(decision, projectionGeneratedAtMs, evaluatedAtMs);
    if (consistency.length > 0) {
      return {
        review: freezeDeep({ ...base, disposition: "VERIFY_REQUIRED" as const, proposalId: null, reasonCodes: consistency }),
        proposal: null
      };
    }
    return {
      review: freezeDeep({ ...base, disposition: "NO_CHANGE" as const, proposalId: null, reasonCodes: uniqueSorted(decision.reasonCodes) }),
      proposal: null
    };
  }

  const reasons = new Set<string>(upstreamDecisionIssues(decision, projectionGeneratedAtMs, evaluatedAtMs));
  const semantic = semanticIssue(decision);
  if (semantic) reasons.add(semantic);
  if (decision.disposition === "NEW_RELATIONSHIP_CANDIDATE" && decision.relationshipStatus === "ENDED") {
    reasons.add("ENDED_SIGNAL_WITHOUT_EXISTING_RELATIONSHIP_REQUIRES_HISTORY_REVIEW");
  }

  if (reasons.size > 0) {
    return {
      review: freezeDeep({
        ...base,
        disposition: "VERIFY_REQUIRED" as const,
        proposalId: null,
        reasonCodes: uniqueSorted([...decision.reasonCodes, ...reasons])
      }),
      proposal: null
    };
  }

  const operation: RelationshipGraphChangeOperationV1 = decision.disposition === "NEW_RELATIONSHIP_CANDIDATE"
    ? "ADD_RELATIONSHIP"
    : "END_RELATIONSHIP";
  const reviewDisposition: RelationshipGraphChangeReviewDispositionV1 = operation === "ADD_RELATIONSHIP" ? "PROPOSE_ADD" : "PROPOSE_END";
  const proposalId = `relationship-graph-change:${safeText(decision.deltaId, "decision.deltaId")}:${operation === "ADD_RELATIONSHIP" ? "add" : "end"}`;
  const subjectEntityRef = safeText(decision.subjectEntityRef, "decision.subjectEntityRef");
  const objectEntityRef = safeText(decision.objectEntityRef, "decision.objectEntityRef");
  const matchedRelationshipRef = safeNullableText(decision.matchedRelationshipRef, "decision.matchedRelationshipRef");

  const proposal = freezeDeep({
    proposalId,
    operation,
    sourceDeltaId: base.deltaId,
    sourceSignalId: base.signalId,
    sourceEventKey: safeText(decision.sourceEventKey, "decision.sourceEventKey"),
    sourceRef: safeText(decision.sourceRef, "decision.sourceRef"),
    observedAt: timestamp(decision.observedAt, "decision.observedAt"),
    subjectEntityRef,
    objectEntityRef,
    relationshipKind: decision.relationshipKind,
    relationshipStatus: decision.relationshipStatus,
    matchedRelationshipRef,
    signalEvidenceRefs: [...evidenceRefs],
    matchedRelationshipEvidenceRefs: [...safeRefs(decision.matchedRelationshipEvidenceRefs, "decision.matchedRelationshipEvidenceRefs")],
    truthState: "KNOWN" as const,
    confidence: "NOT_ESTABLISHED" as const,
    sponsorInterest: "NOT_ESTABLISHED" as const,
    decisionAuthority: "NOT_ESTABLISHED" as const,
    opportunityImplication: "NOT_ESTABLISHED" as const,
    monetaryValue: null,
    writeAuthority: "NONE" as const
  });

  return {
    review: freezeDeep({
      ...base,
      disposition: reviewDisposition,
      proposalId,
      reasonCodes: uniqueSorted([...decision.reasonCodes, "EXACT_EVIDENCE_BACKED_RELATIONSHIP_CHANGE_READY_FOR_INTERNAL_GRAPH_REVIEW"])
    }),
    proposal
  };
}

function emptyCounts() {
  return {
    decisionsReviewed: 0,
    addsProposed: 0,
    endsProposed: 0,
    noChange: 0,
    verificationRequired: 0,
    suppressed: 0
  };
}

export function compileRelationshipGraphChangeProposalsV1(
  input: RelationshipGraphChangeProposalInputV1
): RelationshipGraphChangeProposalResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  const generatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(generatedAt);
  const maximumProjectionAgeMinutes = positiveBoundedInteger(input.maximumProjectionAgeMinutes, "maximumProjectionAgeMinutes");
  const issues = projectionIssues(input.projection, evaluatedAtMs, maximumProjectionAgeMinutes);

  if (issues.length > 0) {
    return freezeDeep({
      version: RELATIONSHIP_GRAPH_CHANGE_PROPOSAL_VERSION_V1,
      sourceProjectionVersion: RELATIONSHIP_SIGNAL_DELTA_VERSION,
      generatedAt,
      status: "BLOCKED" as const,
      issues: [...issues],
      proposals: [],
      decisions: [],
      counts: { ...emptyCounts(), decisionsReviewed: Array.isArray(input.projection?.decisions) ? input.projection.decisions.length : 0 },
      inferencePolicy: "EXACT_CANONICAL_DELTA_ONLY_NO_DIRECTION_KIND_OPPORTUNITY_OR_VALUE_INFERENCE" as const,
      limitations: [...LIMITATIONS],
      authority: { ...AUTHORITY }
    });
  }

  const projectionGeneratedAtMs = Date.parse(input.projection.generatedAt);
  const reviewed = input.projection.decisions.map((decision) => reviewDecision(decision, projectionGeneratedAtMs, evaluatedAtMs));
  const decisions = reviewed.map((item) => item.review).sort((a, b) => a.deltaId.localeCompare(b.deltaId));
  const proposals = reviewed
    .map((item) => item.proposal)
    .filter((item): item is RelationshipGraphChangeProposalV1 => item != null)
    .sort((a, b) => a.proposalId.localeCompare(b.proposalId));

  return freezeDeep({
    version: RELATIONSHIP_GRAPH_CHANGE_PROPOSAL_VERSION_V1,
    sourceProjectionVersion: RELATIONSHIP_SIGNAL_DELTA_VERSION,
    generatedAt,
    status: "READY" as const,
    issues: [],
    proposals,
    decisions,
    counts: {
      decisionsReviewed: decisions.length,
      addsProposed: decisions.filter((item) => item.disposition === "PROPOSE_ADD").length,
      endsProposed: decisions.filter((item) => item.disposition === "PROPOSE_END").length,
      noChange: decisions.filter((item) => item.disposition === "NO_CHANGE").length,
      verificationRequired: decisions.filter((item) => item.disposition === "VERIFY_REQUIRED").length,
      suppressed: decisions.filter((item) => item.disposition === "SUPPRESS").length
    },
    inferencePolicy: "EXACT_CANONICAL_DELTA_ONLY_NO_DIRECTION_KIND_OPPORTUNITY_OR_VALUE_INFERENCE" as const,
    limitations: [...LIMITATIONS],
    authority: { ...AUTHORITY }
  });
}
