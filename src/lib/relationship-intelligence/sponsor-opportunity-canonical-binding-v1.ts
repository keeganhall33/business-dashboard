import {
  SPONSOR_OPPORTUNITY_READINESS_VERSION_V1,
  type SponsorOpportunityReadinessDecisionV1,
  type SponsorOpportunityReadinessResultV1,
  type SponsorOpportunityReadinessStatusV1
} from "@/lib/relationship-intelligence/sponsor-opportunity-readiness-v1";

export const SPONSOR_OPPORTUNITY_CANONICAL_BINDING_VERSION_V1 =
  "SPONSOR_OPPORTUNITY_CANONICAL_BINDING_V1" as const;

export type SponsorOpportunityCanonicalBindingTruthStateV1 =
  | "KNOWN"
  | "PARTIAL"
  | "CONFLICTED";

export type SponsorOpportunityCanonicalBindingEvidenceV1 = Readonly<{
  bindingId: string;
  candidateId: string;
  canonicalOpportunityRef: string;
  canonicalOrganizationRef?: string | null;
  canonicalPersonRef?: string | null;
  observedAt: string | Date;
  truthState: SponsorOpportunityCanonicalBindingTruthStateV1;
  basis: "EXPLICIT_CANONICAL_OPPORTUNITY_BINDING";
  evidenceRefs: readonly string[];
}>;

export type SponsorOpportunityCanonicalBindingDispositionV1 =
  | "BOUND"
  | "RESEARCH_REQUIRED"
  | "VERIFY_REQUIRED"
  | "SUPPRESS";

export type SponsorOpportunityCanonicalBindingRecordV1 = Readonly<{
  candidateId: string;
  readinessStatus: SponsorOpportunityReadinessStatusV1;
  disposition: SponsorOpportunityCanonicalBindingDispositionV1;
  bindingId: string | null;
  canonicalOpportunityRef: string | null;
  canonicalOrganizationRef: string | null;
  canonicalPersonRef: string | null;
  evidenceRefs: readonly string[];
  reasonCodes: readonly string[];
  sponsorInterest: "NOT_ESTABLISHED";
  opportunityCertainty: "NOT_ESTABLISHED";
  dealLikelihood: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
}>;

export type SponsorOpportunityCanonicalBindingInputV1 = Readonly<{
  evaluatedAt: string | Date;
  readiness: SponsorOpportunityReadinessResultV1;
  bindings: readonly SponsorOpportunityCanonicalBindingEvidenceV1[];
  maximumProjectionAgeMinutes?: number;
  maximumBindingAgeMinutes?: number;
}>;

export type SponsorOpportunityCanonicalBindingResultV1 = Readonly<{
  version: typeof SPONSOR_OPPORTUNITY_CANONICAL_BINDING_VERSION_V1;
  sourceReadinessVersion: typeof SPONSOR_OPPORTUNITY_READINESS_VERSION_V1;
  generatedAt: string;
  status: "READY" | "BLOCKED";
  issues: readonly string[];
  records: readonly SponsorOpportunityCanonicalBindingRecordV1[];
  bindingPolicy: "EXACT_CANDIDATE_TO_EXPLICIT_CANONICAL_OPPORTUNITY_ONLY";
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    canonicalIdentityProjectionAllowed: true;
    opportunityMutationAuthorized: false;
    crmMutationAuthorized: false;
    relationshipMutationAuthorized: false;
    contactDiscoveryAuthorized: false;
    outreachAuthorized: false;
    spendAuthorized: false;
    contractAuthorized: false;
    externalActionAuthorized: false;
    approvalBypassAuthorized: false;
  }>;
}>;

const MINUTE_MS = 60_000;
const DEFAULT_MAX_PROJECTION_AGE_MINUTES = 60;
const DEFAULT_MAX_BINDING_AGE_MINUTES = 10_080;
const MAX_AGE_MINUTES = 43_200;
const MAX_BINDINGS = 2_000;
const UNSAFE_REF = /(?:op:\/\/|begin\s+(?:rsa\s+)?private\s+key|(?:password|passwd|secret|token|api[_-]?key)\s*[=:]|[?&](?:access_token|token|api_key|key)=)/i;

const READINESS_STATUSES = new Set<SponsorOpportunityReadinessStatusV1>([
  "READY_TO_PREPARE",
  "PLAN_AHEAD",
  "ACCESS_BLOCKED",
  "MISSED_WINDOW",
  "RESEARCH_REQUIRED",
  "VERIFY_REQUIRED",
  "SUPPRESS"
]);

