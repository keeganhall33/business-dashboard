import type {
  CanonicalSocialAccountSnapshotV1,
  CanonicalSocialContentV1,
  SocialMetricKeyV1,
  SocialPlatformV1
} from "./social-canonical-v1";
import type {
  SocialContentOpportunityQueueV1,
  SocialContentOpportunityV1
} from "./social-content-opportunity-queue-v1";
import type {
  SocialBusinessOutcomeKindV1,
  SocialBusinessOutcomeLinkageV1,
  SocialOutcomeAttributionClassV1
} from "./social-business-outcome-linkage-v1";

export const SOCIAL_CONTENT_OUTCOME_REVIEW_V1_VERSION = "SocialContentOutcomeReviewV1" as const;

export type SocialContentOutcomeSuccessCriterionV1 = Readonly<
  | { kind: "MINIMUM_VALUE"; atLeast: number }
  | { kind: "MINIMUM_ABSOLUTE_LIFT"; atLeast: number; baselineContentId: string }
  | { kind: "MINIMUM_PERCENTAGE_LIFT"; atLeast: number; baselineContentId: string }
>;

export type SocialContentOutcomeVerificationReasonV1 =
  | "OPPORTUNITY_NOT_FOUND"
  | "TARGET_PLATFORM_MISMATCH"
  | "TARGET_SOURCE_NOT_DECISION_GRADE"
  | "TARGET_SNAPSHOT_FROM_FUTURE"
  | "TARGET_SNAPSHOT_TOO_OLD"
  | "TARGET_SYNC_TIMESTAMP_MISSING"
  | "TARGET_SYNC_TIMESTAMP_FROM_FUTURE"
  | "TARGET_CONTENT_NOT_FOUND"
  | "TARGET_CONTENT_PREDATES_RECOMMENDATION"
  | "EXECUTION_EVIDENCE_MISSING"
  | "TARGET_METRIC_NOT_COVERED"
  | "TARGET_METRIC_UNKNOWN"
  | "TARGET_METRIC_EVIDENCE_MISSING"
  | "OUTCOME_LINKAGE_FROM_FUTURE"
  | "BASELINE_CONTENT_NOT_FOUND"
  | "BASELINE_CONTENT_NOT_PRIOR"
  | "BASELINE_METRIC_UNKNOWN"
  | "BASELINE_METRIC_EVIDENCE_MISSING"
  | "BASELINE_ZERO_FOR_PERCENTAGE";

export type SocialContentOutcomeCriterionStateV1 = "MET" | "NOT_MET" | "NOT_DEFINED" | "UNVERIFIABLE";

export type SocialContentOutcomeReviewV1 = Readonly<{
  contractVersion: typeof SOCIAL_CONTENT_OUTCOME_REVIEW_V1_VERSION;
  evaluatedAt: string;
  status: "REVIEW_READY" | "VERIFY_REQUIRED";
  opportunityId: string;
  sourcePlatform: SocialPlatformV1 | null;
  targetPlatform: SocialPlatformV1 | null;
  targetContentRef: string | null;
  targetMetric: Extract<SocialMetricKeyV1, "LINK_CLICKS" | "PROFILE_VISITS" | "SAVES"> | null;
  observedMetricValue: number | null;
  baselineContentRef: string | null;
  baselineMetricValue: number | null;
  absoluteLift: number | null;
  percentageLift: number | null;
  criterion: SocialContentOutcomeSuccessCriterionV1 | null;
  criterionState: SocialContentOutcomeCriterionStateV1;
  linkedOutcomes: Readonly<{
    linkedOutcomeCount: number;
    directTrackedOutcomeCount: number;
    outcomeCounts: Readonly<Record<SocialBusinessOutcomeKindV1, number>>;
    strongestAttributionClass: Exclude<SocialOutcomeAttributionClassV1, "NOT_ESTABLISHED"> | null;
    evidenceRefs: readonly string[];
  }>;
  observationEvidenceRefs: readonly string[];
  verificationReasons: readonly SocialContentOutcomeVerificationReasonV1[];
  reviewCandidate: "GOVERNED_LEARNING_REVIEW" | "NONE";
  learningScope: "SINGLE_OBSERVATION_NOT_DURABLE_POLICY";
  causalClaim: false;
  revenueAttributionClaim: false;
  competitorPerformanceClaim: false;
  durableLearningAllowed: false;
  futurePriorUpdateAllowed: false;
  publicPostingAuthority: "NONE";
  limitations: readonly string[];
  externalAccessPerformed: false;
  writesPerformed: false;
}>;

