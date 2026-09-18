import type { SocialPlatformV1 } from "./social-canonical-v1";
import {
  SOCIAL_PEER_PUBLIC_EVIDENCE_V1_VERSION,
  type SocialPeerObservedCadenceV1,
  type SocialPeerPatternDimensionV1,
  type SocialPeerPublicEvidenceV1,
  type SocialPeerPublicObservationV1
} from "./social-peer-public-evidence-v1";

export const SOCIAL_PEER_SHIFT_REVIEW_V1_VERSION = "SocialPeerShiftReviewV1" as const;
export const SOCIAL_PEER_SHIFT_MAX_ITEMS_V1 = 100;

export type SocialPeerShiftPatternDimensionV1 = Exclude<SocialPeerPatternDimensionV1, "VISIBLE_PARTICIPANT">;

export type SocialPeerShiftKindV1 =
  | "PATTERN_EMERGED"
  | "PATTERN_RECEDED"
  | "CADENCE_INCREASED"
  | "CADENCE_DECREASED";

export type SocialPeerShiftReviewStatusV1 =
  | "READY_FOR_REVIEW"
  | "PARTIAL"
  | "NO_MATERIAL_SHIFT"
  | "VERIFY_REQUIRED"
  | "INSUFFICIENT_EVIDENCE";

export type SocialPeerShiftVerificationReasonV1 =
  | "PRIOR_EVIDENCE_NOT_READY"
  | "CURRENT_EVIDENCE_NOT_READY"
  | "CURRENT_EVIDENCE_STALE";

export type SocialPeerShiftPolicyV1 = Readonly<{
  maxCurrentEvidenceAgeHours: number;
  maxWindowGapHours: number;
  minDistinctPostsForPattern: number;
  minAbsoluteCadenceDeltaPerWeek: number;
}>;

export type SocialPeerShiftItemV1 = Readonly<{
  shiftId: string;
  peerId: string;
  peerDisplayName: string;
  platform: SocialPlatformV1;
  kind: SocialPeerShiftKindV1;
  dimension: SocialPeerShiftPatternDimensionV1 | null;
  value: string | null;
  priorObservedCount: number | null;
  currentObservedCount: number | null;
  priorPostsPerWeek: number | null;
  currentPostsPerWeek: number | null;
  priorWindowStartAt: string;
  priorWindowEndAt: string;
  currentWindowStartAt: string;
  currentWindowEndAt: string;
  evidenceRefs: readonly string[];
  statement: string;
  alertReviewCandidate: true;
  performanceClaim: false;
  audienceGrowthClaim: false;
  causalClaim: false;
  relationshipClaim: false;
  endorsementClaim: false;
  attributionClaim: false;
}>;

export type SocialPeerShiftComparisonCoverageV1 = Readonly<{
  comparedIdentityCount: number;
  skippedIdentityCount: number;
  comparedIdentityKeys: readonly string[];
  skippedIdentityKeys: readonly string[];
}>;

export type SocialPeerShiftReviewV1 = Readonly<{
  contractVersion: typeof SOCIAL_PEER_SHIFT_REVIEW_V1_VERSION;
  evaluatedAt: string;
  status: SocialPeerShiftReviewStatusV1;
  items: readonly SocialPeerShiftItemV1[];
  verificationReasons: readonly SocialPeerShiftVerificationReasonV1[];
  comparisonCoverage: SocialPeerShiftComparisonCoverageV1;
  guardrails: readonly string[];
  notificationAuthority: "NONE";
  paidMediaAuthority: "NONE";
  postingAuthority: "NONE";
  externalAccessPerformed: false;
  writesPerformed: false;
}>;

export type SocialPeerShiftReviewInputV1 = Readonly<{
  prior: SocialPeerPublicEvidenceV1;
  current: SocialPeerPublicEvidenceV1;
  policy: SocialPeerShiftPolicyV1;
  evaluatedAt: string;
}>;

type ComparableCadence = Readonly<{
  peerId: string;
  peerDisplayName: string;
  platform: SocialPlatformV1;
  startAt: string;
  endAt: string;
  startMs: number;
  endMs: number;
  observedPostsPerWeek: number;
  evidenceRefs: readonly string[];
}>;

type PatternCount = Readonly<{
  dimension: SocialPeerShiftPatternDimensionV1;
  value: string;
  distinctContentCount: number;
  evidenceRefs: readonly string[];
}>;

