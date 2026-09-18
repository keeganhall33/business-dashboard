import { createHash } from "node:crypto";

export const OPPORTUNITY_SIGNAL_INTAKE_VERSION_V1 = "OPPORTUNITY_SIGNAL_INTAKE_V1" as const;

export type OpportunitySignalSourceKindV1 = "BOARDROOM" | "CHATGPT" | "EMAIL";
export type OpportunitySignalTruthStateV1 = "KNOWN" | "PARTIAL" | "UNKNOWN" | "STALE" | "CONFLICTED";
export type OpportunitySignalTypeV1 =
  | "SPONSORSHIP_OPPORTUNITY"
  | "PARTNERSHIP_OPPORTUNITY"
  | "PLANNING_WINDOW"
  | "DECISION_MAKER_CHANGE"
  | "WARM_INTRO"
  | "COMMERCIAL_INTEREST"
  | "OTHER_BUSINESS_OPPORTUNITY"
  | "NONE";

export type OpportunitySignalIntakeDispositionV1 =
  | "CAPTURED_FOR_REVIEW"
  | "RESEARCH_REQUIRED"
  | "VERIFY_REQUIRED"
  | "SUPPRESS";

export type EvidenceBackedPlanningWindowV1 = Readonly<{
  startAt: string | Date;
  endAt: string | Date;
  rationale: string;
  evidenceRefs: readonly string[];
}>;

export type EvidenceBackedDecisionMakerClaimV1 = Readonly<{
  authorityClass: "DECISION_MAKER" | "INFLUENCER";
  evidenceRefs: readonly string[];
}>;

export type EvidenceBackedBinaryClaimV1 = Readonly<{
  state: "SUPPORTED";
  evidenceRefs: readonly string[];
}>;

export type OpportunitySourceObservationV1 = Readonly<{
  captureId: string;
  sourceKind: OpportunitySignalSourceKindV1;
  sourceEventKey: string;
  sourceRef: string;
  observedAt: string | Date;
  evidenceRefs: readonly string[];
  truthState: OpportunitySignalTruthStateV1;
  signalType: OpportunitySignalTypeV1;
  organizationRef?: string | null;
  personRef?: string | null;
  opportunityRef?: string | null;
  planningWindow?: EvidenceBackedPlanningWindowV1 | null;
  decisionMakerClaim?: EvidenceBackedDecisionMakerClaimV1 | null;
  sponsorshipRelationshipClaim?: EvidenceBackedBinaryClaimV1 | null;
  warmAccessClaim?: EvidenceBackedBinaryClaimV1 | null;
}>;

export type OpportunitySignalIntakeDecisionV1 = Readonly<{
  candidateId: string;
  groupKey: string;
  disposition: OpportunitySignalIntakeDispositionV1;
  signalType: OpportunitySignalTypeV1;
  canonicalOrganizationRef: string | null;
  canonicalPersonRef: string | null;
  canonicalOpportunityRef: string | null;
  observedAt: string;
  sourceKinds: readonly OpportunitySignalSourceKindV1[];
  sourceRefs: readonly string[];
  sourceEventKeys: readonly string[];
  captureIds: readonly string[];
  evidenceRefs: readonly string[];
  planningWindow: Readonly<{
    state: "SUPPORTED";
    startAt: string;
    endAt: string;
    rationale: string;
    evidenceRefs: readonly string[];
  }> | Readonly<{ state: "NOT_ESTABLISHED" }>;
  decisionMakerAuthority:
    | Readonly<{ state: "SUPPORTED"; authorityClass: "DECISION_MAKER" | "INFLUENCER"; evidenceRefs: readonly string[] }>
    | Readonly<{ state: "NOT_ESTABLISHED" }>;
  sponsorshipRelationship:
    | Readonly<{ state: "SUPPORTED"; evidenceRefs: readonly string[] }>
    | Readonly<{ state: "NOT_ESTABLISHED" }>;
  warmAccess:
    | Readonly<{ state: "SUPPORTED"; evidenceRefs: readonly string[] }>
    | Readonly<{ state: "NOT_ESTABLISHED" }>;
  sponsorInterest: "NOT_ESTABLISHED";
  budgetAvailability: "NOT_ESTABLISHED";
  opportunityCertainty: "NOT_ESTABLISHED";
  dealLikelihood: "NOT_ESTABLISHED";
  confidenceFromSourceCount: "NOT_ESTABLISHED";
  reasonCodes: readonly string[];
  safeNextStep: string;
}>;

