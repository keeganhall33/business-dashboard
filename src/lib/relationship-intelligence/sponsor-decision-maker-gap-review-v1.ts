import {
  SPONSOR_OPPORTUNITY_PORTFOLIO_VERSION_V1,
  type SponsorOpportunityPortfolioEntryV1,
  type SponsorOpportunityPortfolioResultV1,
  type SponsorOpportunityPortfolioStateV1
} from "@/lib/relationship-intelligence/sponsor-opportunity-portfolio-v1";
import {
  OPPORTUNITY_QUALIFICATION_READINESS_VERSION_V1,
  type OpportunityQualificationReadinessDecisionV1,
  type OpportunityQualificationReadinessResultV1
} from "@/lib/relationship-intelligence/opportunity-qualification-readiness-v1";

export const SPONSOR_DECISION_MAKER_GAP_REVIEW_VERSION_V1 =
  "SPONSOR_DECISION_MAKER_GAP_REVIEW_V1" as const;

export type SponsorDecisionMakerGapDispositionV1 =
  | "READY_FOR_INTERNAL_DECISION_MAKER_REVIEW"
  | "RESEARCH_REQUIRED"
  | "VERIFY_REQUIRED"
  | "NOT_APPLICABLE"
  | "SUPPRESS";

export type SponsorDecisionMakerGapActionV1 =
  | "REVIEW_EVIDENCED_DECISION_MAKER_CONTEXT"
  | "RESEARCH_CURRENT_DECISION_MAKER_EVIDENCE"
  | "RESOLVE_SPONSOR_PERSON_BINDING"
  | "VERIFY_CANONICAL_PERSON_IDENTITY"
  | "VERIFY_SOURCE_EVIDENCE"
  | "NONE";

export type SponsorDecisionMakerGapDecisionV1 = Readonly<{
  portfolioEntryId: string;
  sponsorCandidateId: string;
  qualificationCandidateId: string | null;
  canonicalOpportunityRef: string | null;
  canonicalOrganizationRef: string | null;
  canonicalPersonRef: string | null;
  portfolioState: SponsorOpportunityPortfolioStateV1;
  disposition: SponsorDecisionMakerGapDispositionV1;
  nextInternalAction: SponsorDecisionMakerGapActionV1;
  decisionMakerAuthorityEvidence: "SUPPORTED_CONTEXT_PRESENT" | "NOT_ESTABLISHED";
  sponsorPersonBinding: "EXACT_MATCH" | "MISSING" | "CONFLICTED" | "NOT_APPLICABLE";
  evidenceRefs: readonly string[];
  reasonCodes: readonly string[];
  sponsorInterest: "NOT_ESTABLISHED";
  budgetAuthority: "NOT_ESTABLISHED";
  willingnessToEngage: "NOT_ESTABLISHED";
  contactCoordinates: null;
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
}>;

export type SponsorDecisionMakerGapReviewInputV1 = Readonly<{
  evaluatedAt: string | Date;
  portfolio: SponsorOpportunityPortfolioResultV1;
  qualification: OpportunityQualificationReadinessResultV1;
  maximumProjectionAgeMinutes: number;
}>;

export type SponsorDecisionMakerGapReviewResultV1 = Readonly<{
  version: typeof SPONSOR_DECISION_MAKER_GAP_REVIEW_VERSION_V1;
  generatedAt: string;
  status: "READY" | "BLOCKED";
  issues: readonly string[];
  decisions: readonly SponsorDecisionMakerGapDecisionV1[];
  counts: Readonly<Record<SponsorDecisionMakerGapDispositionV1, number>>;
  matchingPolicy: "EXACT_QUALIFICATION_CANDIDATE_AND_CANONICAL_IDENTITY_ONLY";
  orderingPolicy: "SAFETY_AND_WORKFLOW_ONLY_NOT_BUSINESS_VALUE";
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    internalReviewAllowed: true;
    internalResearchPreparationAllowed: true;
    decisionMakerFactPromotionAuthorized: false;
    relationshipMutationAuthorized: false;
    crmMutationAuthorized: false;
    contactDiscoveryAuthorized: false;
    outreachAuthorized: false;
    spendAuthorized: false;
    contractAuthorized: false;
    externalActionAuthorized: false;
  }>;
}>;

