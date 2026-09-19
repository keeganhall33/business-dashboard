import {
  SPONSOR_DECISION_MAKER_GAP_REVIEW_VERSION_V1,
  type SponsorDecisionMakerGapDecisionV1,
  type SponsorDecisionMakerGapReviewResultV1
} from "@/lib/relationship-intelligence/sponsor-decision-maker-gap-review-v1";

export const SPONSOR_DECISION_MAKER_RESEARCH_PLAN_VERSION_V1 =
  "SPONSOR_DECISION_MAKER_RESEARCH_PLAN_V1" as const;

export type SponsorDecisionMakerResearchWorkTypeV1 =
  | "RESEARCH_CURRENT_DECISION_MAKER"
  | "RESOLVE_SPONSOR_PERSON_BINDING"
  | "VERIFY_CANONICAL_PERSON_IDENTITY"
  | "VERIFY_SOURCE_EVIDENCE";

export type SponsorDecisionMakerResearchEvidenceNeedV1 =
  | "CURRENT_DECISION_MAKER_EVIDENCE"
  | "EXACT_SPONSOR_PERSON_BINDING"
  | "CANONICAL_PERSON_IDENTITY"
  | "SOURCE_EVIDENCE_INTEGRITY";

export type SponsorDecisionMakerResearchSourceClassV1 =
  | "OFFICIAL_ORGANIZATION_SOURCE"
  | "PUBLIC_PRIMARY_SOURCE"
  | "AUTHORIZED_FIRST_PARTY"
  | "CANONICAL_RELATIONSHIP_GRAPH";

export type SponsorDecisionMakerResearchTaskV1 = Readonly<{
  taskId: string;
  upstreamOrdinal: number;
  portfolioEntryId: string;
  sponsorCandidateId: string;
  qualificationCandidateId: string | null;
  canonicalOpportunityRef: string | null;
  canonicalOrganizationRef: string | null;
  canonicalPersonRef: string | null;
  workType: SponsorDecisionMakerResearchWorkTypeV1;
  evidenceNeed: SponsorDecisionMakerResearchEvidenceNeedV1;
  allowedSourceClasses: readonly SponsorDecisionMakerResearchSourceClassV1[];
  evidenceRefs: readonly string[];
  reasonCodes: readonly string[];
  factCreationAuthorized: false;
  privateContactDiscoveryAuthorized: false;
  relationshipInferenceAuthorized: false;
  sponsorshipInferenceAuthorized: false;
  decisionAuthorityInferenceAuthorized: false;
  opportunityQualificationAuthorized: false;
  crmMutationAuthorized: false;
  relationshipMutationAuthorized: false;
  outreachAuthorized: false;
}>;

export type SponsorDecisionMakerResearchPlanInputV1 = Readonly<{
  gapReview: SponsorDecisionMakerGapReviewResultV1;
  evaluatedAt: string | Date;
  maximumProjectionAgeMinutes: number;
  maximumTasks?: number;
}>;

export type SponsorDecisionMakerResearchPlanResultV1 = Readonly<{
  version: typeof SPONSOR_DECISION_MAKER_RESEARCH_PLAN_VERSION_V1;
  generatedAt: string;
  status: "READY" | "NO_RESEARCH_NEEDED" | "BLOCKED";
  issues: readonly string[];
  tasks: readonly SponsorDecisionMakerResearchTaskV1[];
  omittedTaskCount: number;
  orderingPolicy: "PRESERVE_UPSTREAM_SAFETY_AND_WORKFLOW_ORDER";
  returnPolicy: "OBSERVED_EVIDENCE_MUST_REENTER_CANONICAL_REVIEW";
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    internalResearchPreparationAllowed: true;
    externalResearchExecutionAuthorized: false;
    factCreationAuthorized: false;
    privateContactDiscoveryAuthorized: false;
    relationshipInferenceAuthorized: false;
    sponsorshipInferenceAuthorized: false;
    decisionAuthorityInferenceAuthorized: false;
    opportunityQualificationAuthorized: false;
    crmMutationAuthorized: false;
    relationshipMutationAuthorized: false;
    outreachAuthorized: false;
    spendAuthorized: false;
    contractAuthorized: false;
    externalActionAuthorized: false;
  }>;
}>;

