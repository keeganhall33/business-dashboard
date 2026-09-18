import type { SocialPlatformV1 } from "./social-canonical-v1";

export const SOCIAL_PEER_PUBLIC_EVIDENCE_V1_VERSION = "SocialPeerPublicEvidenceV1" as const;
export const SOCIAL_PEER_MAX_OBSERVATIONS_V1 = 1_000;
export const SOCIAL_PEER_MAX_AGE_DAYS_V1 = 180;

export const SOCIAL_PEER_SOURCE_KINDS_V1 = [
  "PUBLIC_PLATFORM_PAGE",
  "PUBLIC_WEB_PAGE",
  "PUBLIC_SEARCH_RESULT"
] as const;
export type SocialPeerSourceKindV1 = (typeof SOCIAL_PEER_SOURCE_KINDS_V1)[number];

export const SOCIAL_PEER_PATTERN_DIMENSIONS_V1 = [
  "FORMAT",
  "SERIES",
  "HOOK",
  "TITLE_PATTERN",
  "VISIBLE_PARTICIPANT"
] as const;
export type SocialPeerPatternDimensionV1 = (typeof SOCIAL_PEER_PATTERN_DIMENSIONS_V1)[number];

export type SocialPeerPublicObservationInputV1 = {
  observationId: string;
  peerId: string;
  peerDisplayName: string;
  platform: SocialPlatformV1;
  sourceKind: SocialPeerSourceKindV1;
  sourceRef: string;
  observedAt: string;
  capturedAt: string;
  contentId?: string | null;
  format?: string | null;
  seriesLabel?: string | null;
  hookText?: string | null;
  titlePattern?: string | null;
  visibleParticipant?: string | null;
  evidenceRefs: readonly string[];
};

export type SocialPeerCoverageWindowInputV1 = {
  peerId: string;
  platform: SocialPlatformV1;
  startAt: string;
  endAt: string;
  coverage: "COMPLETE_PUBLIC_TIMELINE" | "PARTIAL" | "UNKNOWN";
  evidenceRefs: readonly string[];
};

export type SocialPeerPublicEvidenceInputV1 = {
  asOf: string;
  observations: readonly SocialPeerPublicObservationInputV1[];
  coverageWindows?: readonly SocialPeerCoverageWindowInputV1[];
};

export type SocialPeerPublicObservationV1 = Readonly<{
  observationId: string;
  peerId: string;
  peerDisplayName: string;
  platform: SocialPlatformV1;
  sourceKind: SocialPeerSourceKindV1;
  sourceRef: string;
  observedAt: string;
  capturedAt: string;
  contentId: string | null;
  format: string | null;
  seriesLabel: string | null;
  hookText: string | null;
  titlePattern: string | null;
  visibleParticipant: string | null;
  evidenceRefs: readonly string[];
  freshness: "CURRENT" | "STALE";
  relationshipClaim: false;
  performanceClaim: false;
}>;

export type SocialPeerObservedPatternV1 = Readonly<{
  peerId: string;
  peerDisplayName: string;
  platform: SocialPlatformV1;
  dimension: SocialPeerPatternDimensionV1;
  value: string;
  distinctContentCount: number;
  evidenceRefs: readonly string[];
  statement: string;
  state: "OBSERVED_REPETITION";
  causalClaim: false;
  relationshipClaim: false;
  performanceClaim: false;
}>;

export type SocialPeerObservedCadenceV1 = Readonly<{
  peerId: string;
  peerDisplayName: string;
  platform: SocialPlatformV1;
  state: "OBSERVED_COMPLETE_WINDOW" | "UNKNOWN";
  startAt: string | null;
  endAt: string | null;
  observedPostCount: number | null;
  observedPostsPerWeek: number | null;
  evidenceRefs: readonly string[];
  limitation: string | null;
  performanceClaim: false;
}>;