const LIMITATIONS = Object.freeze([
  "This boundary binds an existing sponsor-readiness candidate to an explicit canonical opportunity identity only. Candidate IDs, organization adjacency, person adjacency, sponsor-map proximity, source count, names, titles, and text similarity never create the binding.",
  "A BOUND record establishes identity linkage only. It does not qualify the opportunity, prove sponsorship, sponsor interest, buyer authority, willingness to introduce Keegan, budget, timing, likelihood, confidence, monetary value, or expected outcome.",
  "The upstream readiness status is preserved exactly and is never upgraded by an opportunity binding. Missing, stale, partial, conflicted, mismatched, duplicate, or future-dated binding evidence fails closed.",
  "No record authorizes CRM/opportunity/relationship mutation, contact discovery, outreach, spend, contracts, or any external action."
] as const);

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  canonicalIdentityProjectionAllowed: true as const,
  opportunityMutationAuthorized: false as const,
  crmMutationAuthorized: false as const,
  relationshipMutationAuthorized: false as const,
  contactDiscoveryAuthorized: false as const,
  outreachAuthorized: false as const,
  spendAuthorized: false as const,
  contractAuthorized: false as const,
  externalActionAuthorized: false as const,
  approvalBypassAuthorized: false as const
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

function safeText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  const normalized = value.trim();
  if (UNSAFE_REF.test(normalized)) throw new Error(`${label} must not contain credential material`);
  return normalized;
}

function safeNullableText(value: unknown, label: string): string | null {
  if (value == null) return null;
  return safeText(value, label);
}

function safeRefs(values: readonly string[], label: string): readonly string[] {
  if (!Array.isArray(values) || values.length === 0) throw new Error(`${label} must be a non-empty array`);
  return uniqueSorted(values.map((value, index) => safeText(value, `${label}[${index}]`)));
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.filter((value) => value.length > 0))].sort((a, b) => a.localeCompare(b)));
}

function boundedInteger(value: unknown, fallback: number, label: string): number {
  const candidate = value == null ? fallback : value;
  if (typeof candidate !== "number" || !Number.isInteger(candidate) || candidate < 1 || candidate > MAX_AGE_MINUTES) {
    throw new Error(`${label} must be an integer between 1 and ${MAX_AGE_MINUTES}`);
  }
  return candidate;
}

function projectionIssue(
  generatedAt: string,
  evaluatedAtMs: number,
  maximumProjectionAgeMinutes: number
): string | null {
  const generatedAtMs = Date.parse(generatedAt);
  if (!Number.isFinite(generatedAtMs)) return "READINESS_GENERATED_AT_INVALID";
  if (generatedAtMs > evaluatedAtMs) return "READINESS_GENERATED_IN_FUTURE";
  if (evaluatedAtMs - generatedAtMs > maximumProjectionAgeMinutes * MINUTE_MS) return "READINESS_PROJECTION_STALE";
  return null;
}

function countsMatch(readiness: SponsorOpportunityReadinessResultV1): boolean {
  const decisions = readiness.decisions;
  for (const status of READINESS_STATUSES) {
    if (readiness.counts[status] !== decisions.filter((decision) => decision.status === status).length) return false;
  }
  return true;
}

function readinessIssues(
  readiness: SponsorOpportunityReadinessResultV1,
  evaluatedAtMs: number,
  maximumProjectionAgeMinutes: number
): readonly string[] {
  const issues = new Set<string>();
  if (!readiness || typeof readiness !== "object" || Array.isArray(readiness)) return Object.freeze(["READINESS_REQUIRED"]);
  if (readiness.version !== SPONSOR_OPPORTUNITY_READINESS_VERSION_V1) issues.add("READINESS_VERSION_UNSUPPORTED");
  if (readiness.status !== "READY") issues.add("READINESS_NOT_READY");
  const ageIssue = projectionIssue(readiness.generatedAt, evaluatedAtMs, maximumProjectionAgeMinutes);
  if (ageIssue) issues.add(ageIssue);
  if (!Array.isArray(readiness.decisions)) issues.add("READINESS_DECISIONS_REQUIRED");
  else {
    const ids = new Set<string>();
    for (const [index, decision] of readiness.decisions.entries()) {
      try {
        const candidateId = safeText(decision.candidateId, `readiness.decisions[${index}].candidateId`);
        safeNullableText(decision.canonicalOrganizationRef, `readiness.decisions[${index}].canonicalOrganizationRef`);
        safeNullableText(decision.canonicalPersonRef, `readiness.decisions[${index}].canonicalPersonRef`);
        safeRefs(decision.evidenceRefs, `readiness.decisions[${index}].evidenceRefs`);
        if (!READINESS_STATUSES.has(decision.status)) issues.add("READINESS_STATUS_UNSUPPORTED");
        if (ids.has(candidateId)) issues.add("READINESS_DUPLICATE_CANDIDATE_ID");
        ids.add(candidateId);
      } catch {
        issues.add("READINESS_UNSAFE_OR_INVALID_PROVENANCE");
      }
    }
    if (!countsMatch(readiness)) issues.add("READINESS_COUNT_MISMATCH");
  }

  if (readiness.authority?.analysisOnly !== true) issues.add("READINESS_ANALYSIS_AUTHORITY_REQUIRED");
  if (readiness.authority?.internalPreparationAllowed !== true) issues.add("READINESS_INTERNAL_PREPARATION_CONTRACT_CHANGED");
  if (readiness.authority?.crmMutationAuthorized !== false) issues.add("READINESS_CRM_MUTATION_NOT_ALLOWED");
  if (readiness.authority?.contactDiscoveryAuthorized !== false) issues.add("READINESS_CONTACT_DISCOVERY_NOT_ALLOWED");
  if (readiness.authority?.outreachAuthorized !== false) issues.add("READINESS_OUTREACH_NOT_ALLOWED");
  if (readiness.authority?.externalActionAuthorized !== false) issues.add("READINESS_EXTERNAL_ACTION_NOT_ALLOWED");

  return uniqueSorted([...issues]);
}