const PATTERN_DIMENSIONS: readonly SocialPeerShiftPatternDimensionV1[] = [
  "FORMAT",
  "SERIES",
  "HOOK",
  "TITLE_PATTERN"
];

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function requireIso(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!value || Number.isNaN(parsed)) throw new Error(`${field} must be a valid timestamp`);
  return new Date(parsed).toISOString();
}

function requirePositiveFinite(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${field} must be a finite positive number`);
  return value;
}

function requireNonNegativeFinite(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} must be a finite non-negative number`);
  return value;
}

function requirePositiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${field} must be a positive integer`);
  return value;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function identityKey(peerId: string, platform: SocialPlatformV1): string {
  return `${peerId}\u0000${platform}`;
}

function shiftId(parts: readonly string[]): string {
  return ["social-peer-shift", ...parts].map((part) => encodeURIComponent(part)).join(":");
}

function safeLabel(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").trim();
}

function isSecretLike(value: string): boolean {
  return /(authorization\s*:|bearer\s+[a-z0-9._~+\/-]+|(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|client[_-]?secret|session[_-]?token)\s*[=:])/i.test(value);
}

function assertSafeRef(value: string, field: string): void {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} must be non-empty`);
  if (isSecretLike(normalized)) throw new Error(`${field} contains credential-like material`);
}

function assertSnapshotIntegrity(snapshot: SocialPeerPublicEvidenceV1, label: "prior" | "current", evaluatedAtMs: number): void {
  if (snapshot.contractVersion !== SOCIAL_PEER_PUBLIC_EVIDENCE_V1_VERSION) {
    throw new Error(`${label}.contractVersion is not canonical SocialPeerPublicEvidenceV1`);
  }
  if (snapshot.externalAccessPerformed !== false || snapshot.writesPerformed !== false) {
    throw new Error(`${label} widens upstream authority`);
  }

  const asOf = requireIso(snapshot.asOf, `${label}.asOf`);
  const asOfMs = Date.parse(asOf);
  if (asOfMs > evaluatedAtMs) throw new Error(`${label}.asOf cannot be after evaluatedAt`);

  const staleIds = new Set(snapshot.staleObservationIds);
  if (staleIds.size !== snapshot.staleObservationIds.length) throw new Error(`${label}.staleObservationIds contains duplicates`);

  const observationIds = new Set<string>();
  for (const [index, observation] of snapshot.observations.entries()) {
    if (!observation.observationId.trim()) throw new Error(`${label}.observations[${index}].observationId must be non-empty`);
    if (observationIds.has(observation.observationId)) {
      throw new Error(`${label} contains duplicate observationId: ${observation.observationId}`);
    }
    observationIds.add(observation.observationId);

    const observedAt = requireIso(observation.observedAt, `${label}.${observation.observationId}.observedAt`);
    const capturedAt = requireIso(observation.capturedAt, `${label}.${observation.observationId}.capturedAt`);
    if (Date.parse(observedAt) > Date.parse(capturedAt)) {
      throw new Error(`${label}.${observation.observationId}.observedAt cannot be after capturedAt`);
    }
    if (Date.parse(capturedAt) > asOfMs) {
      throw new Error(`${label}.${observation.observationId}.capturedAt cannot be after asOf`);
    }
    assertSafeRef(observation.sourceRef, `${label}.${observation.observationId}.sourceRef`);
    for (const [evidenceIndex, evidenceRef] of observation.evidenceRefs.entries()) {
      assertSafeRef(evidenceRef, `${label}.${observation.observationId}.evidenceRefs[${evidenceIndex}]`);
    }
    if ((observation.freshness === "STALE") !== staleIds.has(observation.observationId)) {
      throw new Error(`${label} stale observation index is inconsistent for ${observation.observationId}`);
    }
  }

  for (const staleId of staleIds) {
    if (!observationIds.has(staleId)) throw new Error(`${label}.staleObservationIds contains unknown observationId: ${staleId}`);
  }

  const cadenceKeys = new Set<string>();
  for (const [index, cadence] of snapshot.cadence.entries()) {
    const key = identityKey(cadence.peerId, cadence.platform);
    if (cadenceKeys.has(key)) throw new Error(`${label} contains duplicate cadence identity: ${cadence.peerId}/${cadence.platform}`);
    cadenceKeys.add(key);
    for (const [evidenceIndex, evidenceRef] of cadence.evidenceRefs.entries()) {
      assertSafeRef(evidenceRef, `${label}.cadence[${index}].evidenceRefs[${evidenceIndex}]`);
    }
    if (cadence.state === "OBSERVED_COMPLETE_WINDOW") {
      if (!cadence.startAt || !cadence.endAt || cadence.observedPostCount === null || cadence.observedPostsPerWeek === null) {
        throw new Error(`${label}.cadence[${index}] complete window is internally inconsistent`);
      }
      const startAt = requireIso(cadence.startAt, `${label}.cadence[${index}].startAt`);
      const endAt = requireIso(cadence.endAt, `${label}.cadence[${index}].endAt`);
      if (Date.parse(endAt) <= Date.parse(startAt)) throw new Error(`${label}.cadence[${index}] must have a positive duration`);
      if (Date.parse(endAt) > asOfMs) throw new Error(`${label}.cadence[${index}].endAt cannot be after asOf`);
      if (!Number.isInteger(cadence.observedPostCount) || cadence.observedPostCount < 0) {
        throw new Error(`${label}.cadence[${index}].observedPostCount must be a non-negative integer`);
      }
      if (!Number.isFinite(cadence.observedPostsPerWeek) || cadence.observedPostsPerWeek < 0) {
        throw new Error(`${label}.cadence[${index}].observedPostsPerWeek must be finite and non-negative`);
      }
    }
  }
}