export type SocialPeerPublicEvidenceV1 = Readonly<{
  contractVersion: typeof SOCIAL_PEER_PUBLIC_EVIDENCE_V1_VERSION;
  asOf: string;
  status: "READY" | "PARTIAL" | "INSUFFICIENT_EVIDENCE";
  observations: readonly SocialPeerPublicObservationV1[];
  patterns: readonly SocialPeerObservedPatternV1[];
  cadence: readonly SocialPeerObservedCadenceV1[];
  staleObservationIds: readonly string[];
  guardrails: readonly string[];
  externalAccessPerformed: false;
  writesPerformed: false;
}>;

type NormalizedCoverageWindow = Readonly<{
  peerId: string;
  platform: SocialPlatformV1;
  startAt: string;
  endAt: string;
  coverage: SocialPeerCoverageWindowInputV1["coverage"];
  evidenceRefs: readonly string[];
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

function optionalText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const normalized = value.trim();
  return normalized || null;
}

function iso(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!value || Number.isNaN(parsed)) throw new Error(`${field} must be a valid timestamp`);
  return new Date(parsed).toISOString();
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function daysBetween(earlier: string, later: string): number {
  return (Date.parse(later) - Date.parse(earlier)) / 86_400_000;
}

function coverageKey(peerId: string, platform: SocialPlatformV1): string {
  return `${peerId}\u0000${platform}`;
}

function normalizeObservation(
  input: SocialPeerPublicObservationInputV1,
  asOf: string,
  seenIds: Set<string>
): SocialPeerPublicObservationV1 {
  const observationId = nonEmpty(input.observationId, "observationId");
  if (seenIds.has(observationId)) throw new Error(`duplicate observationId: ${observationId}`);
  seenIds.add(observationId);

  if (!(SOCIAL_PEER_SOURCE_KINDS_V1 as readonly string[]).includes(input.sourceKind)) {
    throw new Error(`${observationId}.sourceKind must be a supported public source`);
  }

  const peerId = nonEmpty(input.peerId, `${observationId}.peerId`);
  const peerDisplayName = nonEmpty(input.peerDisplayName, `${observationId}.peerDisplayName`);
  const sourceRef = nonEmpty(input.sourceRef, `${observationId}.sourceRef`);
  const observedAt = iso(input.observedAt, `${observationId}.observedAt`);
  const capturedAt = iso(input.capturedAt, `${observationId}.capturedAt`);
  if (Date.parse(observedAt) > Date.parse(capturedAt)) {
    throw new Error(`${observationId}.observedAt cannot be after capturedAt`);
  }
  if (Date.parse(capturedAt) > Date.parse(asOf)) {
    throw new Error(`${observationId}.capturedAt cannot be after asOf`);
  }
  const evidenceRefs = unique(input.evidenceRefs ?? []);
  if (!evidenceRefs.length) throw new Error(`${observationId} requires public/compliant evidence`);

  return freeze({
    observationId,
    peerId,
    peerDisplayName,
    platform: input.platform,
    sourceKind: input.sourceKind,
    sourceRef,
    observedAt,
    capturedAt,
    contentId: optionalText(input.contentId),
    format: optionalText(input.format),
    seriesLabel: optionalText(input.seriesLabel),
    hookText: optionalText(input.hookText),
    titlePattern: optionalText(input.titlePattern),
    visibleParticipant: optionalText(input.visibleParticipant),
    evidenceRefs,
    freshness: daysBetween(capturedAt, asOf) <= SOCIAL_PEER_MAX_AGE_DAYS_V1 ? "CURRENT" : "STALE",
    relationshipClaim: false as const,
    performanceClaim: false as const
  });
}

function validatePeerIdentity(observations: readonly SocialPeerPublicObservationV1[]): void {
  const names = new Map<string, string>();
  for (const observation of observations) {
    const key = coverageKey(observation.peerId, observation.platform);
    const prior = names.get(key);
    if (prior && prior.toLocaleLowerCase() !== observation.peerDisplayName.toLocaleLowerCase()) {
      throw new Error(`conflicting peer identity for ${observation.peerId}/${observation.platform}`);
    }
    names.set(key, observation.peerDisplayName);
  }
}

