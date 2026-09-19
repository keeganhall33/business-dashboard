import type { SponsorDecisionMakerSideReviewV1 } from "@/lib/opportunity-intelligence/sponsor-decision-maker-side-v1";
import type {
  DecisionMakerRoleFreshnessResultV1,
  DecisionMakerRoleProjectionV1,
} from "@/lib/relationship-intelligence/decision-maker-role-freshness-v1";

export const SPONSOR_DECISION_MAKER_ROLE_REVIEW_VERSION_V1 =
  "SponsorDecisionMakerRoleReviewV1" as const;

export type SponsorDecisionMakerRoleBindingV1 = Readonly<{
  personCanonicalId: string;
  personLabel: string;
  organizationCanonicalId: string;
  organizationLabel: string;
  decisionClass: string;
  currentRoleObservationId: string;
  title: string;
  decisionFunction: string;
  authorityClass: string;
  roleObservedAt: string;
  evidenceRefs: readonly string[];
  roleState: "CURRENT_ROLE_EVIDENCED";
  outreachAuthority: "NOT_GRANTED";
}>;

export type SponsorDecisionMakerRoleWithheldReasonV1 =
  | "ROLE_NOT_FOUND"
  | "ROLE_ORGANIZATION_MISMATCH"
  | "ROLE_NOT_CURRENTLY_SUPPORTED"
  | "ROLE_AUTHORITY_NOT_USABLE"
  | "ROLE_REVALIDATION_REQUIRED";

export type SponsorDecisionMakerRoleWithheldV1 = Readonly<{
  personCanonicalId: string;
  organizationCanonicalId: string;
  reason: SponsorDecisionMakerRoleWithheldReasonV1;
  roleDisposition: DecisionMakerRoleProjectionV1["disposition"] | null;
  evidenceRefs: readonly string[];
}>;