const MINUTE_MS = 60_000;
const MAX_PROJECTION_AGE_MINUTES = 10_080;
const MAX_TASKS = 500;
const UNSAFE_REF = /(?:op:\/\/|mailto:|tel:|@|begin\s+(?:rsa\s+)?private\s+key|(?:password|passwd|secret|token|api[_-]?key)\s*[=:])/i;

const LIMITATIONS = Object.freeze([
  "This plan converts already-governed sponsor decision-maker gaps into bounded evidence-acquisition work. It does not perform research or establish a buyer.",
  "A current title, employer match, public proximity, source count, or sponsor adjacency does not establish budget authority, willingness to engage, or a warm relationship.",
  "Public-source work is limited to observed professional facts. Private contact discovery, inferred relationships, inferred sponsorships, inferred decision authority, and inferred opportunity qualification remain prohibited.",
  "Research output must return through canonical evidence, identity, relationship, and opportunity review before any fact or state can change.",
  "No task authorizes CRM or graph mutation, outreach, spend, contracts, publishing, or any external action."
] as const);

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  internalResearchPreparationAllowed: true as const,
  externalResearchExecutionAuthorized: false as const,
  factCreationAuthorized: false as const,
  privateContactDiscoveryAuthorized: false as const,
  relationshipInferenceAuthorized: false as const,
  sponsorshipInferenceAuthorized: false as const,
  decisionAuthorityInferenceAuthorized: false as const,
  opportunityQualificationAuthorized: false as const,
  crmMutationAuthorized: false as const,
  relationshipMutationAuthorized: false as const,
  outreachAuthorized: false as const,
  spendAuthorized: false as const,
  contractAuthorized: false as const,
  externalActionAuthorized: false as const
});

const TASK_AUTHORITY = Object.freeze({
  factCreationAuthorized: false as const,
  privateContactDiscoveryAuthorized: false as const,
  relationshipInferenceAuthorized: false as const,
  sponsorshipInferenceAuthorized: false as const,
  decisionAuthorityInferenceAuthorized: false as const,
  opportunityQualificationAuthorized: false as const,
  crmMutationAuthorized: false as const,
  relationshipMutationAuthorized: false as const,
  outreachAuthorized: false as const
});

const WORK_MAP = Object.freeze({
  RESEARCH_CURRENT_DECISION_MAKER_EVIDENCE: Object.freeze({
    workType: "RESEARCH_CURRENT_DECISION_MAKER" as const,
    evidenceNeed: "CURRENT_DECISION_MAKER_EVIDENCE" as const,
    allowedSourceClasses: Object.freeze([
      "OFFICIAL_ORGANIZATION_SOURCE",
      "PUBLIC_PRIMARY_SOURCE",
      "AUTHORIZED_FIRST_PARTY"
    ] as const)
  }),
  RESOLVE_SPONSOR_PERSON_BINDING: Object.freeze({
    workType: "RESOLVE_SPONSOR_PERSON_BINDING" as const,
    evidenceNeed: "EXACT_SPONSOR_PERSON_BINDING" as const,
    allowedSourceClasses: Object.freeze([
      "CANONICAL_RELATIONSHIP_GRAPH",
      "AUTHORIZED_FIRST_PARTY",
      "OFFICIAL_ORGANIZATION_SOURCE"
    ] as const)
  }),
  VERIFY_CANONICAL_PERSON_IDENTITY: Object.freeze({
    workType: "VERIFY_CANONICAL_PERSON_IDENTITY" as const,
    evidenceNeed: "CANONICAL_PERSON_IDENTITY" as const,
    allowedSourceClasses: Object.freeze([
      "CANONICAL_RELATIONSHIP_GRAPH",
      "AUTHORIZED_FIRST_PARTY",
      "OFFICIAL_ORGANIZATION_SOURCE",
      "PUBLIC_PRIMARY_SOURCE"
    ] as const)
  }),
  VERIFY_SOURCE_EVIDENCE: Object.freeze({
    workType: "VERIFY_SOURCE_EVIDENCE" as const,
    evidenceNeed: "SOURCE_EVIDENCE_INTEGRITY" as const,
    allowedSourceClasses: Object.freeze([
      "AUTHORIZED_FIRST_PARTY",
      "OFFICIAL_ORGANIZATION_SOURCE",
      "PUBLIC_PRIMARY_SOURCE",
      "CANONICAL_RELATIONSHIP_GRAPH"
    ] as const)
  })
});

