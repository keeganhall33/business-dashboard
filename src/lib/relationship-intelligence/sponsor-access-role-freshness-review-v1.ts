import {
  DECISION_MAKER_ROLE_FRESHNESS_VERSION,
  type DecisionMakerRoleFreshnessResultV1,
  type DecisionMakerRoleProjectionV1,
  type RoleAuthorityClassV1
} from "@/lib/relationship-intelligence/decision-maker-role-freshness-v1";
import {
  SPONSOR_ACCESS_BRIEF_VERSION_V1,
  type SponsorAccessBriefResultV1,
  type SponsorAccessBriefStatusV1,
  type SponsorAccessBriefV1
} from "@/lib/relationship-intelligence/sponsor-access-brief-v1";

export const SPONSOR_ACCESS_ROLE_FRESHNESS_REVIEW_VERSION_V1 =
  "SPONSOR_ACCESS_ROLE_FRESHNESS_REVIEW_V1" as const;

export type SponsorAccessRoleFreshnessDispositionV1 =
  | "CURRENT_ROLE_CONFIRMS_ACCESS_READY"
  | "ROLE_RESEARCH_REQUIRED"
  | "VERIFY_ROLE_BEFORE_ACCESS"
  | "UPSTREAM_ACCESS_NOT_READY";

export type SponsorAccessRoleFreshnessReviewV1 = Readonly<{
  candidateId: string;
  upstreamAccessStatus: SponsorAccessBriefStatusV1;
  disposition: SponsorAccessRoleFreshnessDispositionV1;
  canonicalPersonRef: string | null;
  sponsorOrganizationRef: string | null;
  currentRoleOrganizationRef: string | null;
  currentRoleDisposition: DecisionMakerRoleProjectionV1["disposition"] | null;
  sponsorAuthorityClass: RoleAuthorityClassV1 | null;
  currentRoleAuthorityClass: RoleAuthorityClassV1 | null;
  currentRoleObservedAt: string | null;
  evidenceRefs: readonly string[];
  reasonCodes: readonly string[];
  introPreparationAllowed: boolean;
  relationshipHistoryInvalidated: false;
  confidence: "NOT_ESTABLISHED";
  sponsorInterest: "NOT_ESTABLISHED";
  opportunityCertainty: "NOT_ESTABLISHED";
  monetaryValue: null;
}>;

export type SponsorAccessRoleFreshnessReviewInputV1 = Readonly<{
  access: SponsorAccessBriefResultV1;
  roles: DecisionMakerRoleFreshnessResultV1;
  evaluatedAt: string | Date;
  maximumProjectionAgeMinutes: number;
}>;

export type SponsorAccessRoleFreshnessReviewResultV1 = Readonly<{
  version: typeof SPONSOR_ACCESS_ROLE_FRESHNESS_REVIEW_VERSION_V1;
  generatedAt: string;
  status: "READY" | "BLOCKED";
  issues: readonly string[];
  reviews: readonly SponsorAccessRoleFreshnessReviewV1[];
  counts: Readonly<{
    reviewed: number;
    currentRoleConfirmed: number;
    roleResearchRequired: number;
    verificationRequired: number;
    upstreamNotReady: number;
  }>;
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    introPreparationAllowedOnlyForConfirmedReview: true;
    relationshipMutationAuthorized: false;
    crmMutationAuthorized: false;
    contactDiscoveryAuthorized: false;
    outreachAuthorized: false;
    externalActionAuthorized: false;
  }>;
}>;

const MINUTE_MS = 60_000;
const MAX_PROJECTION_AGE_MINUTES = 10_080;
const MAX_REVIEWS = 1_000;

const DECISION_CAPABLE_AUTHORITIES = new Set<RoleAuthorityClassV1>(["DECISION_MAKER", "BUDGET_OWNER"]);

