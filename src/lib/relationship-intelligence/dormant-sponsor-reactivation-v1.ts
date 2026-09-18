import {
  DORMANT_EMAIL_OPPORTUNITY_PROJECTOR_VERSION,
  type DormantEmailOpportunityProjectorResultV1,
  type DormantOpportunityCandidateV1,
  type DormantTruthStateV1
} from "@/lib/relationship-intelligence/dormant-email-opportunity-projector-v1";
import {
  DORMANT_OPPORTUNITY_HANDOFF_VERSION,
  type DormantOpportunityHandoffDecisionV1,
  type DormantOpportunityHandoffResultV1
} from "@/lib/relationship-intelligence/dormant-opportunity-handoff-v1";
import {
  SPONSOR_OPPORTUNITY_READINESS_VERSION_V1,
  type SponsorOpportunityReadinessDecisionV1,
  type SponsorOpportunityReadinessResultV1
} from "@/lib/relationship-intelligence/sponsor-opportunity-readiness-v1";

export const DORMANT_SPONSOR_REACTIVATION_VERSION_V1 = "DORMANT_SPONSOR_REACTIVATION_V1" as const;

export type DormantSponsorLinkBasisV1 =
  | "SAME_CANONICAL_ORGANIZATION"
  | "SAME_CANONICAL_PERSON"
  | "EVIDENCED_OPPORTUNITY_TO_SPONSOR";

export type DormantSponsorReactivationDispositionV1 =
  | "READY_FOR_INTERNAL_REACTIVATION_PREP"
  | "PLAN_AHEAD"
  | "ACCESS_BLOCKED"
  | "MISSED_WINDOW"
  | "RESEARCH_REQUIRED"
  | "VERIFY_REQUIRED"
  | "SUPPRESS"
  | "NOT_APPLICABLE";

export type DormantSponsorReactivationNextActionV1 =
  | "PREPARE_REACTIVATION_BRIEF_FOR_KEEGAN_REVIEW"
  | "PREPARE_EARLY_REACTIVATION_BRIEF"
  | "RESOLVE_CURRENT_ACCESS_BLOCKER"
  | "RESEARCH_NEXT_SUPPORTED_PLANNING_CYCLE"
  | "RESEARCH_DORMANT_TO_CURRENT_SPONSOR_LINK"
  | "VERIFY_DORMANT_TO_CURRENT_SPONSOR_LINK"
  | "NONE";

export type DormantSponsorMappingV1 = Readonly<{
  dormantCandidateId: string;
  sponsorCandidateId: string;
  linkBasis: DormantSponsorLinkBasisV1;
  truthState: DormantTruthStateV1;
  evidenceRefs: readonly string[];
}>;

export type DormantSponsorReactivationDecisionV1 = Readonly<{
  dormantCandidateId: string;
  sponsorCandidateId: string | null;
  disposition: DormantSponsorReactivationDispositionV1;
  businessSignal: DormantOpportunityCandidateV1["businessSignal"];
  dormantHandoffDisposition: DormantOpportunityHandoffDecisionV1["disposition"];
  sponsorReadinessStatus: SponsorOpportunityReadinessDecisionV1["status"] | null;
  canonicalPersonRef: string | null;
  canonicalOrganizationRef: string | null;
  canonicalOpportunityRef: string | null;
  lastMeaningfulTouchAt: string;
  ageDays: number;
  idealOutreachDateRange: SponsorOpportunityReadinessDecisionV1["idealOutreachDateRange"] | null;
  timingRationale: string | null;
  currentSponsorInterest: "NOT_ESTABLISHED";
  nextInternalAction: DormantSponsorReactivationNextActionV1;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  gaps: readonly string[];
  reasonCodes: readonly string[];
}>;

export type DormantSponsorReactivationInputV1 = Readonly<{
  evaluatedAt: string | Date;
  dormantProjection: DormantEmailOpportunityProjectorResultV1;
  dormantHandoff: DormantOpportunityHandoffResultV1;
  sponsorReadiness: SponsorOpportunityReadinessResultV1;
  mappings: readonly DormantSponsorMappingV1[];
  maximumProjectionAgeMinutes?: number;
}>;