type ResearchableActionV1 = keyof typeof WORK_MAP;

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

function boundedInteger(value: unknown, minimum: number, maximum: number, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function optionalBoundedInteger(value: unknown, fallback: number, minimum: number, maximum: number, label: string): number {
  return value == null ? fallback : boundedInteger(value, minimum, maximum, label);
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
  }))].sort((left, right) => left.localeCompare(right)));
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((left, right) => left.localeCompare(right)));
}

function emptyCounts(): Record<SponsorDecisionMakerGapDecisionV1["disposition"], number> {
  return {
    READY_FOR_INTERNAL_DECISION_MAKER_REVIEW: 0,
    RESEARCH_REQUIRED: 0,
    VERIFY_REQUIRED: 0,
    NOT_APPLICABLE: 0,
    SUPPRESS: 0
  };
}

function sourceAuthoritySafe(source: SponsorDecisionMakerGapReviewResultV1): boolean {
  const authority = source.authority;
  return authority.analysisOnly === true
    && authority.internalReviewAllowed === true
    && authority.internalResearchPreparationAllowed === true
    && authority.decisionMakerFactPromotionAuthorized === false
    && authority.relationshipMutationAuthorized === false
    && authority.crmMutationAuthorized === false
    && authority.contactDiscoveryAuthorized === false
    && authority.outreachAuthorized === false
    && authority.spendAuthorized === false
    && authority.contractAuthorized === false
    && authority.externalActionAuthorized === false;
}

function countsMatch(source: SponsorDecisionMakerGapReviewResultV1): boolean {
  const expected = emptyCounts();
  for (const decision of source.decisions) expected[decision.disposition] += 1;
  return (Object.keys(expected) as Array<keyof typeof expected>)
    .every((key) => source.counts[key] === expected[key]);
}

function blocked(generatedAt: string, issues: readonly string[]): SponsorDecisionMakerResearchPlanResultV1 {
  return freezeDeep({
    version: SPONSOR_DECISION_MAKER_RESEARCH_PLAN_VERSION_V1,
    generatedAt,
    status: "BLOCKED" as const,
    issues: uniqueSorted(issues),
    tasks: Object.freeze([]),
    omittedTaskCount: 0,
    orderingPolicy: "PRESERVE_UPSTREAM_SAFETY_AND_WORKFLOW_ORDER" as const,
    returnPolicy: "OBSERVED_EVIDENCE_MUST_REENTER_CANONICAL_REVIEW" as const,
    limitations: LIMITATIONS,
    authority: AUTHORITY
  });
}

function actionForDecision(decision: SponsorDecisionMakerGapDecisionV1): ResearchableActionV1 | null {
  if (decision.disposition === "RESEARCH_REQUIRED") {
    if (decision.nextInternalAction === "RESEARCH_CURRENT_DECISION_MAKER_EVIDENCE") {
      return "RESEARCH_CURRENT_DECISION_MAKER_EVIDENCE";
    }
    if (decision.nextInternalAction === "RESOLVE_SPONSOR_PERSON_BINDING") {
      return "RESOLVE_SPONSOR_PERSON_BINDING";
    }
    return null;
  }

  if (decision.disposition === "VERIFY_REQUIRED") {
    if (decision.nextInternalAction === "VERIFY_CANONICAL_PERSON_IDENTITY") {
      return "VERIFY_CANONICAL_PERSON_IDENTITY";
    }
    if (decision.nextInternalAction === "VERIFY_SOURCE_EVIDENCE") {
      return "VERIFY_SOURCE_EVIDENCE";
    }
    return null;
  }

  return null;
}