const LIMITATIONS = Object.freeze([
  "This review can only keep an already ACCESS_READY sponsor brief ready when the exact canonical person has a fresh, currently supported, graph-usable role at the exact sponsor organization with matching decision authority.",
  "A role departure, role change, stale or conflicted role evidence, missing role evidence, organization mismatch, authority mismatch, or explicit revalidation requirement cannot erase relationship history; it only blocks use of that role as current sponsor decision authority.",
  "Multiple evidence sources do not establish sponsor interest, opportunity certainty, confidence, monetary value, willingness to introduce Keegan, or causality.",
  "This review performs no relationship, CRM, contact, opportunity, outreach, spend, contract, or external mutation."
] as const);

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  introPreparationAllowedOnlyForConfirmedReview: true as const,
  relationshipMutationAuthorized: false as const,
  crmMutationAuthorized: false as const,
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

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze(
    [...new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()))]
      .sort((left, right) => left.localeCompare(right))
  );
}

function sourceAgeIssue(
  generatedAt: string,
  label: string,
  evaluatedAtMs: number,
  maximumProjectionAgeMinutes: number
): string | null {
  const generatedAtMs = Date.parse(generatedAt);
  if (!Number.isFinite(generatedAtMs)) return `${label}_GENERATED_AT_INVALID`;
  if (generatedAtMs > evaluatedAtMs) return `${label}_GENERATED_IN_FUTURE`;
  if (evaluatedAtMs - generatedAtMs > maximumProjectionAgeMinutes * MINUTE_MS) return `${label}_STALE`;
  return null;
}

function accessCountsMatch(access: SponsorAccessBriefResultV1): boolean {
  if (!access.counts || typeof access.counts !== "object") return false;
  const expected: Record<SponsorAccessBriefStatusV1, number> = {
    ACCESS_READY: 0,
    PATH_BLOCKED: 0,
    NO_SUPPORTED_PATH: 0,
    RESEARCH_REQUIRED: 0,
    VERIFY_REQUIRED: 0,
    SUPPRESS: 0
  };
  for (const brief of access.briefs) expected[brief.status] += 1;
  return (Object.keys(expected) as SponsorAccessBriefStatusV1[]).every((status) => access.counts[status] === expected[status]);
}

function roleCountsMatch(roles: DecisionMakerRoleFreshnessResultV1): boolean {
  if (!roles.counts || typeof roles.counts !== "object") return false;
  return roles.counts.peopleReviewed === roles.roles.length
    && roles.counts.currentSupported === roles.roles.filter((role) => role.disposition === "CURRENT_ROLE_SUPPORTED").length
    && roles.counts.needsResearch === roles.roles.filter((role) => role.disposition === "CURRENT_ROLE_NEEDS_RESEARCH").length
    && roles.counts.verifyRequired === roles.roles.filter((role) => role.disposition === "VERIFY_REQUIRED").length
    && roles.counts.noCurrentRole === roles.roles.filter((role) => role.disposition === "NO_CURRENT_ROLE_SUPPORTED").length
    && roles.counts.conflicted === roles.roles.filter((role) => role.disposition === "CONFLICTED").length;
}

