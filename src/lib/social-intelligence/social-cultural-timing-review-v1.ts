import type { SocialContentOpportunityQueueV1 } from "./social-content-opportunity-queue-v1";

export const SOCIAL_CULTURAL_TIMING_REVIEW_V1_VERSION = "SocialCulturalTimingReviewV1" as const;
export const SOCIAL_CULTURAL_TIMING_MAX_OBSERVATIONS_V1 = 500;

export const SOCIAL_EXTERNAL_TIMING_SOURCE_KINDS_V1 = [
  "OFFICIAL_EVENT_PAGE",
  "OFFICIAL_SCHEDULE",
  "OFFICIAL_ANNOUNCEMENT",
  "PUBLIC_EVENT_CALENDAR",
  "PUBLIC_NEWS_REPORT",
  "PUBLIC_REFERENCE_PAGE"
] as const;
export type SocialExternalTimingSourceKindV1 = (typeof SOCIAL_EXTERNAL_TIMING_SOURCE_KINDS_V1)[number];

export const SOCIAL_EXTERNAL_TIMING_SIGNAL_KINDS_V1 = [
  "SPORT_EVENT",
  "MUSIC_EVENT",
  "CULTURAL_EVENT",
  "ANNIVERSARY",
  "NEWS_MOMENT",
  "MARKET_MOMENT"
] as const;
export type SocialExternalTimingSignalKindV1 = (typeof SOCIAL_EXTERNAL_TIMING_SIGNAL_KINDS_V1)[number];

export type SocialExternalTimingObservationInputV1 = Readonly<{
  observationId: string;
  signalId: string;
  signalKind: SocialExternalTimingSignalKindV1;
  subject: string;
  sourceKind: SocialExternalTimingSourceKindV1;
  sourceRef: string;
  observedAt: string;
  capturedAt: string;
  windowStartAt: string;
  windowEndAt: string;
  evidenceRefs: readonly string[];
}>;

export type SocialCulturalTimingPolicyV1 = Readonly<{
  maxObservationAgeHours: number;
  lookaheadHours: number;
  minIndependentPublicSources: number;
}>;

export type SocialExternalTimingObservationV1 = Readonly<{
  observationId: string;
  signalId: string;
  signalKind: SocialExternalTimingSignalKindV1;
  subject: string;
  sourceKind: SocialExternalTimingSourceKindV1;
  sourceRef: string;
  observedAt: string;
  capturedAt: string;
  windowStartAt: string;
  windowEndAt: string;
  evidenceRefs: readonly string[];
  freshness: "CURRENT" | "STALE";
  officialSource: boolean;
  performanceClaim: false;
  competitorPerformanceClaim: false;
  relationshipClaim: false;
  endorsementClaim: false;
}>;

export type SocialExternalTimingSignalV1 = Readonly<{
  signalId: string;
  signalKind: SocialExternalTimingSignalKindV1;
  subject: string;
  windowStartAt: string;
  windowEndAt: string;
  state: "CURRENT_SUPPORTED" | "VERIFY_REQUIRED" | "STALE_ONLY";
  withinLookahead: boolean;
  hoursUntilWindowStart: number | null;
  currentObservationIds: readonly string[];
  staleObservationIds: readonly string[];
  independentCurrentSourceCount: number;
  officialCurrentSourceCount: number;
  sourceRefs: readonly string[];
  evidenceRefs: readonly string[];
  supportBasis: "OFFICIAL_SOURCE" | "INDEPENDENT_PUBLIC_SOURCES" | "INSUFFICIENT_CURRENT_SUPPORT" | "STALE_ONLY";
  expectedPerformance: null;
  causalClaim: false;
  competitorPerformanceClaim: false;
  relationshipClaim: false;
  endorsementClaim: false;
}>;

export type SocialOpportunityTimingReviewStateV1 =
  | "READY_FOR_TIMING_REVIEW"
  | "VERIFY_REQUIRED"
  | "NO_CURRENT_TIMING_SIGNAL";

