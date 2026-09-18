import type {
  CanonicalSocialAccountSnapshotV1,
  SocialAttributionConfidenceV1,
  SocialPlatformV1
} from "./social-canonical-v1";

export const SOCIAL_BUSINESS_OUTCOME_KINDS_V1 = [
  "SITE_SESSION",
  "EMAIL_SIGNUP",
  "INQUIRY",
  "PURCHASE",
  "OPPORTUNITY",
  "MEDIA_OUTCOME"
] as const;

export type SocialBusinessOutcomeKindV1 = (typeof SOCIAL_BUSINESS_OUTCOME_KINDS_V1)[number];

export const SOCIAL_BUSINESS_OUTCOME_SOURCES_V1 = [
  "GA4",
  "WEBSITE",
  "EMAIL",
  "COMMERCE",
  "CRM",
  "MEDIA",
  "OTHER"
] as const;

export type SocialBusinessOutcomeSourceV1 = (typeof SOCIAL_BUSINESS_OUTCOME_SOURCES_V1)[number];
export type SocialBusinessOutcomeTruthStateV1 = "KNOWN" | "INFERRED" | "UNKNOWN" | "STALE" | "PARTIAL" | "CONFLICTED";
export type SocialOutcomeLinkBasisV1 = "EXACT_CONTENT_REF" | "EXACT_TRACKING_REF" | "EXACT_CAMPAIGN_REF";
export type SocialOutcomeLinkDispositionV1 = "DIRECT_LINK" | "ASSOCIATED_LINK" | "VERIFY_REQUIRED" | "UNLINKED";
export type SocialOutcomeAttributionClassV1 = "DIRECT_TRACKED" | "SUPPORTED_ASSOCIATION" | "NOT_ESTABLISHED";

export type SocialContentRefV1 = {
  platform: SocialPlatformV1;
  contentId: string;
};

export type SocialOutcomeLinkEvidenceInputV1 = {
  basis: SocialOutcomeLinkBasisV1;
  attributionRef: string;
  evidenceRefs: readonly string[];
};

export type SocialBusinessOutcomeObservationInputV1 = {
  outcomeId: string;
  kind: SocialBusinessOutcomeKindV1;
  source: SocialBusinessOutcomeSourceV1;
  sourceRecordRef: string;
  occurredAt: string;
  observedAt: string;
  truthState: SocialBusinessOutcomeTruthStateV1;
  completeThroughAt?: string | null;
  evidenceRefs: readonly string[];
  socialContentRef?: SocialContentRefV1 | null;
  linkEvidence?: SocialOutcomeLinkEvidenceInputV1 | null;
};

export type SocialBusinessOutcomeLinkageInputV1 = {
  generatedAt: string;
  socialSnapshots: readonly CanonicalSocialAccountSnapshotV1[];
  outcomes: readonly SocialBusinessOutcomeObservationInputV1[];
};

export type SocialBusinessOutcomeLinkageRowV1 = {
  outcomeId: string;
  kind: SocialBusinessOutcomeKindV1;
  source: SocialBusinessOutcomeSourceV1;
  sourceRecordRef: string;
  occurredAt: string;
  observedAt: string;
  completeThroughAt: string | null;
  truthState: SocialBusinessOutcomeTruthStateV1;
  socialContentRef: string | null;
  platform: SocialPlatformV1 | null;
  contentId: string | null;
  linkBasis: SocialOutcomeLinkBasisV1 | null;
  attributionRef: string | null;
  upstreamAttributionConfidence: SocialAttributionConfidenceV1 | null;
  disposition: SocialOutcomeLinkDispositionV1;
  attributionClass: SocialOutcomeAttributionClassV1;
  evidenceRefs: readonly string[];
  verificationReasons: readonly string[];
  causalClaim: false;
  revenueAttributionClaim: false;
  monetaryValue: null;
};

export type SocialContentBusinessOutcomeSummaryV1 = {
  socialContentRef: string;
  platform: SocialPlatformV1;
  contentId: string;
  linkedOutcomeCount: number;
  directTrackedOutcomeCount: number;
  outcomeCounts: Readonly<Record<SocialBusinessOutcomeKindV1, number>>;
  strongestAttributionClass: Exclude<SocialOutcomeAttributionClassV1, "NOT_ESTABLISHED">;
  evidenceRefs: readonly string[];
  causalClaim: false;
  revenueAttributionClaim: false;
  monetaryValue: null;
};

