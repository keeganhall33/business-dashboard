import type {
  SocialContentBusinessValueReviewItemV1,
  SocialContentBusinessValueReviewV1
} from "./social-content-business-value-review-v1";
import type { SocialPlatformV1 } from "./social-canonical-v1";

export const SOCIAL_PLATFORM_ROLE_EVIDENCE_REVIEW_V1_VERSION = "SocialPlatformRoleEvidenceReviewV1" as const;
export const SOCIAL_PLATFORM_ROLE_EVIDENCE_REVIEW_MAX_ITEMS_V1 = 500;

export const SOCIAL_PLATFORM_ROLES_V1 = [
  "DISCOVERY",
  "COMMUNITY",
  "TRAFFIC",
  "BUSINESS_DEVELOPMENT",
  "COMMERCE",
  "MEDIA_AUTHORITY"
] as const;

export type SocialPlatformRoleV1 = (typeof SOCIAL_PLATFORM_ROLES_V1)[number];
export type SocialPlatformRoleEvidenceStateV1 = "EVIDENCE_CANDIDATE" | "NOT_ESTABLISHED";

export type SocialPlatformRoleEvidenceItemV1 = Readonly<{
  role: SocialPlatformRoleV1;
  state: SocialPlatformRoleEvidenceStateV1;
  distinctContentCount: number;
  directTrackedContentCount: number;
  contentRefs: readonly string[];
  evidenceRefs: readonly string[];
  basis: readonly string[];
}>;

export type SocialPlatformRoleAccountReviewV1 = Readonly<{
  platform: SocialPlatformV1;
  accountId: string;
  observedContentCount: number;
  roles: readonly SocialPlatformRoleEvidenceItemV1[];
}>;

export type SocialPlatformRoleEvidenceReviewV1 = Readonly<{
  contractVersion: typeof SOCIAL_PLATFORM_ROLE_EVIDENCE_REVIEW_V1_VERSION;
  evaluatedAt: string;
  status: "READY" | "NO_EVIDENCE" | "VERIFY_REQUIRED";
  accounts: readonly SocialPlatformRoleAccountReviewV1[];
  evidenceRefs: readonly string[];
  limitations: readonly string[];
  crossPlatformRankingAuthority: "NONE";
  causalClaim: false;
  attributionClaim: false;
  confidenceClaim: false;
  monetaryValue: null;
  recommendationAuthority: "NONE";
  providerWriteAuthority: "NONE";
  notificationAuthority: "NONE";
  externalAccessPerformed: false;
  writesPerformed: false;
}>;

export type SocialPlatformRoleEvidenceReviewInputV1 = Readonly<{
  businessValueReview: SocialContentBusinessValueReviewV1;
  evaluatedAt: string;
  maxReviewAgeHours: number;
  minimumDistinctContentPerRole: number;
}>;

const ROLE_ORDER = new Map<SocialPlatformRoleV1, number>(
  SOCIAL_PLATFORM_ROLES_V1.map((role, index) => [role, index])
);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value;
}