type NormalizedBinding = Readonly<{
  bindingId: string;
  candidateId: string;
  canonicalOpportunityRef: string;
  canonicalOrganizationRef: string | null;
  canonicalPersonRef: string | null;
  observedAt: string;
  truthState: SponsorOpportunityCanonicalBindingTruthStateV1;
  evidenceRefs: readonly string[];
  reasonCodes: readonly string[];
}>;

function normalizeBinding(
  binding: SponsorOpportunityCanonicalBindingEvidenceV1,
  index: number,
  evaluatedAtMs: number,
  maximumBindingAgeMinutes: number
): NormalizedBinding {
  if (!binding || typeof binding !== "object" || Array.isArray(binding)) throw new Error(`bindings[${index}] must be an object`);
  if (!["KNOWN", "PARTIAL", "CONFLICTED"].includes(binding.truthState)) throw new Error(`bindings[${index}].truthState is unsupported`);
  if (binding.basis !== "EXPLICIT_CANONICAL_OPPORTUNITY_BINDING") throw new Error(`bindings[${index}].basis is unsupported`);

  const observedAt = timestamp(binding.observedAt, `bindings[${index}].observedAt`);
  const observedAtMs = Date.parse(observedAt);
  const reasons = new Set<string>();
  if (observedAtMs > evaluatedAtMs) reasons.add("BINDING_OBSERVED_IN_FUTURE");
  else if (evaluatedAtMs - observedAtMs > maximumBindingAgeMinutes * MINUTE_MS) reasons.add("BINDING_STALE");
  if (binding.truthState === "PARTIAL") reasons.add("BINDING_TRUTH_PARTIAL");
  if (binding.truthState === "CONFLICTED") reasons.add("BINDING_TRUTH_CONFLICTED");

  return freezeDeep({
    bindingId: safeText(binding.bindingId, `bindings[${index}].bindingId`),
    candidateId: safeText(binding.candidateId, `bindings[${index}].candidateId`),
    canonicalOpportunityRef: safeText(binding.canonicalOpportunityRef, `bindings[${index}].canonicalOpportunityRef`),
    canonicalOrganizationRef: safeNullableText(binding.canonicalOrganizationRef, `bindings[${index}].canonicalOrganizationRef`),
    canonicalPersonRef: safeNullableText(binding.canonicalPersonRef, `bindings[${index}].canonicalPersonRef`),
    observedAt,
    truthState: binding.truthState,
    evidenceRefs: safeRefs(binding.evidenceRefs, `bindings[${index}].evidenceRefs`),
    reasonCodes: uniqueSorted([...reasons])
  });
}

function bindingIndexes(
  bindings: readonly NormalizedBinding[],
  readinessCandidateIds: ReadonlySet<string>
): Readonly<{
  byCandidate: ReadonlyMap<string, readonly NormalizedBinding[]>;
  issues: readonly string[];
}> {
  const byCandidate = new Map<string, NormalizedBinding[]>();
  const bindingIds = new Set<string>();
  const issues = new Set<string>();

  for (const binding of bindings) {
    if (bindingIds.has(binding.bindingId)) issues.add("DUPLICATE_BINDING_ID");
    bindingIds.add(binding.bindingId);
    if (!readinessCandidateIds.has(binding.candidateId)) issues.add("BINDING_REFERENCES_UNKNOWN_CANDIDATE");
    byCandidate.set(binding.candidateId, [...(byCandidate.get(binding.candidateId) ?? []), binding]);
  }

  return freezeDeep({ byCandidate, issues: uniqueSorted([...issues]) });
}