function patternDimensions(observation: SocialPeerPublicObservationV1): Array<[SocialPeerPatternDimensionV1, string]> {
  const candidates: Array<[SocialPeerPatternDimensionV1, string | null]> = [
    ["FORMAT", observation.format],
    ["SERIES", observation.seriesLabel],
    ["HOOK", observation.hookText],
    ["TITLE_PATTERN", observation.titlePattern],
    ["VISIBLE_PARTICIPANT", observation.visibleParticipant]
  ];
  return candidates.flatMap(([dimension, value]) => (value ? [[dimension, value] as [SocialPeerPatternDimensionV1, string]] : []));
}

function compilePatterns(observations: readonly SocialPeerPublicObservationV1[]): SocialPeerObservedPatternV1[] {
  const groups = new Map<
    string,
    {
      peerId: string;
      peerDisplayName: string;
      platform: SocialPlatformV1;
      dimension: SocialPeerPatternDimensionV1;
      value: string;
      byContent: Map<string, SocialPeerPublicObservationV1>;
    }
  >();

  for (const observation of observations) {
    if (observation.freshness !== "CURRENT" || !observation.contentId) continue;
    for (const [dimension, value] of patternDimensions(observation)) {
      const key = [observation.peerId, observation.platform, dimension, value.toLocaleLowerCase()].join("\u0000");
      const existing = groups.get(key);
      if (existing) existing.byContent.set(observation.contentId, observation);
      else {
        groups.set(key, {
          peerId: observation.peerId,
          peerDisplayName: observation.peerDisplayName,
          platform: observation.platform,
          dimension,
          value,
          byContent: new Map([[observation.contentId, observation]])
        });
      }
    }
  }

  return [...groups.values()]
    .filter((group) => group.byContent.size >= 2)
    .map((group) => {
      const distinctObservations = [...group.byContent.values()];
      return freeze({
        peerId: group.peerId,
        peerDisplayName: group.peerDisplayName,
        platform: group.platform,
        dimension: group.dimension,
        value: group.value,
        distinctContentCount: distinctObservations.length,
        evidenceRefs: unique(distinctObservations.flatMap((observation) => observation.evidenceRefs)),
        statement: `${group.peerDisplayName} has ${distinctObservations.length} distinct directly observed ${group.platform} content items tagged ${group.dimension.toLowerCase()} “${group.value}” in the bounded evidence set. This establishes repetition only, not performance, causality, endorsement, or a relationship.`,
        state: "OBSERVED_REPETITION" as const,
        causalClaim: false as const,
        relationshipClaim: false as const,
        performanceClaim: false as const
      });
    })
    .sort((a, b) =>
      a.peerDisplayName.localeCompare(b.peerDisplayName) ||
      a.platform.localeCompare(b.platform) ||
      a.dimension.localeCompare(b.dimension) ||
      a.value.localeCompare(b.value)
    );
}

