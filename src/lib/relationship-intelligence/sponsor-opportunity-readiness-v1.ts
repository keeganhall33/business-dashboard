import type {
  DecisionMakerRoleFreshnessResultV1,
  DecisionMakerRoleProjectionV1
} from "@/lib/relationship-intelligence/decision-maker-role-freshness-v1";
import type {
  EarlyPlanningDecisionV1,
  EarlyPlanningWindowResultV1
} from "@/lib/relationship-intelligence/early-planning-window-v1";
import type {
  SponsorAccessBriefResultV1,
  SponsorAccessBriefV1
} from "@/lib/relationship-intelligence/sponsor-access-brief-v1";

export const SPONSOR_OPPORTUNITY_READINESS_VERSION_V1 = "SPONSOR_OPPORTUNITY_READINESS_V1" as const;

export type SponsorOpportunityReadinessStatusV1 =
  | "READY_TO_PREPARE"
  | "PLAN_AHEAD"
  | "ACCESS_BLOCKED"
  | "MISSED_WINDOW"
  | "RESEARCH_REQUIRED"
  | "VERIFY_REQUIRED"
  | "SUPPRESS";

export type SponsorOpportunityNextInternalActionV1 =
  | "PREPARE_APPROVAL_READY_OUTREACH"
  | "PREPARE_EARLY_ACTIVATION_BRIEF"
  | "RESOLVE_ACCESS_BLOCKER"
  | "RESEARCH_NEXT_CYCLE"
  | "RESEARCH_EVIDENCE_GAPS"
  | "VERIFY_IDENTITY_ROLE_ACCESS_OR_TIMING"
  | "NONE";

export type SponsorOpportunityReadinessInputV1 = Readonly<{
  evaluatedAt: string | Date;
  sponsorAccess: SponsorAccessBriefResultV1;
  planning: EarlyPlanningWindowResultV1;
  roleFreshness: DecisionMakerRoleFreshnessResultV1;
  maximumProjectionAgeMinutes?: number;
}>;

export type SponsorOpportunityReadinessDecisionV1 = Readonly<{
  candidateId: string;
  status: SponsorOpportunityReadinessStatusV1;
  canonicalOrganizationRef: string | null;
  canonicalPersonRef: string | null;
  ecosystemRole: SponsorAccessBriefV1["ecosystemRole"];
  decisionFunction: SponsorAccessBriefV1["decisionFunction"];
  authorityClass: SponsorAccessBriefV1["authorityClass"];
  accessStatus: SponsorAccessBriefV1["status"];
  planningDisposition: EarlyPlanningDecisionV1["disposition"] | null;
  roleDisposition: DecisionMakerRoleProjectionV1["disposition"] | null;
  idealOutreachDateRange: EarlyPlanningDecisionV1["idealOutreachDateRange"] | null;
  timingRationale: string | null;
  nextInternalAction: SponsorOpportunityNextInternalActionV1;
  evidenceRefs: readonly string[];
  gaps: readonly string[];
  reasonCodes: readonly string[];
}>;

export type SponsorOpportunityReadinessResultV1 = Readonly<{
  version: typeof SPONSOR_OPPORTUNITY_READINESS_VERSION_V1;
  generatedAt: string;
  status: "READY" | "BLOCKED";
  issues: readonly string[];
  decisions: readonly SponsorOpportunityReadinessDecisionV1[];
  counts: Readonly<Record<SponsorOpportunityReadinessStatusV1, number>>;
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    internalPreparationAllowed: true;
    crmMutationAuthorized: false;
    contactDiscoveryAuthorized: false;
    outreachAuthorized: false;
    externalActionAuthorized: false;
  }>;
}>;

const DEFAULT_MAX_PROJECTION_AGE_MINUTES = 60;
const MAX_PROJECTION_AGE_MINUTES = 1_440;
const MINUTE_MS = 60_000;

