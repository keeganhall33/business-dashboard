import { createHash } from "node:crypto";

import type {
  SponsorOpportunityAttentionClassV1,
  SponsorOpportunityEarlyWarningAlertV1,
  SponsorOpportunityEarlyWarningResultV1
} from "@/lib/relationship-intelligence/sponsor-opportunity-early-warning-v1";
import type {
  OpportunityQualificationReadinessDecisionV1,
  OpportunityQualificationReadinessDispositionV1,
  OpportunityQualificationReadinessResultV1
} from "@/lib/relationship-intelligence/opportunity-qualification-readiness-v1";

export const SPONSOR_OPPORTUNITY_PORTFOLIO_VERSION_V1 = "SPONSOR_OPPORTUNITY_PORTFOLIO_V1" as const;

const MINUTE_MS = 60_000;
const MAX_AGE_MINUTES = 1_440;
const UNSAFE_REF = /(?:op:\/\/|@|begin\s+(?:rsa\s+)?private\s+key|(?:password|passwd|secret|token|api[_-]?key)\s*[=:])/i;

export type SponsorOpportunityPortfolioStateV1 =
  | "REVIEW_NOW"
  | "PLAN_AHEAD"
  | "ACCESS_BLOCKED"
  | "RECOVER_NEXT_CYCLE"
  | "RESEARCH_REQUIRED"
  | "VERIFY_REQUIRED"
  | "CONTEXT_ONLY"
  | "SUPPRESS";

export type SponsorOpportunityPortfolioNextInternalActionV1 =
  | "REVIEW_PREPARATION_AND_QUALIFICATION_PACKET"
  | "PREPARE_EARLY_ACTIVATION_BRIEF"
  | "RESOLVE_ACCESS_BLOCKER"
  | "RESEARCH_NEXT_CYCLE"
  | "RESEARCH_EVIDENCE_GAPS"
  | "VERIFY_EXACT_BINDING_OR_SOURCE_EVIDENCE"
  | "REVIEW_CONTEXT_ONLY"
  | "NONE";

export type SponsorOpportunityPortfolioBindingV1 = Readonly<{
  bindingId: string;
  sponsorCandidateId: string;
  qualificationCandidateId: string;
  canonicalOpportunityRef: string;
  observedAt: string;
  truthState: "KNOWN" | "PARTIAL" | "CONFLICTED";
  basis: "EXPLICIT_CANONICAL_OPPORTUNITY_BINDING";
  evidenceRefs: readonly string[];
}>;

export type SponsorOpportunityPortfolioEntryV1 = Readonly<{
  portfolioEntryId: string;
  sponsorCandidateId: string;
  qualificationCandidateId: string | null;
  canonicalOpportunityRef: string | null;
  canonicalOrganizationRef: string | null;
  sponsorCanonicalPersonRef: string | null;
  qualificationCanonicalPersonRef: string | null;
  linkedCanonicalPersonRef: string | null;
  state: SponsorOpportunityPortfolioStateV1;
  attentionClass: SponsorOpportunityAttentionClassV1;
  qualificationDisposition: OpportunityQualificationReadinessDispositionV1 | null;
  idealOutreachDateRange: SponsorOpportunityEarlyWarningAlertV1["idealOutreachDateRange"];
  timingRationale: string | null;
  supportedContext: OpportunityQualificationReadinessDecisionV1["supportedContext"];
  nextInternalAction: SponsorOpportunityPortfolioNextInternalActionV1;
  evidenceRefs: readonly string[];
  gaps: readonly string[];
  reasonCodes: readonly string[];
  sponsorInterest: "NOT_ESTABLISHED";
  budgetAvailability: "NOT_ESTABLISHED";
  opportunityCertainty: "NOT_ESTABLISHED";
  dealLikelihood: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
  causalInterpretation: "NOT_ESTABLISHED";
}>;

export type SponsorOpportunityPortfolioInputV1 = Readonly<{
  evaluatedAt: string | Date;
  radar: SponsorOpportunityEarlyWarningResultV1;
  qualification: OpportunityQualificationReadinessResultV1;
  bindings: readonly SponsorOpportunityPortfolioBindingV1[];
  maximumProjectionAgeMinutes: number;
  maximumBindingAgeMinutes: number;
}>;

