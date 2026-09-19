import type { OpportunityAccessPathNodeV1 } from "@/lib/opportunity-intelligence/opportunity-access-map-v1";
import type { SponsorDecisionMakerSideReviewV1 } from "@/lib/opportunity-intelligence/sponsor-decision-maker-side-v1";

export const SPONSOR_WARM_ACCESS_REVIEW_VERSION_V1 = "SponsorWarmAccessReviewV1" as const;

export type SponsorWarmAccessBindingV1 = Readonly<{
  personCanonicalId: string;
  personLabel: string;
  organizationCanonicalId: string;
  organizationLabel: string;
  decisionClass: string;
  path: readonly OpportunityAccessPathNodeV1[];
  reasonForIntroduction: string;
  decisionMakerEvidenceIds: readonly string[];
  warmPathEvidenceIds: readonly string[];
  evidenceRefs: readonly string[];
  relationshipAccess: "EVIDENCED_PATH_ONLY";
  introductionWillingness: "NOT_ESTABLISHED";
  outreachAuthority: "NOT_GRANTED";
}>;

export type SponsorWarmAccessReviewV1 = Readonly<{
  contractVersion: typeof SPONSOR_WARM_ACCESS_REVIEW_VERSION_V1;
  status: "LIVE" | "NO_EXACT_MATCHES" | "STALE" | "UNAVAILABLE";
  opportunityId: string | null;
  evaluatedAt: string;
  bindings: readonly SponsorWarmAccessBindingV1[];
  sponsorSideBuyerIdsWithoutWarmPath: readonly string[];
  unmatchedWarmPathEvidenceIds: readonly string[];
  issues: readonly string[];
  verificationRequired: boolean;
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

function sourceOutsideFreshnessBound(sourceAt: string, evaluatedAtMs: number, maximumAgeMs: number): boolean {
  const sourceMs = Date.parse(sourceAt);
  return !Number.isFinite(sourceMs) || sourceMs > evaluatedAtMs || evaluatedAtMs - sourceMs > maximumAgeMs;
}

function copyPath(path: readonly OpportunityAccessPathNodeV1[]): readonly OpportunityAccessPathNodeV1[] {
  return Object.freeze(path.map((node) => Object.freeze({ ...node })));
}

function empty(
  status: Exclude<SponsorWarmAccessReviewV1["status"], "LIVE">,
  evaluatedAt: string,
  opportunityId: string | null,
  issues: readonly string[],
  verificationRequired: boolean,
): SponsorWarmAccessReviewV1 {
  return Object.freeze({
    contractVersion: SPONSOR_WARM_ACCESS_REVIEW_VERSION_V1,
    status,
    opportunityId,
    evaluatedAt,
    bindings: Object.freeze([]),
    sponsorSideBuyerIdsWithoutWarmPath: Object.freeze([]),
    unmatchedWarmPathEvidenceIds: Object.freeze([]),
    issues: Object.freeze(unique(issues)),
    verificationRequired,
    authority: AUTHORITY,
  });
}

/**
 * Binds evidence-qualified sponsor-side decision makers to evidence-backed warm
 * access paths only when the final path node is the exact canonical buyer.
 * Organization-only or fuzzy-label matches are deliberately not promoted.
 * This is a review projection and never permission to request an introduction
 * or contact a buyer.
 */
export function buildSponsorWarmAccessReviewV1(input: Readonly<{
  sideReview: SponsorDecisionMakerSideReviewV1 | null;
  evaluatedAt: string;
  maxAgeMs?: number;
}>): SponsorWarmAccessReviewV1 {
  const evaluatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(evaluatedAt);
  const maximumAgeMs = maxAge(input.maxAgeMs);

  if (!input.sideReview) {
    return empty("UNAVAILABLE", evaluatedAt, null, ["SPONSOR_SIDE_REVIEW_UNAVAILABLE"], true);
  }

  const sideAsOf = timestamp(input.sideReview.asOf, "sideReview.asOf");
  if (sourceOutsideFreshnessBound(sideAsOf, evaluatedAtMs, maximumAgeMs)) {
    return empty(
      "STALE",
      evaluatedAt,
      input.sideReview.opportunityId,
      ["SPONSOR_ACCESS_EVIDENCE_OUTSIDE_FRESHNESS_BOUND"],
      true,
    );
  }

  const sponsorSideBuyers = input.sideReview.decisionMakers.filter((maker) => maker.side === "SPONSOR_SIDE");
  const sponsorByPersonId = new Map<string, typeof sponsorSideBuyers>();
  for (const maker of sponsorSideBuyers) {
    const current = sponsorByPersonId.get(maker.personCanonicalId) ?? [];
    current.push(maker);
    sponsorByPersonId.set(maker.personCanonicalId, current);
  }

  const bindings: SponsorWarmAccessBindingV1[] = [];
  const matchedBuyerIds = new Set<string>();
  const unmatchedWarmPathEvidenceIds = new Set<string>();

  for (const warmPath of input.sideReview.accessMap.warmAccessPaths) {
    const terminal = warmPath.path.at(-1);
    if (!terminal || terminal.entityType !== "PERSON") {
      for (const evidenceId of warmPath.evidenceIds) unmatchedWarmPathEvidenceIds.add(evidenceId);
      continue;
    }

    const buyers = sponsorByPersonId.get(terminal.canonicalId) ?? [];
    if (buyers.length === 0) {
      for (const evidenceId of warmPath.evidenceIds) unmatchedWarmPathEvidenceIds.add(evidenceId);
      continue;
    }

    for (const buyer of buyers) {
      matchedBuyerIds.add(buyer.personCanonicalId);
      bindings.push({
        personCanonicalId: buyer.personCanonicalId,
        personLabel: buyer.personLabel,
        organizationCanonicalId: buyer.organizationCanonicalId,
        organizationLabel: buyer.organizationLabel,
        decisionClass: buyer.decisionClass,
        path: copyPath(warmPath.path),
        reasonForIntroduction: warmPath.reasonForIntroduction,
        decisionMakerEvidenceIds: Object.freeze([...buyer.decisionMakerEvidenceIds]),
        warmPathEvidenceIds: Object.freeze([...warmPath.evidenceIds]),
        evidenceRefs: Object.freeze(unique([...buyer.evidenceRefs, ...warmPath.evidenceRefs])),
        relationshipAccess: "EVIDENCED_PATH_ONLY",
        introductionWillingness: "NOT_ESTABLISHED",
        outreachAuthority: "NOT_GRANTED",
      });
    }
  }

  bindings.sort(
    (left, right) =>
      left.organizationLabel.localeCompare(right.organizationLabel) ||
      left.personLabel.localeCompare(right.personLabel) ||
      left.decisionClass.localeCompare(right.decisionClass) ||
      left.warmPathEvidenceIds.join("|").localeCompare(right.warmPathEvidenceIds.join("|")),
  );

  const sponsorSideBuyerIdsWithoutWarmPath = unique(
    sponsorSideBuyers
      .filter((buyer) => !matchedBuyerIds.has(buyer.personCanonicalId))
      .map((buyer) => buyer.personCanonicalId),
  );
  const unmatched = [...unmatchedWarmPathEvidenceIds].sort((a, b) => a.localeCompare(b));
  const issues = unique([
    sponsorSideBuyerIdsWithoutWarmPath.length > 0 ? "SPONSOR_SIDE_BUYER_WITHOUT_EXACT_WARM_PATH" : "",
    unmatched.length > 0 ? "WARM_PATH_NOT_BOUND_TO_SPONSOR_SIDE_BUYER" : "",
    input.sideReview.verificationRequired ? "SPONSOR_SIDE_REVIEW_REQUIRES_VERIFICATION" : "",
  ]);

  return Object.freeze({
    contractVersion: SPONSOR_WARM_ACCESS_REVIEW_VERSION_V1,
    status: bindings.length > 0 ? "LIVE" : "NO_EXACT_MATCHES",
    opportunityId: input.sideReview.opportunityId,
    evaluatedAt,
    bindings: Object.freeze(bindings.map((binding) => Object.freeze(binding))),
    sponsorSideBuyerIdsWithoutWarmPath: Object.freeze(sponsorSideBuyerIdsWithoutWarmPath),
    unmatchedWarmPathEvidenceIds: Object.freeze(unmatched),
    issues: Object.freeze(issues),
    verificationRequired:
      input.sideReview.verificationRequired || sponsorSideBuyerIdsWithoutWarmPath.length > 0,
    authority: AUTHORITY,
  });
}
