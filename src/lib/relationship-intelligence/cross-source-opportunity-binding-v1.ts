import type {
  OpportunitySignalSourceKindV1,
  OpportunitySignalTruthStateV1,
  OpportunitySignalTypeV1,
  OpportunitySourceObservationV1
} from "@/lib/relationship-intelligence/opportunity-signal-intake-v1";

export const CROSS_SOURCE_OPPORTUNITY_BINDING_VERSION_V1 =
  "CROSS_SOURCE_OPPORTUNITY_BINDING_V1" as const;

const MINUTE_MS = 60_000;
const MAX_BINDING_AGE_MINUTES = 10_080;
const UNSAFE_REF = /(?:op:\/\/|begin\s+(?:rsa\s+)?private\s+key|(?:password|passwd|secret|token|api[_-]?key)\s*[=:])/i;

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

export type CrossSourceOpportunityBindingEvidenceV1 = Readonly<{
  bindingId: string;
  sourceKind: OpportunitySignalSourceKindV1;
  sourceEventKey: string;
  canonicalOpportunityRef: string;
  observedAt: string | Date;
  truthState: "KNOWN" | "PARTIAL" | "CONFLICTED";
  basis: "EXPLICIT_CANONICAL_OPPORTUNITY_BINDING";
  evidenceRefs: readonly string[];
  expectedOrganizationRef?: string | null;
  expectedPersonRef?: string | null;
}>;

export type CrossSourceOpportunityBindingDispositionV1 =
  | "BOUND"
  | "ALREADY_BOUND"
  | "UNBOUND"
  | "VERIFY_REQUIRED";

export type CrossSourceOpportunityBindingRecordV1 = Readonly<{
  captureId: string;
  sourceKind: OpportunitySignalSourceKindV1;
  sourceEventKey: string;
  disposition: CrossSourceOpportunityBindingDispositionV1;
  bindingId: string | null;
  existingOpportunityRef: string | null;
  projectedOpportunityRef: string | null;
  canonicalOrganizationRef: string | null;
  canonicalPersonRef: string | null;
  bindingEvidenceRefs: readonly string[];
  reasonCodes: readonly string[];
  opportunityCertainty: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
}>;

export type CrossSourceOpportunityBindingInputV1 = Readonly<{
  evaluatedAt: string | Date;
  observations: readonly OpportunitySourceObservationV1[];
  bindings: readonly CrossSourceOpportunityBindingEvidenceV1[];
  maximumBindingAgeMinutes: number;
}>;

export type CrossSourceOpportunityBindingResultV1 = Readonly<{
  version: typeof CROSS_SOURCE_OPPORTUNITY_BINDING_VERSION_V1;
  generatedAt: string;
  status: "READY" | "BLOCKED";
  issues: readonly string[];
  records: readonly CrossSourceOpportunityBindingRecordV1[];
  observations: readonly OpportunitySourceObservationV1[];
  bindingPolicy: "EXACT_SOURCE_KIND_AND_SOURCE_EVENT_TO_EXPLICIT_CANONICAL_OPPORTUNITY_REF";
  unboundPolicy: "PRESERVE_SOURCE_EVENT_WITHOUT_GUESSING";
  sourceCountConfidence: "NOT_ESTABLISHED";
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    structuredBindingProjectionAllowed: true;
    crmMutationAuthorized: false;
    relationshipMutationAuthorized: false;
    contactDiscoveryAuthorized: false;
    outreachAuthorized: false;
    spendAuthorized: false;
    contractAuthorized: false;
    persistenceMutationAuthorized: false;
    externalActionAuthorized: false;
    approvalBypassAuthorized: false;
  }>;
}>;

type NormalizedBinding = Readonly<{
  bindingId: string;
  sourceKind: OpportunitySignalSourceKindV1;
  sourceEventKey: string;
  canonicalOpportunityRef: string;
  observedAt: string;
  truthState: "KNOWN" | "PARTIAL" | "CONFLICTED";
  evidenceRefs: readonly string[];
  expectedOrganizationRef: string | null;
  expectedPersonRef: string | null;
  verificationIssues: readonly string[];
}>;