export type OpportunitySignalIntakeInputV1 = Readonly<{
  observations: readonly OpportunitySourceObservationV1[];
  evaluatedAt: string | Date;
  maximumSignalAgeDays?: number;
}>;

export type OpportunitySignalIntakeResultV1 = Readonly<{
  version: typeof OPPORTUNITY_SIGNAL_INTAKE_VERSION_V1;
  generatedAt: string;
  decisions: readonly OpportunitySignalIntakeDecisionV1[];
  counts: Readonly<Record<OpportunitySignalIntakeDispositionV1, number>>;
  dedupePolicy: "EXACT_SOURCE_KIND_AND_SOURCE_EVENT_KEY";
  groupingPolicy: "EXACT_CANONICAL_OPPORTUNITY_REF_ELSE_SOURCE_EVENT";
  inferencePolicy: "STRUCTURED_EVIDENCE_ONLY_NO_NAME_OR_TEXT_INFERENCE";
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    relationshipMutationAuthorized: false;
    crmMutationAuthorized: false;
    contactDiscoveryAuthorized: false;
    outreachAuthorized: false;
    spendAuthorized: false;
    contractAuthorized: false;
    externalActionAuthorized: false;
  }>;
}>;

const DAY_MS = 86_400_000;
const DEFAULT_MAX_SIGNAL_AGE_DAYS = 30;
const MAX_SIGNAL_AGE_DAYS = 365;
const MAX_OBSERVATIONS = 2_000;

const SOURCE_KINDS = new Set<OpportunitySignalSourceKindV1>(["BOARDROOM", "CHATGPT", "EMAIL"]);
const TRUTH_STATES = new Set<OpportunitySignalTruthStateV1>(["KNOWN", "PARTIAL", "UNKNOWN", "STALE", "CONFLICTED"]);
const SIGNAL_TYPES = new Set<OpportunitySignalTypeV1>([
  "SPONSORSHIP_OPPORTUNITY",
  "PARTNERSHIP_OPPORTUNITY",
  "PLANNING_WINDOW",
  "DECISION_MAKER_CHANGE",
  "WARM_INTRO",
  "COMMERCIAL_INTEREST",
  "OTHER_BUSINESS_OPPORTUNITY",
  "NONE"
]);

const LIMITATIONS = Object.freeze([
  "This intake normalizes already-structured observations from authorized upstream sources. It does not infer facts from raw email, chat, article, social, or web text.",
  "Names are never resolved or fuzzy-matched here. Canonical person, organization, and opportunity refs must already be evidence-backed upstream.",
  "Multiple sources do not increase confidence by themselves. Source count never establishes sponsor interest, budget, likelihood, authority, access, timing, or commercial value.",
  "Captured candidates are internal review observations, not qualified opportunities and not authorization to contact, spend, contract, mutate CRM/graph data, or act externally."
] as const);

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  relationshipMutationAuthorized: false as const,
  crmMutationAuthorized: false as const,
  contactDiscoveryAuthorized: false as const,
  outreachAuthorized: false as const,
  spendAuthorized: false as const,
  contractAuthorized: false as const,
  externalActionAuthorized: false as const
});

type NormalizedObservation = Readonly<{
  captureId: string;
  sourceKind: OpportunitySignalSourceKindV1;
  sourceEventKey: string;
  sourceRef: string;
  observedAt: string;
  evidenceRefs: readonly string[];
  truthState: OpportunitySignalTruthStateV1;
  signalType: OpportunitySignalTypeV1;
  organizationRef: string | null;
  personRef: string | null;
  opportunityRef: string | null;
  planningWindow: OpportunitySignalIntakeDecisionV1["planningWindow"];
  decisionMakerAuthority: OpportunitySignalIntakeDecisionV1["decisionMakerAuthority"];
  sponsorshipRelationship: OpportunitySignalIntakeDecisionV1["sponsorshipRelationship"];
  warmAccess: OpportunitySignalIntakeDecisionV1["warmAccess"];
  validationIssues: readonly string[];
}>;

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function optionalText(value: unknown, label: string): string | null {
  if (value == null) return null;
  return requiredText(value, label);
}