function validateDecision(
  decision: SponsorDecisionMakerGapDecisionV1,
  index: number,
  seenPortfolioEntryIds: Set<string>,
  issues: string[]
): void {
  const prefix = `gapReview.decisions[${index}]`;
  const portfolioEntryId = requiredText(decision.portfolioEntryId, `${prefix}.portfolioEntryId`);
  requiredText(decision.sponsorCandidateId, `${prefix}.sponsorCandidateId`);
  safeNullableRef(decision.qualificationCandidateId, `${prefix}.qualificationCandidateId`);
  safeNullableRef(decision.canonicalOpportunityRef, `${prefix}.canonicalOpportunityRef`);
  safeNullableRef(decision.canonicalOrganizationRef, `${prefix}.canonicalOrganizationRef`);
  safeNullableRef(decision.canonicalPersonRef, `${prefix}.canonicalPersonRef`);
  safeRefs(decision.evidenceRefs, `${prefix}.evidenceRefs`);
  if (!Array.isArray(decision.reasonCodes) || decision.reasonCodes.length === 0) {
    throw new Error(`${prefix}.reasonCodes must be a non-empty array`);
  }
  decision.reasonCodes.forEach((reason, reasonIndex) => requiredText(reason, `${prefix}.reasonCodes[${reasonIndex}]`));

  if (seenPortfolioEntryIds.has(portfolioEntryId)) issues.push(`DUPLICATE_PORTFOLIO_ENTRY:${portfolioEntryId}`);
  seenPortfolioEntryIds.add(portfolioEntryId);

  const action = actionForDecision(decision);
  if ((decision.disposition === "RESEARCH_REQUIRED" || decision.disposition === "VERIFY_REQUIRED") && !action) {
    issues.push(`UNSUPPORTED_GAP_ACTION:${portfolioEntryId}:${decision.disposition}:${decision.nextInternalAction}`);
    return;
  }

  if (action === "RESEARCH_CURRENT_DECISION_MAKER_EVIDENCE" && !decision.canonicalOrganizationRef) {
    issues.push(`CURRENT_DECISION_MAKER_RESEARCH_REQUIRES_ORGANIZATION:${portfolioEntryId}`);
  }
  if (action === "RESOLVE_SPONSOR_PERSON_BINDING") {
    if (!decision.canonicalOrganizationRef) issues.push(`SPONSOR_PERSON_BINDING_REQUIRES_ORGANIZATION:${portfolioEntryId}`);
    if (!decision.canonicalPersonRef) issues.push(`SPONSOR_PERSON_BINDING_REQUIRES_PERSON:${portfolioEntryId}`);
  }
  if (action === "VERIFY_CANONICAL_PERSON_IDENTITY" && !decision.canonicalPersonRef) {
    issues.push(`PERSON_IDENTITY_VERIFICATION_REQUIRES_PERSON:${portfolioEntryId}`);
  }
}

function taskFromDecision(
  decision: SponsorDecisionMakerGapDecisionV1,
  upstreamOrdinal: number,
  action: ResearchableActionV1
): SponsorDecisionMakerResearchTaskV1 {
  const mapping = WORK_MAP[action];
  return freezeDeep({
    taskId: `sponsor-decision-maker-research:${decision.portfolioEntryId}:${mapping.workType}`,
    upstreamOrdinal,
    portfolioEntryId: requiredText(decision.portfolioEntryId, `decision[${upstreamOrdinal}].portfolioEntryId`),
    sponsorCandidateId: requiredText(decision.sponsorCandidateId, `decision[${upstreamOrdinal}].sponsorCandidateId`),
    qualificationCandidateId: safeNullableRef(decision.qualificationCandidateId, `decision[${upstreamOrdinal}].qualificationCandidateId`),
    canonicalOpportunityRef: safeNullableRef(decision.canonicalOpportunityRef, `decision[${upstreamOrdinal}].canonicalOpportunityRef`),
    canonicalOrganizationRef: safeNullableRef(decision.canonicalOrganizationRef, `decision[${upstreamOrdinal}].canonicalOrganizationRef`),
    canonicalPersonRef: safeNullableRef(decision.canonicalPersonRef, `decision[${upstreamOrdinal}].canonicalPersonRef`),
    workType: mapping.workType,
    evidenceNeed: mapping.evidenceNeed,
    allowedSourceClasses: [...mapping.allowedSourceClasses],
    evidenceRefs: [...safeRefs(decision.evidenceRefs, `decision[${upstreamOrdinal}].evidenceRefs`)],
    reasonCodes: [...uniqueSorted(decision.reasonCodes.map((reason) => requiredText(reason, `decision[${upstreamOrdinal}].reasonCode`)))],
    ...TASK_AUTHORITY
  });
}

