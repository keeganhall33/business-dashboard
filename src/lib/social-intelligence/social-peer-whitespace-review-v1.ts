import type {
  CanonicalSocialAccountSnapshotV1,
  SocialPlatformV1
} from "./social-canonical-v1";
import {
  SOCIAL_PEER_PUBLIC_EVIDENCE_V1_VERSION,
  type SocialPeerPublicEvidenceV1,
  type SocialPeerPublicObservationV1
} from "./social-peer-public-evidence-v1";

export const SOCIAL_PEER_WHITESPACE_REVIEW_V1_VERSION = "SocialPeerWhitespaceReviewV1" as const;
export const SOCIAL_PEER_WHITESPACE_MAX_OWNED_SNAPSHOTS_V1 = 20;
export const SOCIAL_PEER_WHITESPACE_MAX_CANDIDATES_V1 = 100;

export const SOCIAL_PEER_WHITESPACE_DIMENSIONS_V1 = ["FORMAT", "HOOK"] as const;
export type SocialPeerWhitespaceDimensionV1 = (typeof SOCIAL_PEER_WHITESPACE_DIMENSIONS_V1)[number];

export type SocialPeerWhitespaceOwnedCoverageV1 = Readonly<{
  platform: SocialPlatformV1;
  snapshotId: string;
  startAt: string;
  endAt: string;
  coverage: "COMPLETE_CANONICAL_CONTENT_TIMELINE" | "PARTIAL" | "UNKNOWN";
  evidenceRefs: readonly string[];
}>;

export type SocialPeerWhitespacePolicyV1 = Readonly<{
  maxEvidenceAgeHours: number;
  minDistinctPeers: number;
  minDistinctContentPerPeer: number;
}>;

export type SocialPeerWhitespaceCandidateV1 = Readonly<{
  whitespaceId: string;
  platform: SocialPlatformV1;
  dimension: SocialPeerWhitespaceDimensionV1;
  value: string;
  windowStartAt: string;
  windowEndAt: string;
  peerCount: number;
  peerIds: readonly string[];
  peerDisplayNames: readonly string[];
  peerDistinctContentCount: number;
  ownedObservedContentCount: 0;
  evidenceRefs: readonly string[];
  statement: string;
  state: "BOUNDED_RESEARCH_WHITESPACE";
  researchCandidate: true;
  performanceClaim: false;
  audienceGrowthClaim: false;
  causalClaim: false;
  relationshipClaim: false;
  endorsementClaim: false;
  attributionClaim: false;
  recommendationClaim: false;
  confidence: null;
  monetaryValue: null;
}>;

export type SocialPeerWhitespaceExcludedScopeV1 = Readonly<{
  platform: SocialPlatformV1;
  reason:
    | "OWNED_SOURCE_NOT_DECISION_GRADE"
    | "OWNED_COVERAGE_NOT_COMPLETE"
    | "OWNED_COVERAGE_WINDOW_MISMATCH"
    | "PEER_COMPLETE_WINDOW_NOT_AVAILABLE";
}>;

export type SocialPeerWhitespaceReviewStatusV1 =
  | "READY_FOR_RESEARCH"
  | "PARTIAL"
  | "NO_BOUNDED_WHITESPACE"
  | "VERIFY_REQUIRED"
  | "INSUFFICIENT_EVIDENCE";

export type SocialPeerWhitespaceVerificationReasonV1 =
  | "PEER_EVIDENCE_NOT_READY"
  | "PEER_EVIDENCE_STALE"
  | "PEER_EVIDENCE_FUTURE_DATED";