function completeCadenceMap(snapshot: SocialPeerPublicEvidenceV1): Map<string, ComparableCadence> {
  const displayNames = new Map<string, string>();
  for (const observation of snapshot.observations) {
    const key = identityKey(observation.peerId, observation.platform);
    const prior = displayNames.get(key);
    if (prior && prior.toLocaleLowerCase() !== observation.peerDisplayName.toLocaleLowerCase()) {
      throw new Error(`conflicting peer identity for ${observation.peerId}/${observation.platform}`);
    }
    displayNames.set(key, observation.peerDisplayName);
  }

  const result = new Map<string, ComparableCadence>();
  for (const cadence of snapshot.cadence) {
    if (
      cadence.state !== "OBSERVED_COMPLETE_WINDOW" ||
      !cadence.startAt ||
      !cadence.endAt ||
      cadence.observedPostsPerWeek === null
    ) continue;

    const key = identityKey(cadence.peerId, cadence.platform);
    result.set(key, freeze({
      peerId: cadence.peerId,
      peerDisplayName: displayNames.get(key) ?? cadence.peerDisplayName,
      platform: cadence.platform,
      startAt: requireIso(cadence.startAt, `${key}.startAt`),
      endAt: requireIso(cadence.endAt, `${key}.endAt`),
      startMs: Date.parse(cadence.startAt),
      endMs: Date.parse(cadence.endAt),
      observedPostsPerWeek: cadence.observedPostsPerWeek,
      evidenceRefs: unique(cadence.evidenceRefs)
    }));
  }
  return result;
}

function patternValue(
  observation: SocialPeerPublicObservationV1,
  dimension: SocialPeerShiftPatternDimensionV1
): string | null {
  switch (dimension) {
    case "FORMAT": return observation.format;
    case "SERIES": return observation.seriesLabel;
    case "HOOK": return observation.hookText;
    case "TITLE_PATTERN": return observation.titlePattern;
  }
}

function patternCounts(
  snapshot: SocialPeerPublicEvidenceV1,
  cadence: ComparableCadence
): Map<string, PatternCount> {
  const groups = new Map<string, {
    dimension: SocialPeerShiftPatternDimensionV1;
    value: string;
    contentIds: Set<string>;
    evidenceRefs: string[];
  }>();

  for (const observation of snapshot.observations) {
    if (
      observation.peerId !== cadence.peerId ||
      observation.platform !== cadence.platform ||
      observation.contentId === null ||
      observation.freshness !== "CURRENT"
    ) continue;
    const observedAtMs = Date.parse(observation.observedAt);
    if (observedAtMs < cadence.startMs || observedAtMs > cadence.endMs) continue;

    for (const dimension of PATTERN_DIMENSIONS) {
      const rawValue = patternValue(observation, dimension);
      const normalized = rawValue?.trim();
      if (!normalized) continue;
      const key = `${dimension}\u0000${normalized.toLocaleLowerCase()}`;
      const existing = groups.get(key);
      if (existing) {
        existing.contentIds.add(observation.contentId);
        existing.evidenceRefs.push(...observation.evidenceRefs);
      } else {
        groups.set(key, {
          dimension,
          value: normalized,
          contentIds: new Set([observation.contentId]),
          evidenceRefs: [...observation.evidenceRefs]
        });
      }
    }
  }

  return new Map(
    [...groups.entries()].map(([key, group]) => [key, freeze({
      dimension: group.dimension,
      value: group.value,
      distinctContentCount: group.contentIds.size,
      evidenceRefs: unique(group.evidenceRefs)
    })])
  );
}