export type DormantSponsorReactivationResultV1 = Readonly<{
  version: typeof DORMANT_SPONSOR_REACTIVATION_VERSION_V1;
  generatedAt: string;
  status: "READY" | "BLOCKED";
  issues: readonly string[];
  decisions: readonly DormantSponsorReactivationDecisionV1[];
  counts: Readonly<Record<DormantSponsorReactivationDispositionV1, number>>;
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    internalPreparationAllowed: true;
    canonicalOpportunityMutationAuthorized: false;
    relationshipMutationAuthorized: false;
    contactDiscoveryAuthorized: false;
    outreachAuthorized: false;
    externalActionAuthorized: false;
  }>;
}>;

const DEFAULT_MAX_PROJECTION_AGE_MINUTES = 180;
const MAX_PROJECTION_AGE_MINUTES = 1_440;
const MINUTE_MS = 60_000;
const MAX_MAPPINGS = 250;
const LINK_BASES = new Set<DormantSponsorLinkBasisV1>([
  "SAME_CANONICAL_ORGANIZATION",
  "SAME_CANONICAL_PERSON",
  "EVIDENCED_OPPORTUNITY_TO_SPONSOR"
]);
const TRUTH_STATES = new Set<DormantTruthStateV1>(["KNOWN", "PARTIAL", "UNKNOWN", "STALE", "CONFLICTED"]);

const LIMITATIONS = Object.freeze([
  "Historical sponsorship discussion is evidence of prior context, not proof that sponsor interest, budget, willingness, or relationship intent remains current.",
  "Current sponsor readiness is reused only through explicit evidence-backed mapping; matching names or organizations are never used to merge separate opportunities speculatively.",
  "READY_FOR_INTERNAL_REACTIVATION_PREP authorizes internal preparation only. It does not send outreach, discover contact details, mutate CRM truth, or establish a current commitment."
] as const);

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  internalPreparationAllowed: true as const,
  canonicalOpportunityMutationAuthorized: false as const,
  relationshipMutationAuthorized: false as const,
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

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function timestamp(value: string | Date, label: string): string {
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

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0))].sort((a, b) => a.localeCompare(b)));
}

function nonEmptyRefs(values: readonly string[], label: string): readonly string[] {
  if (!Array.isArray(values) || values.length === 0) throw new Error(`${label} must be a non-empty array`);
  return uniqueSorted(values.map((value, index) => requiredText(value, `${label}[${index}]`)));
}

function projectedAtIssue(
  generatedAt: string,
  label: string,
  evaluatedAtMs: number,
  maximumProjectionAgeMinutes: number
): string | null {
  const projectedAtMs = Date.parse(generatedAt);
  if (!Number.isFinite(projectedAtMs)) return `${label}_GENERATED_AT_INVALID`;
  if (projectedAtMs > evaluatedAtMs) return `${label}_GENERATED_IN_FUTURE`;
  if (evaluatedAtMs - projectedAtMs > maximumProjectionAgeMinutes * MINUTE_MS) return `${label}_PROJECTION_STALE`;
  return null;
}

function uniqueIndex<T>(values: readonly T[], key: (value: T) => string, label: string): ReadonlyMap<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    const id = key(value);
    if (result.has(id)) throw new Error(`${label} contains duplicate identity ${id}`);
    result.set(id, value);
  }
  return result;
}

function mappingIndex(mappings: readonly DormantSponsorMappingV1[], knownDormantIds: ReadonlySet<string>): ReadonlyMap<string, DormantSponsorMappingV1> {
  if (!Array.isArray(mappings)) throw new Error("mappings must be an array");
  if (mappings.length > MAX_MAPPINGS) throw new Error(`mappings exceeds ${MAX_MAPPINGS}`);
  const result = new Map<string, DormantSponsorMappingV1>();
  for (const [index, mapping] of mappings.entries()) {
    if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) throw new Error(`mappings[${index}] must be an object`);
    const dormantCandidateId = requiredText(mapping.dormantCandidateId, `mappings[${index}].dormantCandidateId`);
    const sponsorCandidateId = requiredText(mapping.sponsorCandidateId, `mappings[${index}].sponsorCandidateId`);
    if (!knownDormantIds.has(dormantCandidateId)) throw new Error(`mapping references unknown dormant candidate ${dormantCandidateId}`);
    if (result.has(dormantCandidateId)) throw new Error(`duplicate mapping for dormant candidate ${dormantCandidateId}`);
    if (!LINK_BASES.has(mapping.linkBasis)) throw new Error(`mappings[${index}].linkBasis is unsupported`);
    if (!TRUTH_STATES.has(mapping.truthState)) throw new Error(`mappings[${index}].truthState is unsupported`);
    result.set(dormantCandidateId, freezeDeep({
      dormantCandidateId,
      sponsorCandidateId,
      linkBasis: mapping.linkBasis,
      truthState: mapping.truthState,
      evidenceRefs: [...nonEmptyRefs(mapping.evidenceRefs, `mappings[${index}].evidenceRefs`)]
    }));
  }
  return result;
}