const LIMITATIONS = Object.freeze([
  "Readiness combines existing evidence-backed sponsor, access, role-freshness, and planning projections; it does not create a new relationship, sponsorship, contact, or timing fact.",
  "READY_TO_PREPARE authorizes internal preparation only. Outreach, contact discovery, CRM mutation, spend, contracts, and other external actions remain separately governed.",
  "A supported relationship path and current role evidence do not prove willingness to introduce Keegan, sponsor interest, budget availability, or deal likelihood."
] as const);

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  internalPreparationAllowed: true as const,
  crmMutationAuthorized: false as const,
  contactDiscoveryAuthorized: false as const,
  outreachAuthorized: false as const,
  externalActionAuthorized: false as const
});

const STATUS_PRIORITY: Readonly<Record<SponsorOpportunityReadinessStatusV1, number>> = Object.freeze({
  READY_TO_PREPARE: 0,
  PLAN_AHEAD: 1,
  MISSED_WINDOW: 2,
  RESEARCH_REQUIRED: 3,
  ACCESS_BLOCKED: 4,
  VERIFY_REQUIRED: 5,
  SUPPRESS: 6
});

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
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

function promote(
  current: SponsorOpportunityReadinessStatusV1,
  candidate: SponsorOpportunityReadinessStatusV1
): SponsorOpportunityReadinessStatusV1 {
  return STATUS_PRIORITY[candidate] > STATUS_PRIORITY[current] ? candidate : current;
}

function statusFromAccess(status: SponsorAccessBriefV1["status"]): SponsorOpportunityReadinessStatusV1 {
  switch (status) {
    case "ACCESS_READY":
      return "READY_TO_PREPARE";
    case "PATH_BLOCKED":
      return "ACCESS_BLOCKED";
    case "NO_SUPPORTED_PATH":
    case "RESEARCH_REQUIRED":
      return "RESEARCH_REQUIRED";
    case "VERIFY_REQUIRED":
      return "VERIFY_REQUIRED";
    case "SUPPRESS":
      return "SUPPRESS";
  }
}

function nextInternalAction(status: SponsorOpportunityReadinessStatusV1): SponsorOpportunityNextInternalActionV1 {
  switch (status) {
    case "READY_TO_PREPARE":
      return "PREPARE_APPROVAL_READY_OUTREACH";
    case "PLAN_AHEAD":
      return "PREPARE_EARLY_ACTIVATION_BRIEF";
    case "ACCESS_BLOCKED":
      return "RESOLVE_ACCESS_BLOCKER";
    case "MISSED_WINDOW":
      return "RESEARCH_NEXT_CYCLE";
    case "RESEARCH_REQUIRED":
      return "RESEARCH_EVIDENCE_GAPS";
    case "VERIFY_REQUIRED":
      return "VERIFY_IDENTITY_ROLE_ACCESS_OR_TIMING";
    case "SUPPRESS":
      return "NONE";
  }
}

function emptyCounts(): Record<SponsorOpportunityReadinessStatusV1, number> {
  return {
    READY_TO_PREPARE: 0,
    PLAN_AHEAD: 0,
    ACCESS_BLOCKED: 0,
    MISSED_WINDOW: 0,
    RESEARCH_REQUIRED: 0,
    VERIFY_REQUIRED: 0,
    SUPPRESS: 0
  };
}