/**
 * Converts exact sponsor decision-maker gaps into bounded evidence-acquisition tasks.
 * This is an internal planning boundary only. It deliberately does not perform live
 * research, discover private contact coordinates, infer authority/relationships, or
 * mutate canonical relationship/opportunity state.
 */
export function buildSponsorDecisionMakerResearchPlanV1(
  input: SponsorDecisionMakerResearchPlanInputV1
): SponsorDecisionMakerResearchPlanResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  const generatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(generatedAt);
  const maximumProjectionAgeMinutes = boundedInteger(
    input.maximumProjectionAgeMinutes,
    1,
    MAX_PROJECTION_AGE_MINUTES,
    "maximumProjectionAgeMinutes"
  );
  const maximumTasks = optionalBoundedInteger(input.maximumTasks, MAX_TASKS, 1, MAX_TASKS, "maximumTasks");

  const source = input.gapReview;
  if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("gapReview must be an object");
  if (!Array.isArray(source.decisions) || !Array.isArray(source.issues)) {
    throw new Error("gapReview decisions and issues must be arrays");
  }

  const issues: string[] = [];
  if (source.version !== SPONSOR_DECISION_MAKER_GAP_REVIEW_VERSION_V1) issues.push("UNSUPPORTED_GAP_REVIEW_VERSION");
  const sourceGeneratedAtMs = Date.parse(source.generatedAt);
  if (!Number.isFinite(sourceGeneratedAtMs)) issues.push("GAP_REVIEW_GENERATED_AT_INVALID");
  else {
    if (sourceGeneratedAtMs > evaluatedAtMs) issues.push("GAP_REVIEW_GENERATED_IN_FUTURE");
    if (evaluatedAtMs - sourceGeneratedAtMs > maximumProjectionAgeMinutes * MINUTE_MS) {
      issues.push("GAP_REVIEW_PROJECTION_STALE");
    }
  }
  if (source.status !== "READY") issues.push("GAP_REVIEW_NOT_READY");
  if (source.issues.length > 0) issues.push("GAP_REVIEW_HAS_ISSUES");
  if (!sourceAuthoritySafe(source)) issues.push("GAP_REVIEW_AUTHORITY_INVARIANT_FAILED");
  if (!countsMatch(source)) issues.push("GAP_REVIEW_COUNT_DRIFT");

  const seenPortfolioEntryIds = new Set<string>();
  source.decisions.forEach((decision, index) => validateDecision(decision, index, seenPortfolioEntryIds, issues));
  if (issues.length > 0) return blocked(generatedAt, issues);

  const candidateTasks: SponsorDecisionMakerResearchTaskV1[] = [];
  for (const [index, decision] of source.decisions.entries()) {
    const action = actionForDecision(decision);
    if (!action) continue;
    candidateTasks.push(taskFromDecision(decision, index, action));
  }

  const tasks = candidateTasks.slice(0, maximumTasks);
  return freezeDeep({
    version: SPONSOR_DECISION_MAKER_RESEARCH_PLAN_VERSION_V1,
    generatedAt,
    status: candidateTasks.length === 0 ? "NO_RESEARCH_NEEDED" as const : "READY" as const,
    issues: Object.freeze([]),
    tasks,
    omittedTaskCount: candidateTasks.length - tasks.length,
    orderingPolicy: "PRESERVE_UPSTREAM_SAFETY_AND_WORKFLOW_ORDER" as const,
    returnPolicy: "OBSERVED_EVIDENCE_MUST_REENTER_CANONICAL_REVIEW" as const,
    limitations: LIMITATIONS,
    authority: AUTHORITY
  });
}