function emptyCounts(): Record<DormantSponsorReactivationDispositionV1, number> {
  return {
    READY_FOR_INTERNAL_REACTIVATION_PREP: 0,
    PLAN_AHEAD: 0,
    ACCESS_BLOCKED: 0,
    MISSED_WINDOW: 0,
    RESEARCH_REQUIRED: 0,
    VERIFY_REQUIRED: 0,
    SUPPRESS: 0,
    NOT_APPLICABLE: 0
  };
}

function nextInternalAction(disposition: DormantSponsorReactivationDispositionV1): DormantSponsorReactivationNextActionV1 {
  switch (disposition) {
    case "READY_FOR_INTERNAL_REACTIVATION_PREP":
      return "PREPARE_REACTIVATION_BRIEF_FOR_KEEGAN_REVIEW";
    case "PLAN_AHEAD":
      return "PREPARE_EARLY_REACTIVATION_BRIEF";
    case "ACCESS_BLOCKED":
      return "RESOLVE_CURRENT_ACCESS_BLOCKER";
    case "MISSED_WINDOW":
      return "RESEARCH_NEXT_SUPPORTED_PLANNING_CYCLE";
    case "RESEARCH_REQUIRED":
      return "RESEARCH_DORMANT_TO_CURRENT_SPONSOR_LINK";
    case "VERIFY_REQUIRED":
      return "VERIFY_DORMANT_TO_CURRENT_SPONSOR_LINK";
    case "SUPPRESS":
    case "NOT_APPLICABLE":
      return "NONE";
  }
}

function sponsorDisposition(status: SponsorOpportunityReadinessDecisionV1["status"]): DormantSponsorReactivationDispositionV1 {
  switch (status) {
    case "READY_TO_PREPARE":
      return "READY_FOR_INTERNAL_REACTIVATION_PREP";
    case "PLAN_AHEAD":
      return "PLAN_AHEAD";
    case "ACCESS_BLOCKED":
      return "ACCESS_BLOCKED";
    case "MISSED_WINDOW":
      return "MISSED_WINDOW";
    case "RESEARCH_REQUIRED":
      return "RESEARCH_REQUIRED";
    case "VERIFY_REQUIRED":
      return "VERIFY_REQUIRED";
    case "SUPPRESS":
      return "SUPPRESS";
  }
}

function mappingTruthDisposition(state: DormantTruthStateV1): DormantSponsorReactivationDispositionV1 | null {
  if (state === "KNOWN") return null;
  if (state === "CONFLICTED" || state === "STALE") return "VERIFY_REQUIRED";
  return "RESEARCH_REQUIRED";
}