function roleStatus(
  role: DecisionMakerRoleProjectionV1 | null,
  access: SponsorAccessBriefV1,
  gaps: Set<string>,
  reasons: Set<string>
): SponsorOpportunityReadinessStatusV1 {
  if (!access.canonicalPersonRef) {
    gaps.add("CANONICAL_PERSON_REQUIRED");
    reasons.add("SPONSOR_ACCESS_HAS_NO_CANONICAL_PERSON");
    return "RESEARCH_REQUIRED";
  }
  if (!role) {
    gaps.add("CURRENT_DECISION_MAKER_ROLE_REQUIRED");
    reasons.add("NO_ROLE_FRESHNESS_PROJECTION_FOR_SPONSOR_CONTACT");
    return "RESEARCH_REQUIRED";
  }

  for (const reason of role.reasonCodes) reasons.add(`ROLE:${reason}`);

  if (role.disposition === "CONFLICTED" || role.disposition === "VERIFY_REQUIRED" || role.disposition === "NO_CURRENT_ROLE_SUPPORTED") {
    gaps.add("DECISION_MAKER_ROLE_NOT_SAFE_TO_USE");
    reasons.add("CURRENT_ROLE_OR_EMPLOYMENT_REQUIRES_VERIFICATION");
    return "VERIFY_REQUIRED";
  }
  if (role.disposition === "CURRENT_ROLE_NEEDS_RESEARCH") {
    gaps.add("DECISION_MAKER_ROLE_INCOMPLETE");
    reasons.add("CURRENT_ROLE_LACKS_DECISION_GRADE_FUNCTION_OR_AUTHORITY");
    return "RESEARCH_REQUIRED";
  }
  if (!role.authorityUsableForGraph) {
    gaps.add("DECISION_AUTHORITY_NOT_USABLE_FOR_GRAPH");
    reasons.add("ROLE_FRESHNESS_DOES_NOT_AUTHORIZE_GRAPH_AUTHORITY");
    return "VERIFY_REQUIRED";
  }
  if (role.authorityRevalidationRequired) {
    gaps.add("RELATIONSHIP_AUTHORITY_REVALIDATION_REQUIRED");
    reasons.add("NEWER_ROLE_EVIDENCE_REQUIRES_ACCESS_PATH_REVALIDATION");
    return "VERIFY_REQUIRED";
  }

  if (access.canonicalOrganizationRef && role.canonicalOrganizationRef !== access.canonicalOrganizationRef) {
    gaps.add("ROLE_ORGANIZATION_MISMATCH");
    reasons.add("SPONSOR_ACCESS_AND_CURRENT_ROLE_ORGANIZATIONS_DISAGREE");
    return "VERIFY_REQUIRED";
  }
  if (access.authorityClass.value && role.authorityClass && access.authorityClass.value !== role.authorityClass) {
    gaps.add("ROLE_AUTHORITY_MISMATCH");
    reasons.add("SPONSOR_ACCESS_AND_CURRENT_ROLE_AUTHORITY_DISAGREE");
    return "VERIFY_REQUIRED";
  }

  reasons.add("CURRENT_DECISION_MAKER_ROLE_CONFIRMED");
  return "READY_TO_PREPARE";
}

function planningStatus(
  planning: EarlyPlanningDecisionV1 | null,
  access: SponsorAccessBriefV1,
  gaps: Set<string>,
  reasons: Set<string>
): SponsorOpportunityReadinessStatusV1 {
  if (!planning) {
    gaps.add("EARLY_PLANNING_DECISION_REQUIRED");
    reasons.add("NO_MATCHING_EARLY_PLANNING_PROJECTION");
    return "RESEARCH_REQUIRED";
  }

  for (const reason of planning.reasonCodes) reasons.add(`PLANNING:${reason}`);
  for (const gap of planning.coverageGaps) gaps.add(`PLANNING:${gap}`);

  if (access.canonicalOrganizationRef && planning.canonicalOrganizationRef && access.canonicalOrganizationRef !== planning.canonicalOrganizationRef) {
    gaps.add("PLANNING_ORGANIZATION_MISMATCH");
    reasons.add("SPONSOR_ACCESS_AND_PLANNING_ORGANIZATIONS_DISAGREE");
    return "VERIFY_REQUIRED";
  }
  if (!planning.canonicalOrganizationRef) {
    gaps.add("PLANNING_CANONICAL_ORGANIZATION_REQUIRED");
    reasons.add("PLANNING_PROJECTION_LACKS_CANONICAL_ORGANIZATION");
    return "RESEARCH_REQUIRED";
  }

  switch (planning.disposition) {
    case "WINDOW_OPEN":
      return "READY_TO_PREPARE";
    case "PLAN_AHEAD":
      return "PLAN_AHEAD";
    case "MISSED_PLANNING_WINDOW":
      return "MISSED_WINDOW";
    case "NEEDS_RESEARCH":
      return "RESEARCH_REQUIRED";
    case "NEEDS_VERIFICATION":
      return "VERIFY_REQUIRED";
    case "SUPPRESS":
      return "SUPPRESS";
  }
}