const LIMITATIONS = Object.freeze([
  "This bridge can attach an explicit canonical opportunity ref only to the exact structured source event named by current binding evidence. It never matches by names, organizations, titles, text similarity, model inference, or source count.",
  "A binding proves only that the source event has been explicitly associated with an existing canonical opportunity identity. It does not establish opportunity quality, sponsor interest, commercial intent, decision authority, warm access, timing, budget, likelihood, confidence, monetary value, causality, or expected outcome.",
  "Unbound source events remain unbound. Missing binding evidence is never treated as permission to merge Boardroom, ChatGPT, or email observations that merely look similar.",
  "BOUND and ALREADY_BOUND outputs are structured intake projections only. CRM, relationship graph, persistence, contact discovery, outreach, spend, contracts, and all external actions remain separately governed."
] as const);

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  structuredBindingProjectionAllowed: true as const,
  crmMutationAuthorized: false as const,
  relationshipMutationAuthorized: false as const,
  contactDiscoveryAuthorized: false as const,
  outreachAuthorized: false as const,
  spendAuthorized: false as const,
  contractAuthorized: false as const,
  persistenceMutationAuthorized: false as const,
  externalActionAuthorized: false as const,
  approvalBypassAuthorized: false as const
});

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value as Readonly<T>;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function optionalText(value: unknown, label: string): string | null {
  if (value == null) return null;
  return requiredText(value, label);
}

function timestamp(value: string | Date, label: string): string {
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return parsed.toISOString();
}

function positiveBoundedInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > MAX_BINDING_AGE_MINUTES) {
    throw new Error(`${label} must be an integer between 1 and ${MAX_BINDING_AGE_MINUTES}`);
  }
  return value;
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b)));
}

function textList(value: unknown, label: string, allowEmpty = false): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const result = uniqueSorted(value.map((item, index) => requiredText(item, `${label}[${index}]`)));
  if (!allowEmpty && result.length === 0) throw new Error(`${label} must not be empty`);
  return result;
}

function sourceKey(sourceKind: OpportunitySignalSourceKindV1, sourceEventKey: string): string {
  return `${sourceKind}\u0000${sourceEventKey}`;
}

function cloneObservation(
  observation: OpportunitySourceObservationV1,
  index: number,
  projectedOpportunityRef: string | null,
  bindingEvidenceRefs: readonly string[]
): OpportunitySourceObservationV1 {
  if (!observation || typeof observation !== "object" || Array.isArray(observation)) {
    throw new Error(`observations[${index}] must be an object`);
  }
  if (!SOURCE_KINDS.has(observation.sourceKind)) throw new Error(`observations[${index}].sourceKind is unsupported`);
  if (!TRUTH_STATES.has(observation.truthState)) throw new Error(`observations[${index}].truthState is unsupported`);
  if (!SIGNAL_TYPES.has(observation.signalType)) throw new Error(`observations[${index}].signalType is unsupported`);

  const evidenceRefs = uniqueSorted([
    ...textList(observation.evidenceRefs, `observations[${index}].evidenceRefs`),
    ...bindingEvidenceRefs
  ]);

  const planningWindow = observation.planningWindow
    ? {
        startAt: timestamp(observation.planningWindow.startAt, `observations[${index}].planningWindow.startAt`),
        endAt: timestamp(observation.planningWindow.endAt, `observations[${index}].planningWindow.endAt`),
        rationale: requiredText(observation.planningWindow.rationale, `observations[${index}].planningWindow.rationale`),
        evidenceRefs: textList(observation.planningWindow.evidenceRefs, `observations[${index}].planningWindow.evidenceRefs`)
      }
    : null;

  const decisionMakerClaim = observation.decisionMakerClaim
    ? {
        authorityClass: observation.decisionMakerClaim.authorityClass,
        evidenceRefs: textList(observation.decisionMakerClaim.evidenceRefs, `observations[${index}].decisionMakerClaim.evidenceRefs`)
      }
    : null;

  const sponsorshipRelationshipClaim = observation.sponsorshipRelationshipClaim
    ? {
        state: observation.sponsorshipRelationshipClaim.state,
        evidenceRefs: textList(
          observation.sponsorshipRelationshipClaim.evidenceRefs,
          `observations[${index}].sponsorshipRelationshipClaim.evidenceRefs`
        )
      }
    : null;

  const warmAccessClaim = observation.warmAccessClaim
    ? {
        state: observation.warmAccessClaim.state,
        evidenceRefs: textList(observation.warmAccessClaim.evidenceRefs, `observations[${index}].warmAccessClaim.evidenceRefs`)
      }
    : null;

  return freezeDeep({
    captureId: requiredText(observation.captureId, `observations[${index}].captureId`),
    sourceKind: observation.sourceKind,
    sourceEventKey: requiredText(observation.sourceEventKey, `observations[${index}].sourceEventKey`),
    sourceRef: requiredText(observation.sourceRef, `observations[${index}].sourceRef`),
    observedAt: timestamp(observation.observedAt, `observations[${index}].observedAt`),
    evidenceRefs,
    truthState: observation.truthState,
    signalType: observation.signalType,
    organizationRef: optionalText(observation.organizationRef, `observations[${index}].organizationRef`),
    personRef: optionalText(observation.personRef, `observations[${index}].personRef`),
    opportunityRef: projectedOpportunityRef,
    planningWindow,
    decisionMakerClaim,
    sponsorshipRelationshipClaim,
    warmAccessClaim
  });
}