function recordFor(
  decision: SponsorOpportunityReadinessDecisionV1,
  candidateBindings: readonly NormalizedBinding[]
): SponsorOpportunityCanonicalBindingRecordV1 {
  if (decision.status === "SUPPRESS") {
    return freezeDeep({
      candidateId: decision.candidateId,
      readinessStatus: decision.status,
      disposition: "SUPPRESS" as const,
      bindingId: null,
      canonicalOpportunityRef: null,
      canonicalOrganizationRef: decision.canonicalOrganizationRef,
      canonicalPersonRef: decision.canonicalPersonRef,
      evidenceRefs: [...decision.evidenceRefs],
      reasonCodes: uniqueSorted([...decision.reasonCodes, "UPSTREAM_READINESS_SUPPRESSED"]),
      sponsorInterest: "NOT_ESTABLISHED" as const,
      opportunityCertainty: "NOT_ESTABLISHED" as const,
      dealLikelihood: "NOT_ESTABLISHED" as const,
      confidence: "NOT_ESTABLISHED" as const,
      monetaryValue: null
    });
  }

  if (candidateBindings.length === 0) {
    return freezeDeep({
      candidateId: decision.candidateId,
      readinessStatus: decision.status,
      disposition: "RESEARCH_REQUIRED" as const,
      bindingId: null,
      canonicalOpportunityRef: null,
      canonicalOrganizationRef: decision.canonicalOrganizationRef,
      canonicalPersonRef: decision.canonicalPersonRef,
      evidenceRefs: [...decision.evidenceRefs],
      reasonCodes: uniqueSorted([...decision.reasonCodes, "EXACT_CANONICAL_OPPORTUNITY_BINDING_REQUIRED"]),
      sponsorInterest: "NOT_ESTABLISHED" as const,
      opportunityCertainty: "NOT_ESTABLISHED" as const,
      dealLikelihood: "NOT_ESTABLISHED" as const,
      confidence: "NOT_ESTABLISHED" as const,
      monetaryValue: null
    });
  }

  if (candidateBindings.length !== 1) {
    return freezeDeep({
      candidateId: decision.candidateId,
      readinessStatus: decision.status,
      disposition: "VERIFY_REQUIRED" as const,
      bindingId: null,
      canonicalOpportunityRef: null,
      canonicalOrganizationRef: decision.canonicalOrganizationRef,
      canonicalPersonRef: decision.canonicalPersonRef,
      evidenceRefs: uniqueSorted([...decision.evidenceRefs, ...candidateBindings.flatMap((item) => item.evidenceRefs)]),
      reasonCodes: uniqueSorted([...decision.reasonCodes, "MULTIPLE_BINDINGS_FOR_CANDIDATE"]),
      sponsorInterest: "NOT_ESTABLISHED" as const,
      opportunityCertainty: "NOT_ESTABLISHED" as const,
      dealLikelihood: "NOT_ESTABLISHED" as const,
      confidence: "NOT_ESTABLISHED" as const,
      monetaryValue: null
    });
  }

  const binding = candidateBindings[0];
  const reasons = new Set([...decision.reasonCodes, ...binding.reasonCodes]);
  if (binding.canonicalOrganizationRef && binding.canonicalOrganizationRef !== decision.canonicalOrganizationRef) {
    reasons.add("BINDING_ORGANIZATION_MISMATCH");
  }
  if (binding.canonicalPersonRef && binding.canonicalPersonRef !== decision.canonicalPersonRef) {
    reasons.add("BINDING_PERSON_MISMATCH");
  }

  const verificationRequired = [...reasons].some((reason) =>
    reason === "BINDING_OBSERVED_IN_FUTURE"
    || reason === "BINDING_STALE"
    || reason === "BINDING_TRUTH_PARTIAL"
    || reason === "BINDING_TRUTH_CONFLICTED"
    || reason === "BINDING_ORGANIZATION_MISMATCH"
    || reason === "BINDING_PERSON_MISMATCH"
  );

  return freezeDeep({
    candidateId: decision.candidateId,
    readinessStatus: decision.status,
    disposition: verificationRequired ? "VERIFY_REQUIRED" as const : "BOUND" as const,
    bindingId: verificationRequired ? null : binding.bindingId,
    canonicalOpportunityRef: verificationRequired ? null : binding.canonicalOpportunityRef,
    canonicalOrganizationRef: decision.canonicalOrganizationRef,
    canonicalPersonRef: decision.canonicalPersonRef,
    evidenceRefs: uniqueSorted([...decision.evidenceRefs, ...binding.evidenceRefs]),
    reasonCodes: uniqueSorted([...reasons, verificationRequired ? "CANONICAL_OPPORTUNITY_BINDING_REQUIRES_VERIFICATION" : "EXACT_CANONICAL_OPPORTUNITY_BINDING_SUPPORTED"]),
    sponsorInterest: "NOT_ESTABLISHED" as const,
    opportunityCertainty: "NOT_ESTABLISHED" as const,
    dealLikelihood: "NOT_ESTABLISHED" as const,
    confidence: "NOT_ESTABLISHED" as const,
    monetaryValue: null
  });
}