function compareWindows(
  prior: ComparableCadence,
  current: ComparableCadence,
  maxWindowGapHours: number
): boolean {
  const priorDuration = prior.endMs - prior.startMs;
  const currentDuration = current.endMs - current.startMs;
  if (priorDuration <= 0 || currentDuration <= 0 || priorDuration !== currentDuration) return false;
  if (current.startMs < prior.endMs) return false;
  const gapHours = (current.startMs - prior.endMs) / 3_600_000;
  return gapHours <= maxWindowGapHours;
}

function patternStatement(
  kind: Extract<SocialPeerShiftKindV1, "PATTERN_EMERGED" | "PATTERN_RECEDED">,
  peerDisplayName: string,
  platform: SocialPlatformV1,
  dimension: SocialPeerShiftPatternDimensionV1,
  value: string,
  priorCount: number,
  currentCount: number,
  threshold: number
): string {
  const direction = kind === "PATTERN_EMERGED" ? "rose above" : "fell below";
  return `${safeLabel(peerDisplayName)} had ${priorCount} then ${currentCount} distinct observed ${platform} content items tagged ${dimension.toLowerCase()} “${safeLabel(value)}” across two complete comparable public-timeline windows, so observed usage ${direction} the configured repeated-pattern review threshold of ${threshold}. This is a public content-pattern observation only; it does not establish performance, audience growth, causality, endorsement, sponsorship, or any relationship.`;
}

function cadenceStatement(
  kind: Extract<SocialPeerShiftKindV1, "CADENCE_INCREASED" | "CADENCE_DECREASED">,
  peerDisplayName: string,
  platform: SocialPlatformV1,
  priorRate: number,
  currentRate: number
): string {
  const direction = kind === "CADENCE_INCREASED" ? "increased" : "decreased";
  return `${safeLabel(peerDisplayName)} observed ${platform} posting cadence ${direction} from ${priorRate} to ${currentRate} posts per week across two complete comparable public-timeline windows. This is cadence observation only; it does not establish content performance, audience growth, strategy, causality, or future behavior.`;
}