export type SocialPeerWhitespaceReviewV1 = Readonly<{
  contractVersion: typeof SOCIAL_PEER_WHITESPACE_REVIEW_V1_VERSION;
  evaluatedAt: string;
  status: SocialPeerWhitespaceReviewStatusV1;
  candidates: readonly SocialPeerWhitespaceCandidateV1[];
  evaluatedPlatforms: readonly SocialPlatformV1[];
  excludedScopes: readonly SocialPeerWhitespaceExcludedScopeV1[];
  verificationReasons: readonly SocialPeerWhitespaceVerificationReasonV1[];
  guardrails: readonly string[];
  providerAccessAuthority: "NONE";
  notificationAuthority: "NONE";
  postingAuthority: "NONE";
  externalAccessPerformed: false;
  writesPerformed: false;
}>;

export type SocialPeerWhitespaceReviewInputV1 = Readonly<{
  peerEvidence: SocialPeerPublicEvidenceV1;
  ownedSnapshots: readonly CanonicalSocialAccountSnapshotV1[];
  ownedCoverage: readonly SocialPeerWhitespaceOwnedCoverageV1[];
  policy: SocialPeerWhitespacePolicyV1;
  evaluatedAt: string;
}>;

type PeerPattern = Readonly<{
  peerId: string;
  peerDisplayName: string;
  dimension: SocialPeerWhitespaceDimensionV1;
  value: string;
  normalizedValue: string;
  distinctContentCount: number;
  evidenceRefs: readonly string[];
}>;

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function iso(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!value || Number.isNaN(parsed)) throw new Error(`${field} must be a valid timestamp`);
  return new Date(parsed).toISOString();
}

function positiveFinite(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${field} must be a finite positive number`);
  return value;
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${field} must be a positive integer`);
  return value;
}

function nonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} must be non-empty`);
  return normalized;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function isSecretLike(value: string): boolean {
  return /(authorization\s*:|bearer\s+[a-z0-9._~+\/-]+|(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|client[_-]?secret|session[_-]?token)\s*[=:])/i.test(value);
}

function safeRef(value: string, field: string): string {
  const normalized = nonEmpty(value, field);
  if (isSecretLike(normalized)) throw new Error(`${field} contains credential-like material`);
  return normalized;
}

function normalizeComparable(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.toLocaleLowerCase() : null;
}

function hoursBetween(earlier: string, later: string): number {
  return (Date.parse(later) - Date.parse(earlier)) / 3_600_000;
}

function guardrails(): readonly string[] {
  return freeze([
    "Whitespace means a directly observed peer pattern was repeated inside an evidenced complete public window and was not observed inside the matching evidenced complete owned-content window.",
    "A bounded observation gap is not competitor performance, audience growth, endorsement, relationship, causality, attribution, confidence, expected lift, monetary value, or a recommendation.",
    "Only exact FORMAT and HOOK values are compared; semantic similarity, inferred themes, title patterns, series, participants, and private metrics are not inferred.",
    "Incomplete, stale, future-dated, mismatched, or authority-widened evidence cannot create a research candidate.",
    "This review performs no provider access, scraping, posting, messaging, notifications, account mutation, spend, or other external action."
  ]);
}

function emptyReview(
  evaluatedAt: string,
  status: SocialPeerWhitespaceReviewStatusV1,
  verificationReasons: readonly SocialPeerWhitespaceVerificationReasonV1[] = [],
  excludedScopes: readonly SocialPeerWhitespaceExcludedScopeV1[] = []
): SocialPeerWhitespaceReviewV1 {
  return freeze({
    contractVersion: SOCIAL_PEER_WHITESPACE_REVIEW_V1_VERSION,
    evaluatedAt,
    status,
    candidates: [],
    evaluatedPlatforms: [],
    excludedScopes: [...excludedScopes],
    verificationReasons: unique(verificationReasons) as SocialPeerWhitespaceVerificationReasonV1[],
    guardrails: guardrails(),
    providerAccessAuthority: "NONE" as const,
    notificationAuthority: "NONE" as const,
    postingAuthority: "NONE" as const,
    externalAccessPerformed: false as const,
    writesPerformed: false as const
  });
}

function assertPeerIntegrity(peerEvidence: SocialPeerPublicEvidenceV1, evaluatedAt: string): void {
  if (peerEvidence.contractVersion !== SOCIAL_PEER_PUBLIC_EVIDENCE_V1_VERSION) {
    throw new Error("peerEvidence.contractVersion is not canonical SocialPeerPublicEvidenceV1");
  }
  if (peerEvidence.externalAccessPerformed !== false || peerEvidence.writesPerformed !== false) {
    throw new Error("peerEvidence widens upstream authority");
  }

  const asOf = iso(peerEvidence.asOf, "peerEvidence.asOf");
  if (Date.parse(asOf) > Date.parse(evaluatedAt)) throw new Error("peerEvidence.asOf cannot be after evaluatedAt");

  const ids = new Set<string>();
  for (const [index, observation] of peerEvidence.observations.entries()) {
    const id = nonEmpty(observation.observationId, `peerEvidence.observations[${index}].observationId`);
    if (ids.has(id)) throw new Error(`duplicate peer observationId: ${id}`);
    ids.add(id);
    const observedAt = iso(observation.observedAt, `${id}.observedAt`);
    const capturedAt = iso(observation.capturedAt, `${id}.capturedAt`);
    if (Date.parse(observedAt) > Date.parse(capturedAt)) throw new Error(`${id}.observedAt cannot be after capturedAt`);
    if (Date.parse(capturedAt) > Date.parse(asOf)) throw new Error(`${id}.capturedAt cannot be after peerEvidence.asOf`);
    safeRef(observation.sourceRef, `${id}.sourceRef`);
    observation.evidenceRefs.forEach((ref, evidenceIndex) => safeRef(ref, `${id}.evidenceRefs[${evidenceIndex}]`));
  }

  const stale = new Set(peerEvidence.staleObservationIds);
  for (const staleId of stale) {
    if (!ids.has(staleId)) throw new Error(`peerEvidence.staleObservationIds contains unknown observationId: ${staleId}`);
  }

  for (const [index, cadence] of peerEvidence.cadence.entries()) {
    cadence.evidenceRefs.forEach((ref, evidenceIndex) => safeRef(ref, `peerEvidence.cadence[${index}].evidenceRefs[${evidenceIndex}]`));
    if (cadence.state === "OBSERVED_COMPLETE_WINDOW") {
      if (!cadence.startAt || !cadence.endAt || cadence.observedPostCount === null || cadence.observedPostsPerWeek === null) {
        throw new Error(`peerEvidence.cadence[${index}] complete window is internally inconsistent`);
      }
      const startAt = iso(cadence.startAt, `peerEvidence.cadence[${index}].startAt`);
      const endAt = iso(cadence.endAt, `peerEvidence.cadence[${index}].endAt`);
      if (Date.parse(endAt) <= Date.parse(startAt)) throw new Error(`peerEvidence.cadence[${index}] must have positive duration`);
      if (Date.parse(endAt) > Date.parse(asOf)) throw new Error(`peerEvidence.cadence[${index}].endAt cannot be after peerEvidence.asOf`);
    }
  }
}

function normalizeOwnedCoverage(
  input: readonly SocialPeerWhitespaceOwnedCoverageV1[],
  evaluatedAt: string
): Map<SocialPlatformV1, SocialPeerWhitespaceOwnedCoverageV1> {
  const result = new Map<SocialPlatformV1, SocialPeerWhitespaceOwnedCoverageV1>();
  for (const [index, row] of input.entries()) {
    if (result.has(row.platform)) throw new Error(`duplicate owned coverage for ${row.platform}`);
    const snapshotId = nonEmpty(row.snapshotId, `ownedCoverage[${index}].snapshotId`);
    const startAt = iso(row.startAt, `ownedCoverage[${index}].startAt`);
    const endAt = iso(row.endAt, `ownedCoverage[${index}].endAt`);
    if (Date.parse(endAt) <= Date.parse(startAt)) throw new Error(`ownedCoverage[${index}] must have positive duration`);
    if (Date.parse(endAt) > Date.parse(evaluatedAt)) throw new Error(`ownedCoverage[${index}].endAt cannot be after evaluatedAt`);
    const evidenceRefs = unique(row.evidenceRefs);
    if (!evidenceRefs.length) throw new Error(`ownedCoverage[${index}] requires evidence`);
    evidenceRefs.forEach((ref, evidenceIndex) => safeRef(ref, `ownedCoverage[${index}].evidenceRefs[${evidenceIndex}]`));
    result.set(row.platform, freeze({ ...row, snapshotId, startAt, endAt, evidenceRefs }));
  }
  return result;
}

function assertOwnedSnapshotIntegrity(snapshot: CanonicalSocialAccountSnapshotV1, evaluatedAt: string): void {
  if (snapshot.contractVersion !== "CanonicalSocialAccountSnapshotV1") {
    throw new Error(`${snapshot.platform} snapshot is not canonical`);
  }
  if (snapshot.externalAccessPerformed !== false || snapshot.writesPerformed !== false) {
    throw new Error(`${snapshot.platform} snapshot widens upstream authority`);
  }
  const retrievedAt = iso(snapshot.retrievedAt, `${snapshot.platform}.retrievedAt`);
  if (Date.parse(retrievedAt) > Date.parse(evaluatedAt)) throw new Error(`${snapshot.platform}.retrievedAt cannot be after evaluatedAt`);
  snapshot.evidenceRefs.forEach((ref, index) => safeRef(ref, `${snapshot.platform}.evidenceRefs[${index}]`));
  const contentIds = new Set<string>();
  for (const [index, content] of snapshot.content.entries()) {
    if (content.platform !== snapshot.platform) throw new Error(`${snapshot.platform}.content[${index}] platform mismatch`);
    const contentId = nonEmpty(content.contentId, `${snapshot.platform}.content[${index}].contentId`);
    if (contentIds.has(contentId)) throw new Error(`${snapshot.platform} contains duplicate contentId: ${contentId}`);
    contentIds.add(contentId);
    const publishedAt = iso(content.publishedAt, `${snapshot.platform}.${contentId}.publishedAt`);
    if (Date.parse(publishedAt) > Date.parse(retrievedAt)) throw new Error(`${snapshot.platform}.${contentId}.publishedAt cannot be after retrievedAt`);
  }
}

function peerPatternValue(
  observation: SocialPeerPublicObservationV1,
  dimension: SocialPeerWhitespaceDimensionV1
): string | null {
  return dimension === "FORMAT" ? observation.format : observation.hookText;
}

function completePeerIdsForWindow(
  peerEvidence: SocialPeerPublicEvidenceV1,
  platform: SocialPlatformV1,
  startAt: string,
  endAt: string
): Set<string> {
  return new Set(
    peerEvidence.cadence
      .filter(
        (cadence) =>
          cadence.platform === platform &&
          cadence.state === "OBSERVED_COMPLETE_WINDOW" &&
          cadence.startAt === startAt &&
          cadence.endAt === endAt
      )
      .map((cadence) => cadence.peerId)
  );
}

function peerPatternsForWindow(
  peerEvidence: SocialPeerPublicEvidenceV1,
  platform: SocialPlatformV1,
  startAt: string,
  endAt: string,
  minDistinctContentPerPeer: number
): PeerPattern[] {
  const completePeerIds = completePeerIdsForWindow(peerEvidence, platform, startAt, endAt);
  if (!completePeerIds.size) return [];

  const groups = new Map<string, {
    peerId: string;
    peerDisplayName: string;
    dimension: SocialPeerWhitespaceDimensionV1;
    value: string;
    normalizedValue: string;
    contentIds: Set<string>;
    evidenceRefs: string[];
  }>();

  for (const observation of peerEvidence.observations) {
    if (
      observation.platform !== platform ||
      observation.freshness !== "CURRENT" ||
      !observation.contentId ||
      !completePeerIds.has(observation.peerId) ||
      Date.parse(observation.observedAt) < Date.parse(startAt) ||
      Date.parse(observation.observedAt) > Date.parse(endAt)
    ) continue;

    for (const dimension of SOCIAL_PEER_WHITESPACE_DIMENSIONS_V1) {
      const rawValue = peerPatternValue(observation, dimension);
      const normalizedValue = normalizeComparable(rawValue);
      if (!rawValue || !normalizedValue) continue;
      const key = [observation.peerId, dimension, normalizedValue].join("\u0000");
      const existing = groups.get(key);
      if (existing) {
        existing.contentIds.add(observation.contentId);
        existing.evidenceRefs.push(...observation.evidenceRefs);
      } else {
        groups.set(key, {
          peerId: observation.peerId,
          peerDisplayName: observation.peerDisplayName,
          dimension,
          value: rawValue.replace(/\s+/g, " ").trim(),
          normalizedValue,
          contentIds: new Set([observation.contentId]),
          evidenceRefs: [...observation.evidenceRefs]
        });
      }
    }
  }

  return [...groups.values()]
    .filter((group) => group.contentIds.size >= minDistinctContentPerPeer)
    .map((group) => freeze({
      peerId: group.peerId,
      peerDisplayName: group.peerDisplayName,
      dimension: group.dimension,
      value: group.value,
      normalizedValue: group.normalizedValue,
      distinctContentCount: group.contentIds.size,
      evidenceRefs: unique(group.evidenceRefs)
    }));
}

function ownedValuesForWindow(
  snapshot: CanonicalSocialAccountSnapshotV1,
  startAt: string,
  endAt: string
): Map<SocialPeerWhitespaceDimensionV1, Set<string>> {
  const result = new Map<SocialPeerWhitespaceDimensionV1, Set<string>>(
    SOCIAL_PEER_WHITESPACE_DIMENSIONS_V1.map((dimension) => [dimension, new Set<string>()])
  );
  for (const content of snapshot.content) {
    if (Date.parse(content.publishedAt) < Date.parse(startAt) || Date.parse(content.publishedAt) > Date.parse(endAt)) continue;
    const format = normalizeComparable(content.format);
    const hook = normalizeComparable(content.hook);
    if (format) result.get("FORMAT")!.add(format);
    if (hook) result.get("HOOK")!.add(hook);
  }
  return result;
}

function candidateId(platform: SocialPlatformV1, dimension: SocialPeerWhitespaceDimensionV1, value: string, startAt: string, endAt: string): string {
  return ["social-peer-whitespace", platform, dimension, value, startAt, endAt].map((part) => encodeURIComponent(part)).join(":");
}

export function reviewSocialPeerWhitespaceV1(input: SocialPeerWhitespaceReviewInputV1): SocialPeerWhitespaceReviewV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.ownedSnapshots)) throw new Error("ownedSnapshots must be an array");
  if (!Array.isArray(input.ownedCoverage)) throw new Error("ownedCoverage must be an array");
  if (input.ownedSnapshots.length > SOCIAL_PEER_WHITESPACE_MAX_OWNED_SNAPSHOTS_V1) {
    throw new Error(`at most ${SOCIAL_PEER_WHITESPACE_MAX_OWNED_SNAPSHOTS_V1} owned snapshots are allowed`);
  }

  const evaluatedAt = iso(input.evaluatedAt, "evaluatedAt");
  const maxEvidenceAgeHours = positiveFinite(input.policy.maxEvidenceAgeHours, "policy.maxEvidenceAgeHours");
  const minDistinctPeers = positiveInteger(input.policy.minDistinctPeers, "policy.minDistinctPeers");
  const minDistinctContentPerPeer = positiveInteger(input.policy.minDistinctContentPerPeer, "policy.minDistinctContentPerPeer");

  assertPeerIntegrity(input.peerEvidence, evaluatedAt);
  const peerAsOf = iso(input.peerEvidence.asOf, "peerEvidence.asOf");
  if (input.peerEvidence.status !== "READY") {
    return emptyReview(evaluatedAt, "VERIFY_REQUIRED", ["PEER_EVIDENCE_NOT_READY"]);
  }
  if (Date.parse(peerAsOf) > Date.parse(evaluatedAt)) {
    return emptyReview(evaluatedAt, "VERIFY_REQUIRED", ["PEER_EVIDENCE_FUTURE_DATED"]);
  }
  if (hoursBetween(peerAsOf, evaluatedAt) > maxEvidenceAgeHours) {
    return emptyReview(evaluatedAt, "VERIFY_REQUIRED", ["PEER_EVIDENCE_STALE"]);
  }

  const coverageByPlatform = normalizeOwnedCoverage(input.ownedCoverage, evaluatedAt);
  const snapshotByPlatform = new Map<SocialPlatformV1, CanonicalSocialAccountSnapshotV1>();
  for (const snapshot of input.ownedSnapshots) {
    assertOwnedSnapshotIntegrity(snapshot, evaluatedAt);
    if (snapshotByPlatform.has(snapshot.platform)) throw new Error(`duplicate owned snapshot for ${snapshot.platform}`);
    snapshotByPlatform.set(snapshot.platform, snapshot);
  }

  const candidates: SocialPeerWhitespaceCandidateV1[] = [];
  const evaluatedPlatforms: SocialPlatformV1[] = [];
  const excludedScopes: SocialPeerWhitespaceExcludedScopeV1[] = [];

  for (const platform of [...snapshotByPlatform.keys()].sort()) {
    const snapshot = snapshotByPlatform.get(platform)!;
    const coverage = coverageByPlatform.get(platform);
    if (snapshot.sourceCoverage.effectiveState !== "CONNECTED_AND_INGESTING" || snapshot.sourceCoverage.freshness !== "FRESH") {
      excludedScopes.push({ platform, reason: "OWNED_SOURCE_NOT_DECISION_GRADE" });
      continue;
    }
    if (!coverage || coverage.coverage !== "COMPLETE_CANONICAL_CONTENT_TIMELINE") {
      excludedScopes.push({ platform, reason: "OWNED_COVERAGE_NOT_COMPLETE" });
      continue;
    }
    if (coverage.snapshotId !== snapshot.snapshotId || Date.parse(coverage.endAt) > Date.parse(snapshot.retrievedAt)) {
      excludedScopes.push({ platform, reason: "OWNED_COVERAGE_WINDOW_MISMATCH" });
      continue;
    }

    const completePeerIds = completePeerIdsForWindow(input.peerEvidence, platform, coverage.startAt, coverage.endAt);
    if (completePeerIds.size < minDistinctPeers) {
      excludedScopes.push({ platform, reason: "PEER_COMPLETE_WINDOW_NOT_AVAILABLE" });
      continue;
    }

    evaluatedPlatforms.push(platform);
    const ownedValues = ownedValuesForWindow(snapshot, coverage.startAt, coverage.endAt);
    const peerPatterns = peerPatternsForWindow(
      input.peerEvidence,
      platform,
      coverage.startAt,
      coverage.endAt,
      minDistinctContentPerPeer
    );
    const groups = new Map<string, PeerPattern[]>();
    for (const pattern of peerPatterns) {
      const key = `${pattern.dimension}\u0000${pattern.normalizedValue}`;
      const rows = groups.get(key) ?? [];
      rows.push(pattern);
      groups.set(key, rows);
    }

    for (const rows of groups.values()) {
      const distinctByPeer = new Map(rows.map((row) => [row.peerId, row]));
      if (distinctByPeer.size < minDistinctPeers) continue;
      const sample = [...distinctByPeer.values()].sort((a, b) => a.peerId.localeCompare(b.peerId))[0]!;
      if (ownedValues.get(sample.dimension)!.has(sample.normalizedValue)) continue;

      const peerRows = [...distinctByPeer.values()].sort((a, b) => a.peerId.localeCompare(b.peerId));
      const peerIds = peerRows.map((row) => row.peerId);
      const peerDisplayNames = peerRows.map((row) => row.peerDisplayName);
      const peerDistinctContentCount = peerRows.reduce((sum, row) => sum + row.distinctContentCount, 0);
      const evidenceRefs = unique([
        ...coverage.evidenceRefs,
        ...peerRows.flatMap((row) => row.evidenceRefs),
        ...input.peerEvidence.cadence
          .filter((cadence) => peerIds.includes(cadence.peerId) && cadence.platform === platform && cadence.startAt === coverage.startAt && cadence.endAt === coverage.endAt)
          .flatMap((cadence) => cadence.evidenceRefs)
      ]);

      candidates.push(freeze({
        whitespaceId: candidateId(platform, sample.dimension, sample.normalizedValue, coverage.startAt, coverage.endAt),
        platform,
        dimension: sample.dimension,
        value: sample.value,
        windowStartAt: coverage.startAt,
        windowEndAt: coverage.endAt,
        peerCount: peerRows.length,
        peerIds,
        peerDisplayNames,
        peerDistinctContentCount,
        ownedObservedContentCount: 0 as const,
        evidenceRefs,
        statement: `${sample.dimension.toLowerCase()} “${sample.value}” was directly observed on at least ${minDistinctContentPerPeer} distinct content items for each of ${peerRows.length} peers in the evidenced complete public ${platform} window, and was not observed in the matching evidenced complete owned-content window. This is a bounded research whitespace only, not a performance or recommendation claim.`,
        state: "BOUNDED_RESEARCH_WHITESPACE" as const,
        researchCandidate: true as const,
        performanceClaim: false as const,
        audienceGrowthClaim: false as const,
        causalClaim: false as const,
        relationshipClaim: false as const,
        endorsementClaim: false as const,
        attributionClaim: false as const,
        recommendationClaim: false as const,
        confidence: null,
        monetaryValue: null
      }));
    }
  }

  if (candidates.length > SOCIAL_PEER_WHITESPACE_MAX_CANDIDATES_V1) {
    throw new Error(`at most ${SOCIAL_PEER_WHITESPACE_MAX_CANDIDATES_V1} whitespace candidates are allowed`);
  }

  candidates.sort((a, b) =>
    a.platform.localeCompare(b.platform) ||
    a.dimension.localeCompare(b.dimension) ||
    a.value.localeCompare(b.value)
  );

  const status: SocialPeerWhitespaceReviewStatusV1 = evaluatedPlatforms.length === 0
    ? "INSUFFICIENT_EVIDENCE"
    : candidates.length === 0
      ? excludedScopes.length > 0 ? "PARTIAL" : "NO_BOUNDED_WHITESPACE"
      : excludedScopes.length > 0 ? "PARTIAL" : "READY_FOR_RESEARCH";

  return freeze({
    contractVersion: SOCIAL_PEER_WHITESPACE_REVIEW_V1_VERSION,
    evaluatedAt,
    status,
    candidates,
    evaluatedPlatforms: unique(evaluatedPlatforms) as SocialPlatformV1[],
    excludedScopes: excludedScopes.sort((a, b) => a.platform.localeCompare(b.platform) || a.reason.localeCompare(b.reason)),
    verificationReasons: [],
    guardrails: guardrails(),
    providerAccessAuthority: "NONE" as const,
    notificationAuthority: "NONE" as const,
    postingAuthority: "NONE" as const,
    externalAccessPerformed: false as const,
    writesPerformed: false as const
  });
}