function validateLinkBasis(
  mapping: DormantSponsorMappingV1,
  dormant: DormantOpportunityHandoffDecisionV1,
  sponsor: SponsorOpportunityReadinessDecisionV1,
  gaps: Set<string>,
  reasons: Set<string>
): DormantSponsorReactivationDispositionV1 | null {
  if (dormant.canonicalOrganizationRef && sponsor.canonicalOrganizationRef && dormant.canonicalOrganizationRef !== sponsor.canonicalOrganizationRef) {
    gaps.add("CANONICAL_ORGANIZATION_MISMATCH");
    reasons.add("DORMANT_AND_CURRENT_SPONSOR_ORGANIZATIONS_DISAGREE");
    return "VERIFY_REQUIRED";
  }
  if (dormant.canonicalPersonRef && sponsor.canonicalPersonRef && dormant.canonicalPersonRef !== sponsor.canonicalPersonRef) {
    gaps.add("CANONICAL_PERSON_MISMATCH");
    reasons.add("DORMANT_AND_CURRENT_SPONSOR_PEOPLE_DISAGREE");
    return "VERIFY_REQUIRED";
  }

  if (mapping.linkBasis === "SAME_CANONICAL_ORGANIZATION") {
    if (!dormant.canonicalOrganizationRef || !sponsor.canonicalOrganizationRef) {
      gaps.add("CANONICAL_ORGANIZATION_REQUIRED_FOR_LINK_BASIS");
      reasons.add("ORGANIZATION_LINK_BASIS_LACKS_CANONICAL_ORGANIZATION");
      return "VERIFY_REQUIRED";
    }
    if (dormant.canonicalOrganizationRef !== sponsor.canonicalOrganizationRef) {
      gaps.add("CANONICAL_ORGANIZATION_MISMATCH");
      reasons.add("ORGANIZATION_LINK_BASIS_DOES_NOT_MATCH");
      return "VERIFY_REQUIRED";
    }
    reasons.add("EXPLICIT_MAPPING_CONFIRMED_BY_SAME_CANONICAL_ORGANIZATION");
    return null;
  }

  if (mapping.linkBasis === "SAME_CANONICAL_PERSON") {
    if (!dormant.canonicalPersonRef || !sponsor.canonicalPersonRef) {
      gaps.add("CANONICAL_PERSON_REQUIRED_FOR_LINK_BASIS");
      reasons.add("PERSON_LINK_BASIS_LACKS_CANONICAL_PERSON");
      return "VERIFY_REQUIRED";
    }
    if (dormant.canonicalPersonRef !== sponsor.canonicalPersonRef) {
      gaps.add("CANONICAL_PERSON_MISMATCH");
      reasons.add("PERSON_LINK_BASIS_DOES_NOT_MATCH");
      return "VERIFY_REQUIRED";
    }
    reasons.add("EXPLICIT_MAPPING_CONFIRMED_BY_SAME_CANONICAL_PERSON");
    return null;
  }

  if (!dormant.canonicalOpportunityRef) {
    gaps.add("CANONICAL_OPPORTUNITY_REQUIRED_FOR_OPPORTUNITY_SPONSOR_LINK");
    reasons.add("OPPORTUNITY_TO_SPONSOR_LINK_LACKS_CANONICAL_OPPORTUNITY");
    return "VERIFY_REQUIRED";
  }
  if (!sponsor.canonicalOrganizationRef) {
    gaps.add("CURRENT_SPONSOR_CANONICAL_ORGANIZATION_REQUIRED");
    reasons.add("OPPORTUNITY_TO_SPONSOR_LINK_LACKS_CURRENT_SPONSOR_ORGANIZATION");
    return "VERIFY_REQUIRED";
  }
  reasons.add("EXPLICIT_EVIDENCED_OPPORTUNITY_TO_SPONSOR_MAPPING_USED");
  return null;
}

function baseDecision(
  candidate: DormantOpportunityCandidateV1,
  handoff: DormantOpportunityHandoffDecisionV1,
  disposition: DormantSponsorReactivationDispositionV1,
  sponsor: SponsorOpportunityReadinessDecisionV1 | null,
  mapping: DormantSponsorMappingV1 | null,
  gaps: readonly string[],
  reasonCodes: readonly string[]
): DormantSponsorReactivationDecisionV1 {
  return freezeDeep({
    dormantCandidateId: candidate.candidateId,
    sponsorCandidateId: mapping?.sponsorCandidateId ?? null,
    disposition,
    businessSignal: candidate.businessSignal,
    dormantHandoffDisposition: handoff.disposition,
    sponsorReadinessStatus: sponsor?.status ?? null,
    canonicalPersonRef: handoff.canonicalPersonRef,
    canonicalOrganizationRef: handoff.canonicalOrganizationRef,
    canonicalOpportunityRef: handoff.canonicalOpportunityRef,
    lastMeaningfulTouchAt: handoff.lastMeaningfulTouchAt,
    ageDays: handoff.ageDays,
    idealOutreachDateRange: sponsor?.idealOutreachDateRange ? { ...sponsor.idealOutreachDateRange } : null,
    timingRationale: sponsor?.timingRationale ?? null,
    currentSponsorInterest: "NOT_ESTABLISHED" as const,
    nextInternalAction: nextInternalAction(disposition),
    evidenceRefs: [...uniqueSorted([
      ...candidate.evidenceRefs,
      ...handoff.evidenceRefs,
      ...(mapping?.evidenceRefs ?? []),
      ...(sponsor?.evidenceRefs ?? [])
    ])],
    sourceRefs: [...uniqueSorted(handoff.sourceRefs)],
    gaps: [...uniqueSorted(gaps)],
    reasonCodes: [...uniqueSorted(reasonCodes)]
  });
}