function sourceIssues(
  access: SponsorAccessBriefResultV1,
  roles: DecisionMakerRoleFreshnessResultV1,
  evaluatedAtMs: number,
  maximumProjectionAgeMinutes: number
): readonly string[] {
  const issues = new Set<string>();

  if (!access || typeof access !== "object" || Array.isArray(access)) issues.add("ACCESS_SOURCE_REQUIRED");
  if (!roles || typeof roles !== "object" || Array.isArray(roles)) issues.add("ROLE_SOURCE_REQUIRED");
  if (issues.size > 0) return Object.freeze([...issues].sort((a, b) => a.localeCompare(b)));

  if (access.version !== SPONSOR_ACCESS_BRIEF_VERSION_V1) issues.add("ACCESS_SOURCE_VERSION_UNSUPPORTED");
  if (roles.version !== DECISION_MAKER_ROLE_FRESHNESS_VERSION) issues.add("ROLE_SOURCE_VERSION_UNSUPPORTED");
  if (!Array.isArray(access.briefs)) issues.add("ACCESS_BRIEFS_REQUIRED");
  else if (access.briefs.length > MAX_REVIEWS) issues.add("ACCESS_BRIEF_LIMIT_EXCEEDED");
  if (!Array.isArray(roles.roles)) issues.add("ROLE_PROJECTIONS_REQUIRED");
  else if (roles.roles.length > MAX_REVIEWS) issues.add("ROLE_PROJECTION_LIMIT_EXCEEDED");

  const accessAgeIssue = sourceAgeIssue(access.generatedAt, "ACCESS_SOURCE", evaluatedAtMs, maximumProjectionAgeMinutes);
  if (accessAgeIssue) issues.add(accessAgeIssue);
  const roleAgeIssue = sourceAgeIssue(roles.generatedAt, "ROLE_SOURCE", evaluatedAtMs, maximumProjectionAgeMinutes);
  if (roleAgeIssue) issues.add(roleAgeIssue);

  if (access.actionAuthority?.analysisOnly !== true) issues.add("ACCESS_SOURCE_ANALYSIS_BOUNDARY_INVALID");
  if (access.actionAuthority?.crmMutationAuthorized !== false) issues.add("ACCESS_SOURCE_CRM_MUTATION_NOT_ALLOWED");
  if (access.actionAuthority?.contactDiscoveryAuthorized !== false) issues.add("ACCESS_SOURCE_CONTACT_DISCOVERY_NOT_ALLOWED");
  if (access.actionAuthority?.outreachAuthorized !== false) issues.add("ACCESS_SOURCE_OUTREACH_NOT_ALLOWED");
  if (access.actionAuthority?.externalActionAuthorized !== false) issues.add("ACCESS_SOURCE_EXTERNAL_ACTION_NOT_ALLOWED");

  if (roles.externalResearchPerformed !== false) issues.add("ROLE_SOURCE_EXTERNAL_RESEARCH_NOT_ALLOWED");
  if (roles.crmMutationPerformed !== false) issues.add("ROLE_SOURCE_CRM_MUTATION_NOT_ALLOWED");
  if (roles.relationshipMutationPerformed !== false) issues.add("ROLE_SOURCE_RELATIONSHIP_MUTATION_NOT_ALLOWED");
  if (roles.externalActionPerformed !== false) issues.add("ROLE_SOURCE_EXTERNAL_ACTION_NOT_ALLOWED");

  if (Array.isArray(access.briefs) && !accessCountsMatch(access)) issues.add("ACCESS_SOURCE_COUNT_MISMATCH");
  if (Array.isArray(roles.roles) && !roleCountsMatch(roles)) issues.add("ROLE_SOURCE_COUNT_MISMATCH");

  if (Array.isArray(access.briefs)) {
    const candidateIds = new Set<string>();
    for (const [index, brief] of access.briefs.entries()) {
      try {
        const candidateId = requiredText(brief.candidateId, `access.briefs[${index}].candidateId`);
        if (candidateIds.has(candidateId)) issues.add("DUPLICATE_ACCESS_CANDIDATE_ID");
        candidateIds.add(candidateId);
      } catch {
        issues.add("ACCESS_SOURCE_IDENTITY_INVALID");
      }
    }
  }

  if (Array.isArray(roles.roles)) {
    const personRefs = new Set<string>();
    for (const [index, role] of roles.roles.entries()) {
      try {
        const personRef = requiredText(role.canonicalPersonRef, `roles.roles[${index}].canonicalPersonRef`);
        if (personRefs.has(personRef)) issues.add("DUPLICATE_CURRENT_ROLE_PERSON_REF");
        personRefs.add(personRef);
      } catch {
        issues.add("ROLE_SOURCE_IDENTITY_INVALID");
      }
    }
  }

  return Object.freeze([...issues].sort((a, b) => a.localeCompare(b)));
}

function sponsorAuthority(brief: SponsorAccessBriefV1): RoleAuthorityClassV1 | null {
  const value = brief.authorityClass?.value;
  if (value == null || value === "UNKNOWN") return null;
  return value as RoleAuthorityClassV1;
}

function reviewEvidence(brief: SponsorAccessBriefV1, role: DecisionMakerRoleProjectionV1 | null): readonly string[] {
  return uniqueSorted([...brief.evidenceRefs, ...(role?.evidenceRefs ?? [])]);
}