export type SocialBusinessOutcomeLinkageV1 = {
  contractVersion: "SocialBusinessOutcomeLinkageV1";
  generatedAt: string;
  rows: readonly SocialBusinessOutcomeLinkageRowV1[];
  byContent: readonly SocialContentBusinessOutcomeSummaryV1[];
  limitations: readonly string[];
  externalAccessPerformed: false;
  writesPerformed: false;
};

const INPUT_KEYS = new Set(["generatedAt", "socialSnapshots", "outcomes"]);
const OUTCOME_KEYS = new Set([
  "outcomeId",
  "kind",
  "source",
  "sourceRecordRef",
  "occurredAt",
  "observedAt",
  "truthState",
  "completeThroughAt",
  "evidenceRefs",
  "socialContentRef",
  "linkEvidence"
]);
const CONTENT_REF_KEYS = new Set(["platform", "contentId"]);
const LINK_KEYS = new Set(["basis", "attributionRef", "evidenceRefs"]);

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function assertPlainObject(value: unknown, field: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object`);
}

function assertAllowedKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, field: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${field}.${key} is not supported`);
  }
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
  return [...new Set(values.map((value, index) => safeRef(value, `${field}[${index}]`)))].sort((left, right) => left.localeCompare(right));
}

function contentKey(ref: SocialContentRefV1): string {
  return `${ref.platform}:${ref.contentId}`;
}

function zeroOutcomeCounts(): Record<SocialBusinessOutcomeKindV1, number> {
  return {
    SITE_SESSION: 0,
    EMAIL_SIGNUP: 0,
    INQUIRY: 0,
    PURCHASE: 0,
    OPPORTUNITY: 0,
    MEDIA_OUTCOME: 0
  };
}

function normalizeContentRef(input: SocialContentRefV1, field: string): SocialContentRefV1 {
  assertPlainObject(input, field);
  assertAllowedKeys(input, CONTENT_REF_KEYS, field);
  return freeze({
    platform: input.platform,
    contentId: requireNonEmpty(input.contentId, `${field}.contentId`)
  });
}

function normalizeLinkEvidence(input: SocialOutcomeLinkEvidenceInputV1, field: string): SocialOutcomeLinkEvidenceInputV1 {
  assertPlainObject(input, field);
  assertAllowedKeys(input, LINK_KEYS, field);
  return freeze({
    basis: input.basis,
    attributionRef: safeRef(input.attributionRef, `${field}.attributionRef`),
    evidenceRefs: uniqueRefs(input.evidenceRefs ?? [], `${field}.evidenceRefs`)
  });
}