function instant(value: string | Date, label: string): string {
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return parsed.toISOString();
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number, label: string): number {
  const candidate = value == null ? fallback : value;
  if (typeof candidate !== "number" || !Number.isInteger(candidate) || candidate < min || candidate > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}`);
  }
  return candidate;
}

function textList(value: readonly string[], label: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must be a non-empty array`);
  return Object.freeze([...new Set(value.map((item, index) => requiredText(item, `${label}[${index}]`)))].sort((a, b) => a.localeCompare(b)));
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b)));
}

function claimEvidence(
  evidenceRefs: readonly string[],
  observationEvidenceRefs: readonly string[],
  label: string,
  issues: string[]
): readonly string[] {
  const normalized = textList(evidenceRefs, `${label}.evidenceRefs`);
  const allowed = new Set(observationEvidenceRefs);
  if (normalized.some((ref) => !allowed.has(ref))) issues.push(`${label.toUpperCase()}_EVIDENCE_NOT_IN_OBSERVATION_LINEAGE`);
  return normalized;
}

function normalizeObservation(
  observation: OpportunitySourceObservationV1,
  index: number,
  evaluatedAtMs: number,
  maximumSignalAgeDays: number
): NormalizedObservation {
  if (!observation || typeof observation !== "object" || Array.isArray(observation)) throw new Error(`observation ${index} must be an object`);
  if (!SOURCE_KINDS.has(observation.sourceKind)) throw new Error(`observation ${index}.sourceKind is unsupported`);
  if (!TRUTH_STATES.has(observation.truthState)) throw new Error(`observation ${index}.truthState is unsupported`);
  if (!SIGNAL_TYPES.has(observation.signalType)) throw new Error(`observation ${index}.signalType is unsupported`);

  const observedAt = instant(observation.observedAt, `observation ${index}.observedAt`);
  const observedAtMs = Date.parse(observedAt);
  if (observedAtMs > evaluatedAtMs) throw new Error(`observation ${index}.observedAt must not be future-dated`);

  const evidenceRefs = textList(observation.evidenceRefs, `observation ${index}.evidenceRefs`);
  const issues: string[] = [];
  if (evaluatedAtMs - observedAtMs > maximumSignalAgeDays * DAY_MS) issues.push("SOURCE_OBSERVATION_STALE");
  if (observation.truthState === "CONFLICTED") issues.push("SOURCE_TRUTH_CONFLICTED");
  if (observation.truthState === "UNKNOWN") issues.push("SOURCE_TRUTH_UNKNOWN");
  if (observation.truthState === "STALE") issues.push("SOURCE_TRUTH_STALE");
  if (observation.truthState === "PARTIAL") issues.push("SOURCE_TRUTH_PARTIAL");

  const organizationRef = optionalText(observation.organizationRef, `observation ${index}.organizationRef`);
  const personRef = optionalText(observation.personRef, `observation ${index}.personRef`);
  const opportunityRef = optionalText(observation.opportunityRef, `observation ${index}.opportunityRef`);
  if (!organizationRef && !personRef && !opportunityRef) issues.push("NO_CANONICAL_ENTITY_ANCHOR");

  let planningWindow: OpportunitySignalIntakeDecisionV1["planningWindow"] = { state: "NOT_ESTABLISHED" };
  if (observation.planningWindow) {
    const claimRefs = claimEvidence(observation.planningWindow.evidenceRefs, evidenceRefs, "planning_window", issues);
    const startAt = instant(observation.planningWindow.startAt, `observation ${index}.planningWindow.startAt`);
    const endAt = instant(observation.planningWindow.endAt, `observation ${index}.planningWindow.endAt`);
    if (Date.parse(endAt) <= Date.parse(startAt)) issues.push("PLANNING_WINDOW_INVALID_RANGE");
    planningWindow = {
      state: "SUPPORTED",
      startAt,
      endAt,
      rationale: requiredText(observation.planningWindow.rationale, `observation ${index}.planningWindow.rationale`),
      evidenceRefs: claimRefs
    };
  }

  let decisionMakerAuthority: OpportunitySignalIntakeDecisionV1["decisionMakerAuthority"] = { state: "NOT_ESTABLISHED" };
  if (observation.decisionMakerClaim) {
    if (!personRef) issues.push("DECISION_MAKER_CLAIM_WITHOUT_CANONICAL_PERSON");
    decisionMakerAuthority = {
      state: "SUPPORTED",
      authorityClass: observation.decisionMakerClaim.authorityClass,
      evidenceRefs: claimEvidence(observation.decisionMakerClaim.evidenceRefs, evidenceRefs, "decision_maker_claim", issues)
    };
  }

  let sponsorshipRelationship: OpportunitySignalIntakeDecisionV1["sponsorshipRelationship"] = { state: "NOT_ESTABLISHED" };
  if (observation.sponsorshipRelationshipClaim) {
    if (!organizationRef) issues.push("SPONSORSHIP_CLAIM_WITHOUT_CANONICAL_ORGANIZATION");
    sponsorshipRelationship = {
      state: "SUPPORTED",
      evidenceRefs: claimEvidence(observation.sponsorshipRelationshipClaim.evidenceRefs, evidenceRefs, "sponsorship_claim", issues)
    };
  }

  let warmAccess: OpportunitySignalIntakeDecisionV1["warmAccess"] = { state: "NOT_ESTABLISHED" };
  if (observation.warmAccessClaim) {
    if (!personRef) issues.push("WARM_ACCESS_CLAIM_WITHOUT_CANONICAL_PERSON");
    warmAccess = {
      state: "SUPPORTED",
      evidenceRefs: claimEvidence(observation.warmAccessClaim.evidenceRefs, evidenceRefs, "warm_access_claim", issues)
    };
  }

  return freezeDeep({
    captureId: requiredText(observation.captureId, `observation ${index}.captureId`),
    sourceKind: observation.sourceKind,
    sourceEventKey: requiredText(observation.sourceEventKey, `observation ${index}.sourceEventKey`),
    sourceRef: requiredText(observation.sourceRef, `observation ${index}.sourceRef`),
    observedAt,
    evidenceRefs,
    truthState: observation.truthState,
    signalType: observation.signalType,
    organizationRef,
    personRef,
    opportunityRef,
    planningWindow,
    decisionMakerAuthority,
    sponsorshipRelationship,
    warmAccess,
    validationIssues: uniqueSorted(issues)
  });
}