const MINUTE_MS = 60_000;
const MAX_AGE_MINUTES = 10_080;
const UNSAFE_REF = /(?:op:\/\/|mailto:|tel:|@|begin\s+(?:rsa\s+)?private\s+key|(?:password|passwd|secret|token|api[_-]?key)\s*[=:])/i;

const LIMITATIONS = Object.freeze([
  "This review checks whether a sponsor-opportunity portfolio entry has exact current decision-maker evidence suitable for internal review. It does not establish that a person controls budget, wants to engage, or will approve an activation.",
  "Decision-maker authority is treated only as supported context when the existing qualification projection explicitly carries DECISION_MAKER_AUTHORITY and an exact canonical person reference. Titles, names, employer proximity, source count, or sponsor adjacency never substitute for that evidence.",
  "A person mismatch between sponsor and qualification evidence requires verification. A missing sponsor-side person binding remains research work even when qualification evidence names an exact person.",
  "No output authorizes fact promotion, contact discovery, CRM or relationship mutation, outreach, spend, contracts, publishing, or any external action."
] as const);

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  internalReviewAllowed: true as const,
  internalResearchPreparationAllowed: true as const,
  decisionMakerFactPromotionAuthorized: false as const,
  relationshipMutationAuthorized: false as const,
  crmMutationAuthorized: false as const,
  contactDiscoveryAuthorized: false as const,
  outreachAuthorized: false as const,
  spendAuthorized: false as const,
  contractAuthorized: false as const,
  externalActionAuthorized: false as const
});