function reviewPair(
  priorSnapshot: SocialPeerPublicEvidenceV1,
  currentSnapshot: SocialPeerPublicEvidenceV1,
  prior: ComparableCadence,
  current: ComparableCadence,
  policy: SocialPeerShiftPolicyV1
): SocialPeerShiftItemV1[] {
  const items: SocialPeerShiftItemV1[] = [];
  const priorPatterns = patternCounts(priorSnapshot, prior);
  const currentPatterns = patternCounts(currentSnapshot, current);
  const patternKeys = [...new Set([...priorPatterns.keys(), ...currentPatterns.keys()])].sort((left, right) => left.localeCompare(right));

  for (const key of patternKeys) {
    const priorPattern = priorPatterns.get(key);
    const currentPattern = currentPatterns.get(key);
    const representative = currentPattern ?? priorPattern;
    if (!representative) continue;
    const priorCount = priorPattern?.distinctContentCount ?? 0;
    const currentCount = currentPattern?.distinctContentCount ?? 0;
    const wasRepeated = priorCount >= policy.minDistinctPostsForPattern;
    const isRepeated = currentCount >= policy.minDistinctPostsForPattern;
    if (wasRepeated === isRepeated) continue;

    const kind: Extract<SocialPeerShiftKindV1, "PATTERN_EMERGED" | "PATTERN_RECEDED"> = isRepeated
      ? "PATTERN_EMERGED"
      : "PATTERN_RECEDED";
    items.push(freeze({
      shiftId: shiftId([current.peerId, current.platform, kind, representative.dimension, representative.value.toLocaleLowerCase()]),
      peerId: current.peerId,
      peerDisplayName: current.peerDisplayName,
      platform: current.platform,
      kind,
      dimension: representative.dimension,
      value: representative.value,
      priorObservedCount: priorCount,
      currentObservedCount: currentCount,
      priorPostsPerWeek: null,
      currentPostsPerWeek: null,
      priorWindowStartAt: prior.startAt,
      priorWindowEndAt: prior.endAt,
      currentWindowStartAt: current.startAt,
      currentWindowEndAt: current.endAt,
      evidenceRefs: unique([
        ...prior.evidenceRefs,
        ...current.evidenceRefs,
        ...(priorPattern?.evidenceRefs ?? []),
        ...(currentPattern?.evidenceRefs ?? [])
      ]),
      statement: patternStatement(
        kind,
        current.peerDisplayName,
        current.platform,
        representative.dimension,
        representative.value,
        priorCount,
        currentCount,
        policy.minDistinctPostsForPattern
      ),
      alertReviewCandidate: true,
      performanceClaim: false,
      audienceGrowthClaim: false,
      causalClaim: false,
      relationshipClaim: false,
      endorsementClaim: false,
      attributionClaim: false
    }));
  }

  const cadenceDelta = current.observedPostsPerWeek - prior.observedPostsPerWeek;
  if (Math.abs(cadenceDelta) >= policy.minAbsoluteCadenceDeltaPerWeek) {
    const kind: Extract<SocialPeerShiftKindV1, "CADENCE_INCREASED" | "CADENCE_DECREASED"> = cadenceDelta > 0
      ? "CADENCE_INCREASED"
      : "CADENCE_DECREASED";
    items.push(freeze({
      shiftId: shiftId([current.peerId, current.platform, kind]),
      peerId: current.peerId,
      peerDisplayName: current.peerDisplayName,
      platform: current.platform,
      kind,
      dimension: null,
      value: null,
      priorObservedCount: null,
      currentObservedCount: null,
      priorPostsPerWeek: prior.observedPostsPerWeek,
      currentPostsPerWeek: current.observedPostsPerWeek,
      priorWindowStartAt: prior.startAt,
      priorWindowEndAt: prior.endAt,
      currentWindowStartAt: current.startAt,
      currentWindowEndAt: current.endAt,
      evidenceRefs: unique([...prior.evidenceRefs, ...current.evidenceRefs]),
      statement: cadenceStatement(
        kind,
        current.peerDisplayName,
        current.platform,
        prior.observedPostsPerWeek,
        current.observedPostsPerWeek
      ),
      alertReviewCandidate: true,
      performanceClaim: false,
      audienceGrowthClaim: false,
      causalClaim: false,
      relationshipClaim: false,
      endorsementClaim: false,
      attributionClaim: false
    }));
  }

  return items;
}