function semanticSignature(observation: NormalizedObservation): string {
  return JSON.stringify({
    sourceKind: observation.sourceKind,
    sourceEventKey: observation.sourceEventKey,
    observedAt: observation.observedAt,
    truthState: observation.truthState,
    signalType: observation.signalType,
    organizationRef: observation.organizationRef,
    personRef: observation.personRef,
    opportunityRef: observation.opportunityRef,
    planningWindow: observation.planningWindow,
    decisionMakerAuthority: observation.decisionMakerAuthority,
    sponsorshipRelationship: observation.sponsorshipRelationship,
    warmAccess: observation.warmAccess
  });
}

function stableCandidateId(groupKey: string): string {
  return `opportunity-intake:${createHash("sha256").update(groupKey).digest("hex").slice(0, 20)}`;
}

function groupKey(observation: NormalizedObservation): string {
  return observation.opportunityRef
    ? `opportunity:${observation.opportunityRef}`
    : `source:${observation.sourceKind}:${observation.sourceEventKey}`;
}

function singleValue(values: readonly (string | null)[]): string | null | "CONFLICT" {
  const nonNull = uniqueSorted(values.filter((value): value is string => Boolean(value)));
  if (nonNull.length === 0) return null;
  if (nonNull.length === 1) return nonNull[0];
  return "CONFLICT";
}

function equivalentClaim<T>(claims: readonly T[]): T | null | "CONFLICT" {
  if (claims.length === 0) return null;
  const byJson = new Map(claims.map((claim) => [JSON.stringify(claim), claim] as const));
  if (byJson.size === 1) return [...byJson.values()][0] ?? null;
  return "CONFLICT";
}

function dispositionFor(issues: readonly string[], signalType: OpportunitySignalTypeV1): OpportunitySignalIntakeDispositionV1 {
  if (signalType === "NONE") return "SUPPRESS";
  if (issues.some((issue) => issue.includes("CONFLICT") || issue.includes("INVALID_RANGE") || issue.includes("EVIDENCE_NOT_IN_OBSERVATION_LINEAGE") || issue.includes("WITHOUT_CANONICAL"))) {
    return "VERIFY_REQUIRED";
  }
  if (issues.length > 0) return "RESEARCH_REQUIRED";
  return "CAPTURED_FOR_REVIEW";
}