function compileDecision(
  candidate: DormantOpportunityCandidateV1,
  handoff: DormantOpportunityHandoffDecisionV1,
  mapping: DormantSponsorMappingV1 | null,
  sponsorsById: ReadonlyMap<string, SponsorOpportunityReadinessDecisionV1>
): DormantSponsorReactivationDecisionV1 {
  const gaps = new Set<string>();
  const reasons = new Set<string>();

  if (candidate.conversationKey !== handoff.conversationKey
    || candidate.personRef !== handoff.canonicalPersonRef
    || candidate.organizationRef !== handoff.canonicalOrganizationRef
    || candidate.opportunityRef !== handoff.canonicalOpportunityRef
    || candidate.lastMeaningfulTouchAt !== handoff.lastMeaningfulTouchAt
    || candidate.ageDays !== handoff.ageDays) {
    gaps.add("DORMANT_PROJECTION_HANDOFF_IDENTITY_MISMATCH");
    reasons.add("DORMANT_HANDOFF_DOES_NOT_MATCH_SOURCE_PROJECTION");
    return baseDecision(candidate, handoff, "VERIFY_REQUIRED", null, mapping, [...gaps], [...reasons]);
  }

  if (candidate.businessSignal !== "SPONSORSHIP") {
    reasons.add("DORMANT_SIGNAL_IS_NOT_SPONSORSHIP");
    return baseDecision(candidate, handoff, "NOT_APPLICABLE", null, null, [], [...reasons]);
  }

  if (handoff.disposition === "SUPPRESS") {
    reasons.add("DORMANT_HANDOFF_IS_SUPPRESSED");
    return baseDecision(candidate, handoff, "SUPPRESS", null, mapping, [], [...reasons]);
  }
  if (handoff.disposition === "NEEDS_VERIFICATION" || handoff.disposition === "RELATIONSHIP_REVIEW_ONLY") {
    gaps.add("DORMANT_OPPORTUNITY_NOT_CANONICALLY_READY");
    reasons.add(`DORMANT_HANDOFF_${handoff.disposition}`);
    return baseDecision(candidate, handoff, "VERIFY_REQUIRED", null, mapping, [...gaps], [...reasons]);
  }

  if (!mapping) {
    gaps.add("EXPLICIT_DORMANT_TO_SPONSOR_MAPPING_REQUIRED");
    reasons.add("NO_SPECULATIVE_JOIN_FROM_ORGANIZATION_OR_NAME_MATCH");
    return baseDecision(candidate, handoff, "RESEARCH_REQUIRED", null, null, [...gaps], [...reasons]);
  }

  for (const ref of mapping.evidenceRefs) reasons.add(`MAPPING_EVIDENCE:${ref}`);
  const truthDisposition = mappingTruthDisposition(mapping.truthState);
  if (truthDisposition) {
    gaps.add(`MAPPING_${mapping.truthState}`);
    reasons.add("DORMANT_TO_CURRENT_SPONSOR_MAPPING_IS_NOT_KNOWN");
    return baseDecision(candidate, handoff, truthDisposition, null, mapping, [...gaps], [...reasons]);
  }

  const sponsor = sponsorsById.get(mapping.sponsorCandidateId) ?? null;
  if (!sponsor) {
    gaps.add("CURRENT_SPONSOR_READINESS_REQUIRED");
    reasons.add("MAPPED_SPONSOR_CANDIDATE_HAS_NO_CURRENT_READINESS_DECISION");
    return baseDecision(candidate, handoff, "RESEARCH_REQUIRED", null, mapping, [...gaps], [...reasons]);
  }

  const linkDisposition = validateLinkBasis(mapping, handoff, sponsor, gaps, reasons);
  if (linkDisposition) return baseDecision(candidate, handoff, linkDisposition, sponsor, mapping, [...gaps], [...reasons]);

  for (const gap of sponsor.gaps) gaps.add(`SPONSOR_READINESS:${gap}`);
  for (const reason of sponsor.reasonCodes) reasons.add(`SPONSOR_READINESS:${reason}`);
  reasons.add("HISTORICAL_SPONSORSHIP_AND_CURRENT_READINESS_ARE_EXPLICITLY_LINKED");
  reasons.add("CURRENT_SPONSOR_INTEREST_REMAINS_NOT_ESTABLISHED");

  return baseDecision(candidate, handoff, sponsorDisposition(sponsor.status), sponsor, mapping, [...gaps], [...reasons]);
}