const DISPOSITION_ORDER: Readonly<Record<SponsorDecisionMakerGapDispositionV1, number>> = Object.freeze({
  VERIFY_REQUIRED: 0,
  RESEARCH_REQUIRED: 1,
  READY_FOR_INTERNAL_DECISION_MAKER_REVIEW: 2,
  NOT_APPLICABLE: 3,
  SUPPRESS: 4
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
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > MAX_AGE_MINUTES) {
    throw new Error(`maximumProjectionAgeMinutes must be an integer between 1 and ${MAX_AGE_MINUTES}`);
  }
  return value;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function safeNullableRef(value: unknown, label: string): string | null {
  if (value == null) return null;
  const ref = requiredText(value, label);
  if (ref.length > 512 || /\s/.test(ref) || UNSAFE_REF.test(ref)) throw new Error(`${label} is unsafe`);
  return ref;
}

function safeRefs(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must be a non-empty array`);
  return Object.freeze([...new Set(value.map((item, index) => {
    const ref = requiredText(item, `${label}[${index}]`);
    if (ref.length > 512 || /\s/.test(ref) || UNSAFE_REF.test(ref)) throw new Error(`${label}[${index}] is unsafe`);
    return ref;
  }))].sort((a, b) => a.localeCompare(b)));
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b)));
}

function emptyCounts(): Record<SponsorDecisionMakerGapDispositionV1, number> {
  return {
    READY_FOR_INTERNAL_DECISION_MAKER_REVIEW: 0,
    RESEARCH_REQUIRED: 0,
    VERIFY_REQUIRED: 0,
    NOT_APPLICABLE: 0,
    SUPPRESS: 0
  };
}

function projectionAgeIssue(
  generatedAt: string,
  label: string,
  evaluatedAtMs: number,
  maximumProjectionAgeMinutes: number
): string | null {
  const generatedAtMs = Date.parse(generatedAt);
  if (!Number.isFinite(generatedAtMs)) return `${label}_GENERATED_AT_INVALID`;
  if (generatedAtMs > evaluatedAtMs) return `${label}_GENERATED_IN_FUTURE`;
  if (evaluatedAtMs - generatedAtMs > maximumProjectionAgeMinutes * MINUTE_MS) return `${label}_PROJECTION_STALE`;
  return null;
}

function portfolioAuthoritySafe(source: SponsorOpportunityPortfolioResultV1): boolean {
  const authority = source.authority;
  return authority.analysisOnly === true
    && authority.internalReviewAllowed === true
    && authority.internalPreparationAllowed === true
    && authority.qualificationMutationAuthorized === false
    && authority.crmMutationAuthorized === false
    && authority.relationshipMutationAuthorized === false
    && authority.contactDiscoveryAuthorized === false
    && authority.outreachAuthorized === false
    && authority.spendAuthorized === false
    && authority.contractAuthorized === false
    && authority.externalActionAuthorized === false
    && authority.approvalBypassAuthorized === false;
}

function qualificationAuthoritySafe(source: OpportunityQualificationReadinessResultV1): boolean {
  const authority = source.authority;
  return authority.analysisOnly === true
    && authority.internalQualificationReviewAllowed === true
    && authority.qualificationMutationAuthorized === false
    && authority.crmMutationAuthorized === false
    && authority.relationshipMutationAuthorized === false
    && authority.contactDiscoveryAuthorized === false
    && authority.outreachAuthorized === false
    && authority.spendAuthorized === false
    && authority.contractAuthorized === false
    && authority.externalActionAuthorized === false;
}

function portfolioCountsMatch(source: SponsorOpportunityPortfolioResultV1): boolean {
  return Object.keys(emptyCounts()).length > 0
    && source.entries.every((entry) => typeof source.counts[entry.state] === "number")
    && Object.entries(source.counts).every(([state, count]) =>
      count === source.entries.filter((entry) => entry.state === state).length
    );
}

function qualificationCountsMatch(source: OpportunityQualificationReadinessResultV1): boolean {
  return Object.entries(source.counts).every(([disposition, count]) =>
    count === source.decisions.filter((decision) => decision.disposition === disposition).length
  );
}

function blocked(generatedAt: string, issues: readonly string[]): SponsorDecisionMakerGapReviewResultV1 {
  return freezeDeep({
    version: SPONSOR_DECISION_MAKER_GAP_REVIEW_VERSION_V1,
    generatedAt,
    status: "BLOCKED" as const,
    issues: uniqueSorted(issues),
    decisions: Object.freeze([]),
    counts: Object.freeze(emptyCounts()),
    matchingPolicy: "EXACT_QUALIFICATION_CANDIDATE_AND_CANONICAL_IDENTITY_ONLY" as const,
    orderingPolicy: "SAFETY_AND_WORKFLOW_ONLY_NOT_BUSINESS_VALUE" as const,
    limitations: LIMITATIONS,
    authority: AUTHORITY
  });
}

function evaluateEntry(
  entry: SponsorOpportunityPortfolioEntryV1,
  qualification: OpportunityQualificationReadinessDecisionV1 | null
): SponsorDecisionMakerGapDecisionV1 {
  const evidenceRefs = uniqueSorted([
    ...safeRefs(entry.evidenceRefs, `${entry.portfolioEntryId}.portfolioEvidenceRefs`),
    ...(qualification ? safeRefs(qualification.evidenceRefs, `${entry.portfolioEntryId}.qualificationEvidenceRefs`) : [])
  ]);

  const common = {
    portfolioEntryId: entry.portfolioEntryId,
    sponsorCandidateId: entry.sponsorCandidateId,
    qualificationCandidateId: entry.qualificationCandidateId,
    canonicalOpportunityRef: entry.canonicalOpportunityRef,
    canonicalOrganizationRef: entry.canonicalOrganizationRef,
    canonicalPersonRef: qualification?.canonicalPersonRef ?? null,
    portfolioState: entry.state,
    evidenceRefs,
    sponsorInterest: "NOT_ESTABLISHED" as const,
    budgetAuthority: "NOT_ESTABLISHED" as const,
    willingnessToEngage: "NOT_ESTABLISHED" as const,
    contactCoordinates: null,
    confidence: "NOT_ESTABLISHED" as const,
    monetaryValue: null
  };

  if (entry.state === "SUPPRESS") {
    return freezeDeep({
      ...common,
      disposition: "SUPPRESS" as const,
      nextInternalAction: "NONE" as const,
      decisionMakerAuthorityEvidence: "NOT_ESTABLISHED" as const,
      sponsorPersonBinding: "NOT_APPLICABLE" as const,
      reasonCodes: Object.freeze(["UPSTREAM_PORTFOLIO_SUPPRESSED"])
    });
  }

  if (entry.state === "CONTEXT_ONLY") {
    return freezeDeep({
      ...common,
      disposition: "NOT_APPLICABLE" as const,
      nextInternalAction: "NONE" as const,
      decisionMakerAuthorityEvidence: "NOT_ESTABLISHED" as const,
      sponsorPersonBinding: "NOT_APPLICABLE" as const,
      reasonCodes: Object.freeze(["CONTEXT_ONLY_ENTRY_NOT_PROMOTED_TO_DECISION_MAKER_WORK"])
    });
  }

  if (entry.state === "VERIFY_REQUIRED") {
    return freezeDeep({
      ...common,
      disposition: "VERIFY_REQUIRED" as const,
      nextInternalAction: "VERIFY_SOURCE_EVIDENCE" as const,
      decisionMakerAuthorityEvidence: "NOT_ESTABLISHED" as const,
      sponsorPersonBinding: "NOT_APPLICABLE" as const,
      reasonCodes: Object.freeze(["UPSTREAM_PORTFOLIO_VERIFICATION_REQUIRED"])
    });
  }

  if (!qualification) {
    return freezeDeep({
      ...common,
      disposition: "RESEARCH_REQUIRED" as const,
      nextInternalAction: "RESEARCH_CURRENT_DECISION_MAKER_EVIDENCE" as const,
      decisionMakerAuthorityEvidence: "NOT_ESTABLISHED" as const,
      sponsorPersonBinding: "MISSING" as const,
      reasonCodes: Object.freeze(["EXACT_QUALIFICATION_BINDING_REQUIRED"])
    });
  }

  const hasAuthorityContext = qualification.supportedContext.includes("DECISION_MAKER_AUTHORITY");
  if (!hasAuthorityContext || !qualification.canonicalPersonRef) {
    return freezeDeep({
      ...common,
      disposition: "RESEARCH_REQUIRED" as const,
      nextInternalAction: "RESEARCH_CURRENT_DECISION_MAKER_EVIDENCE" as const,
      decisionMakerAuthorityEvidence: "NOT_ESTABLISHED" as const,
      sponsorPersonBinding: entry.sponsorCanonicalPersonRef ? "NOT_APPLICABLE" as const : "MISSING" as const,
      reasonCodes: Object.freeze(uniqueSorted([
        ...(!hasAuthorityContext ? ["DECISION_MAKER_AUTHORITY_EVIDENCE_NOT_ESTABLISHED"] : []),
        ...(!qualification.canonicalPersonRef ? ["EXACT_CANONICAL_DECISION_MAKER_PERSON_REQUIRED"] : [])
      ]))
    });
  }

  if (entry.sponsorCanonicalPersonRef && entry.sponsorCanonicalPersonRef !== qualification.canonicalPersonRef) {
    return freezeDeep({
      ...common,
      disposition: "VERIFY_REQUIRED" as const,
      nextInternalAction: "VERIFY_CANONICAL_PERSON_IDENTITY" as const,
      decisionMakerAuthorityEvidence: "SUPPORTED_CONTEXT_PRESENT" as const,
      sponsorPersonBinding: "CONFLICTED" as const,
      reasonCodes: Object.freeze(["SPONSOR_AND_QUALIFICATION_PERSON_REFS_DISAGREE"])
    });
  }

  if (!entry.sponsorCanonicalPersonRef || entry.linkedCanonicalPersonRef !== qualification.canonicalPersonRef) {
    return freezeDeep({
      ...common,
      disposition: "RESEARCH_REQUIRED" as const,
      nextInternalAction: "RESOLVE_SPONSOR_PERSON_BINDING" as const,
      decisionMakerAuthorityEvidence: "SUPPORTED_CONTEXT_PRESENT" as const,
      sponsorPersonBinding: "MISSING" as const,
      reasonCodes: Object.freeze(["DECISION_MAKER_CONTEXT_EVIDENCED_BUT_SPONSOR_PERSON_BINDING_MISSING"])
    });
  }

  return freezeDeep({
    ...common,
    disposition: "READY_FOR_INTERNAL_DECISION_MAKER_REVIEW" as const,
    nextInternalAction: "REVIEW_EVIDENCED_DECISION_MAKER_CONTEXT" as const,
    decisionMakerAuthorityEvidence: "SUPPORTED_CONTEXT_PRESENT" as const,
    sponsorPersonBinding: "EXACT_MATCH" as const,
    reasonCodes: Object.freeze(["EXACT_PERSON_BINDING_AND_DECISION_MAKER_CONTEXT_PRESENT"])
  });
}

/**
 * Reconciles sponsor-portfolio identity with opportunity qualification evidence to expose
 * decision-maker gaps without inventing a buyer, authority, contact route, sponsor intent,
 * or outreach permission.
 */
export function buildSponsorDecisionMakerGapReviewV1(
  input: SponsorDecisionMakerGapReviewInputV1
): SponsorDecisionMakerGapReviewResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  const generatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(generatedAt);
  const maximumProjectionAgeMinutes = boundedAge(input.maximumProjectionAgeMinutes);
  const issues: string[] = [];

  if (!input.portfolio || typeof input.portfolio !== "object" || Array.isArray(input.portfolio)) {
    return blocked(generatedAt, ["PORTFOLIO_REQUIRED"]);
  }
  if (!input.qualification || typeof input.qualification !== "object" || Array.isArray(input.qualification)) {
    return blocked(generatedAt, ["QUALIFICATION_REQUIRED"]);
  }

  if (input.portfolio.version !== SPONSOR_OPPORTUNITY_PORTFOLIO_VERSION_V1) issues.push("PORTFOLIO_VERSION_UNSUPPORTED");
  if (input.qualification.version !== OPPORTUNITY_QUALIFICATION_READINESS_VERSION_V1) issues.push("QUALIFICATION_VERSION_UNSUPPORTED");
  if (input.portfolio.status !== "READY") issues.push("PORTFOLIO_NOT_READY");
  if (input.qualification.status !== "READY") issues.push("QUALIFICATION_NOT_READY");
  if (input.portfolio.issues.length > 0) issues.push("PORTFOLIO_HAS_ISSUES");
  if (input.qualification.issues.length > 0) issues.push("QUALIFICATION_HAS_ISSUES");
  if (input.portfolio.matchingPolicy !== "EXPLICIT_BINDING_PLUS_EXACT_CANONICAL_IDENTITY_ONLY") issues.push("PORTFOLIO_MATCHING_POLICY_NOT_EXACT");
  if (!portfolioAuthoritySafe(input.portfolio)) issues.push("PORTFOLIO_AUTHORITY_INVARIANT_FAILED");
  if (!qualificationAuthoritySafe(input.qualification)) issues.push("QUALIFICATION_AUTHORITY_INVARIANT_FAILED");
  if (!portfolioCountsMatch(input.portfolio)) issues.push("PORTFOLIO_COUNT_MISMATCH");
  if (!qualificationCountsMatch(input.qualification)) issues.push("QUALIFICATION_COUNT_MISMATCH");

  const portfolioAge = projectionAgeIssue(input.portfolio.generatedAt, "PORTFOLIO", evaluatedAtMs, maximumProjectionAgeMinutes);
  if (portfolioAge) issues.push(portfolioAge);
  const qualificationAge = projectionAgeIssue(input.qualification.generatedAt, "QUALIFICATION", evaluatedAtMs, maximumProjectionAgeMinutes);
  if (qualificationAge) issues.push(qualificationAge);

  const qualificationById = new Map<string, OpportunityQualificationReadinessDecisionV1>();
  for (const [index, decision] of input.qualification.decisions.entries()) {
    const candidateId = requiredText(decision.candidateId, `qualification.decisions[${index}].candidateId`);
    if (qualificationById.has(candidateId)) issues.push(`DUPLICATE_QUALIFICATION_CANDIDATE:${candidateId}`);
    qualificationById.set(candidateId, decision);
    try {
      safeNullableRef(decision.canonicalPersonRef, `${candidateId}.canonicalPersonRef`);
      safeNullableRef(decision.canonicalOrganizationRef, `${candidateId}.canonicalOrganizationRef`);
      safeNullableRef(decision.canonicalOpportunityRef, `${candidateId}.canonicalOpportunityRef`);
      safeRefs(decision.evidenceRefs, `${candidateId}.evidenceRefs`);
    } catch {
      issues.push(`QUALIFICATION_PROVENANCE_UNSAFE:${candidateId}`);
    }
  }

  const portfolioIds = new Set<string>();
  const sponsorCandidateIds = new Set<string>();
  for (const [index, entry] of input.portfolio.entries.entries()) {
    const entryId = requiredText(entry.portfolioEntryId, `portfolio.entries[${index}].portfolioEntryId`);
    const sponsorCandidateId = requiredText(entry.sponsorCandidateId, `${entryId}.sponsorCandidateId`);
    if (portfolioIds.has(entryId)) issues.push(`DUPLICATE_PORTFOLIO_ENTRY:${entryId}`);
    if (sponsorCandidateIds.has(sponsorCandidateId)) issues.push(`DUPLICATE_SPONSOR_CANDIDATE:${sponsorCandidateId}`);
    portfolioIds.add(entryId);
    sponsorCandidateIds.add(sponsorCandidateId);
    try {
      safeNullableRef(entry.canonicalOpportunityRef, `${entryId}.canonicalOpportunityRef`);
      safeNullableRef(entry.canonicalOrganizationRef, `${entryId}.canonicalOrganizationRef`);
      safeNullableRef(entry.sponsorCanonicalPersonRef, `${entryId}.sponsorCanonicalPersonRef`);
      safeNullableRef(entry.qualificationCanonicalPersonRef, `${entryId}.qualificationCanonicalPersonRef`);
      safeNullableRef(entry.linkedCanonicalPersonRef, `${entryId}.linkedCanonicalPersonRef`);
      safeRefs(entry.evidenceRefs, `${entryId}.evidenceRefs`);
    } catch {
      issues.push(`PORTFOLIO_PROVENANCE_UNSAFE:${entryId}`);
    }

    if (entry.qualificationCandidateId) {
      const qualification = qualificationById.get(entry.qualificationCandidateId);
      if (!qualification) {
        issues.push(`QUALIFICATION_CANDIDATE_NOT_FOUND:${entryId}`);
      } else {
        if (entry.canonicalOpportunityRef !== qualification.canonicalOpportunityRef) {
          issues.push(`CANONICAL_OPPORTUNITY_MISMATCH:${entryId}`);
        }
        if (entry.qualificationCanonicalPersonRef !== qualification.canonicalPersonRef) {
          issues.push(`QUALIFICATION_PERSON_PROJECTION_MISMATCH:${entryId}`);
        }
      }
    }
  }

  if (issues.length > 0) return blocked(generatedAt, issues);

  const decisions = input.portfolio.entries.map((entry) => evaluateEntry(
    entry,
    entry.qualificationCandidateId ? qualificationById.get(entry.qualificationCandidateId) ?? null : null
  ));

  decisions.sort((a, b) => DISPOSITION_ORDER[a.disposition] - DISPOSITION_ORDER[b.disposition]
    || a.portfolioEntryId.localeCompare(b.portfolioEntryId));

  const counts = emptyCounts();
  for (const decision of decisions) counts[decision.disposition] += 1;

  return freezeDeep({
    version: SPONSOR_DECISION_MAKER_GAP_REVIEW_VERSION_V1,
    generatedAt,
    status: "READY" as const,
    issues: Object.freeze([]),
    decisions: Object.freeze(decisions),
    counts: Object.freeze(counts),
    matchingPolicy: "EXACT_QUALIFICATION_CANDIDATE_AND_CANONICAL_IDENTITY_ONLY" as const,
    orderingPolicy: "SAFETY_AND_WORKFLOW_ONLY_NOT_BUSINESS_VALUE" as const,
    limitations: LIMITATIONS,
    authority: AUTHORITY
  });
}
