import type { SponsorDecisionMakerSideReviewV1 } from "@/lib/opportunity-intelligence/sponsor-decision-maker-side-v1";
import type {
  EarlyPlanningDecisionV1,
  EarlyPlanningWindowResultV1,
} from "@/lib/relationship-intelligence/early-planning-window-v1";

export const SPONSOR_PLANNING_WINDOW_REVIEW_VERSION_V1 =
  "SponsorPlanningWindowReviewV1" as const;

export type SponsorPlanningWindowBindingV1 = Readonly<{
  personCanonicalId: string;
  personLabel: string;
  organizationCanonicalId: string;
  organizationLabel: string;
  decisionClass: string;
  timingCandidateId: string;
  disposition: EarlyPlanningDecisionV1["disposition"];
  idealOutreachDateRange: EarlyPlanningDecisionV1["idealOutreachDateRange"];
  activationDateRange: EarlyPlanningDecisionV1["activationDateRange"];
  whyThisWindow: string;
  coverageGaps: EarlyPlanningDecisionV1["coverageGaps"];
  safeNextStep: EarlyPlanningDecisionV1["safeNextStep"];
  evidenceRefs: readonly string[];
  outreachAuthority: "NOT_GRANTED";
  sponsorshipInterest: "NOT_ESTABLISHED";
  relationshipAccess: "NOT_ESTABLISHED";
}>;

export type SponsorPlanningWindowReviewV1 = Readonly<{
  contractVersion: typeof SPONSOR_PLANNING_WINDOW_REVIEW_VERSION_V1;
  status: "LIVE" | "NO_EXACT_MATCHES" | "STALE" | "UNAVAILABLE";
  opportunityId: string | null;
  evaluatedAt: string;
  bindings: readonly SponsorPlanningWindowBindingV1[];
  unmatchedTimingCandidateIds: readonly string[];
  issues: readonly string[];
  authority: Readonly<{
    outreachAllowed: false;
    crmMutationAllowed: false;
    opportunityMutationAllowed: false;
    approvalBypassAllowed: false;
  }>;
}>;

const AUTHORITY = Object.freeze({
  outreachAllowed: false,
  crmMutationAllowed: false,
  opportunityMutationAllowed: false,
  approvalBypassAllowed: false,
} as const);

const DEFAULT_MAX_AGE_MS = 36 * 60 * 60 * 1_000;