function compileCadence(
  observations: readonly SocialPeerPublicObservationV1[],
  coverageWindows: readonly SocialPeerCoverageWindowInputV1[]
): SocialPeerObservedCadenceV1[] {
  const windows = new Map<string, NormalizedCoverageWindow>();
  for (const [index, input] of coverageWindows.entries()) {
    const peerId = nonEmpty(input.peerId, `coverageWindows[${index}].peerId`);
    const startAt = iso(input.startAt, `coverageWindows[${index}].startAt`);
    const endAt = iso(input.endAt, `coverageWindows[${index}].endAt`);
    if (Date.parse(endAt) <= Date.parse(startAt)) throw new Error(`coverageWindows[${index}] must have a positive duration`);
    const evidenceRefs = unique(input.evidenceRefs ?? []);
    if (!evidenceRefs.length) throw new Error(`coverageWindows[${index}] requires evidence`);
    const key = coverageKey(peerId, input.platform);
    if (windows.has(key)) throw new Error(`duplicate coverage window for ${peerId}/${input.platform}`);
    windows.set(key, freeze({
      peerId,
      platform: input.platform,
      startAt,
      endAt,
      coverage: input.coverage,
      evidenceRefs
    }));
  }

  const identities = new Map<string, { peerId: string; peerDisplayName: string; platform: SocialPlatformV1 }>();
  for (const observation of observations) {
    identities.set(coverageKey(observation.peerId, observation.platform), {
      peerId: observation.peerId,
      peerDisplayName: observation.peerDisplayName,
      platform: observation.platform
    });
  }
  for (const key of windows.keys()) {
    if (!identities.has(key)) throw new Error("coverage window requires at least one matching public observation");
  }

  return [...identities.entries()]
    .map(([key, identity]) => {
      const window = windows.get(key);
      if (!window || window.coverage !== "COMPLETE_PUBLIC_TIMELINE") {
        return freeze({
          ...identity,
          state: "UNKNOWN" as const,
          startAt: window?.startAt ?? null,
          endAt: window?.endAt ?? null,
          observedPostCount: null,
          observedPostsPerWeek: null,
          evidenceRefs: window ? unique(window.evidenceRefs) : [],
          limitation: "Posting cadence remains UNKNOWN because complete public-timeline coverage was not evidenced.",
          performanceClaim: false as const
        });
      }

      const rows = observations.filter(
        (observation) =>
          observation.peerId === identity.peerId &&
          observation.platform === identity.platform &&
          observation.contentId !== null &&
          Date.parse(observation.observedAt) >= Date.parse(window.startAt) &&
          Date.parse(observation.observedAt) <= Date.parse(window.endAt)
      );
      const distinctPostIds = new Set(rows.map((row) => row.contentId as string));
      const durationDays = daysBetween(window.startAt, window.endAt);
      const evidenceRefs = unique([...window.evidenceRefs, ...rows.flatMap((row) => row.evidenceRefs)]);
      return freeze({
        ...identity,
        state: "OBSERVED_COMPLETE_WINDOW" as const,
        startAt: window.startAt,
        endAt: window.endAt,
        observedPostCount: distinctPostIds.size,
        observedPostsPerWeek: Math.round((distinctPostIds.size / durationDays) * 7 * 1000) / 1000,
        evidenceRefs,
        limitation: "Cadence describes only the evidenced complete public window; it is not a forecast or performance claim.",
        performanceClaim: false as const
      });
    })
    .sort((a, b) => a.peerDisplayName.localeCompare(b.peerDisplayName) || a.platform.localeCompare(b.platform));
}

export function compileSocialPeerPublicEvidenceV1(input: SocialPeerPublicEvidenceInputV1): SocialPeerPublicEvidenceV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.observations)) throw new Error("observations must be an array");
  if (input.observations.length > SOCIAL_PEER_MAX_OBSERVATIONS_V1) {
    throw new Error(`at most ${SOCIAL_PEER_MAX_OBSERVATIONS_V1} peer observations are allowed`);
  }
  const asOf = iso(input.asOf, "asOf");
  const seenIds = new Set<string>();
  const observations = freeze(input.observations.map((observation) => normalizeObservation(observation, asOf, seenIds)));
  validatePeerIdentity(observations);
  const patterns = freeze(compilePatterns(observations));
  const cadence = freeze(compileCadence(observations, input.coverageWindows ?? []));
  const staleObservationIds = freeze(
    observations.filter((observation) => observation.freshness === "STALE").map((observation) => observation.observationId).sort()
  );
  const currentCount = observations.length - staleObservationIds.length;
  const status = currentCount === 0
    ? "INSUFFICIENT_EVIDENCE"
    : staleObservationIds.length > 0
      ? "PARTIAL"
      : "READY";

  return freeze({
    contractVersion: SOCIAL_PEER_PUBLIC_EVIDENCE_V1_VERSION,
    asOf,
    status,
    observations,
    patterns,
    cadence,
    staleObservationIds,
    guardrails: [
      "Only directly observed public/compliant facts are represented.",
      "Repeated formats, hooks, series, titles, or visible participants do not establish performance, causality, endorsement, sponsorship, or a relationship.",
      "Competitor private metrics, audience quality, revenue, conversion, paid amplification, growth, and attribution remain UNKNOWN unless separately evidenced through a compliant source.",
      "Cadence is calculated only from an explicitly evidenced complete public-timeline window and deduplicated content identities.",
      "This compiler performs no scraping, provider access, messaging, posting, account mutation, or other external action."
    ],
    externalAccessPerformed: false as const,
    writesPerformed: false as const
  });
}