function reviewBrief(
  brief: SponsorAccessBriefV1,
  roleByPersonRef: ReadonlyMap<string, DecisionMakerRoleProjectionV1>
): SponsorAccessRoleFreshnessReviewV1 {
  const personRef = brief.canonicalPersonRef;
  const role = personRef ? roleByPersonRef.get(personRef) ?? null : null;
  const evidenceRefs = reviewEvidence(brief, role);
  const sponsorAuthorityClass = sponsorAuthority(brief);
  const base = {
    candidateId: brief.candidateId,
    upstreamAccessStatus: brief.status,
    canonicalPersonRef: personRef,
    sponsorOrganizationRef: brief.canonicalOrganizationRef,
    currentRoleOrganizationRef: role?.canonicalOrganizationRef ?? null,
    currentRoleDisposition: role?.disposition ?? null,
    sponsorAuthorityClass,
    currentRoleAuthorityClass: role?.authorityClass ?? null,
    currentRoleObservedAt: role?.observedAt ?? null,
    evidenceRefs,
    relationshipHistoryInvalidated: false as const,
    confidence: "NOT_ESTABLISHED" as const,
    sponsorInterest: "NOT_ESTABLISHED" as const,
    opportunityCertainty: "NOT_ESTABLISHED" as const,
    monetaryValue: null
  };

  if (brief.status !== "ACCESS_READY") {
    return freezeDeep({
      ...base,
      disposition: "UPSTREAM_ACCESS_NOT_READY" as const,
      reasonCodes: [`UPSTREAM_ACCESS_STATUS_${brief.status}`],
      introPreparationAllowed: false
    });
  }

  if (!personRef || !brief.canonicalOrganizationRef) {
    return freezeDeep({
      ...base,
      disposition: "VERIFY_ROLE_BEFORE_ACCESS" as const,
      reasonCodes: ["ACCESS_READY_BRIEF_MISSING_EXACT_CANONICAL_TARGET_IDENTITY"],
      introPreparationAllowed: false
    });
  }

  if (!role) {
    return freezeDeep({
      ...base,
      disposition: "ROLE_RESEARCH_REQUIRED" as const,
      reasonCodes: ["NO_CURRENT_ROLE_PROJECTION_FOR_EXACT_CANONICAL_PERSON"],
      introPreparationAllowed: false
    });
  }

  if (role.disposition === "CURRENT_ROLE_NEEDS_RESEARCH") {
    return freezeDeep({
      ...base,
      disposition: "ROLE_RESEARCH_REQUIRED" as const,
      reasonCodes: uniqueSorted(["CURRENT_ROLE_EVIDENCED_BUT_DECISION_AUTHORITY_NOT_READY", ...role.reasonCodes]),
      introPreparationAllowed: false
    });
  }

  if (role.disposition !== "CURRENT_ROLE_SUPPORTED") {
    return freezeDeep({
      ...base,
      disposition: "VERIFY_ROLE_BEFORE_ACCESS" as const,
      reasonCodes: uniqueSorted([`CURRENT_ROLE_DISPOSITION_${role.disposition}`, ...role.reasonCodes]),
      introPreparationAllowed: false
    });
  }

  if (!role.authorityUsableForGraph) {
    return freezeDeep({
      ...base,
      disposition: "VERIFY_ROLE_BEFORE_ACCESS" as const,
      reasonCodes: uniqueSorted(["CURRENT_ROLE_AUTHORITY_NOT_USABLE_FOR_GRAPH", ...role.reasonCodes]),
      introPreparationAllowed: false
    });
  }

  if (role.authorityRevalidationRequired) {
    return freezeDeep({
      ...base,
      disposition: "VERIFY_ROLE_BEFORE_ACCESS" as const,
      reasonCodes: uniqueSorted(["CURRENT_ROLE_AUTHORITY_REVALIDATION_REQUIRED", ...role.reasonCodes]),
      introPreparationAllowed: false
    });
  }

  if (role.canonicalOrganizationRef !== brief.canonicalOrganizationRef) {
    return freezeDeep({
      ...base,
      disposition: "VERIFY_ROLE_BEFORE_ACCESS" as const,
      reasonCodes: ["CURRENT_ROLE_ORGANIZATION_MISMATCH"],
      introPreparationAllowed: false
    });
  }

  if (!sponsorAuthorityClass || !DECISION_CAPABLE_AUTHORITIES.has(sponsorAuthorityClass)) {
    return freezeDeep({
      ...base,
      disposition: "VERIFY_ROLE_BEFORE_ACCESS" as const,
      reasonCodes: ["SPONSOR_ACCESS_AUTHORITY_NOT_DECISION_CAPABLE"],
      introPreparationAllowed: false
    });
  }

  if (!role.authorityClass || !DECISION_CAPABLE_AUTHORITIES.has(role.authorityClass)) {
    return freezeDeep({
      ...base,
      disposition: "VERIFY_ROLE_BEFORE_ACCESS" as const,
      reasonCodes: ["CURRENT_ROLE_AUTHORITY_NOT_DECISION_CAPABLE"],
      introPreparationAllowed: false
    });
  }

  if (role.authorityClass !== sponsorAuthorityClass) {
    return freezeDeep({
      ...base,
      disposition: "VERIFY_ROLE_BEFORE_ACCESS" as const,
      reasonCodes: ["SPONSOR_ACCESS_AND_CURRENT_ROLE_AUTHORITY_MISMATCH"],
      introPreparationAllowed: false
    });
  }

  if (!role.observedAt || evidenceRefs.length === 0) {
    return freezeDeep({
      ...base,
      disposition: "VERIFY_ROLE_BEFORE_ACCESS" as const,
      reasonCodes: ["CURRENT_ROLE_EVIDENCE_INCOMPLETE"],
      introPreparationAllowed: false
    });
  }

  return freezeDeep({
    ...base,
    disposition: "CURRENT_ROLE_CONFIRMS_ACCESS_READY" as const,
    reasonCodes: ["EXACT_CURRENT_ROLE_SUPPORTS_SPONSOR_ACCESS_TARGET"],
    introPreparationAllowed: true
  });
}