function buildDecision(
  access: SponsorAccessBriefV1,
  planning: EarlyPlanningDecisionV1 | null,
  role: DecisionMakerRoleProjectionV1 | null
): SponsorOpportunityReadinessDecisionV1 {
  const gaps = new Set<string>(access.researchOrVerificationGaps.map((gap) => `ACCESS:${gap}`));
  const reasons = new Set<string>(access.reasonCodes.map((reason) => `ACCESS:${reason}`));
  let status = statusFromAccess(access.status);

  if (status !== "SUPPRESS") {
    status = promote(status, roleStatus(role, access, gaps, reasons));
    status = promote(status, planningStatus(planning, access, gaps, reasons));
  }

  const evidenceRefs = uniqueSorted([
    ...access.evidenceRefs,
    ...(planning?.evidenceRefs ?? []),
    ...(role?.evidenceRefs ?? [])
  ]);

  return freezeDeep({
    candidateId: access.candidateId,
    status,
    canonicalOrganizationRef: access.canonicalOrganizationRef,
    canonicalPersonRef: access.canonicalPersonRef,
    ecosystemRole: access.ecosystemRole,
    decisionFunction: access.decisionFunction,
    authorityClass: access.authorityClass,
    accessStatus: access.status,
    planningDisposition: planning?.disposition ?? null,
    roleDisposition: role?.disposition ?? null,
    idealOutreachDateRange: planning?.idealOutreachDateRange ?? null,
    timingRationale: planning?.whyThisWindow ?? null,
    nextInternalAction: nextInternalAction(status),
    evidenceRefs,
    gaps: uniqueSorted([...gaps]),
    reasonCodes: uniqueSorted([...reasons])
  });
}

/**
 * Produces a decision-grade sponsor readiness projection without creating new
 * relationship, contact, sponsor, timing, or opportunity facts. The synthesis
 * fails closed when upstream projections are stale/future and keeps all
 * external actions outside this contract's authority.
 */
export function buildSponsorOpportunityReadinessV1(
  input: SponsorOpportunityReadinessInputV1
): SponsorOpportunityReadinessResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  const generatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(generatedAt);
  const maximumProjectionAgeMinutes = boundedInteger(
    input.maximumProjectionAgeMinutes,
    DEFAULT_MAX_PROJECTION_AGE_MINUTES,
    1,
    MAX_PROJECTION_AGE_MINUTES,
    "maximumProjectionAgeMinutes"
  );

  const issues = uniqueSorted([
    projectedAtIssue(input.sponsorAccess.generatedAt, "SPONSOR_ACCESS", evaluatedAtMs, maximumProjectionAgeMinutes) ?? "",
    projectedAtIssue(input.planning.generatedAt, "EARLY_PLANNING", evaluatedAtMs, maximumProjectionAgeMinutes) ?? "",
    projectedAtIssue(input.roleFreshness.generatedAt, "ROLE_FRESHNESS", evaluatedAtMs, maximumProjectionAgeMinutes) ?? ""
  ]);

  if (issues.length > 0) {
    return freezeDeep({
      version: SPONSOR_OPPORTUNITY_READINESS_VERSION_V1,
      generatedAt,
      status: "BLOCKED" as const,
      issues: [...issues],
      decisions: [],
      counts: emptyCounts(),
      limitations: [...LIMITATIONS],
      authority: AUTHORITY
    });
  }

  const accessByCandidate = uniqueIndex(input.sponsorAccess.briefs, (brief) => brief.candidateId, "sponsorAccess.briefs");
  const planningByCandidate = uniqueIndex(input.planning.decisions, (decision) => decision.candidateId, "planning.decisions");
  const roleByPerson = uniqueIndex(input.roleFreshness.roles, (role) => role.canonicalPersonRef, "roleFreshness.roles");

  const decisions = [...accessByCandidate.values()]
    .sort((left, right) => left.candidateId.localeCompare(right.candidateId))
    .map((access) => buildDecision(
      access,
      planningByCandidate.get(access.candidateId) ?? null,
      access.canonicalPersonRef ? roleByPerson.get(access.canonicalPersonRef) ?? null : null
    ));

  const counts = emptyCounts();
  for (const decision of decisions) counts[decision.status] += 1;

  return freezeDeep({
    version: SPONSOR_OPPORTUNITY_READINESS_VERSION_V1,
    generatedAt,
    status: "READY" as const,
    issues: [],
    decisions,
    counts,
    limitations: [...LIMITATIONS],
    authority: AUTHORITY
  });
}