/**
 * Connects historical IONOS-derived dormant sponsorship candidates to current
 * sponsor access/role/timing readiness only through an explicit evidence-backed
 * mapping. This is an internal reactivation-preparation gate, never proof that
 * old interest remains current and never authority to write CRM or contact a
 * sponsor.
 */
export function buildDormantSponsorReactivationV1(
  input: DormantSponsorReactivationInputV1
): DormantSponsorReactivationResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (input.dormantProjection.version !== DORMANT_EMAIL_OPPORTUNITY_PROJECTOR_VERSION) throw new Error("dormantProjection.version is unsupported");
  if (input.dormantHandoff.version !== DORMANT_OPPORTUNITY_HANDOFF_VERSION) throw new Error("dormantHandoff.version is unsupported");
  if (input.sponsorReadiness.version !== SPONSOR_OPPORTUNITY_READINESS_VERSION_V1) throw new Error("sponsorReadiness.version is unsupported");

  const generatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(generatedAt);
  const maximumProjectionAgeMinutes = boundedInteger(
    input.maximumProjectionAgeMinutes,
    DEFAULT_MAX_PROJECTION_AGE_MINUTES,
    1,
    MAX_PROJECTION_AGE_MINUTES,
    "maximumProjectionAgeMinutes"
  );

  const dormantCandidates = uniqueIndex(input.dormantProjection.queue, (candidate) => requiredText(candidate.candidateId, "candidate.candidateId"), "dormantProjection.queue");
  const dormantHandoffs = uniqueIndex(input.dormantHandoff.decisions, (decision) => requiredText(decision.candidateId, "handoff.candidateId"), "dormantHandoff.decisions");
  const sponsorDecisions = uniqueIndex(input.sponsorReadiness.decisions, (decision) => requiredText(decision.candidateId, "sponsor.candidateId"), "sponsorReadiness.decisions");
  const mappings = mappingIndex(input.mappings, new Set(dormantCandidates.keys()));

  const issues = new Set<string>();
  if (input.dormantProjection.generatedAt !== input.dormantHandoff.generatedAt) issues.add("DORMANT_PROJECTION_HANDOFF_GENERATION_MISMATCH");
  if (dormantCandidates.size !== dormantHandoffs.size
    || [...dormantCandidates.keys()].some((candidateId) => !dormantHandoffs.has(candidateId))) {
    issues.add("DORMANT_PROJECTION_HANDOFF_CANDIDATE_SET_MISMATCH");
  }

  const dormantFreshnessIssue = projectedAtIssue(input.dormantProjection.generatedAt, "DORMANT_PROJECTION", evaluatedAtMs, maximumProjectionAgeMinutes);
  if (dormantFreshnessIssue) issues.add(dormantFreshnessIssue);
  const sponsorFreshnessIssue = projectedAtIssue(input.sponsorReadiness.generatedAt, "SPONSOR_READINESS", evaluatedAtMs, maximumProjectionAgeMinutes);
  if (sponsorFreshnessIssue) issues.add(sponsorFreshnessIssue);
  if (input.sponsorReadiness.status === "BLOCKED") {
    issues.add("SPONSOR_READINESS_BLOCKED");
    for (const issue of input.sponsorReadiness.issues) issues.add(`SPONSOR_READINESS:${issue}`);
  }

  if (issues.size > 0) {
    return freezeDeep({
      version: DORMANT_SPONSOR_REACTIVATION_VERSION_V1,
      generatedAt,
      status: "BLOCKED" as const,
      issues: [...uniqueSorted([...issues])],
      decisions: [],
      counts: emptyCounts(),
      limitations: [...LIMITATIONS],
      authority: AUTHORITY
    });
  }

  const decisions = input.dormantProjection.queue.map((candidate) => {
    const handoff = dormantHandoffs.get(candidate.candidateId);
    if (!handoff) throw new Error(`missing dormant handoff for ${candidate.candidateId}`);
    return compileDecision(candidate, handoff, mappings.get(candidate.candidateId) ?? null, sponsorDecisions);
  });
  const counts = emptyCounts();
  for (const decision of decisions) counts[decision.disposition] += 1;

  return freezeDeep({
    version: DORMANT_SPONSOR_REACTIVATION_VERSION_V1,
    generatedAt,
    status: "READY" as const,
    issues: [],
    decisions,
    counts,
    limitations: [...LIMITATIONS],
    authority: AUTHORITY
  });
}