function blocked(generatedAt: string, issues: readonly string[]): SponsorAccessRoleFreshnessReviewResultV1 {
  return freezeDeep({
    version: SPONSOR_ACCESS_ROLE_FRESHNESS_REVIEW_VERSION_V1,
    generatedAt,
    status: "BLOCKED" as const,
    issues: uniqueSorted(issues),
    reviews: [],
    counts: {
      reviewed: 0,
      currentRoleConfirmed: 0,
      roleResearchRequired: 0,
      verificationRequired: 0,
      upstreamNotReady: 0
    },
    limitations: [...LIMITATIONS],
    authority: { ...AUTHORITY }
  });
}

/**
 * Revalidates an already evidence-bounded sponsor access brief against the latest
 * canonical decision-maker role projection. This can only make access readiness
 * stricter. It never creates a role, sponsorship, relationship, warm path, timing
 * claim, contact route, or opportunity.
 */
export function reviewSponsorAccessRoleFreshnessV1(
  input: SponsorAccessRoleFreshnessReviewInputV1
): SponsorAccessRoleFreshnessReviewResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  const generatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(generatedAt);
  const maximumProjectionAgeMinutes = positiveBoundedInteger(input.maximumProjectionAgeMinutes, "maximumProjectionAgeMinutes");

  const issues = sourceIssues(input.access, input.roles, evaluatedAtMs, maximumProjectionAgeMinutes);
  if (issues.length > 0) return blocked(generatedAt, issues);

  const roleByPersonRef = new Map<string, DecisionMakerRoleProjectionV1>();
  for (const role of input.roles.roles) roleByPersonRef.set(role.canonicalPersonRef, role);

  const reviews = input.access.briefs.map((brief) => reviewBrief(brief, roleByPersonRef));
  const counts = {
    reviewed: reviews.length,
    currentRoleConfirmed: reviews.filter((review) => review.disposition === "CURRENT_ROLE_CONFIRMS_ACCESS_READY").length,
    roleResearchRequired: reviews.filter((review) => review.disposition === "ROLE_RESEARCH_REQUIRED").length,
    verificationRequired: reviews.filter((review) => review.disposition === "VERIFY_ROLE_BEFORE_ACCESS").length,
    upstreamNotReady: reviews.filter((review) => review.disposition === "UPSTREAM_ACCESS_NOT_READY").length
  };

  return freezeDeep({
    version: SPONSOR_ACCESS_ROLE_FRESHNESS_REVIEW_VERSION_V1,
    generatedAt,
    status: "READY" as const,
    issues: [],
    reviews,
    counts,
    limitations: [...LIMITATIONS],
    authority: { ...AUTHORITY }
  });
}