function timestamp(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be a non-empty timestamp`);
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new Error(`${field} must be a valid timestamp`);
  return new Date(parsed).toISOString();
}

function positive(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be a finite positive number`);
  }
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function safeRef(value: string, field: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${field} must be non-empty`);
  if (/^op:\/\//i.test(normalized)) throw new Error(`${field} must not contain a secret reference`);
  return normalized;
}

function unique(values: readonly string[], field = "evidenceRefs"): string[] {
  return [...new Set(values.map((value, index) => safeRef(value, `${field}[${index}]`)))].sort((a, b) => a.localeCompare(b));
}

function contentRef(item: SocialContentBusinessValueReviewItemV1): string {
  return `${item.platform}:${item.contentId}`;
}

function validateReview(review: SocialContentBusinessValueReviewV1): void {
  if (review.contractVersion !== "SocialContentBusinessValueReviewV1") {
    throw new Error("businessValueReview contractVersion is invalid");
  }
  if (review.items.length > SOCIAL_PLATFORM_ROLE_EVIDENCE_REVIEW_MAX_ITEMS_V1) {
    throw new Error("businessValueReview exceeds the supported bound");
  }
  if (
    review.causalClaim !== false ||
    review.revenueAttributionClaim !== false ||
    review.monetaryValue !== null ||
    review.competitorPerformanceClaim !== false ||
    review.endorsementClaim !== false ||
    review.recommendationAuthority !== "NONE" ||
    review.providerWriteAuthority !== "NONE" ||
    review.notificationAuthority !== "NONE" ||
    review.externalAccessPerformed !== false ||
    review.writesPerformed !== false
  ) {
    throw new Error("businessValueReview widens interpretation or action authority");
  }

  const seen = new Set<string>();
  for (const [index, item] of review.items.entries()) {
    const expectedRef = contentRef(item);
    if (item.contentRef !== expectedRef) throw new Error(`businessValueReview.items[${index}] content identity drift`);
    const identity = `${item.platform}\u0000${item.accountId}\u0000${item.contentId}`;
    if (seen.has(identity)) throw new Error(`duplicate business-value content item: ${identity}`);
    seen.add(identity);
    if (
      item.causalClaim !== false ||
      item.revenueAttributionClaim !== false ||
      item.monetaryValue !== null ||
      item.competitorPerformanceClaim !== false ||
      item.endorsementClaim !== false ||
      item.recommendationAuthority !== "NONE" ||
      item.providerWriteAuthority !== "NONE" ||
      item.notificationAuthority !== "NONE"
    ) {
      throw new Error(`businessValueReview item widens interpretation or action authority: ${expectedRef}`);
    }
    unique(item.performanceEvidenceRefs, `businessValueReview.items[${index}].performanceEvidenceRefs`);
    unique(item.outcomeEvidenceRefs, `businessValueReview.items[${index}].outcomeEvidenceRefs`);
  }
}

type RoleAccumulator = {
  role: SocialPlatformRoleV1;
  contentRefs: Set<string>;
  directTrackedContentRefs: Set<string>;
  evidenceRefs: Set<string>;
  basis: Set<string>;
};

function newAccumulator(role: SocialPlatformRoleV1): RoleAccumulator {
  return {
    role,
    contentRefs: new Set<string>(),
    directTrackedContentRefs: new Set<string>(),
    evidenceRefs: new Set<string>(),
    basis: new Set<string>()
  };
}

function addEvidence(
  accumulator: RoleAccumulator,
  item: SocialContentBusinessValueReviewItemV1,
  refs: readonly string[],
  basis: string,
  directTracked = false
): void {
  accumulator.contentRefs.add(item.contentRef);
  if (directTracked) accumulator.directTrackedContentRefs.add(item.contentRef);
  for (const ref of refs) accumulator.evidenceRefs.add(ref);
  accumulator.basis.add(basis);
}

function accumulateItem(
  accumulators: Map<SocialPlatformRoleV1, RoleAccumulator>,
  item: SocialContentBusinessValueReviewItemV1
): void {
  if (item.reachState === "HIGHER_THAN_COMPARABLE") {
    addEvidence(
      accumulators.get("DISCOVERY")!,
      item,
      item.performanceEvidenceRefs,
      "Within-platform comparable REACH/VIEWS evidence is outperforming."
    );
  }

  const communityMetrics = item.outperformingEngagementMetrics.filter(
    (metric) => metric === "COMMENTS" || metric === "SHARES" || metric === "SAVES"
  );
  if (item.engagementState === "OUTPERFORMING" && communityMetrics.length > 0) {
    addEvidence(
      accumulators.get("COMMUNITY")!,
      item,
      item.performanceEvidenceRefs,
      `Within-platform comparable community engagement evidence is outperforming for ${communityMetrics.join(", ")}.`
    );
  }

  const trackedSiteSessions = item.outcomeCounts?.SITE_SESSION ?? 0;
  if (item.highIntentMetrics.includes("LINK_CLICKS")) {
    addEvidence(
      accumulators.get("TRAFFIC")!,
      item,
      item.performanceEvidenceRefs,
      "Within-platform comparable LINK_CLICKS evidence is outperforming."
    );
  }
  if (trackedSiteSessions > 0) {
    addEvidence(
      accumulators.get("TRAFFIC")!,
      item,
      item.outcomeEvidenceRefs,
      "Canonical downstream linkage includes one or more observed SITE_SESSION outcomes.",
      item.directTrackedOutcomeCount > 0
    );
  }

  const businessDevelopmentOutcomes = (item.outcomeCounts?.INQUIRY ?? 0) + (item.outcomeCounts?.OPPORTUNITY ?? 0);
  if (businessDevelopmentOutcomes > 0) {
    addEvidence(
      accumulators.get("BUSINESS_DEVELOPMENT")!,
      item,
      item.outcomeEvidenceRefs,
      "Canonical downstream linkage includes one or more observed INQUIRY or OPPORTUNITY outcomes.",
      item.directTrackedOutcomeCount > 0
    );
  }

  if ((item.outcomeCounts?.PURCHASE ?? 0) > 0) {
    addEvidence(
      accumulators.get("COMMERCE")!,
      item,
      item.outcomeEvidenceRefs,
      "Canonical downstream linkage includes one or more observed PURCHASE outcomes.",
      item.directTrackedOutcomeCount > 0
    );
  }

  if ((item.outcomeCounts?.MEDIA_OUTCOME ?? 0) > 0) {
    addEvidence(
      accumulators.get("MEDIA_AUTHORITY")!,
      item,
      item.outcomeEvidenceRefs,
      "Canonical downstream linkage includes one or more observed MEDIA_OUTCOME records.",
      item.directTrackedOutcomeCount > 0
    );
  }
}

function roleItem(accumulator: RoleAccumulator, minimumDistinctContentPerRole: number): SocialPlatformRoleEvidenceItemV1 {
  const contentRefs = [...accumulator.contentRefs].sort((a, b) => a.localeCompare(b));
  const evidenceRefs = [...accumulator.evidenceRefs].sort((a, b) => a.localeCompare(b));
  const state: SocialPlatformRoleEvidenceStateV1 = contentRefs.length >= minimumDistinctContentPerRole && evidenceRefs.length > 0
    ? "EVIDENCE_CANDIDATE"
    : "NOT_ESTABLISHED";

  return deepFreeze({
    role: accumulator.role,
    state,
    distinctContentCount: contentRefs.length,
    directTrackedContentCount: accumulator.directTrackedContentRefs.size,
    contentRefs,
    evidenceRefs,
    basis: [...accumulator.basis].sort((a, b) => a.localeCompare(b))
  });
}

function emptyResult(
  evaluatedAt: string,
  status: "NO_EVIDENCE" | "VERIFY_REQUIRED",
  limitations: readonly string[]
): SocialPlatformRoleEvidenceReviewV1 {
  return deepFreeze({
    contractVersion: SOCIAL_PLATFORM_ROLE_EVIDENCE_REVIEW_V1_VERSION,
    evaluatedAt,
    status,
    accounts: [],
    evidenceRefs: [],
    limitations: [...limitations],
    crossPlatformRankingAuthority: "NONE",
    causalClaim: false,
    attributionClaim: false,
    confidenceClaim: false,
    monetaryValue: null,
    recommendationAuthority: "NONE",
    providerWriteAuthority: "NONE",
    notificationAuthority: "NONE",
    externalAccessPerformed: false,
    writesPerformed: false
  });
}

export function compileSocialPlatformRoleEvidenceReviewV1(
  input: SocialPlatformRoleEvidenceReviewInputV1
): SocialPlatformRoleEvidenceReviewV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  const evaluatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(evaluatedAt);
  const maxReviewAgeHours = positive(input.maxReviewAgeHours, "maxReviewAgeHours");
  const minimumDistinctContentPerRole = positiveInteger(
    input.minimumDistinctContentPerRole,
    "minimumDistinctContentPerRole"
  );

  validateReview(input.businessValueReview);
  const sourceEvaluatedAt = timestamp(input.businessValueReview.evaluatedAt, "businessValueReview.evaluatedAt");
  const sourceEvaluatedAtMs = Date.parse(sourceEvaluatedAt);
  if (sourceEvaluatedAtMs > evaluatedAtMs) {
    return emptyResult(evaluatedAt, "VERIFY_REQUIRED", [
      "The canonical business-value review is from the future relative to this platform-role review."
    ]);
  }
  if (evaluatedAtMs - sourceEvaluatedAtMs > maxReviewAgeHours * 3_600_000) {
    return emptyResult(evaluatedAt, "VERIFY_REQUIRED", [
      "The canonical business-value review is older than the caller-owned freshness limit."
    ]);
  }
  if (input.businessValueReview.status === "VERIFY_REQUIRED") {
    return emptyResult(evaluatedAt, "VERIFY_REQUIRED", [
      "The canonical business-value review requires verification; platform-role evidence was not promoted."
    ]);
  }
  if (input.businessValueReview.status === "NO_EVIDENCE" || input.businessValueReview.items.length === 0) {
    return emptyResult(evaluatedAt, "NO_EVIDENCE", [
      "No decision-grade first-party content evidence is available for platform-role review."
    ]);
  }

  const grouped = new Map<string, {
    platform: SocialPlatformV1;
    accountId: string;
    items: SocialContentBusinessValueReviewItemV1[];
  }>();

  for (const item of input.businessValueReview.items) {
    const key = `${item.platform}\u0000${item.accountId}`;
    const existing = grouped.get(key);
    if (existing) existing.items.push(item);
    else grouped.set(key, { platform: item.platform, accountId: item.accountId, items: [item] });
  }

  const accounts = [...grouped.values()].map((group): SocialPlatformRoleAccountReviewV1 => {
    const accumulators = new Map<SocialPlatformRoleV1, RoleAccumulator>(
      SOCIAL_PLATFORM_ROLES_V1.map((role) => [role, newAccumulator(role)])
    );
    for (const item of group.items) accumulateItem(accumulators, item);
    const roles = [...accumulators.values()]
      .map((accumulator) => roleItem(accumulator, minimumDistinctContentPerRole))
      .sort((left, right) => (ROLE_ORDER.get(left.role) ?? 999) - (ROLE_ORDER.get(right.role) ?? 999));

    return deepFreeze({
      platform: group.platform,
      accountId: group.accountId,
      observedContentCount: group.items.length,
      roles
    });
  }).sort((left, right) => {
    const platform = left.platform.localeCompare(right.platform);
    return platform !== 0 ? platform : left.accountId.localeCompare(right.accountId);
  });

  const evidenceRefs = unique(accounts.flatMap((account) => account.roles.flatMap((role) => role.evidenceRefs)));

  return deepFreeze({
    contractVersion: SOCIAL_PLATFORM_ROLE_EVIDENCE_REVIEW_V1_VERSION,
    evaluatedAt,
    status: "READY",
    accounts,
    evidenceRefs,
    limitations: [
      "Role evidence is descriptive and account-scoped. It does not rank one platform above another because platform metrics and audiences are not assumed comparable.",
      "DISCOVERY and COMMUNITY candidates require repeated within-platform comparable performance evidence; TRAFFIC and downstream role candidates require the corresponding observed platform or linked business evidence.",
      "Prestige, collector intent, and long-form authority are not inferred from reach, engagement, traffic, commerce, opportunity, or media outcomes. They remain unestablished until a separate explicit evidence contract exists.",
      "A repeated association is not causal proof, confidence, expected future performance, monetary value, or authority to change content, posting cadence, paid support, spend, or provider settings."
    ],
    crossPlatformRankingAuthority: "NONE",
    causalClaim: false,
    attributionClaim: false,
    confidenceClaim: false,
    monetaryValue: null,
    recommendationAuthority: "NONE",
    providerWriteAuthority: "NONE",
    notificationAuthority: "NONE",
    externalAccessPerformed: false,
    writesPerformed: false
  });
}