export type SponsorOpportunityPortfolioResultV1 = Readonly<{
  version: typeof SPONSOR_OPPORTUNITY_PORTFOLIO_VERSION_V1;
  generatedAt: string;
  status: "READY" | "BLOCKED";
  issues: readonly string[];
  entries: readonly SponsorOpportunityPortfolioEntryV1[];
  counts: Readonly<Record<SponsorOpportunityPortfolioStateV1, number>>;
  orderingPolicy: "SAFETY_AND_WORKFLOW_ONLY_NOT_BUSINESS_VALUE";
  matchingPolicy: "EXPLICIT_BINDING_PLUS_EXACT_CANONICAL_IDENTITY_ONLY";
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    internalReviewAllowed: true;
    internalPreparationAllowed: true;
    qualificationMutationAuthorized: false;
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

const LIMITATIONS = Object.freeze([
  "This portfolio joins existing sponsor-radar and opportunity-qualification evidence only through an explicit current canonical-opportunity binding; it never matches by name, text similarity, organization similarity, or model inference.",
  "Workflow ordering reflects safety and review state only. It is not a business-value ranking and does not establish sponsor interest, budget, certainty, confidence, deal likelihood, monetary value, causality, or expected outcome.",
  "A REVIEW_NOW entry authorizes internal review and preparation only. Outreach, contact discovery, CRM or relationship mutation, spend, contracts, publishing, and other external actions remain separately approval-gated.",
  "Unlinked sponsor-radar alerts remain visible as research gaps rather than being attached to a plausible-looking opportunity."
] as const);

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  internalReviewAllowed: true as const,
  internalPreparationAllowed: true as const,
  qualificationMutationAuthorized: false as const,
  crmMutationAuthorized: false as const,
  relationshipMutationAuthorized: false as const,
  contactDiscoveryAuthorized: false as const,
  outreachAuthorized: false as const,
  spendAuthorized: false as const,
  contractAuthorized: false as const,
  externalActionAuthorized: false as const,
  approvalBypassAuthorized: false as const
});

const STATE_ORDER: Readonly<Record<SponsorOpportunityPortfolioStateV1, number>> = Object.freeze({
  VERIFY_REQUIRED: 0,
  REVIEW_NOW: 1,
  PLAN_AHEAD: 2,
  ACCESS_BLOCKED: 3,
  RECOVER_NEXT_CYCLE: 4,
  RESEARCH_REQUIRED: 5,
  CONTEXT_ONLY: 6,
  SUPPRESS: 7
});

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

function timestamp(value: string | Date, label: string): string {
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return parsed.toISOString();
}

function positiveBoundedInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > MAX_AGE_MINUTES) {
    throw new Error(`${label} must be an integer between 1 and ${MAX_AGE_MINUTES}`);
  }
  return value;
}