function normalizeBinding(
  binding: CrossSourceOpportunityBindingEvidenceV1,
  index: number,
  evaluatedAtMs: number,
  maximumBindingAgeMinutes: number
): NormalizedBinding {
  if (!binding || typeof binding !== "object" || Array.isArray(binding)) {
    throw new Error(`bindings[${index}] must be an object`);
  }
  if (!SOURCE_KINDS.has(binding.sourceKind)) throw new Error(`bindings[${index}].sourceKind is unsupported`);
  if (!["KNOWN", "PARTIAL", "CONFLICTED"].includes(binding.truthState)) {
    throw new Error(`bindings[${index}].truthState is unsupported`);
  }
  if (binding.basis !== "EXPLICIT_CANONICAL_OPPORTUNITY_BINDING") {
    throw new Error(`bindings[${index}].basis must be EXPLICIT_CANONICAL_OPPORTUNITY_BINDING`);
  }

  const observedAt = timestamp(binding.observedAt, `bindings[${index}].observedAt`);
  const verificationIssues: string[] = [];
  const evidenceRefs = textList(binding.evidenceRefs, `bindings[${index}].evidenceRefs`);
  const safeEvidenceRefs: string[] = [];
  for (const ref of evidenceRefs) {
    if (ref.length > 512 || UNSAFE_REF.test(ref)) verificationIssues.push("UNSAFE_BINDING_EVIDENCE_REF");
    else safeEvidenceRefs.push(ref);
  }

  const observedAtMs = Date.parse(observedAt);
  if (observedAtMs > evaluatedAtMs) verificationIssues.push("BINDING_OBSERVED_IN_FUTURE");
  else if (evaluatedAtMs - observedAtMs > maximumBindingAgeMinutes * MINUTE_MS) verificationIssues.push("BINDING_EVIDENCE_STALE");
  if (binding.truthState === "PARTIAL") verificationIssues.push("BINDING_TRUTH_PARTIAL");
  if (binding.truthState === "CONFLICTED") verificationIssues.push("BINDING_TRUTH_CONFLICTED");

  return freezeDeep({
    bindingId: requiredText(binding.bindingId, `bindings[${index}].bindingId`),
    sourceKind: binding.sourceKind,
    sourceEventKey: requiredText(binding.sourceEventKey, `bindings[${index}].sourceEventKey`),
    canonicalOpportunityRef: requiredText(binding.canonicalOpportunityRef, `bindings[${index}].canonicalOpportunityRef`),
    observedAt,
    truthState: binding.truthState,
    evidenceRefs: uniqueSorted(safeEvidenceRefs),
    expectedOrganizationRef: optionalText(binding.expectedOrganizationRef, `bindings[${index}].expectedOrganizationRef`),
    expectedPersonRef: optionalText(binding.expectedPersonRef, `bindings[${index}].expectedPersonRef`),
    verificationIssues: uniqueSorted(verificationIssues)
  });
}

function blockedResult(generatedAt: string, issues: readonly string[]): CrossSourceOpportunityBindingResultV1 {
  return freezeDeep({
    version: CROSS_SOURCE_OPPORTUNITY_BINDING_VERSION_V1,
    generatedAt,
    status: "BLOCKED" as const,
    issues: uniqueSorted(issues),
    records: Object.freeze([]),
    observations: Object.freeze([]),
    bindingPolicy: "EXACT_SOURCE_KIND_AND_SOURCE_EVENT_TO_EXPLICIT_CANONICAL_OPPORTUNITY_REF" as const,
    unboundPolicy: "PRESERVE_SOURCE_EVENT_WITHOUT_GUESSING" as const,
    sourceCountConfidence: "NOT_ESTABLISHED" as const,
    limitations: [...LIMITATIONS],
    authority: AUTHORITY
  });
}

