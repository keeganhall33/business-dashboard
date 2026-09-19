import type { OpportunityQualificationAccessBriefResultV1 } from "@/lib/opportunity-intelligence/opportunity-qualification-access-brief-v1";
import type { SponsorDecisionMakerRoleReviewV1 } from "@/lib/opportunity-intelligence/sponsor-decision-maker-role-review-v1";
import type { SponsorPlanningWindowReviewV1 } from "@/lib/opportunity-intelligence/sponsor-planning-window-review-v1";
import type { SponsorWarmAccessReviewV1 } from "@/lib/opportunity-intelligence/sponsor-warm-access-review-v1";

export const SPONSOR_PURSUIT_EVIDENCE_BRIEF_VERSION_V1 = "SponsorPursuitEvidenceBriefV1" as const;

export type SponsorPursuitEvidenceDispositionV1 =
  | "READY_FOR_INTERNAL_REVIEW"
  | "RESEARCH_REQUIRED"
  | "VERIFY_REQUIRED"
  | "TIMING_REVIEW_REQUIRED";

export type SponsorPursuitEvidenceNextActionV1 =
  | "REVIEW_EVIDENCE_AND_PREPARE_APPROVAL_GATED_PITCH"
  | "RESEARCH_MISSING_ACCESS_OR_TIMING_EVIDENCE"
  | "VERIFY_UPSTREAM_EVIDENCE"
  | "REVIEW_NEXT_PLANNING_CYCLE";

export type SponsorPursuitEvidenceBuyerV1 = Readonly<{
  opportunityId: string;
  personCanonicalId: string;
  personLabel: string;
  organizationCanonicalId: string;
  organizationLabel: string;
  decisionClass: string;
  currentRoleObservationId: string;
  title: string;
  decisionFunction: string;
  authorityClass: string;
  qualificationCandidateIds: readonly string[];
  warmPathEvidenceIds: readonly string[];
  timingCandidateIds: readonly string[];
  planningDispositions: readonly string[];
  evidenceRefs: readonly string[];
  disposition: SponsorPursuitEvidenceDispositionV1;
  nextInternalAction: SponsorPursuitEvidenceNextActionV1;
  reasonCodes: readonly string[];
  sponsorInterest: "NOT_ESTABLISHED";
  budgetAvailability: "NOT_ESTABLISHED";
  introductionWillingness: "NOT_ESTABLISHED";
  opportunityCertainty: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
  outreachAuthority: "NOT_GRANTED";
}>;

export type SponsorPursuitEvidenceBriefV1 = Readonly<{
  contractVersion: typeof SPONSOR_PURSUIT_EVIDENCE_BRIEF_VERSION_V1;
  status: "LIVE" | "NO_CURRENT_SPONSOR_BUYERS" | "STALE" | "UNAVAILABLE" | "BLOCKED";
  opportunityId: string | null;
  evaluatedAt: string;
  buyers: readonly SponsorPursuitEvidenceBuyerV1[];
  issues: readonly string[];
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    internalReviewAllowed: true;
    crmMutationAllowed: false;
    relationshipMutationAllowed: false;
    opportunityMutationAllowed: false;
    contactDiscoveryAllowed: false;
    outreachAllowed: false;
    approvalBypassAllowed: false;
    externalActionAllowed: false;
  }>;
}>;

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  internalReviewAllowed: true as const,
  crmMutationAllowed: false as const,
  relationshipMutationAllowed: false as const,
  opportunityMutationAllowed: false as const,
  contactDiscoveryAllowed: false as const,
  outreachAllowed: false as const,
  approvalBypassAllowed: false as const,
  externalActionAllowed: false as const,
});

const LIMITATIONS = Object.freeze([
  "This brief joins already-governed qualification, current-role, warm-access, and planning-window evidence through exact canonical opportunity, organization, and person identifiers.",
  "A warm path establishes only an evidenced relationship path. It does not establish willingness to make an introduction.",
  "A planning window establishes only evidenced timing. It does not establish sponsor interest, available budget, deal likelihood, or permission to contact anyone.",
  "READY_FOR_INTERNAL_REVIEW authorizes internal review only. External outreach and consequential actions remain approval-gated.",
] as const);

const DEFAULT_MAX_AGE_MS = 36 * 60 * 60 * 1_000;
const ACTIONABLE_PLANNING = new Set(["PLAN_AHEAD", "WINDOW_OPEN"]);
const VERIFY_PLANNING = new Set(["NEEDS_VERIFICATION"]);
const MISSED_PLANNING = new Set(["MISSED_PLANNING_WINDOW"]);