export type SocialOpportunityTimingReviewItemV1 = Readonly<{
  opportunityId: string;
  existingRank: number;
  subjectDirection: string;
  state: SocialOpportunityTimingReviewStateV1;
  supportedSignalIds: readonly string[];
  verificationSignalIds: readonly string[];
  nearestWindowStartAt: string | null;
  hoursUntilNearestWindowStart: number | null;
  evidenceRefs: readonly string[];
  alertReviewCandidate: boolean;
  rankChanged: false;
  expectedPerformance: null;
  causalClaim: false;
  attributionClaim: false;
  competitorPerformanceClaim: false;
  relationshipClaim: false;
  endorsementClaim: false;
  executionAuthority: "NONE";
}>;

export type SocialCulturalTimingReviewInputV1 = Readonly<{
  generatedAt: string;
  queue: SocialContentOpportunityQueueV1;
  observations: readonly SocialExternalTimingObservationInputV1[];
  policy: SocialCulturalTimingPolicyV1;
}>;

export type SocialCulturalTimingReviewV1 = Readonly<{
  contractVersion: typeof SOCIAL_CULTURAL_TIMING_REVIEW_V1_VERSION;
  generatedAt: string;
  status: "READY_FOR_REVIEW" | "VERIFY_REQUIRED" | "NO_CURRENT_SIGNAL" | "UPSTREAM_INSUFFICIENT_EVIDENCE";
  observations: readonly SocialExternalTimingObservationV1[];
  signals: readonly SocialExternalTimingSignalV1[];
  opportunityReviews: readonly SocialOpportunityTimingReviewItemV1[];
  unmatchedSupportedSignalIds: readonly string[];
  limitations: readonly string[];
  notificationAuthority: "NONE";
  postingAuthority: "NONE";
  externalAccessPerformed: false;
  writesPerformed: false;
}>;

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function nonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} must be non-empty`);
  return normalized;
}

function iso(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!value || Number.isNaN(parsed)) throw new Error(`${field} must be a valid timestamp`);
  return new Date(parsed).toISOString();
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function normalizedSubject(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function officialSource(kind: SocialExternalTimingSourceKindV1): boolean {
  return kind === "OFFICIAL_EVENT_PAGE" || kind === "OFFICIAL_SCHEDULE" || kind === "OFFICIAL_ANNOUNCEMENT";
}

function unsafeRef(value: string): boolean {
  return /(?:authorization\s*:\s*bearer|[?&](?:access_token|token|api_key|client_secret|password)=|(?:access[_-]?token|api[_-]?key|client[_-]?secret|password)\s*[:=])/i.test(value);
}

function positiveFinite(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${field} must be a finite positive number`);
  return value;
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${field} must be a positive integer`);
  return value;
}

function normalizeObservation(
  input: SocialExternalTimingObservationInputV1,
  generatedAt: string,
  maxObservationAgeHours: number,
  seenIds: Set<string>
): SocialExternalTimingObservationV1 {
  const observationId = nonEmpty(input.observationId, "observationId");
  if (seenIds.has(observationId)) throw new Error(`duplicate observationId: ${observationId}`);
  seenIds.add(observationId);

  if (!(SOCIAL_EXTERNAL_TIMING_SOURCE_KINDS_V1 as readonly string[]).includes(input.sourceKind)) {
    throw new Error(`${observationId}.sourceKind must be a supported public/compliant source`);
  }
  if (!(SOCIAL_EXTERNAL_TIMING_SIGNAL_KINDS_V1 as readonly string[]).includes(input.signalKind)) {
    throw new Error(`${observationId}.signalKind is unsupported`);
  }

  const signalId = nonEmpty(input.signalId, `${observationId}.signalId`);
  const subject = nonEmpty(input.subject, `${observationId}.subject`).replace(/\s+/g, " ");
  const sourceRef = nonEmpty(input.sourceRef, `${observationId}.sourceRef`);
  const observedAt = iso(input.observedAt, `${observationId}.observedAt`);
  const capturedAt = iso(input.capturedAt, `${observationId}.capturedAt`);
  const windowStartAt = iso(input.windowStartAt, `${observationId}.windowStartAt`);
  const windowEndAt = iso(input.windowEndAt, `${observationId}.windowEndAt`);
  const evidenceRefs = unique(input.evidenceRefs ?? []);

  if (!evidenceRefs.length) throw new Error(`${observationId} requires public/compliant evidence`);
  if ([sourceRef, ...evidenceRefs].some(unsafeRef)) throw new Error(`${observationId} contains secret-like provenance`);
  if (Date.parse(observedAt) > Date.parse(capturedAt)) {
    throw new Error(`${observationId}.observedAt cannot be after capturedAt`);
  }
  if (Date.parse(capturedAt) > Date.parse(generatedAt)) {
    throw new Error(`${observationId}.capturedAt cannot be after generatedAt`);
  }
  if (Date.parse(windowEndAt) < Date.parse(windowStartAt)) {
    throw new Error(`${observationId}.windowEndAt cannot be before windowStartAt`);
  }

  const freshness = Date.parse(generatedAt) - Date.parse(capturedAt) <= maxObservationAgeHours * 3_600_000
    ? "CURRENT"
    : "STALE";

  return freeze({
    observationId,
    signalId,
    signalKind: input.signalKind,
    subject,
    sourceKind: input.sourceKind,
    sourceRef,
    observedAt,
    capturedAt,
    windowStartAt,
    windowEndAt,
    evidenceRefs,
    freshness,
    officialSource: officialSource(input.sourceKind),
    performanceClaim: false,
    competitorPerformanceClaim: false,
    relationshipClaim: false,
    endorsementClaim: false
  });
}

function sameSignalIdentity(
  left: SocialExternalTimingObservationV1,
  right: SocialExternalTimingObservationV1
): boolean {
  return left.signalKind === right.signalKind &&
    normalizedSubject(left.subject) === normalizedSubject(right.subject) &&
    left.windowStartAt === right.windowStartAt &&
    left.windowEndAt === right.windowEndAt;
}

function compileSignal(
  observations: readonly SocialExternalTimingObservationV1[],
  generatedAt: string,
  policy: SocialCulturalTimingPolicyV1
): SocialExternalTimingSignalV1 {
  const first = observations[0];
  if (!first) throw new Error("signal group requires at least one observation");
  for (const row of observations.slice(1)) {
    if (!sameSignalIdentity(first, row)) {
      throw new Error(`conflicting external timing identity for signalId: ${first.signalId}`);
    }
  }

  const current = observations.filter((row) => row.freshness === "CURRENT");
  const stale = observations.filter((row) => row.freshness === "STALE");
  const independentCurrentSources = new Set(current.map((row) => row.sourceRef));
  const officialCurrentSources = new Set(current.filter((row) => row.officialSource).map((row) => row.sourceRef));
  const hasOfficial = officialCurrentSources.size > 0;
  const hasEnoughPublic = independentCurrentSources.size >= policy.minIndependentPublicSources;

  let state: SocialExternalTimingSignalV1["state"];
  let supportBasis: SocialExternalTimingSignalV1["supportBasis"];
  if (!current.length) {
    state = "STALE_ONLY";
    supportBasis = "STALE_ONLY";
  } else if (hasOfficial) {
    state = "CURRENT_SUPPORTED";
    supportBasis = "OFFICIAL_SOURCE";
  } else if (hasEnoughPublic) {
    state = "CURRENT_SUPPORTED";
    supportBasis = "INDEPENDENT_PUBLIC_SOURCES";
  } else {
    state = "VERIFY_REQUIRED";
    supportBasis = "INSUFFICIENT_CURRENT_SUPPORT";
  }

  const nowMs = Date.parse(generatedAt);
  const horizonMs = nowMs + policy.lookaheadHours * 3_600_000;
  const startMs = Date.parse(first.windowStartAt);
  const endMs = Date.parse(first.windowEndAt);
  const withinLookahead = endMs >= nowMs && startMs <= horizonMs;
  const hoursUntilWindowStart = endMs < nowMs
    ? null
    : Math.max(0, Math.round(((startMs - nowMs) / 3_600_000) * 100) / 100);

  return freeze({
    signalId: first.signalId,
    signalKind: first.signalKind,
    subject: first.subject,
    windowStartAt: first.windowStartAt,
    windowEndAt: first.windowEndAt,
    state,
    withinLookahead,
    hoursUntilWindowStart,
    currentObservationIds: unique(current.map((row) => row.observationId)),
    staleObservationIds: unique(stale.map((row) => row.observationId)),
    independentCurrentSourceCount: independentCurrentSources.size,
    officialCurrentSourceCount: officialCurrentSources.size,
    sourceRefs: unique(current.map((row) => row.sourceRef)),
    evidenceRefs: unique(current.flatMap((row) => row.evidenceRefs)),
    supportBasis,
    expectedPerformance: null,
    causalClaim: false,
    competitorPerformanceClaim: false,
    relationshipClaim: false,
    endorsementClaim: false
  });
}

function opportunityReview(
  opportunity: SocialContentOpportunityQueueV1["opportunities"][number],
  signals: readonly SocialExternalTimingSignalV1[]
): SocialOpportunityTimingReviewItemV1 | null {
  if (!opportunity.subjectDirection) return null;
  const subject = normalizedSubject(opportunity.subjectDirection);
  const matched = signals.filter((signal) => normalizedSubject(signal.subject) === subject);
  const supported = matched.filter((signal) => signal.state === "CURRENT_SUPPORTED" && signal.withinLookahead);
  const verification = matched.filter((signal) =>
    signal.withinLookahead && (signal.state === "VERIFY_REQUIRED" || signal.state === "STALE_ONLY")
  );

  let state: SocialOpportunityTimingReviewStateV1 = "NO_CURRENT_TIMING_SIGNAL";
  if (supported.length) state = "READY_FOR_TIMING_REVIEW";
  else if (verification.length) state = "VERIFY_REQUIRED";

  const nearest = supported
    .slice()
    .sort((a, b) => Date.parse(a.windowStartAt) - Date.parse(b.windowStartAt) || a.signalId.localeCompare(b.signalId))[0] ?? null;

  return freeze({
    opportunityId: opportunity.opportunityId,
    existingRank: opportunity.rank,
    subjectDirection: opportunity.subjectDirection,
    state,
    supportedSignalIds: unique(supported.map((signal) => signal.signalId)),
    verificationSignalIds: unique(verification.map((signal) => signal.signalId)),
    nearestWindowStartAt: nearest?.windowStartAt ?? null,
    hoursUntilNearestWindowStart: nearest?.hoursUntilWindowStart ?? null,
    evidenceRefs: unique([...opportunity.firstPartyEvidenceRefs, ...supported.flatMap((signal) => signal.evidenceRefs)]),
    alertReviewCandidate: state === "READY_FOR_TIMING_REVIEW",
    rankChanged: false,
    expectedPerformance: null,
    causalClaim: false,
    attributionClaim: false,
    competitorPerformanceClaim: false,
    relationshipClaim: false,
    endorsementClaim: false,
    executionAuthority: "NONE"
  });
}

export function compileSocialCulturalTimingReviewV1(
  input: SocialCulturalTimingReviewInputV1
): SocialCulturalTimingReviewV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.observations)) throw new Error("observations must be an array");
  if (input.observations.length > SOCIAL_CULTURAL_TIMING_MAX_OBSERVATIONS_V1) {
    throw new Error(`at most ${SOCIAL_CULTURAL_TIMING_MAX_OBSERVATIONS_V1} external timing observations are allowed`);
  }

  const generatedAt = iso(input.generatedAt, "generatedAt");
  const policy = freeze({
    maxObservationAgeHours: positiveFinite(input.policy.maxObservationAgeHours, "policy.maxObservationAgeHours"),
    lookaheadHours: positiveFinite(input.policy.lookaheadHours, "policy.lookaheadHours"),
    minIndependentPublicSources: positiveInteger(
      input.policy.minIndependentPublicSources,
      "policy.minIndependentPublicSources"
    )
  });

  const queueGeneratedAt = iso(input.queue.generatedAt, "queue.generatedAt");
  if (Date.parse(queueGeneratedAt) > Date.parse(generatedAt)) {
    throw new Error("queue.generatedAt cannot be after generatedAt");
  }
  if (input.queue.postingAuthority !== "NONE" || input.queue.writesPerformed || input.queue.externalAccessPerformed) {
    throw new Error("queue authority widened beyond the canonical read-only content opportunity contract");
  }

  const seenIds = new Set<string>();
  const observations = freeze(
    input.observations
      .map((row) => normalizeObservation(row, generatedAt, policy.maxObservationAgeHours, seenIds))
      .sort((a, b) => a.signalId.localeCompare(b.signalId) || a.observationId.localeCompare(b.observationId))
  );

  const grouped = new Map<string, SocialExternalTimingObservationV1[]>();
  for (const observation of observations) {
    const rows = grouped.get(observation.signalId) ?? [];
    rows.push(observation);
    grouped.set(observation.signalId, rows);
  }
  const signals = freeze(
    [...grouped.entries()]
      .map(([, rows]) => compileSignal(rows, generatedAt, policy))
      .sort((a, b) => Date.parse(a.windowStartAt) - Date.parse(b.windowStartAt) || a.signalId.localeCompare(b.signalId))
  );

  const opportunityReviews = freeze(
    input.queue.opportunities
      .map((opportunity) => opportunityReview(opportunity, signals))
      .filter((row): row is SocialOpportunityTimingReviewItemV1 => row !== null)
      .sort((a, b) => a.existingRank - b.existingRank || a.opportunityId.localeCompare(b.opportunityId))
  );

  const matchedSupportedIds = new Set(opportunityReviews.flatMap((row) => row.supportedSignalIds));
  const unmatchedSupportedSignalIds = unique(
    signals
      .filter((signal) => signal.state === "CURRENT_SUPPORTED" && signal.withinLookahead)
      .map((signal) => signal.signalId)
      .filter((signalId) => !matchedSupportedIds.has(signalId))
  );

  const status: SocialCulturalTimingReviewV1["status"] = input.queue.status === "INSUFFICIENT_EVIDENCE"
    ? "UPSTREAM_INSUFFICIENT_EVIDENCE"
    : opportunityReviews.some((row) => row.state === "READY_FOR_TIMING_REVIEW")
      ? "READY_FOR_REVIEW"
      : opportunityReviews.some((row) => row.state === "VERIFY_REQUIRED")
        ? "VERIFY_REQUIRED"
        : "NO_CURRENT_SIGNAL";

  return freeze({
    contractVersion: SOCIAL_CULTURAL_TIMING_REVIEW_V1_VERSION,
    generatedAt,
    status,
    observations,
    signals,
    opportunityReviews,
    unmatchedSupportedSignalIds,
    limitations: [
      "External timing evidence can add review context only; it never changes the existing content-opportunity rank or establishes expected performance.",
      "Opportunity matching is exact normalized subject matching only. No fuzzy, semantic, sponsorship, relationship, endorsement, or competitor-performance inference is performed.",
      "A current official source can establish a timing window. Non-official public sources require the caller-supplied minimum number of independent source references.",
      "A timing match is not evidence that publishing will perform better, cause engagement, create revenue, or produce any business outcome.",
      "This contract performs no web/provider access, posting, paid-media changes, notifications, persistence writes, or other external action."
    ],
    notificationAuthority: "NONE",
    postingAuthority: "NONE",
    externalAccessPerformed: false,
    writesPerformed: false
  });
}