export function bindCrossSourceOpportunityObservationsV1(
  input: CrossSourceOpportunityBindingInputV1
): CrossSourceOpportunityBindingResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.observations)) throw new Error("observations must be an array");
  if (!Array.isArray(input.bindings)) throw new Error("bindings must be an array");

  const generatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(generatedAt);
  const maximumBindingAgeMinutes = positiveBoundedInteger(input.maximumBindingAgeMinutes, "maximumBindingAgeMinutes");

  const observationKeys = new Map<string, number>();
  const normalizedBaseObservations: OpportunitySourceObservationV1[] = [];
  const globalIssues: string[] = [];

  for (const [index, observation] of input.observations.entries()) {
    const cloned = cloneObservation(
      observation,
      index,
      optionalText(observation.opportunityRef, `observations[${index}].opportunityRef`),
      []
    );
    if (Date.parse(String(cloned.observedAt)) > evaluatedAtMs) globalIssues.push("SOURCE_OBSERVATION_IN_FUTURE");
    const key = sourceKey(cloned.sourceKind, cloned.sourceEventKey);
    if (observationKeys.has(key)) globalIssues.push("DUPLICATE_SOURCE_EVENT_OBSERVATION");
    else observationKeys.set(key, index);
    normalizedBaseObservations.push(cloned);
  }

  const bindingsBySource = new Map<string, NormalizedBinding>();
  const seenBindingIds = new Set<string>();
  for (const [index, binding] of input.bindings.entries()) {
    const normalized = normalizeBinding(binding, index, evaluatedAtMs, maximumBindingAgeMinutes);
    if (seenBindingIds.has(normalized.bindingId)) globalIssues.push("DUPLICATE_BINDING_ID");
    seenBindingIds.add(normalized.bindingId);
    const key = sourceKey(normalized.sourceKind, normalized.sourceEventKey);
    if (bindingsBySource.has(key)) globalIssues.push("DUPLICATE_BINDING_FOR_SOURCE_EVENT");
    else bindingsBySource.set(key, normalized);
    if (!observationKeys.has(key)) globalIssues.push("ORPHAN_BINDING_WITHOUT_SOURCE_EVENT");
  }

  if (globalIssues.length > 0) return blockedResult(generatedAt, globalIssues);

  const records: CrossSourceOpportunityBindingRecordV1[] = [];
  const projectedObservations: OpportunitySourceObservationV1[] = [];

  for (const [index, observation] of normalizedBaseObservations.entries()) {
    const key = sourceKey(observation.sourceKind, observation.sourceEventKey);
    const binding = bindingsBySource.get(key) ?? null;
    const existingOpportunityRef = optionalText(observation.opportunityRef, `observations[${index}].opportunityRef`);
    const organizationRef = optionalText(observation.organizationRef, `observations[${index}].organizationRef`);
    const personRef = optionalText(observation.personRef, `observations[${index}].personRef`);
    const reasons = new Set<string>();

    if (!binding) {
      const disposition: CrossSourceOpportunityBindingDispositionV1 = existingOpportunityRef ? "ALREADY_BOUND" : "UNBOUND";
      reasons.add(existingOpportunityRef ? "EXISTING_EXACT_OPPORTUNITY_REF_PRESERVED" : "NO_EXPLICIT_BINDING_SUPPLIED");
      projectedObservations.push(cloneObservation(observation, index, existingOpportunityRef, []));
      records.push(freezeDeep({
        captureId: observation.captureId,
        sourceKind: observation.sourceKind,
        sourceEventKey: observation.sourceEventKey,
        disposition,
        bindingId: null,
        existingOpportunityRef,
        projectedOpportunityRef: existingOpportunityRef,
        canonicalOrganizationRef: organizationRef,
        canonicalPersonRef: personRef,
        bindingEvidenceRefs: Object.freeze([]),
        reasonCodes: uniqueSorted([...reasons]),
        opportunityCertainty: "NOT_ESTABLISHED" as const,
        confidence: "NOT_ESTABLISHED" as const,
        monetaryValue: null
      }));
      continue;
    }

    for (const issue of binding.verificationIssues) reasons.add(issue);
    if (binding.expectedOrganizationRef && organizationRef !== binding.expectedOrganizationRef) {
      reasons.add(organizationRef ? "CANONICAL_ORGANIZATION_IDENTITY_CONFLICT" : "EXPECTED_ORGANIZATION_NOT_PRESENT_ON_SOURCE");
    }
    if (binding.expectedPersonRef && personRef !== binding.expectedPersonRef) {
      reasons.add(personRef ? "CANONICAL_PERSON_IDENTITY_CONFLICT" : "EXPECTED_PERSON_NOT_PRESENT_ON_SOURCE");
    }
    if (existingOpportunityRef && existingOpportunityRef !== binding.canonicalOpportunityRef) {
      reasons.add("EXISTING_CANONICAL_OPPORTUNITY_REF_CONFLICT");
    }

    if (reasons.size > 0) {
      projectedObservations.push(cloneObservation(observation, index, existingOpportunityRef, []));
      records.push(freezeDeep({
        captureId: observation.captureId,
        sourceKind: observation.sourceKind,
        sourceEventKey: observation.sourceEventKey,
        disposition: "VERIFY_REQUIRED" as const,
        bindingId: binding.bindingId,
        existingOpportunityRef,
        projectedOpportunityRef: existingOpportunityRef,
        canonicalOrganizationRef: organizationRef,
        canonicalPersonRef: personRef,
        bindingEvidenceRefs: [...binding.evidenceRefs],
        reasonCodes: uniqueSorted([...reasons]),
        opportunityCertainty: "NOT_ESTABLISHED" as const,
        confidence: "NOT_ESTABLISHED" as const,
        monetaryValue: null
      }));
      continue;
    }

    const disposition: CrossSourceOpportunityBindingDispositionV1 = existingOpportunityRef ? "ALREADY_BOUND" : "BOUND";
    reasons.add(existingOpportunityRef ? "EXACT_BINDING_CONFIRMS_EXISTING_OPPORTUNITY_REF" : "EXPLICIT_EXACT_BINDING_APPLIED");
    reasons.add("BINDING_DOES_NOT_UPGRADE_SOURCE_TRUTH_OR_OPPORTUNITY_CERTAINTY");
    projectedObservations.push(
      cloneObservation(observation, index, binding.canonicalOpportunityRef, binding.evidenceRefs)
    );
    records.push(freezeDeep({
      captureId: observation.captureId,
      sourceKind: observation.sourceKind,
      sourceEventKey: observation.sourceEventKey,
      disposition,
      bindingId: binding.bindingId,
      existingOpportunityRef,
      projectedOpportunityRef: binding.canonicalOpportunityRef,
      canonicalOrganizationRef: organizationRef,
      canonicalPersonRef: personRef,
      bindingEvidenceRefs: [...binding.evidenceRefs],
      reasonCodes: uniqueSorted([...reasons]),
      opportunityCertainty: "NOT_ESTABLISHED" as const,
      confidence: "NOT_ESTABLISHED" as const,
      monetaryValue: null
    }));
  }

  records.sort((a, b) =>
    a.sourceKind.localeCompare(b.sourceKind)
      || a.sourceEventKey.localeCompare(b.sourceEventKey)
      || a.captureId.localeCompare(b.captureId)
  );
  projectedObservations.sort((a, b) =>
    a.sourceKind.localeCompare(b.sourceKind)
      || a.sourceEventKey.localeCompare(b.sourceEventKey)
      || a.captureId.localeCompare(b.captureId)
  );

  return freezeDeep({
    version: CROSS_SOURCE_OPPORTUNITY_BINDING_VERSION_V1,
    generatedAt,
    status: "READY" as const,
    issues: Object.freeze([]),
    records,
    observations: projectedObservations,
    bindingPolicy: "EXACT_SOURCE_KIND_AND_SOURCE_EVENT_TO_EXPLICIT_CANONICAL_OPPORTUNITY_REF" as const,
    unboundPolicy: "PRESERVE_SOURCE_EVENT_WITHOUT_GUESSING" as const,
    sourceCountConfidence: "NOT_ESTABLISHED" as const,
    limitations: [...LIMITATIONS],
    authority: AUTHORITY
  });
}