export type SponsorDecisionMakerRoleReviewV1 = Readonly<{
  contractVersion: typeof SPONSOR_DECISION_MAKER_ROLE_REVIEW_VERSION_V1;
  status: "LIVE" | "NO_CURRENT_SPONSOR_BUYERS" | "STALE" | "UNAVAILABLE";
  opportunityId: string | null;
  evaluatedAt: string;
  bindings: readonly SponsorDecisionMakerRoleBindingV1[];
  withheld: readonly SponsorDecisionMakerRoleWithheldV1[];
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

function outsideFreshnessBound(sourceAt: string, evaluatedAtMs: number, maximumAgeMs: number): boolean {
  const sourceMs = Date.parse(sourceAt);
  return !Number.isFinite(sourceMs) || sourceMs > evaluatedAtMs || evaluatedAtMs - sourceMs > maximumAgeMs;
}

function empty(
  status: Exclude<SponsorDecisionMakerRoleReviewV1["status"], "LIVE">,
  evaluatedAt: string,
  opportunityId: string | null,
  issues: readonly string[],
): SponsorDecisionMakerRoleReviewV1 {
  return Object.freeze({
    contractVersion: SPONSOR_DECISION_MAKER_ROLE_REVIEW_VERSION_V1,
    status,
    opportunityId,
    evaluatedAt,
    bindings: Object.freeze([]),
    withheld: Object.freeze([]),
    issues: Object.freeze(unique(issues)),
    verificationRequired: true,
    authority: AUTHORITY,
  });
}

function roleWithheldReason(
  role: DecisionMakerRoleProjectionV1,
  expectedOrganizationId: string,
): SponsorDecisionMakerRoleWithheldReasonV1 | null {
  if (role.canonicalOrganizationRef !== expectedOrganizationId) return "ROLE_ORGANIZATION_MISMATCH";
  if (role.disposition !== "CURRENT_ROLE_SUPPORTED") return "ROLE_NOT_CURRENTLY_SUPPORTED";
  if (!role.authorityUsableForGraph) return "ROLE_AUTHORITY_NOT_USABLE";
  if (role.authorityRevalidationRequired) return "ROLE_REVALIDATION_REQUIRED";
  return null;
}

/**
 * Revalidates sponsor-side decision makers against the canonical role-freshness
 * projection. A sponsor buyer is usable here only when the exact canonical
 * person remains in the exact canonical organization and the role engine says
 * current authority is fully supported. No title/name similarity is used.
 */
export function buildSponsorDecisionMakerRoleReviewV1(input: Readonly<{
  sideReview: SponsorDecisionMakerSideReviewV1 | null;
  roleFreshness: DecisionMakerRoleFreshnessResultV1 | null;
  evaluatedAt: string;
  maxAgeMs?: number;
}>): SponsorDecisionMakerRoleReviewV1 {
  const evaluatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(evaluatedAt);
  const maximumAgeMs = maxAge(input.maxAgeMs);

  if (!input.sideReview || !input.roleFreshness) {
    return empty(
      "UNAVAILABLE",
      evaluatedAt,
      input.sideReview?.opportunityId ?? null,
      [
        !input.sideReview ? "SPONSOR_SIDE_REVIEW_UNAVAILABLE" : "",
        !input.roleFreshness ? "ROLE_FRESHNESS_REVIEW_UNAVAILABLE" : "",
      ],
    );
  }

  const sideAsOf = timestamp(input.sideReview.asOf, "sideReview.asOf");
  const roleGeneratedAt = timestamp(input.roleFreshness.generatedAt, "roleFreshness.generatedAt");
  if (
    outsideFreshnessBound(sideAsOf, evaluatedAtMs, maximumAgeMs) ||
    outsideFreshnessBound(roleGeneratedAt, evaluatedAtMs, maximumAgeMs)
  ) {
    return empty(
      "STALE",
      evaluatedAt,
      input.sideReview.opportunityId,
      ["SPONSOR_OR_ROLE_EVIDENCE_OUTSIDE_FRESHNESS_BOUND"],
    );
  }

  const rolesByPerson = new Map(
    input.roleFreshness.roles.map((role) => [role.canonicalPersonRef, role] as const),
  );
  const sponsorSide = input.sideReview.decisionMakers.filter((maker) => maker.side === "SPONSOR_SIDE");
  const bindings: SponsorDecisionMakerRoleBindingV1[] = [];
  const withheld: SponsorDecisionMakerRoleWithheldV1[] = [];

  for (const maker of sponsorSide) {
    const role = rolesByPerson.get(maker.personCanonicalId);
    if (!role) {
      withheld.push({
        personCanonicalId: maker.personCanonicalId,
        organizationCanonicalId: maker.organizationCanonicalId,
        reason: "ROLE_NOT_FOUND",
        roleDisposition: null,
        evidenceRefs: Object.freeze([...maker.evidenceRefs]),
      });
      continue;
    }

    const reason = roleWithheldReason(role, maker.organizationCanonicalId);
    if (reason) {
      withheld.push({
        personCanonicalId: maker.personCanonicalId,
        organizationCanonicalId: maker.organizationCanonicalId,
        reason,
        roleDisposition: role.disposition,
        evidenceRefs: Object.freeze(unique([...maker.evidenceRefs, ...role.evidenceRefs])),
      });
      continue;
    }

    if (
      !role.currentObservationId ||
      !role.title ||
      !role.decisionFunction ||
      !role.authorityClass ||
      !role.observedAt
    ) {
      withheld.push({
        personCanonicalId: maker.personCanonicalId,
        organizationCanonicalId: maker.organizationCanonicalId,
        reason: "ROLE_AUTHORITY_NOT_USABLE",
        roleDisposition: role.disposition,
        evidenceRefs: Object.freeze(unique([...maker.evidenceRefs, ...role.evidenceRefs])),
      });
      continue;
    }

    bindings.push(Object.freeze({
      personCanonicalId: maker.personCanonicalId,
      personLabel: maker.personLabel,
      organizationCanonicalId: maker.organizationCanonicalId,
      organizationLabel: maker.organizationLabel,
      decisionClass: maker.decisionClass,
      currentRoleObservationId: role.currentObservationId,
      title: role.title,
      decisionFunction: role.decisionFunction,
      authorityClass: role.authorityClass,
      roleObservedAt: role.observedAt,
      evidenceRefs: Object.freeze(unique([...maker.evidenceRefs, ...role.evidenceRefs])),
      roleState: "CURRENT_ROLE_EVIDENCED" as const,
      outreachAuthority: "NOT_GRANTED" as const,
    }));
  }

  bindings.sort(
    (left, right) =>
      left.organizationLabel.localeCompare(right.organizationLabel) ||
      left.personLabel.localeCompare(right.personLabel) ||
      left.decisionClass.localeCompare(right.decisionClass) ||
      left.personCanonicalId.localeCompare(right.personCanonicalId),
  );
  withheld.sort(
    (left, right) =>
      left.organizationCanonicalId.localeCompare(right.organizationCanonicalId) ||
      left.personCanonicalId.localeCompare(right.personCanonicalId) ||
      left.reason.localeCompare(right.reason),
  );

  const issues = unique([
    withheld.length > 0 ? "SPONSOR_DECISION_MAKER_ROLE_REVALIDATION_REQUIRED" : "",
    input.sideReview.verificationRequired ? "SPONSOR_SIDE_REVIEW_REQUIRES_VERIFICATION" : "",
  ]);

  return Object.freeze({
    contractVersion: SPONSOR_DECISION_MAKER_ROLE_REVIEW_VERSION_V1,
    status: bindings.length > 0 ? "LIVE" : "NO_CURRENT_SPONSOR_BUYERS",
    opportunityId: input.sideReview.opportunityId,
    evaluatedAt,
    bindings: Object.freeze(bindings),
    withheld: Object.freeze(withheld.map((entry) => Object.freeze(entry))),
    issues: Object.freeze(issues),
    verificationRequired: input.sideReview.verificationRequired || withheld.length > 0,
    authority: AUTHORITY,
  });
}