export function compileSocialPeerShiftReviewV1(input: SocialPeerShiftReviewInputV1): SocialPeerShiftReviewV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  const evaluatedAt = requireIso(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(evaluatedAt);
  const policy = freeze({
    maxCurrentEvidenceAgeHours: requirePositiveFinite(
      input.policy.maxCurrentEvidenceAgeHours,
      "policy.maxCurrentEvidenceAgeHours"
    ),
    maxWindowGapHours: requireNonNegativeFinite(input.policy.maxWindowGapHours, "policy.maxWindowGapHours"),
    minDistinctPostsForPattern: requirePositiveInteger(
      input.policy.minDistinctPostsForPattern,
      "policy.minDistinctPostsForPattern"
    ),
    minAbsoluteCadenceDeltaPerWeek: requirePositiveFinite(
      input.policy.minAbsoluteCadenceDeltaPerWeek,
      "policy.minAbsoluteCadenceDeltaPerWeek"
    )
  });

  assertSnapshotIntegrity(input.prior, "prior", evaluatedAtMs);
  assertSnapshotIntegrity(input.current, "current", evaluatedAtMs);

  const priorAsOfMs = Date.parse(input.prior.asOf);
  const currentAsOfMs = Date.parse(input.current.asOf);
  if (currentAsOfMs <= priorAsOfMs) throw new Error("current.asOf must be after prior.asOf");

  const verificationReasons: SocialPeerShiftVerificationReasonV1[] = [];
  if (input.prior.status !== "READY" || input.prior.staleObservationIds.length > 0) {
    verificationReasons.push("PRIOR_EVIDENCE_NOT_READY");
  }
  if (input.current.status !== "READY" || input.current.staleObservationIds.length > 0) {
    verificationReasons.push("CURRENT_EVIDENCE_NOT_READY");
  }
  if (evaluatedAtMs - currentAsOfMs > policy.maxCurrentEvidenceAgeHours * 3_600_000) {
    verificationReasons.push("CURRENT_EVIDENCE_STALE");
  }

  if (verificationReasons.length) {
    return freeze({
      contractVersion: SOCIAL_PEER_SHIFT_REVIEW_V1_VERSION,
      evaluatedAt,
      status: "VERIFY_REQUIRED" as const,
      items: [],
      verificationReasons: unique(verificationReasons) as SocialPeerShiftVerificationReasonV1[],
      comparisonCoverage: freeze({
        comparedIdentityCount: 0,
        skippedIdentityCount: 0,
        comparedIdentityKeys: [],
        skippedIdentityKeys: []
      }),
      guardrails: [
        "Peer shifts are withheld when canonical public evidence is stale, partial, conflicted, or otherwise not decision-ready.",
        "No missing public observation is interpreted as a performance, growth, relationship, endorsement, sponsorship, or strategy signal.",
        "This review performs no scraping, provider access, notification, posting, paid-media action, persistence write, or other external action."
      ],
      notificationAuthority: "NONE" as const,
      paidMediaAuthority: "NONE" as const,
      postingAuthority: "NONE" as const,
      externalAccessPerformed: false as const,
      writesPerformed: false as const
    });
  }

  const priorCadence = completeCadenceMap(input.prior);
  const currentCadence = completeCadenceMap(input.current);
  const allKeys = [...new Set([...priorCadence.keys(), ...currentCadence.keys()])].sort((left, right) => left.localeCompare(right));
  const comparedIdentityKeys: string[] = [];
  const skippedIdentityKeys: string[] = [];
  const items: SocialPeerShiftItemV1[] = [];

  for (const key of allKeys) {
    const prior = priorCadence.get(key);
    const current = currentCadence.get(key);
    if (!prior || !current || !compareWindows(prior, current, policy.maxWindowGapHours)) {
      skippedIdentityKeys.push(key);
      continue;
    }
    if (prior.peerDisplayName.toLocaleLowerCase() !== current.peerDisplayName.toLocaleLowerCase()) {
      throw new Error(`conflicting peer identity across snapshots for ${prior.peerId}/${prior.platform}`);
    }
    comparedIdentityKeys.push(key);
    items.push(...reviewPair(input.prior, input.current, prior, current, policy));
  }

  items.sort((left, right) =>
    left.peerDisplayName.localeCompare(right.peerDisplayName) ||
    left.platform.localeCompare(right.platform) ||
    left.kind.localeCompare(right.kind) ||
    (left.dimension ?? "").localeCompare(right.dimension ?? "") ||
    (left.value ?? "").localeCompare(right.value ?? "")
  );
  const boundedItems = items.slice(0, SOCIAL_PEER_SHIFT_MAX_ITEMS_V1);

  let status: SocialPeerShiftReviewStatusV1;
  if (!comparedIdentityKeys.length) status = "INSUFFICIENT_EVIDENCE";
  else if (skippedIdentityKeys.length) status = "PARTIAL";
  else if (boundedItems.length) status = "READY_FOR_REVIEW";
  else status = "NO_MATERIAL_SHIFT";

  const guardrails = [
    "A peer shift is an observed difference across two complete, equal-duration, non-overlapping public-timeline windows; it is not a performance or growth claim.",
    "Pattern review includes only directly observed FORMAT, SERIES, HOOK, and TITLE_PATTERN usage. Visible participants are deliberately excluded so their appearance is not turned into a relationship or endorsement inference.",
    "Cadence and pattern shifts do not establish strategy, causality, sponsorship, endorsement, audience growth, business impact, or future behavior.",
    "Skipped identities remain unknown; absence from one snapshot or incomplete public coverage is never interpreted as a competitive change.",
    "Alert review is internal only. This compiler cannot notify, post, boost content, change paid media, persist provider state, or take any external action."
  ];
  if (items.length > boundedItems.length) {
    guardrails.push(`Shift output is bounded to ${SOCIAL_PEER_SHIFT_MAX_ITEMS_V1} deterministic review items.`);
  }

  return freeze({
    contractVersion: SOCIAL_PEER_SHIFT_REVIEW_V1_VERSION,
    evaluatedAt,
    status,
    items: boundedItems,
    verificationReasons: [],
    comparisonCoverage: freeze({
      comparedIdentityCount: comparedIdentityKeys.length,
      skippedIdentityCount: skippedIdentityKeys.length,
      comparedIdentityKeys,
      skippedIdentityKeys
    }),
    guardrails,
    notificationAuthority: "NONE",
    paidMediaAuthority: "NONE",
    postingAuthority: "NONE",
    externalAccessPerformed: false,
    writesPerformed: false
  });
}