function timestamp(value: string, label: string): string {
  const parsed = Date.parse(value);
  if (!value || !Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp`);
  return new Date(parsed).toISOString();
}

function boundedMaxAge(value: number | undefined): number {
  if (value == null) return DEFAULT_MAX_AGE_MS;
  if (!Number.isFinite(value) || value <= 0 || value > 30 * 24 * 60 * 60 * 1_000) {
    throw new Error("maxAgeMs must be finite, positive, and no greater than 30 days");
  }
  return value;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function outsideFreshnessBound(sourceAt: string, evaluatedAtMs: number, maximumAgeMs: number): boolean {
  const sourceMs = Date.parse(sourceAt);
  return !Number.isFinite(sourceMs) || sourceMs > evaluatedAtMs || evaluatedAtMs - sourceMs > maximumAgeMs;
}

function empty(
  status: Exclude<SponsorPursuitEvidenceBriefV1["status"], "LIVE">,
  evaluatedAt: string,
  opportunityId: string | null,
  issues: readonly string[],
): SponsorPursuitEvidenceBriefV1 {
  return Object.freeze({
    contractVersion: SPONSOR_PURSUIT_EVIDENCE_BRIEF_VERSION_V1,
    status,
    opportunityId,
    evaluatedAt,
    buyers: Object.freeze([]),
    issues: Object.freeze(unique(issues)),
    limitations: LIMITATIONS,
    authority: AUTHORITY,
  });
}

function authorityIssues(input: Readonly<{
  qualification: OpportunityQualificationAccessBriefResultV1;
  roleReview: SponsorDecisionMakerRoleReviewV1;
  warmAccess: SponsorWarmAccessReviewV1;
  planning: SponsorPlanningWindowReviewV1;
}>): string[] {
  const issues: string[] = [];
  if (
    input.qualification.authority.analysisOnly !== true ||
    input.qualification.authority.internalReviewAllowed !== true ||
    input.qualification.authority.qualificationMutationAuthorized !== false ||
    input.qualification.authority.crmMutationAuthorized !== false ||
    input.qualification.authority.relationshipMutationAuthorized !== false ||
    input.qualification.authority.contactDiscoveryAuthorized !== false ||
    input.qualification.authority.outreachAuthorized !== false ||
    input.qualification.authority.spendAuthorized !== false ||
    input.qualification.authority.contractAuthorized !== false ||
    input.qualification.authority.externalActionAuthorized !== false
  ) issues.push("QUALIFICATION_AUTHORITY_WIDENED");
  if (
    input.roleReview.authority.outreachAllowed !== false ||
    input.roleReview.authority.crmMutationAllowed !== false ||
    input.roleReview.authority.opportunityMutationAllowed !== false ||
    input.roleReview.authority.approvalBypassAllowed !== false
  ) issues.push("ROLE_REVIEW_AUTHORITY_WIDENED");
  if (
    input.warmAccess.authority.outreachAllowed !== false ||
    input.warmAccess.authority.crmMutationAllowed !== false ||
    input.warmAccess.authority.opportunityMutationAllowed !== false ||
    input.warmAccess.authority.approvalBypassAllowed !== false
  ) issues.push("WARM_ACCESS_AUTHORITY_WIDENED");
  if (
    input.planning.authority.outreachAllowed !== false ||
    input.planning.authority.crmMutationAllowed !== false ||
    input.planning.authority.opportunityMutationAllowed !== false ||
    input.planning.authority.approvalBypassAllowed !== false
  ) issues.push("PLANNING_AUTHORITY_WIDENED");
  return issues;
}

function chooseDisposition(input: Readonly<{
  qualificationReady: boolean;
  qualificationVerify: boolean;
  upstreamVerificationRequired: boolean;
  hasWarmPath: boolean;
  planningDispositions: readonly string[];
}>): Readonly<{
  disposition: SponsorPursuitEvidenceDispositionV1;
  nextInternalAction: SponsorPursuitEvidenceNextActionV1;
  reasonCodes: readonly string[];
}> {
  const reasons: string[] = [];
  if (input.upstreamVerificationRequired || input.qualificationVerify || input.planningDispositions.some((value) => VERIFY_PLANNING.has(value))) {
    if (input.upstreamVerificationRequired) reasons.push("UPSTREAM_VERIFICATION_REQUIRED");
    if (input.qualificationVerify) reasons.push("QUALIFICATION_VERIFICATION_REQUIRED");
    if (input.planningDispositions.some((value) => VERIFY_PLANNING.has(value))) reasons.push("TIMING_VERIFICATION_REQUIRED");
    return {
      disposition: "VERIFY_REQUIRED",
      nextInternalAction: "VERIFY_UPSTREAM_EVIDENCE",
      reasonCodes: unique(reasons),
    };
  }

  if (!input.qualificationReady || !input.hasWarmPath || input.planningDispositions.length === 0) {
    if (!input.qualificationReady) reasons.push("QUALIFICATION_NOT_READY_FOR_INTERNAL_REVIEW");
    if (!input.hasWarmPath) reasons.push("EXACT_WARM_PATH_MISSING");
    if (input.planningDispositions.length === 0) reasons.push("EXACT_PLANNING_WINDOW_MISSING");
    return {
      disposition: "RESEARCH_REQUIRED",
      nextInternalAction: "RESEARCH_MISSING_ACCESS_OR_TIMING_EVIDENCE",
      reasonCodes: unique(reasons),
    };
  }

  if (input.planningDispositions.some((value) => ACTIONABLE_PLANNING.has(value))) {
    return {
      disposition: "READY_FOR_INTERNAL_REVIEW",
      nextInternalAction: "REVIEW_EVIDENCE_AND_PREPARE_APPROVAL_GATED_PITCH",
      reasonCodes: Object.freeze(["EXACT_EVIDENCE_STACK_AVAILABLE"]),
    };
  }

  if (input.planningDispositions.every((value) => MISSED_PLANNING.has(value))) {
    return {
      disposition: "TIMING_REVIEW_REQUIRED",
      nextInternalAction: "REVIEW_NEXT_PLANNING_CYCLE",
      reasonCodes: Object.freeze(["PLANNING_WINDOW_MISSED"]),
    };
  }

  return {
    disposition: "RESEARCH_REQUIRED",
    nextInternalAction: "RESEARCH_MISSING_ACCESS_OR_TIMING_EVIDENCE",
    reasonCodes: Object.freeze(["PLANNING_WINDOW_NOT_ACTIONABLE"]),
  };
}

/**
 * Joins four governed relationship/opportunity projections into one exact-buyer
 * internal review brief. This module never discovers contacts, creates graph
 * edges, infers sponsor interest, or grants outreach authority.
 */
export function buildSponsorPursuitEvidenceBriefV1(input: Readonly<{
  qualification: OpportunityQualificationAccessBriefResultV1 | null;
  roleReview: SponsorDecisionMakerRoleReviewV1 | null;
  warmAccess: SponsorWarmAccessReviewV1 | null;
  planning: SponsorPlanningWindowReviewV1 | null;
  evaluatedAt: string;
  maxAgeMs?: number;
}>): SponsorPursuitEvidenceBriefV1 {
  const evaluatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(evaluatedAt);
  const maximumAgeMs = boundedMaxAge(input.maxAgeMs);
  const opportunityId = input.roleReview?.opportunityId ?? input.warmAccess?.opportunityId ?? input.planning?.opportunityId ?? null;

  if (!input.qualification || !input.roleReview || !input.warmAccess || !input.planning) {
    return empty("UNAVAILABLE", evaluatedAt, opportunityId, [
      !input.qualification ? "QUALIFICATION_BRIEF_UNAVAILABLE" : "",
      !input.roleReview ? "ROLE_REVIEW_UNAVAILABLE" : "",
      !input.warmAccess ? "WARM_ACCESS_REVIEW_UNAVAILABLE" : "",
      !input.planning ? "PLANNING_REVIEW_UNAVAILABLE" : "",
    ]);
  }

  const qualification = input.qualification;
  const roleReview = input.roleReview;
  const warmAccess = input.warmAccess;
  const planning = input.planning;

  const authority = authorityIssues({
    qualification,
    roleReview,
    warmAccess,
    planning,
  });
  if (authority.length > 0) return empty("BLOCKED", evaluatedAt, opportunityId, authority);

  if (qualification.status !== "READY") {
    return empty("BLOCKED", evaluatedAt, opportunityId, ["QUALIFICATION_BRIEF_NOT_READY"]);
  }

  if ([roleReview.status, warmAccess.status, planning.status].includes("STALE")) {
    return empty("STALE", evaluatedAt, opportunityId, ["UPSTREAM_RELATIONSHIP_EVIDENCE_STALE"]);
  }
  if ([roleReview.status, warmAccess.status, planning.status].includes("UNAVAILABLE")) {
    return empty("UNAVAILABLE", evaluatedAt, opportunityId, ["UPSTREAM_RELATIONSHIP_EVIDENCE_UNAVAILABLE"]);
  }

  const ids = unique([
    roleReview.opportunityId ?? "",
    warmAccess.opportunityId ?? "",
    planning.opportunityId ?? "",
  ]);
  if (ids.length !== 1) return empty("BLOCKED", evaluatedAt, opportunityId, ["OPPORTUNITY_IDENTITY_MISMATCH"]);
  const exactOpportunityId = ids[0];
  if (!exactOpportunityId) return empty("BLOCKED", evaluatedAt, null, ["OPPORTUNITY_IDENTITY_MISSING"]);

  const sourceTimes = [
    qualification.generatedAt,
    roleReview.evaluatedAt,
    warmAccess.evaluatedAt,
    planning.evaluatedAt,
  ];
  if (sourceTimes.some((value) => outsideFreshnessBound(value, evaluatedAtMs, maximumAgeMs))) {
    return empty("STALE", evaluatedAt, exactOpportunityId, ["UPSTREAM_EVIDENCE_OUTSIDE_FRESHNESS_BOUND"]);
  }

  if (roleReview.bindings.length === 0) {
    return empty("NO_CURRENT_SPONSOR_BUYERS", evaluatedAt, exactOpportunityId, ["NO_CURRENT_SPONSOR_BUYER_BINDINGS"]);
  }

  const qualificationDecisions = qualification.decisions.filter(
    (decision) => decision.canonicalOpportunityRef === exactOpportunityId,
  );
  const qualificationReady = qualificationDecisions.filter(
    (decision) => decision.disposition === "READY_FOR_INTERNAL_REVIEW",
  );
  const qualificationVerify = qualificationDecisions.some((decision) => decision.disposition === "VERIFY_REQUIRED");
  const upstreamVerificationRequired = roleReview.verificationRequired || warmAccess.verificationRequired;

  const buyers: SponsorPursuitEvidenceBuyerV1[] = roleReview.bindings.map((role) => {
    const warm = warmAccess.bindings.filter(
      (binding) =>
        binding.personCanonicalId === role.personCanonicalId &&
        binding.organizationCanonicalId === role.organizationCanonicalId,
    );
    const timing = planning.bindings.filter(
      (binding) =>
        binding.personCanonicalId === role.personCanonicalId &&
        binding.organizationCanonicalId === role.organizationCanonicalId,
    );
    const planningDispositions = unique(timing.map((binding) => binding.disposition));
    const decision = chooseDisposition({
      qualificationReady: qualificationReady.length > 0,
      qualificationVerify,
      upstreamVerificationRequired,
      hasWarmPath: warm.length > 0,
      planningDispositions,
    });

    return Object.freeze({
      opportunityId: exactOpportunityId,
      personCanonicalId: role.personCanonicalId,
      personLabel: role.personLabel,
      organizationCanonicalId: role.organizationCanonicalId,
      organizationLabel: role.organizationLabel,
      decisionClass: role.decisionClass,
      currentRoleObservationId: role.currentRoleObservationId,
      title: role.title,
      decisionFunction: role.decisionFunction,
      authorityClass: role.authorityClass,
      qualificationCandidateIds: Object.freeze(unique(qualificationReady.map((item) => item.candidateId))),
      warmPathEvidenceIds: Object.freeze(unique(warm.flatMap((item) => item.warmPathEvidenceIds))),
      timingCandidateIds: Object.freeze(unique(timing.map((item) => item.timingCandidateId))),
      planningDispositions: Object.freeze(planningDispositions),
      evidenceRefs: Object.freeze(unique([
        ...role.evidenceRefs,
        ...qualificationDecisions.flatMap((item) => item.evidenceRefs),
        ...warm.flatMap((item) => item.evidenceRefs),
        ...timing.flatMap((item) => item.evidenceRefs),
      ])),
      disposition: decision.disposition,
      nextInternalAction: decision.nextInternalAction,
      reasonCodes: decision.reasonCodes,
      sponsorInterest: "NOT_ESTABLISHED" as const,
      budgetAvailability: "NOT_ESTABLISHED" as const,
      introductionWillingness: "NOT_ESTABLISHED" as const,
      opportunityCertainty: "NOT_ESTABLISHED" as const,
      confidence: "NOT_ESTABLISHED" as const,
      monetaryValue: null,
      outreachAuthority: "NOT_GRANTED" as const,
    });
  });

  buyers.sort(
    (left, right) =>
      left.organizationLabel.localeCompare(right.organizationLabel) ||
      left.personLabel.localeCompare(right.personLabel) ||
      left.personCanonicalId.localeCompare(right.personCanonicalId),
  );

  const issues = unique([
    qualificationDecisions.length === 0 ? "NO_EXACT_QUALIFICATION_DECISION" : "",
    roleReview.issues.length > 0 ? "ROLE_REVIEW_HAS_ISSUES" : "",
    warmAccess.issues.length > 0 ? "WARM_ACCESS_REVIEW_HAS_ISSUES" : "",
    planning.issues.length > 0 ? "PLANNING_REVIEW_HAS_ISSUES" : "",
  ]);

  return Object.freeze({
    contractVersion: SPONSOR_PURSUIT_EVIDENCE_BRIEF_VERSION_V1,
    status: "LIVE",
    opportunityId: exactOpportunityId,
    evaluatedAt,
    buyers: Object.freeze(buyers),
    issues: Object.freeze(issues),
    limitations: LIMITATIONS,
    authority: AUTHORITY,
  });
}