export type SocialContentOutcomeReviewInputV1 = Readonly<{
  queue: SocialContentOpportunityQueueV1;
  opportunityId: string;
  targetSnapshot: CanonicalSocialAccountSnapshotV1;
  targetContentId: string;
  outcomeLinkage: SocialBusinessOutcomeLinkageV1;
  executionEvidenceRefs: readonly string[];
  evaluatedAt: string;
  maxSourceAgeHours: number;
  criterion?: SocialContentOutcomeSuccessCriterionV1 | null;
}>;

const ZERO_OUTCOME_COUNTS: Readonly<Record<SocialBusinessOutcomeKindV1, number>> = Object.freeze({
  SITE_SESSION: 0,
  EMAIL_SIGNUP: 0,
  INQUIRY: 0,
  PURCHASE: 0,
  OPPORTUNITY: 0,
  MEDIA_OUTCOME: 0
});

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function requireNonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} must be non-empty`);
  return normalized;
}

function requireIso(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!value || Number.isNaN(parsed)) throw new Error(`${field} must be a valid timestamp`);
  return new Date(parsed).toISOString();
}

function safeRef(value: string, field: string): string {
  const normalized = requireNonEmpty(value, field);
  if (/^op:\/\//i.test(normalized)) throw new Error(`${field} must not contain a secret reference`);
  return normalized;
}

function uniqueRefs(values: readonly string[], field: string): string[] {
  return [...new Set(values.map((value, index) => safeRef(value, `${field}[${index}]`)))].sort((a, b) => a.localeCompare(b));
}

function uniqueReasons(values: readonly SocialContentOutcomeVerificationReasonV1[]): SocialContentOutcomeVerificationReasonV1[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function contentRef(platform: SocialPlatformV1, contentId: string): string {
  return `${platform}:${contentId}`;
}

function normalizedCriterion(
  criterion: SocialContentOutcomeSuccessCriterionV1 | null | undefined
): SocialContentOutcomeSuccessCriterionV1 | null {
  if (!criterion) return null;
  if (!Number.isFinite(criterion.atLeast) || criterion.atLeast < 0) {
    throw new Error("criterion.atLeast must be a finite non-negative number");
  }
  if (criterion.kind === "MINIMUM_VALUE") return freeze({ ...criterion });
  if (criterion.kind === "MINIMUM_ABSOLUTE_LIFT" || criterion.kind === "MINIMUM_PERCENTAGE_LIFT") {
    return freeze({ ...criterion, baselineContentId: requireNonEmpty(criterion.baselineContentId, "criterion.baselineContentId") });
  }
  throw new Error("criterion.kind is unsupported");
}

function targetMetricObservation(
  content: CanonicalSocialContentV1,
  metric: Extract<SocialMetricKeyV1, "LINK_CLICKS" | "PROFILE_VISITS" | "SAVES">
) {
  return content.metrics[metric];
}

function findOpportunity(
  queue: SocialContentOpportunityQueueV1,
  opportunityId: string
): SocialContentOpportunityV1 | null {
  return queue.opportunities.find((row) => row.opportunityId === opportunityId) ?? null;
}

function criterionState(
  criterion: SocialContentOutcomeSuccessCriterionV1 | null,
  observedMetricValue: number | null,
  absoluteLift: number | null,
  percentageLift: number | null,
  reasons: readonly SocialContentOutcomeVerificationReasonV1[]
): SocialContentOutcomeCriterionStateV1 {
  if (!criterion) return "NOT_DEFINED";
  if (reasons.length > 0 || observedMetricValue == null) return "UNVERIFIABLE";
  if (criterion.kind === "MINIMUM_VALUE") return observedMetricValue >= criterion.atLeast ? "MET" : "NOT_MET";
  if (criterion.kind === "MINIMUM_ABSOLUTE_LIFT") {
    return absoluteLift != null && absoluteLift >= criterion.atLeast ? "MET" : "NOT_MET";
  }
  return percentageLift != null && percentageLift >= criterion.atLeast ? "MET" : "NOT_MET";
}

/**
 * Reviews one explicitly observed target content action against the exact
 * evidence-gated opportunity that preceded it. This compiler does not infer
 * execution, thresholds, causality, revenue attribution, confidence, or a
 * durable lesson. It only creates a bounded candidate for governed review.
 */
export function compileSocialContentOutcomeReviewV1(
  input: SocialContentOutcomeReviewInputV1
): SocialContentOutcomeReviewV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!Number.isFinite(input.maxSourceAgeHours) || input.maxSourceAgeHours <= 0) {
    throw new Error("maxSourceAgeHours must be a finite positive number");
  }

  const evaluatedAt = requireIso(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(evaluatedAt);
  const opportunityId = requireNonEmpty(input.opportunityId, "opportunityId");
  const targetContentId = requireNonEmpty(input.targetContentId, "targetContentId");
  const executionEvidenceRefs = uniqueRefs(input.executionEvidenceRefs ?? [], "executionEvidenceRefs");
  const criterion = normalizedCriterion(input.criterion);
  const opportunity = findOpportunity(input.queue, opportunityId);
  const reasons: SocialContentOutcomeVerificationReasonV1[] = [];

  const queueGeneratedAt = requireIso(input.queue.generatedAt, "queue.generatedAt");
  if (Date.parse(queueGeneratedAt) > evaluatedAtMs) throw new Error("queue.generatedAt must not be after evaluatedAt");

  if (!opportunity) reasons.push("OPPORTUNITY_NOT_FOUND");

  const snapshot = input.targetSnapshot;
  if (opportunity && snapshot.platform !== opportunity.targetPlatform) reasons.push("TARGET_PLATFORM_MISMATCH");
  if (snapshot.sourceCoverage.effectiveState !== "CONNECTED_AND_INGESTING" || snapshot.sourceCoverage.freshness !== "FRESH") {
    reasons.push("TARGET_SOURCE_NOT_DECISION_GRADE");
  }
  const retrievedAt = requireIso(snapshot.retrievedAt, "targetSnapshot.retrievedAt");
  const retrievedAtMs = Date.parse(retrievedAt);
  if (retrievedAtMs > evaluatedAtMs) reasons.push("TARGET_SNAPSHOT_FROM_FUTURE");
  if (evaluatedAtMs - retrievedAtMs > input.maxSourceAgeHours * 3_600_000) reasons.push("TARGET_SNAPSHOT_TOO_OLD");

  const lastSyncAt = snapshot.sourceCoverage.lastSuccessfulSyncAt;
  if (!lastSyncAt) reasons.push("TARGET_SYNC_TIMESTAMP_MISSING");
  else {
    const syncAtMs = Date.parse(requireIso(lastSyncAt, "targetSnapshot.sourceCoverage.lastSuccessfulSyncAt"));
    if (syncAtMs > evaluatedAtMs) reasons.push("TARGET_SYNC_TIMESTAMP_FROM_FUTURE");
    if (evaluatedAtMs - syncAtMs > input.maxSourceAgeHours * 3_600_000) reasons.push("TARGET_SNAPSHOT_TOO_OLD");
  }

  const targetContent = snapshot.content.find((row) => row.contentId === targetContentId) ?? null;
  if (!targetContent) reasons.push("TARGET_CONTENT_NOT_FOUND");
  if (targetContent && Date.parse(targetContent.publishedAt) < Date.parse(queueGeneratedAt)) {
    reasons.push("TARGET_CONTENT_PREDATES_RECOMMENDATION");
  }
  if (executionEvidenceRefs.length === 0) reasons.push("EXECUTION_EVIDENCE_MISSING");

  const targetMetric = opportunity?.targetSuccessMetric ?? null;
  let observedMetricValue: number | null = null;
  let targetMetricEvidenceRefs: string[] = [];
  if (targetMetric) {
    if (!snapshot.sourceCoverage.metricCoverage.includes(targetMetric)) reasons.push("TARGET_METRIC_NOT_COVERED");
    if (targetContent) {
      const observation = targetMetricObservation(targetContent, targetMetric);
      observedMetricValue = observation.value;
      targetMetricEvidenceRefs = [...observation.evidenceRefs];
      if (observation.truthState !== "KNOWN" || observation.value == null) reasons.push("TARGET_METRIC_UNKNOWN");
      if (observation.evidenceRefs.length === 0) reasons.push("TARGET_METRIC_EVIDENCE_MISSING");
    }
  }

  const linkageGeneratedAt = requireIso(input.outcomeLinkage.generatedAt, "outcomeLinkage.generatedAt");
  if (Date.parse(linkageGeneratedAt) > evaluatedAtMs) reasons.push("OUTCOME_LINKAGE_FROM_FUTURE");

  let baselineContentRef: string | null = null;
  let baselineMetricValue: number | null = null;
  let baselineEvidenceRefs: string[] = [];
  let absoluteLift: number | null = null;
  let percentageLift: number | null = null;

  if (criterion && criterion.kind !== "MINIMUM_VALUE" && targetMetric) {
    const baselineContent = snapshot.content.find((row) => row.contentId === criterion.baselineContentId) ?? null;
    baselineContentRef = contentRef(snapshot.platform, criterion.baselineContentId);
    if (!baselineContent) reasons.push("BASELINE_CONTENT_NOT_FOUND");
    else {
      if (targetContent && Date.parse(baselineContent.publishedAt) >= Date.parse(targetContent.publishedAt)) {
        reasons.push("BASELINE_CONTENT_NOT_PRIOR");
      }
      const baselineObservation = targetMetricObservation(baselineContent, targetMetric);
      baselineMetricValue = baselineObservation.value;
      baselineEvidenceRefs = [...baselineObservation.evidenceRefs];
      if (baselineObservation.truthState !== "KNOWN" || baselineObservation.value == null) reasons.push("BASELINE_METRIC_UNKNOWN");
      if (baselineObservation.evidenceRefs.length === 0) reasons.push("BASELINE_METRIC_EVIDENCE_MISSING");
      if (observedMetricValue != null && baselineObservation.value != null) {
        absoluteLift = observedMetricValue - baselineObservation.value;
        if (baselineObservation.value === 0) {
          if (criterion.kind === "MINIMUM_PERCENTAGE_LIFT") reasons.push("BASELINE_ZERO_FOR_PERCENTAGE");
        } else {
          percentageLift = (absoluteLift / Math.abs(baselineObservation.value)) * 100;
        }
      }
    }
  }

  const targetRef = opportunity ? contentRef(opportunity.targetPlatform, targetContentId) : null;
  const linkedSummary = targetRef
    ? input.outcomeLinkage.byContent.find((row) => row.socialContentRef === targetRef) ?? null
    : null;

  const linkedOutcomes = freeze({
    linkedOutcomeCount: linkedSummary?.linkedOutcomeCount ?? 0,
    directTrackedOutcomeCount: linkedSummary?.directTrackedOutcomeCount ?? 0,
    outcomeCounts: freeze(linkedSummary ? { ...linkedSummary.outcomeCounts } : { ...ZERO_OUTCOME_COUNTS }),
    strongestAttributionClass: linkedSummary?.strongestAttributionClass ?? null,
    evidenceRefs: uniqueRefs(linkedSummary?.evidenceRefs ?? [], "linkedOutcomes.evidenceRefs")
  });

  const verificationReasons = uniqueReasons(reasons);
  const evaluatedCriterionState = criterionState(
    criterion,
    observedMetricValue,
    absoluteLift,
    percentageLift,
    verificationReasons
  );
  const status: SocialContentOutcomeReviewV1["status"] = verificationReasons.length ? "VERIFY_REQUIRED" : "REVIEW_READY";
  const observationEvidenceRefs = uniqueRefs([
    ...executionEvidenceRefs,
    ...targetMetricEvidenceRefs,
    ...baselineEvidenceRefs,
    ...linkedOutcomes.evidenceRefs,
    ...(opportunity?.firstPartyEvidenceRefs ?? [])
  ], "observationEvidenceRefs");

  return freeze({
    contractVersion: SOCIAL_CONTENT_OUTCOME_REVIEW_V1_VERSION,
    evaluatedAt,
    status,
    opportunityId,
    sourcePlatform: opportunity?.sourcePlatform ?? null,
    targetPlatform: opportunity?.targetPlatform ?? null,
    targetContentRef: targetRef,
    targetMetric,
    observedMetricValue,
    baselineContentRef,
    baselineMetricValue,
    absoluteLift,
    percentageLift,
    criterion,
    criterionState: evaluatedCriterionState,
    linkedOutcomes,
    observationEvidenceRefs,
    verificationReasons,
    reviewCandidate: status === "REVIEW_READY" && (evaluatedCriterionState === "MET" || evaluatedCriterionState === "NOT_MET")
      ? "GOVERNED_LEARNING_REVIEW"
      : "NONE",
    learningScope: "SINGLE_OBSERVATION_NOT_DURABLE_POLICY",
    causalClaim: false,
    revenueAttributionClaim: false,
    competitorPerformanceClaim: false,
    durableLearningAllowed: false,
    futurePriorUpdateAllowed: false,
    publicPostingAuthority: "NONE",
    limitations: [
      "Meeting or missing a caller-supplied criterion is an observed review fact, not proof that the recommendation caused the result.",
      "Exact tracking may support a downstream association but never upgrades this review to a causal or revenue-attribution claim.",
      "No success threshold, confidence value, competitor performance, endorsement, relationship, monetary value, or durable lesson is inferred here.",
      "One observed result can enter governed learning review but cannot directly change future priors, policy, posting, spend, or execution authority."
    ],
    externalAccessPerformed: false,
    writesPerformed: false
  });
}