export function compileSocialBusinessOutcomeLinkageV1(input: SocialBusinessOutcomeLinkageInputV1): SocialBusinessOutcomeLinkageV1 {
  assertPlainObject(input, "input");
  assertAllowedKeys(input, INPUT_KEYS, "input");

  const generatedAt = requireIso(input.generatedAt, "generatedAt");
  const generatedAtMs = Date.parse(generatedAt);
  if (!Array.isArray(input.socialSnapshots)) throw new Error("socialSnapshots must be an array");
  if (!Array.isArray(input.outcomes)) throw new Error("outcomes must be an array");
  if (input.socialSnapshots.length > 100) throw new Error("socialSnapshots exceeds bounded maximum of 100");
  if (input.outcomes.length > 2_000) throw new Error("outcomes exceeds bounded maximum of 2000");

  const contentIndex = new Map<string, {
    platform: SocialPlatformV1;
    contentId: string;
    publishedAt: string;
    upstreamAttributionConfidence: SocialAttributionConfidenceV1;
    liveAndFresh: boolean;
    snapshotFuture: boolean;
  }[]>();

  for (const snapshot of input.socialSnapshots) {
    const snapshotFuture = Date.parse(snapshot.retrievedAt) > generatedAtMs;
    const liveAndFresh = snapshot.sourceCoverage.effectiveState === "CONNECTED_AND_INGESTING" && snapshot.sourceCoverage.freshness === "FRESH";
    for (const content of snapshot.content) {
      const key = contentKey({ platform: content.platform, contentId: content.contentId });
      const bucket = contentIndex.get(key) ?? [];
      bucket.push({
        platform: content.platform,
        contentId: content.contentId,
        publishedAt: content.publishedAt,
        upstreamAttributionConfidence: content.attributionConfidence,
        liveAndFresh,
        snapshotFuture
      });
      contentIndex.set(key, bucket);
    }
  }

  const seenOutcomeIds = new Set<string>();
  const seenSourceRecords = new Set<string>();
  const rows: SocialBusinessOutcomeLinkageRowV1[] = [];

  for (const [index, raw] of input.outcomes.entries()) {
    assertPlainObject(raw, `outcomes[${index}]`);
    assertAllowedKeys(raw, OUTCOME_KEYS, `outcomes[${index}]`);

    const outcomeId = requireNonEmpty(raw.outcomeId, `outcomes[${index}].outcomeId`);
    const sourceRecordRef = safeRef(raw.sourceRecordRef, `outcomes[${index}].sourceRecordRef`);
    if (seenOutcomeIds.has(outcomeId)) throw new Error(`duplicate outcomeId: ${outcomeId}`);
    if (seenSourceRecords.has(sourceRecordRef)) throw new Error(`duplicate sourceRecordRef: ${sourceRecordRef}`);
    seenOutcomeIds.add(outcomeId);
    seenSourceRecords.add(sourceRecordRef);

    const occurredAt = requireIso(raw.occurredAt, `outcomes[${index}].occurredAt`);
    const observedAt = requireIso(raw.observedAt, `outcomes[${index}].observedAt`);
    const occurredAtMs = Date.parse(occurredAt);
    const observedAtMs = Date.parse(observedAt);
    if (observedAtMs > generatedAtMs) throw new Error(`outcomes[${index}].observedAt must not be after generatedAt`);
    if (occurredAtMs > observedAtMs) throw new Error(`outcomes[${index}].occurredAt must not be after observedAt`);

    const completeThroughAt = raw.completeThroughAt ? requireIso(raw.completeThroughAt, `outcomes[${index}].completeThroughAt`) : null;
    if (completeThroughAt && Date.parse(completeThroughAt) > generatedAtMs) {
      throw new Error(`outcomes[${index}].completeThroughAt must not be after generatedAt`);
    }

    const evidenceRefs = uniqueRefs(raw.evidenceRefs ?? [], `outcomes[${index}].evidenceRefs`);
    const ref = raw.socialContentRef ? normalizeContentRef(raw.socialContentRef, `outcomes[${index}].socialContentRef`) : null;
    const linkEvidence = raw.linkEvidence ? normalizeLinkEvidence(raw.linkEvidence, `outcomes[${index}].linkEvidence`) : null;
    const key = ref ? contentKey(ref) : null;
    const matches = key ? contentIndex.get(key) ?? [] : [];
    const verificationReasons: string[] = [];

    if ((ref && !linkEvidence) || (!ref && linkEvidence)) verificationReasons.push("CONTENT_REF_AND_LINK_EVIDENCE_MUST_BOTH_BE_PRESENT");
    if (evidenceRefs.length === 0) verificationReasons.push("OUTCOME_EVIDENCE_REQUIRED");
    if (linkEvidence && linkEvidence.evidenceRefs.length === 0) verificationReasons.push("LINK_EVIDENCE_REQUIRED");
    if (raw.truthState !== "KNOWN") verificationReasons.push(`OUTCOME_TRUTH_${raw.truthState}`);
    if (ref && matches.length === 0) verificationReasons.push("CONTENT_REF_NOT_FOUND");
    if (ref && matches.length > 1) verificationReasons.push("AMBIGUOUS_CONTENT_REF");

    const match = matches.length === 1 ? matches[0] : null;
    if (match?.snapshotFuture) verificationReasons.push("SOCIAL_SNAPSHOT_FROM_FUTURE");
    if (match && !match.liveAndFresh) verificationReasons.push("SOCIAL_CONTENT_SOURCE_NOT_LIVE_AND_FRESH");
    if (match && occurredAtMs < Date.parse(match.publishedAt)) verificationReasons.push("OUTCOME_PRECEDES_CONTENT");
    if (completeThroughAt == null) verificationReasons.push("SOURCE_COMPLETENESS_UNKNOWN");
    else if (Date.parse(completeThroughAt) < occurredAtMs) verificationReasons.push("SOURCE_INCOMPLETE_THROUGH_OUTCOME");

    let disposition: SocialOutcomeLinkDispositionV1 = "UNLINKED";
    let attributionClass: SocialOutcomeAttributionClassV1 = "NOT_ESTABLISHED";

    if (ref || linkEvidence) {
      if (verificationReasons.length > 0) {
        disposition = "VERIFY_REQUIRED";
      } else if (linkEvidence?.basis === "EXACT_TRACKING_REF") {
        disposition = "DIRECT_LINK";
        attributionClass = "DIRECT_TRACKED";
      } else {
        disposition = "ASSOCIATED_LINK";
        attributionClass = "SUPPORTED_ASSOCIATION";
      }
    }

    rows.push(freeze({
      outcomeId,
      kind: raw.kind,
      source: raw.source,
      sourceRecordRef,
      occurredAt,
      observedAt,
      completeThroughAt,
      truthState: raw.truthState,
      socialContentRef: key,
      platform: ref?.platform ?? null,
      contentId: ref?.contentId ?? null,
      linkBasis: linkEvidence?.basis ?? null,
      attributionRef: linkEvidence?.attributionRef ?? null,
      upstreamAttributionConfidence: match?.upstreamAttributionConfidence ?? null,
      disposition,
      attributionClass,
      evidenceRefs: uniqueRefs([...evidenceRefs, ...(linkEvidence?.evidenceRefs ?? [])], `outcomes[${index}].combinedEvidenceRefs`),
      verificationReasons: [...new Set(verificationReasons)].sort((left, right) => left.localeCompare(right)),
      causalClaim: false,
      revenueAttributionClaim: false,
      monetaryValue: null
    }));
  }

  rows.sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt) || left.outcomeId.localeCompare(right.outcomeId));

  const summaries = new Map<string, {
    platform: SocialPlatformV1;
    contentId: string;
    linkedOutcomeCount: number;
    directTrackedOutcomeCount: number;
    outcomeCounts: Record<SocialBusinessOutcomeKindV1, number>;
    strongestAttributionClass: Exclude<SocialOutcomeAttributionClassV1, "NOT_ESTABLISHED">;
    evidenceRefs: string[];
  }>();

  for (const row of rows) {
    if ((row.disposition !== "DIRECT_LINK" && row.disposition !== "ASSOCIATED_LINK") || !row.socialContentRef || !row.platform || !row.contentId) continue;
    const existing = summaries.get(row.socialContentRef) ?? {
      platform: row.platform,
      contentId: row.contentId,
      linkedOutcomeCount: 0,
      directTrackedOutcomeCount: 0,
      outcomeCounts: zeroOutcomeCounts(),
      strongestAttributionClass: "SUPPORTED_ASSOCIATION" as const,
      evidenceRefs: []
    };
    existing.linkedOutcomeCount += 1;
    existing.outcomeCounts[row.kind] += 1;
    if (row.attributionClass === "DIRECT_TRACKED") {
      existing.directTrackedOutcomeCount += 1;
      existing.strongestAttributionClass = "DIRECT_TRACKED";
    }
    existing.evidenceRefs.push(...row.evidenceRefs);
    summaries.set(row.socialContentRef, existing);
  }

  const byContent = [...summaries.entries()]
    .map(([socialContentRef, summary]) => freeze({
      socialContentRef,
      platform: summary.platform,
      contentId: summary.contentId,
      linkedOutcomeCount: summary.linkedOutcomeCount,
      directTrackedOutcomeCount: summary.directTrackedOutcomeCount,
      outcomeCounts: freeze({ ...summary.outcomeCounts }),
      strongestAttributionClass: summary.strongestAttributionClass,
      evidenceRefs: uniqueRefs(summary.evidenceRefs, `summary.${socialContentRef}.evidenceRefs`),
      causalClaim: false as const,
      revenueAttributionClaim: false as const,
      monetaryValue: null
    }))
    .sort((left, right) => left.socialContentRef.localeCompare(right.socialContentRef));

  return freeze({
    contractVersion: "SocialBusinessOutcomeLinkageV1",
    generatedAt,
    rows,
    byContent,
    limitations: [
      "A linked downstream event is evidence of tracking association, not proof that social content caused the outcome.",
      "Campaign-level and content-reference links remain associations unless an exact tracking reference is independently evidenced.",
      "This contract does not calculate or attribute revenue, monetary value, endorsements, relationships, or competitor performance.",
      "Only content from canonical live-and-fresh social snapshots can contribute to linked outcome summaries."
    ],
    externalAccessPerformed: false,
    writesPerformed: false
  });
}