function safeRefs(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must be a non-empty array`);
  const refs = value.map((raw, index) => {
    const ref = requiredText(raw, `${label}[${index}]`);
    if (ref.length > 512 || /\s/.test(ref) || UNSAFE_REF.test(ref)) throw new Error(`${label}[${index}] is unsafe`);
    return ref;
  });
  return Object.freeze([...new Set(refs)].sort((a, b) => a.localeCompare(b)));
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()))]
    .sort((a, b) => a.localeCompare(b)));
}

function stableId(sponsorCandidateId: string, qualificationCandidateId: string | null): string {
  return `sponsor-portfolio:${createHash("sha256")
    .update(`${sponsorCandidateId}\u0000${qualificationCandidateId ?? "UNLINKED"}`)
    .digest("hex")
    .slice(0, 20)}`;
}

function projectionIssue(
  generatedAt: string,
  label: string,
  evaluatedAtMs: number,
  maximumAgeMinutes: number
): string | null {
  const generatedAtMs = Date.parse(generatedAt);
  if (!Number.isFinite(generatedAtMs)) return `${label}_GENERATED_AT_INVALID`;
  if (generatedAtMs > evaluatedAtMs) return `${label}_GENERATED_IN_FUTURE`;
  if (evaluatedAtMs - generatedAtMs > maximumAgeMinutes * MINUTE_MS) return `${label}_PROJECTION_STALE`;
  return null;
}

function radarAuthoritySafe(radar: SponsorOpportunityEarlyWarningResultV1): boolean {
  const authority = radar.authority;
  return authority.analysisOnly === true
    && authority.internalPreparationAllowed === true
    && authority.crmMutationAuthorized === false
    && authority.contactDiscoveryAuthorized === false
    && authority.outreachAuthorized === false
    && authority.spendAuthorized === false
    && authority.contractAuthorized === false
    && authority.externalActionAuthorized === false;
}

function qualificationAuthoritySafe(qualification: OpportunityQualificationReadinessResultV1): boolean {
  const authority = qualification.authority;
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

function emptyCounts(): Record<SponsorOpportunityPortfolioStateV1, number> {
  return {
    REVIEW_NOW: 0,
    PLAN_AHEAD: 0,
    ACCESS_BLOCKED: 0,
    RECOVER_NEXT_CYCLE: 0,
    RESEARCH_REQUIRED: 0,
    VERIFY_REQUIRED: 0,
    CONTEXT_ONLY: 0,
    SUPPRESS: 0
  };
}

function stateFrom(
  alert: SponsorOpportunityEarlyWarningAlertV1,
  qualification: OpportunityQualificationReadinessDecisionV1,
  identityConflict: boolean
): SponsorOpportunityPortfolioStateV1 {
  if (identityConflict || alert.attentionClass === "VERIFY_BEFORE_ACTION" || qualification.disposition === "VERIFY_REQUIRED") {
    return "VERIFY_REQUIRED";
  }
  if (qualification.disposition === "SUPPRESS") return "SUPPRESS";
  if (qualification.disposition === "RESEARCH_REQUIRED") return "RESEARCH_REQUIRED";
  if (qualification.disposition === "CONTEXT_ONLY") return "CONTEXT_ONLY";

  switch (alert.attentionClass) {
    case "PREPARE_NOW":
      return "REVIEW_NOW";
    case "PLAN_AHEAD":
      return "PLAN_AHEAD";
    case "RESOLVE_ACCESS":
      return "ACCESS_BLOCKED";
    case "RECOVER_NEXT_CYCLE":
      return "RECOVER_NEXT_CYCLE";
    case "RESEARCH_GAPS":
      return "RESEARCH_REQUIRED";
  }
}

function nextInternalAction(state: SponsorOpportunityPortfolioStateV1): SponsorOpportunityPortfolioNextInternalActionV1 {
  switch (state) {
    case "REVIEW_NOW":
      return "REVIEW_PREPARATION_AND_QUALIFICATION_PACKET";
    case "PLAN_AHEAD":
      return "PREPARE_EARLY_ACTIVATION_BRIEF";
    case "ACCESS_BLOCKED":
      return "RESOLVE_ACCESS_BLOCKER";
    case "RECOVER_NEXT_CYCLE":
      return "RESEARCH_NEXT_CYCLE";
    case "RESEARCH_REQUIRED":
      return "RESEARCH_EVIDENCE_GAPS";
    case "VERIFY_REQUIRED":
      return "VERIFY_EXACT_BINDING_OR_SOURCE_EVIDENCE";
    case "CONTEXT_ONLY":
      return "REVIEW_CONTEXT_ONLY";
    case "SUPPRESS":
      return "NONE";
  }
}

function blockedResult(generatedAt: string, issues: readonly string[]): SponsorOpportunityPortfolioResultV1 {
  return freezeDeep({
    version: SPONSOR_OPPORTUNITY_PORTFOLIO_VERSION_V1,
    generatedAt,
    status: "BLOCKED" as const,
    issues: uniqueSorted(issues),
    entries: Object.freeze([]),
    counts: Object.freeze(emptyCounts()),
    orderingPolicy: "SAFETY_AND_WORKFLOW_ONLY_NOT_BUSINESS_VALUE" as const,
    matchingPolicy: "EXPLICIT_BINDING_PLUS_EXACT_CANONICAL_IDENTITY_ONLY" as const,
    limitations: LIMITATIONS,
    authority: AUTHORITY
  });
}

/**
 * Produces a sponsor-opportunity review portfolio from already-governed upstream projections.
 * It does not discover, infer, score, persist, contact, or execute anything. Exact explicit
 * bindings are mandatory before sponsor intelligence may be joined to an opportunity.
 */
export function buildSponsorOpportunityPortfolioV1(
  input: SponsorOpportunityPortfolioInputV1
): SponsorOpportunityPortfolioResultV1 {
  const evaluatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(evaluatedAt);
  const maximumProjectionAgeMinutes = positiveBoundedInteger(input.maximumProjectionAgeMinutes, "maximumProjectionAgeMinutes");
  const maximumBindingAgeMinutes = positiveBoundedInteger(input.maximumBindingAgeMinutes, "maximumBindingAgeMinutes");
  const issues: string[] = [];

  if (input.radar.version !== "SPONSOR_OPPORTUNITY_EARLY_WARNING_V1") issues.push("RADAR_VERSION_INVALID");
  if (input.qualification.version !== "OPPORTUNITY_QUALIFICATION_READINESS_V1") issues.push("QUALIFICATION_VERSION_INVALID");
  if (input.radar.status !== "READY") issues.push("RADAR_NOT_READY");
  if (input.qualification.status !== "READY") issues.push("QUALIFICATION_NOT_READY");
  if (!radarAuthoritySafe(input.radar)) issues.push("RADAR_AUTHORITY_INVARIANT_FAILED");
  if (!qualificationAuthoritySafe(input.qualification)) issues.push("QUALIFICATION_AUTHORITY_INVARIANT_FAILED");

  const radarFreshness = projectionIssue(
    input.radar.generatedAt,
    "RADAR",
    evaluatedAtMs,
    maximumProjectionAgeMinutes
  );
  if (radarFreshness) issues.push(radarFreshness);
  const qualificationFreshness = projectionIssue(
    input.qualification.generatedAt,
    "QUALIFICATION",
    evaluatedAtMs,
    maximumProjectionAgeMinutes
  );
  if (qualificationFreshness) issues.push(qualificationFreshness);

  const alertsById = new Map<string, SponsorOpportunityEarlyWarningAlertV1>();
  for (const alert of input.radar.alerts) {
    const candidateId = requiredText(alert.candidateId, "radar.alert.candidateId");
    if (alertsById.has(candidateId)) issues.push(`DUPLICATE_RADAR_CANDIDATE:${candidateId}`);
    alertsById.set(candidateId, alert);
    try {
      safeRefs(alert.evidenceRefs, `${candidateId}.radarEvidenceRefs`);
    } catch {
      issues.push(`RADAR_EVIDENCE_UNSAFE_OR_MISSING:${candidateId}`);
    }
  }

  const qualificationById = new Map<string, OpportunityQualificationReadinessDecisionV1>();
  for (const decision of input.qualification.decisions) {
    const candidateId = requiredText(decision.candidateId, "qualification.decision.candidateId");
    if (qualificationById.has(candidateId)) issues.push(`DUPLICATE_QUALIFICATION_CANDIDATE:${candidateId}`);
    qualificationById.set(candidateId, decision);
    try {
      safeRefs(decision.evidenceRefs, `${candidateId}.qualificationEvidenceRefs`);
    } catch {
      issues.push(`QUALIFICATION_EVIDENCE_UNSAFE_OR_MISSING:${candidateId}`);
    }
  }

  const bindingBySponsor = new Map<string, SponsorOpportunityPortfolioBindingV1>();
  const bindingIds = new Set<string>();
  for (const binding of input.bindings) {
    const bindingId = requiredText(binding.bindingId, "binding.bindingId");
    const sponsorCandidateId = requiredText(binding.sponsorCandidateId, `${bindingId}.sponsorCandidateId`);
    const qualificationCandidateId = requiredText(binding.qualificationCandidateId, `${bindingId}.qualificationCandidateId`);
    const canonicalOpportunityRef = requiredText(binding.canonicalOpportunityRef, `${bindingId}.canonicalOpportunityRef`);
    if (bindingIds.has(bindingId)) issues.push(`DUPLICATE_BINDING_ID:${bindingId}`);
    bindingIds.add(bindingId);
    if (bindingBySponsor.has(sponsorCandidateId)) issues.push(`CONFLICTING_SPONSOR_BINDING:${sponsorCandidateId}`);
    bindingBySponsor.set(sponsorCandidateId, binding);

    if (binding.truthState !== "KNOWN") issues.push(`BINDING_NOT_KNOWN:${bindingId}`);
    if (binding.basis !== "EXPLICIT_CANONICAL_OPPORTUNITY_BINDING") issues.push(`BINDING_BASIS_INVALID:${bindingId}`);

    const observedAtMs = Date.parse(binding.observedAt);
    if (!Number.isFinite(observedAtMs)) issues.push(`BINDING_OBSERVED_AT_INVALID:${bindingId}`);
    else if (observedAtMs > evaluatedAtMs) issues.push(`BINDING_OBSERVED_IN_FUTURE:${bindingId}`);
    else if (evaluatedAtMs - observedAtMs > maximumBindingAgeMinutes * MINUTE_MS) issues.push(`BINDING_STALE:${bindingId}`);

    try {
      safeRefs(binding.evidenceRefs, `${bindingId}.evidenceRefs`);
    } catch {
      issues.push(`BINDING_EVIDENCE_UNSAFE_OR_MISSING:${bindingId}`);
    }

    if (!alertsById.has(sponsorCandidateId)) issues.push(`BINDING_SPONSOR_TARGET_MISSING:${bindingId}`);
    const qualificationDecision = qualificationById.get(qualificationCandidateId);
    if (!qualificationDecision) {
      issues.push(`BINDING_QUALIFICATION_TARGET_MISSING:${bindingId}`);
    } else if (qualificationDecision.canonicalOpportunityRef !== canonicalOpportunityRef) {
      issues.push(`BINDING_OPPORTUNITY_REF_MISMATCH:${bindingId}`);
    }
  }

  if (issues.length > 0) return blockedResult(evaluatedAt, issues);

  const entries: SponsorOpportunityPortfolioEntryV1[] = [];
  for (const alert of input.radar.alerts) {
    const binding = bindingBySponsor.get(alert.candidateId);
    const radarEvidence = safeRefs(alert.evidenceRefs, `${alert.candidateId}.radarEvidenceRefs`);

    if (!binding) {
      const gaps = uniqueSorted([...alert.gaps, "EXACT_CANONICAL_OPPORTUNITY_BINDING_REQUIRED"]);
      const reasonCodes = uniqueSorted([...alert.reasonCodes, "SPONSOR_ALERT_NOT_EXPLICITLY_BOUND_TO_CANONICAL_OPPORTUNITY"]);
      entries.push({
        portfolioEntryId: stableId(alert.candidateId, null),
        sponsorCandidateId: alert.candidateId,
        qualificationCandidateId: null,
        canonicalOpportunityRef: null,
        canonicalOrganizationRef: alert.canonicalOrganizationRef,
        sponsorCanonicalPersonRef: alert.canonicalPersonRef,
        qualificationCanonicalPersonRef: null,
        linkedCanonicalPersonRef: null,
        state: "RESEARCH_REQUIRED",
        attentionClass: alert.attentionClass,
        qualificationDisposition: null,
        idealOutreachDateRange: alert.idealOutreachDateRange,
        timingRationale: alert.timingRationale,
        supportedContext: Object.freeze([]),
        nextInternalAction: "RESEARCH_EVIDENCE_GAPS",
        evidenceRefs: radarEvidence,
        gaps,
        reasonCodes,
        sponsorInterest: "NOT_ESTABLISHED",
        budgetAvailability: "NOT_ESTABLISHED",
        opportunityCertainty: "NOT_ESTABLISHED",
        dealLikelihood: "NOT_ESTABLISHED",
        confidence: "NOT_ESTABLISHED",
        monetaryValue: null,
        causalInterpretation: "NOT_ESTABLISHED"
      });
      continue;
    }

    const qualification = qualificationById.get(binding.qualificationCandidateId)!;
    const qualificationEvidence = safeRefs(
      qualification.evidenceRefs,
      `${qualification.candidateId}.qualificationEvidenceRefs`
    );
    const bindingEvidence = safeRefs(binding.evidenceRefs, `${binding.bindingId}.evidenceRefs`);
    const reasons = new Set<string>([...alert.reasonCodes, ...qualification.reasonCodes]);
    const gaps = new Set<string>([...alert.gaps, ...qualification.evidenceGaps]);

    let identityConflict = false;
    if (!alert.canonicalOrganizationRef || !qualification.canonicalOrganizationRef) {
      gaps.add("EXACT_CANONICAL_ORGANIZATION_REQUIRED_ON_BOTH_SIDES");
      reasons.add("ORGANIZATION_IDENTITY_INCOMPLETE_ACROSS_SPONSOR_AND_OPPORTUNITY_EVIDENCE");
    } else if (alert.canonicalOrganizationRef !== qualification.canonicalOrganizationRef) {
      identityConflict = true;
      gaps.add("CANONICAL_ORGANIZATION_CONFLICT");
      reasons.add("SPONSOR_AND_QUALIFICATION_ORGANIZATION_REFS_DISAGREE");
    }

    if (alert.canonicalPersonRef && qualification.canonicalPersonRef
      && alert.canonicalPersonRef !== qualification.canonicalPersonRef) {
      identityConflict = true;
      gaps.add("CANONICAL_PERSON_CONFLICT");
      reasons.add("SPONSOR_AND_QUALIFICATION_PERSON_REFS_DISAGREE");
    }

    let state = stateFrom(alert, qualification, identityConflict);
    if (!identityConflict && (!alert.canonicalOrganizationRef || !qualification.canonicalOrganizationRef)) {
      state = "RESEARCH_REQUIRED";
    }
    const linkedCanonicalPersonRef = alert.canonicalPersonRef
      && qualification.canonicalPersonRef
      && alert.canonicalPersonRef === qualification.canonicalPersonRef
      ? alert.canonicalPersonRef
      : null;

    entries.push({
      portfolioEntryId: stableId(alert.candidateId, qualification.candidateId),
      sponsorCandidateId: alert.candidateId,
      qualificationCandidateId: qualification.candidateId,
      canonicalOpportunityRef: qualification.canonicalOpportunityRef,
      canonicalOrganizationRef: alert.canonicalOrganizationRef === qualification.canonicalOrganizationRef
        ? alert.canonicalOrganizationRef
        : null,
      sponsorCanonicalPersonRef: alert.canonicalPersonRef,
      qualificationCanonicalPersonRef: qualification.canonicalPersonRef,
      linkedCanonicalPersonRef,
      state,
      attentionClass: alert.attentionClass,
      qualificationDisposition: qualification.disposition,
      idealOutreachDateRange: alert.idealOutreachDateRange,
      timingRationale: alert.timingRationale,
      supportedContext: Object.freeze([...qualification.supportedContext]),
      nextInternalAction: nextInternalAction(state),
      evidenceRefs: uniqueSorted([...radarEvidence, ...qualificationEvidence, ...bindingEvidence]),
      gaps: uniqueSorted([...gaps]),
      reasonCodes: uniqueSorted([...reasons, "EXPLICIT_CANONICAL_OPPORTUNITY_BINDING_VERIFIED"]),
      sponsorInterest: "NOT_ESTABLISHED",
      budgetAvailability: "NOT_ESTABLISHED",
      opportunityCertainty: "NOT_ESTABLISHED",
      dealLikelihood: "NOT_ESTABLISHED",
      confidence: "NOT_ESTABLISHED",
      monetaryValue: null,
      causalInterpretation: "NOT_ESTABLISHED"
    });
  }

  entries.sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]
    || a.sponsorCandidateId.localeCompare(b.sponsorCandidateId));

  const counts = emptyCounts();
  for (const entry of entries) counts[entry.state] += 1;

  return freezeDeep({
    version: SPONSOR_OPPORTUNITY_PORTFOLIO_VERSION_V1,
    generatedAt: evaluatedAt,
    status: "READY" as const,
    issues: Object.freeze([]),
    entries: Object.freeze(entries),
    counts: Object.freeze(counts),
    orderingPolicy: "SAFETY_AND_WORKFLOW_ONLY_NOT_BUSINESS_VALUE" as const,
    matchingPolicy: "EXPLICIT_BINDING_PLUS_EXACT_CANONICAL_IDENTITY_ONLY" as const,
    limitations: LIMITATIONS,
    authority: AUTHORITY
  });
}