function safeNextStep(disposition: OpportunitySignalIntakeDispositionV1): string {
  switch (disposition) {
    case "CAPTURED_FOR_REVIEW":
      return "Review the evidence-backed observation against current relationship and opportunity intelligence before any action.";
    case "RESEARCH_REQUIRED":
      return "Research the missing or stale canonical facts before treating this as a current opportunity.";
    case "VERIFY_REQUIRED":
      return "Resolve conflicting or invalid evidence before qualification or preparation.";
    case "SUPPRESS":
      return "Do not create an opportunity candidate from this observation.";
  }
}

function buildDecision(groupKeyValue: string, observations: readonly NormalizedObservation[]): OpportunitySignalIntakeDecisionV1 {
  const reasonCodes = new Set<string>();
  for (const observation of observations) for (const issue of observation.validationIssues) reasonCodes.add(issue);

  const organizationRef = singleValue(observations.map((item) => item.organizationRef));
  const personRef = singleValue(observations.map((item) => item.personRef));
  const opportunityRef = singleValue(observations.map((item) => item.opportunityRef));
  const signalTypes = uniqueSorted(observations.map((item) => item.signalType));

  if (organizationRef === "CONFLICT") reasonCodes.add("CANONICAL_ORGANIZATION_CONFLICT");
  if (personRef === "CONFLICT") reasonCodes.add("CANONICAL_PERSON_CONFLICT");
  if (opportunityRef === "CONFLICT") reasonCodes.add("CANONICAL_OPPORTUNITY_CONFLICT");
  if (signalTypes.length > 1) reasonCodes.add("SIGNAL_TYPE_CONFLICT");

  const planningClaims = observations.map((item) => item.planningWindow).filter((claim) => claim.state === "SUPPORTED");
  const authorityClaims = observations.map((item) => item.decisionMakerAuthority).filter((claim) => claim.state === "SUPPORTED");
  const sponsorshipClaims = observations.map((item) => item.sponsorshipRelationship).filter((claim) => claim.state === "SUPPORTED");
  const warmAccessClaims = observations.map((item) => item.warmAccess).filter((claim) => claim.state === "SUPPORTED");

  const planningWindow = equivalentClaim(planningClaims);
  const decisionMakerAuthority = equivalentClaim(authorityClaims);
  const sponsorshipRelationship = equivalentClaim(sponsorshipClaims);
  const warmAccess = equivalentClaim(warmAccessClaims);
  if (planningWindow === "CONFLICT") reasonCodes.add("PLANNING_WINDOW_CONFLICT");
  if (decisionMakerAuthority === "CONFLICT") reasonCodes.add("DECISION_MAKER_AUTHORITY_CONFLICT");
  if (sponsorshipRelationship === "CONFLICT") reasonCodes.add("SPONSORSHIP_RELATIONSHIP_CONFLICT");
  if (warmAccess === "CONFLICT") reasonCodes.add("WARM_ACCESS_CONFLICT");

  const signalType = signalTypes.length === 1 ? signalTypes[0] as OpportunitySignalTypeV1 : "OTHER_BUSINESS_OPPORTUNITY";
  const disposition = dispositionFor([...reasonCodes], signalType);
  const latestObservedAt = [...observations].sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0]?.observedAt;
  if (!latestObservedAt) throw new Error("opportunity intake group must contain at least one observation");

  return freezeDeep({
    candidateId: stableCandidateId(groupKeyValue),
    groupKey: groupKeyValue,
    disposition,
    signalType,
    canonicalOrganizationRef: organizationRef === "CONFLICT" ? null : organizationRef,
    canonicalPersonRef: personRef === "CONFLICT" ? null : personRef,
    canonicalOpportunityRef: opportunityRef === "CONFLICT" ? null : opportunityRef,
    observedAt: latestObservedAt,
    sourceKinds: uniqueSorted(observations.map((item) => item.sourceKind)) as readonly OpportunitySignalSourceKindV1[],
    sourceRefs: uniqueSorted(observations.map((item) => item.sourceRef)),
    sourceEventKeys: uniqueSorted(observations.map((item) => item.sourceEventKey)),
    captureIds: uniqueSorted(observations.map((item) => item.captureId)),
    evidenceRefs: uniqueSorted(observations.flatMap((item) => item.evidenceRefs)),
    planningWindow: planningWindow && planningWindow !== "CONFLICT" ? planningWindow : { state: "NOT_ESTABLISHED" as const },
    decisionMakerAuthority: decisionMakerAuthority && decisionMakerAuthority !== "CONFLICT" ? decisionMakerAuthority : { state: "NOT_ESTABLISHED" as const },
    sponsorshipRelationship: sponsorshipRelationship && sponsorshipRelationship !== "CONFLICT" ? sponsorshipRelationship : { state: "NOT_ESTABLISHED" as const },
    warmAccess: warmAccess && warmAccess !== "CONFLICT" ? warmAccess : { state: "NOT_ESTABLISHED" as const },
    sponsorInterest: "NOT_ESTABLISHED" as const,
    budgetAvailability: "NOT_ESTABLISHED" as const,
    opportunityCertainty: "NOT_ESTABLISHED" as const,
    dealLikelihood: "NOT_ESTABLISHED" as const,
    confidenceFromSourceCount: "NOT_ESTABLISHED" as const,
    reasonCodes: uniqueSorted([...reasonCodes]),
    safeNextStep: safeNextStep(disposition)
  });
}