function timestamp(value: string, label: string): string {
  const parsed = Date.parse(value);
  if (!value || !Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp`);
  return new Date(parsed).toISOString();
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function maxAge(value: number | undefined): number {
  if (value == null) return DEFAULT_MAX_AGE_MS;
  if (!Number.isFinite(value) || value <= 0 || value > 30 * 24 * 60 * 60 * 1_000) {
    throw new Error("maxAgeMs must be finite, positive, and no greater than 30 days");
  }
  return value;
}

function stale(sourceAt: string, evaluatedAtMs: number, maximumAgeMs: number): boolean {
  const sourceMs = Date.parse(sourceAt);
  return !Number.isFinite(sourceMs) || sourceMs > evaluatedAtMs || evaluatedAtMs - sourceMs > maximumAgeMs;
}

function empty(
  status: Exclude<SponsorPlanningWindowReviewV1["status"], "LIVE">,
  evaluatedAt: string,
  opportunityId: string | null,
  issues: readonly string[],
): SponsorPlanningWindowReviewV1 {
  return Object.freeze({
    contractVersion: SPONSOR_PLANNING_WINDOW_REVIEW_VERSION_V1,
    status,
    opportunityId,
    evaluatedAt,
    bindings: Object.freeze([]),
    unmatchedTimingCandidateIds: Object.freeze([]),
    issues: Object.freeze(unique(issues)),
    authority: AUTHORITY,
  });
}

/**
 * Connects evidence-qualified sponsor-side decision makers to evidence-backed
 * planning windows only through exact canonical opportunity and organization
 * references. It is a review surface, never permission to contact anyone.
 */
export function buildSponsorPlanningWindowReviewV1(input: Readonly<{
  sideReview: SponsorDecisionMakerSideReviewV1 | null;
  planning: EarlyPlanningWindowResultV1 | null;
  evaluatedAt: string;
  maxAgeMs?: number;
}>): SponsorPlanningWindowReviewV1 {
  const evaluatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(evaluatedAt);
  const maximumAgeMs = maxAge(input.maxAgeMs);

  if (!input.sideReview || !input.planning) {
    return empty(
      "UNAVAILABLE",
      evaluatedAt,
      input.sideReview?.opportunityId ?? null,
      [
        !input.sideReview ? "SPONSOR_SIDE_REVIEW_UNAVAILABLE" : "",
        !input.planning ? "PLANNING_WINDOW_REVIEW_UNAVAILABLE" : "",
      ],
    );
  }

  const sideAsOf = timestamp(input.sideReview.asOf, "sideReview.asOf");
  const planningGeneratedAt = timestamp(input.planning.generatedAt, "planning.generatedAt");
  if (
    stale(sideAsOf, evaluatedAtMs, maximumAgeMs) ||
    stale(planningGeneratedAt, evaluatedAtMs, maximumAgeMs)
  ) {
    return empty("STALE", evaluatedAt, input.sideReview.opportunityId, ["SPONSOR_OR_TIMING_EVIDENCE_OUTSIDE_FRESHNESS_BOUND"]);
  }

  const sponsors = new Map(
    input.sideReview.decisionMakers
      .filter((maker) => maker.side === "SPONSOR_SIDE")
      .map((maker) => [`${maker.organizationCanonicalId}:${maker.personCanonicalId}`, maker]),
  );
  const sponsorOrganizations = new Map<string, typeof input.sideReview.decisionMakers[number][]>();
  for (const maker of sponsors.values()) {
    const current = sponsorOrganizations.get(maker.organizationCanonicalId) ?? [];
    current.push(maker);
    sponsorOrganizations.set(maker.organizationCanonicalId, current);
  }

  const bindings: SponsorPlanningWindowBindingV1[] = [];
  const unmatched = new Set<string>();

  for (const decision of input.planning.decisions) {
    if (decision.canonicalOpportunityRef !== input.sideReview.opportunityId) continue;
    if (!decision.canonicalOrganizationRef) {
      unmatched.add(decision.candidateId);
      continue;
    }
    const makers = sponsorOrganizations.get(decision.canonicalOrganizationRef) ?? [];
    if (makers.length === 0) {
      unmatched.add(decision.candidateId);
      continue;
    }

    for (const maker of makers) {
      bindings.push({
        personCanonicalId: maker.personCanonicalId,
        personLabel: maker.personLabel,
        organizationCanonicalId: maker.organizationCanonicalId,
        organizationLabel: maker.organizationLabel,
        decisionClass: maker.decisionClass,
        timingCandidateId: decision.candidateId,
        disposition: decision.disposition,
        idealOutreachDateRange: decision.idealOutreachDateRange ? { ...decision.idealOutreachDateRange } : null,
        activationDateRange: decision.activationDateRange ? { ...decision.activationDateRange } : null,
        whyThisWindow: decision.whyThisWindow,
        coverageGaps: [...decision.coverageGaps],
        safeNextStep: decision.safeNextStep,
        evidenceRefs: unique([...maker.evidenceRefs, ...decision.evidenceRefs]),
        outreachAuthority: "NOT_GRANTED",
        sponsorshipInterest: "NOT_ESTABLISHED",
        relationshipAccess: "NOT_ESTABLISHED",
      });
    }
  }

  bindings.sort(
    (left, right) =>
      left.organizationLabel.localeCompare(right.organizationLabel) ||
      left.personLabel.localeCompare(right.personLabel) ||
      left.timingCandidateId.localeCompare(right.timingCandidateId),
  );

  return Object.freeze({
    contractVersion: SPONSOR_PLANNING_WINDOW_REVIEW_VERSION_V1,
    status: bindings.length > 0 ? "LIVE" : "NO_EXACT_MATCHES",
    opportunityId: input.sideReview.opportunityId,
    evaluatedAt,
    bindings: Object.freeze(bindings.map((binding) => Object.freeze(binding))),
    unmatchedTimingCandidateIds: Object.freeze([...unmatched].sort((a, b) => a.localeCompare(b))),
    issues: Object.freeze(bindings.length > 0 ? [] : ["NO_EXACT_SPONSOR_SIDE_TIMING_MATCH"]),
    authority: AUTHORITY,
  });
}