/**
 * Adds an explicit canonical-opportunity identity boundary downstream of sponsor
 * readiness. The readiness candidate and opportunity may be joined only through
 * one current KNOWN binding record; no identity or opportunity fact is inferred
 * from sponsor-map adjacency, organization/person overlap, or source count.
 */
export function bindSponsorOpportunityCanonicalIdentityV1(
  input: SponsorOpportunityCanonicalBindingInputV1
): SponsorOpportunityCanonicalBindingResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.bindings)) throw new Error("bindings must be an array");
  if (input.bindings.length > MAX_BINDINGS) throw new Error(`bindings exceeds ${MAX_BINDINGS}`);

  const generatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(generatedAt);
  const maximumProjectionAgeMinutes = boundedInteger(
    input.maximumProjectionAgeMinutes,
    DEFAULT_MAX_PROJECTION_AGE_MINUTES,
    "maximumProjectionAgeMinutes"
  );
  const maximumBindingAgeMinutes = boundedInteger(
    input.maximumBindingAgeMinutes,
    DEFAULT_MAX_BINDING_AGE_MINUTES,
    "maximumBindingAgeMinutes"
  );

  const sourceIssues = readinessIssues(input.readiness, evaluatedAtMs, maximumProjectionAgeMinutes);
  if (sourceIssues.length > 0) {
    return freezeDeep({
      version: SPONSOR_OPPORTUNITY_CANONICAL_BINDING_VERSION_V1,
      sourceReadinessVersion: SPONSOR_OPPORTUNITY_READINESS_VERSION_V1,
      generatedAt,
      status: "BLOCKED" as const,
      issues: sourceIssues,
      records: [],
      bindingPolicy: "EXACT_CANDIDATE_TO_EXPLICIT_CANONICAL_OPPORTUNITY_ONLY" as const,
      limitations: [...LIMITATIONS],
      authority: AUTHORITY
    });
  }

  const normalizedBindings = input.bindings.map((binding, index) =>
    normalizeBinding(binding, index, evaluatedAtMs, maximumBindingAgeMinutes)
  );
  const readinessCandidateIds = new Set(input.readiness.decisions.map((decision) => decision.candidateId));
  const indexed = bindingIndexes(normalizedBindings, readinessCandidateIds);
  if (indexed.issues.length > 0) {
    return freezeDeep({
      version: SPONSOR_OPPORTUNITY_CANONICAL_BINDING_VERSION_V1,
      sourceReadinessVersion: SPONSOR_OPPORTUNITY_READINESS_VERSION_V1,
      generatedAt,
      status: "BLOCKED" as const,
      issues: indexed.issues,
      records: [],
      bindingPolicy: "EXACT_CANDIDATE_TO_EXPLICIT_CANONICAL_OPPORTUNITY_ONLY" as const,
      limitations: [...LIMITATIONS],
      authority: AUTHORITY
    });
  }

  const records = [...input.readiness.decisions]
    .sort((left, right) => left.candidateId.localeCompare(right.candidateId))
    .map((decision) => recordFor(decision, indexed.byCandidate.get(decision.candidateId) ?? []));

  return freezeDeep({
    version: SPONSOR_OPPORTUNITY_CANONICAL_BINDING_VERSION_V1,
    sourceReadinessVersion: SPONSOR_OPPORTUNITY_READINESS_VERSION_V1,
    generatedAt,
    status: "READY" as const,
    issues: [],
    records,
    bindingPolicy: "EXACT_CANDIDATE_TO_EXPLICIT_CANONICAL_OPPORTUNITY_ONLY" as const,
    limitations: [...LIMITATIONS],
    authority: AUTHORITY
  });
}