export function normalizeOpportunitySignalsV1(input: OpportunitySignalIntakeInputV1): OpportunitySignalIntakeResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.observations)) throw new Error("observations must be an array");
  if (input.observations.length > MAX_OBSERVATIONS) throw new Error(`observations exceeds ${MAX_OBSERVATIONS}`);

  const generatedAt = instant(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(generatedAt);
  const maximumSignalAgeDays = boundedInteger(input.maximumSignalAgeDays, DEFAULT_MAX_SIGNAL_AGE_DAYS, 1, MAX_SIGNAL_AGE_DAYS, "maximumSignalAgeDays");
  const normalized = input.observations.map((observation, index) => normalizeObservation(observation, index, evaluatedAtMs, maximumSignalAgeDays));

  const sourceEvents = new Map<string, NormalizedObservation>();
  const conflictingDuplicateKeys = new Set<string>();
  for (const observation of normalized) {
    const key = `${observation.sourceKind}:${observation.sourceEventKey}`;
    const existing = sourceEvents.get(key);
    if (!existing) {
      sourceEvents.set(key, observation);
      continue;
    }
    if (semanticSignature(existing) !== semanticSignature(observation)) conflictingDuplicateKeys.add(key);
  }

  const groups = new Map<string, NormalizedObservation[]>();
  for (const observation of sourceEvents.values()) {
    const key = groupKey(observation);
    groups.set(key, [...(groups.get(key) ?? []), observation]);
  }

  const decisions = [...groups.entries()].map(([key, observations]) => {
    const decision = buildDecision(key, observations);
    const duplicateConflict = observations.some((observation) => conflictingDuplicateKeys.has(`${observation.sourceKind}:${observation.sourceEventKey}`));
    if (!duplicateConflict) return decision;
    return freezeDeep({
      ...decision,
      disposition: "VERIFY_REQUIRED" as const,
      reasonCodes: uniqueSorted([...decision.reasonCodes, "CONFLICTING_DUPLICATE_SOURCE_EVENT"]),
      safeNextStep: safeNextStep("VERIFY_REQUIRED")
    });
  }).sort((a, b) => {
    const order: Record<OpportunitySignalIntakeDispositionV1, number> = {
      VERIFY_REQUIRED: 0,
      CAPTURED_FOR_REVIEW: 1,
      RESEARCH_REQUIRED: 2,
      SUPPRESS: 3
    };
    return order[a.disposition] - order[b.disposition] || Date.parse(b.observedAt) - Date.parse(a.observedAt) || a.candidateId.localeCompare(b.candidateId);
  });

  const counts: Record<OpportunitySignalIntakeDispositionV1, number> = {
    CAPTURED_FOR_REVIEW: 0,
    RESEARCH_REQUIRED: 0,
    VERIFY_REQUIRED: 0,
    SUPPRESS: 0
  };
  for (const decision of decisions) counts[decision.disposition] += 1;

  return freezeDeep({
    version: OPPORTUNITY_SIGNAL_INTAKE_VERSION_V1,
    generatedAt,
    decisions,
    counts,
    dedupePolicy: "EXACT_SOURCE_KIND_AND_SOURCE_EVENT_KEY" as const,
    groupingPolicy: "EXACT_CANONICAL_OPPORTUNITY_REF_ELSE_SOURCE_EVENT" as const,
    inferencePolicy: "STRUCTURED_EVIDENCE_ONLY_NO_NAME_OR_TEXT_INFERENCE" as const,
    limitations: [...LIMITATIONS],
    authority: AUTHORITY
  });
}
