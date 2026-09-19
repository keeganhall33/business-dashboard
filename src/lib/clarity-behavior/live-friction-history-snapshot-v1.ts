import { createHash } from "node:crypto";

import {
  CLARITY_LIVE_FRICTION_RATE_VERSION,
  type ClarityLiveFrictionMetricV1,
  type ClarityLiveFrictionRateObservationV1,
  type ClarityLiveFrictionRateResultV1,
} from "./live-friction-rate-v1";

export const CLARITY_LIVE_FRICTION_HISTORY_SNAPSHOT_VERSION =
  "CLARITY_LIVE_FRICTION_HISTORY_SNAPSHOT_V1" as const;

export type ClarityLiveFrictionHistorySnapshotReasonV1 =
  | "READY_FOR_INTERNAL_PERSISTENCE"
  | "INVALID_INPUT"
  | "SOURCE_NOT_READY"
  | "SOURCE_PROVENANCE_INVALID"
  | "SOURCE_NOT_COMPLETE"
  | "COVERAGE_INVALID"
  | "FUTURE_EVIDENCE"
  | "STALE_EVIDENCE"
  | "EVIDENCE_REF_INVALID"
  | "OBSERVATION_INVALID"
  | "FRICTION_METRIC_COVERAGE_INCOMPLETE"
  | "SOURCE_AUTHORITY_WIDENED";

export type ClarityLiveFrictionHistorySnapshotV1 = Readonly<{
  version: typeof CLARITY_LIVE_FRICTION_HISTORY_SNAPSHOT_VERSION;
  sourceVersion: typeof CLARITY_LIVE_FRICTION_RATE_VERSION;
  state: "READY_FOR_INTERNAL_PERSISTENCE" | "WITHHELD";
  reasonCodes: readonly ClarityLiveFrictionHistorySnapshotReasonV1[];
  snapshotId: string | null;
  capturedAt: string | null;
  coverage: Readonly<{
    lookbackDays: 1 | 2 | 3 | null;
    requestedWindow: Readonly<{ startAt: string; endAt: string }> | null;
    observedWindow: Readonly<{ startAt: string; endAt: string }> | null;
    dimensions: readonly string[];
    sourceTruth: "COMPLETE" | string;
  }>;
  observations: readonly ClarityLiveFrictionRateObservationV1[];
  evidenceRefs: readonly string[];
  limitations: Readonly<{
    descriptiveProviderRateOnly: true;
    affectedSessionCountsInferred: false;
    historyComparisonEstablished: false;
    causalityEstablished: false;
    attributionEstablished: false;
    statisticalSignificanceEstablished: false;
    monetaryImpactEstablished: false;
    eligibleForConversionRecommendation: false;
  }>;
  authority: Readonly<{
    internalPersistenceHandoffAllowed: boolean;
    persistencePerformed: false;
    siteMutationAllowed: false;
    checkoutMutationAllowed: false;
    trackingMutationAllowed: false;
    pricingMutationAllowed: false;
    metaWriteAllowed: false;
    externalMutationAllowed: false;
  }>;
}>;

export type PrepareClarityLiveFrictionHistorySnapshotInputV1 = Readonly<{
  source: ClarityLiveFrictionRateResultV1;
  evaluatedAt: string;
  maxAgeHours: number;
}>;

const EXPECTED_METRICS: readonly ClarityLiveFrictionMetricV1[] = Object.freeze([
  "DEAD_CLICK",
  "RAGE_CLICK",
  "QUICK_BACK",
  "EXCESSIVE_SCROLL",
  "SCRIPT_ERROR",
  "ERROR_CLICK",
]);
const EXPECTED_METRIC_SET = new Set<ClarityLiveFrictionMetricV1>(EXPECTED_METRICS);
const MAX_OBSERVATIONS = 1_000;
const MAX_EVIDENCE_REFS = 24;
const MAX_DIMENSIONS = 3;
const PERCENT_COMPLEMENT_TOLERANCE = 1;
const HOUR_MS = 60 * 60 * 1_000;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function canonicalInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function safeText(value: unknown, maximumLength = 240): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maximumLength &&
    !/[\r\n]/.test(value) &&
    !/(?:bearer\s+|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[=:]/i.test(
      value,
    ) &&
    !/[?&](?:access_token|token|api_key|key)=/i.test(value)
  );
}

function finitePercentage(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function finiteCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validWindow(value: unknown): value is Readonly<{ startAt: string; endAt: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const window = value as { startAt?: unknown; endAt?: unknown };
  return (
    canonicalInstant(window.startAt) &&
    canonicalInstant(window.endAt) &&
    Date.parse(window.startAt) < Date.parse(window.endAt)
  );
}

function sameWindow(
  left: Readonly<{ startAt: string; endAt: string }>,
  right: Readonly<{ startAt: string; endAt: string }>,
): boolean {
  return left.startAt === right.startAt && left.endAt === right.endAt;
}

function authorityIsReadOnly(source: ClarityLiveFrictionRateResultV1): boolean {
  return Boolean(
    source.authority &&
      source.authority.persistencePerformed === false &&
      source.authority.siteMutationAllowed === false &&
      source.authority.checkoutMutationAllowed === false &&
      source.authority.trackingMutationAllowed === false &&
      source.authority.pricingMutationAllowed === false &&
      source.authority.metaWriteAllowed === false &&
      source.authority.externalMutationAllowed === false
  );
}

function limitationsRemainBounded(source: ClarityLiveFrictionRateResultV1): boolean {
  return Boolean(
    source.limitations &&
      source.limitations.descriptiveProviderRateOnly === true &&
      source.limitations.affectedSessionCountsInferred === false &&
      source.limitations.causalityEstablished === false &&
      source.limitations.attributionEstablished === false &&
      source.limitations.statisticalSignificanceEstablished === false &&
      source.limitations.monetaryImpactEstablished === false &&
      source.limitations.eligibleForConversionRecommendation === false
  );
}

function safeEvidenceRefs(value: unknown): readonly string[] | null {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_EVIDENCE_REFS ||
    value.some((ref) => !safeText(ref))
  ) {
    return null;
  }
  const normalized = value.map((ref) => (ref as string).trim());
  if (new Set(normalized).size !== normalized.length) return null;
  return Object.freeze([...normalized].sort((left, right) => left.localeCompare(right)));
}

function validDimensions(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length > MAX_DIMENSIONS || value.some((item) => !safeText(item, 80))) {
    return null;
  }
  const normalized = value.map((item) => (item as string).trim());
  if (new Set(normalized).size !== normalized.length) return null;
  return Object.freeze([...normalized]);
}

function validObservation(
  observation: ClarityLiveFrictionRateObservationV1,
  dimensions: readonly string[],
  evidenceRefs: ReadonlySet<string>,
): boolean {
  if (
    !observation ||
    !EXPECTED_METRIC_SET.has(observation.metric) ||
    !safeText(observation.providerMetricName, 120) ||
    !Number.isSafeInteger(observation.rowIndex) ||
    observation.rowIndex < 0 ||
    !finiteCount(observation.sessionsCount) ||
    !finitePercentage(observation.sessionsWithMetricPercent) ||
    !finitePercentage(observation.sessionsWithoutMetricPercent) ||
    Math.abs(
      observation.sessionsWithMetricPercent + observation.sessionsWithoutMetricPercent - 100,
    ) > PERCENT_COMPLEMENT_TOLERANCE ||
    observation.affectedSessionCount !== null ||
    observation.affectedSessionCountReason !==
      "PROVIDER_EXPORT_EXPOSES_PERCENTAGE_NOT_EXACT_AFFECTED_SESSION_COUNT" ||
    !safeText(observation.evidenceRef) ||
    !evidenceRefs.has(observation.evidenceRef) ||
    !observation.dimensions ||
    typeof observation.dimensions !== "object" ||
    Array.isArray(observation.dimensions)
  ) {
    return false;
  }

  const keys = Object.keys(observation.dimensions);
  if (keys.length !== dimensions.length || keys.some((key) => !dimensions.includes(key))) return false;
  return dimensions.every((dimension) => safeText(observation.dimensions[dimension], 300));
}

function observationIdentity(
  observation: ClarityLiveFrictionRateObservationV1,
  dimensions: readonly string[],
): string {
  return JSON.stringify([
    observation.metric,
    ...dimensions.map((dimension) => [dimension, observation.dimensions[dimension]]),
  ]);
}

function canonicalObservation(
  observation: ClarityLiveFrictionRateObservationV1,
  dimensions: readonly string[],
): ClarityLiveFrictionRateObservationV1 {
  return {
    ...observation,
    dimensions: Object.fromEntries(
      dimensions.map((dimension) => [dimension, observation.dimensions[dimension]]),
    ),
  };
}

function withheld(
  input: Partial<PrepareClarityLiveFrictionHistorySnapshotInputV1>,
  reasons: readonly ClarityLiveFrictionHistorySnapshotReasonV1[],
): ClarityLiveFrictionHistorySnapshotV1 {
  const source = input.source;
  const dimensions = validDimensions(source?.coverage?.dimensions) ?? [];
  const requestedWindow = validWindow(source?.coverage?.requestedWindow)
    ? { ...source.coverage.requestedWindow }
    : null;
  const observedWindow = validWindow(source?.coverage?.observedWindow)
    ? { ...source.coverage.observedWindow }
    : null;
  const lookbackDays = [1, 2, 3].includes(source?.coverage?.lookbackDays as number)
    ? (source?.coverage?.lookbackDays as 1 | 2 | 3)
    : null;

  return deepFreeze({
    version: CLARITY_LIVE_FRICTION_HISTORY_SNAPSHOT_VERSION,
    sourceVersion: CLARITY_LIVE_FRICTION_RATE_VERSION,
    state: "WITHHELD",
    reasonCodes: [...new Set(reasons)].sort(),
    snapshotId: null,
    capturedAt: canonicalInstant(source?.coverage?.extractedAt) ? source.coverage.extractedAt : null,
    coverage: {
      lookbackDays,
      requestedWindow,
      observedWindow,
      dimensions: [...dimensions],
      sourceTruth: typeof source?.coverage?.sourceTruth === "string" ? source.coverage.sourceTruth : "UNKNOWN",
    },
    observations: [],
    evidenceRefs: [],
    limitations: {
      descriptiveProviderRateOnly: true,
      affectedSessionCountsInferred: false,
      historyComparisonEstablished: false,
      causalityEstablished: false,
      attributionEstablished: false,
      statisticalSignificanceEstablished: false,
      monetaryImpactEstablished: false,
      eligibleForConversionRecommendation: false,
    },
    authority: {
      internalPersistenceHandoffAllowed: false,
      persistencePerformed: false,
      siteMutationAllowed: false,
      checkoutMutationAllowed: false,
      trackingMutationAllowed: false,
      pricingMutationAllowed: false,
      metaWriteAllowed: false,
      externalMutationAllowed: false,
    },
  });
}

export function prepareClarityLiveFrictionHistorySnapshotV1(
  input: PrepareClarityLiveFrictionHistorySnapshotInputV1,
): ClarityLiveFrictionHistorySnapshotV1 {
  if (
    !input ||
    !input.source ||
    !canonicalInstant(input.evaluatedAt) ||
    typeof input.maxAgeHours !== "number" ||
    !Number.isFinite(input.maxAgeHours) ||
    input.maxAgeHours <= 0 ||
    input.maxAgeHours > 168
  ) {
    return withheld(input ?? {}, ["INVALID_INPUT"]);
  }

  const source = input.source;
  if (
    source.version !== CLARITY_LIVE_FRICTION_RATE_VERSION ||
    source.state !== "READY_FOR_BEHAVIOR_REVIEW" ||
    !source.reasonCodes.includes("READY_FOR_BEHAVIOR_REVIEW")
  ) {
    return withheld(input, ["SOURCE_NOT_READY"]);
  }

  if (!authorityIsReadOnly(source)) return withheld(input, ["SOURCE_AUTHORITY_WIDENED"]);
  if (!limitationsRemainBounded(source)) return withheld(input, ["SOURCE_PROVENANCE_INVALID"]);
  if (source.coverage.sourceTruth !== "COMPLETE") return withheld(input, ["SOURCE_NOT_COMPLETE"]);

  const dimensions = validDimensions(source.coverage.dimensions);
  const requestedWindow = source.coverage.requestedWindow;
  const observedWindow = source.coverage.observedWindow;
  const extractedAt = source.coverage.extractedAt;
  const lookbackDays = source.coverage.lookbackDays;
  if (
    !dimensions ||
    !validWindow(requestedWindow) ||
    !validWindow(observedWindow) ||
    !sameWindow(requestedWindow, observedWindow) ||
    !canonicalInstant(extractedAt) ||
    ![1, 2, 3].includes(lookbackDays as number)
  ) {
    return withheld(input, ["COVERAGE_INVALID"]);
  }

  const extractedAtMs = Date.parse(extractedAt);
  const evaluatedAtMs = Date.parse(input.evaluatedAt);
  if (extractedAtMs > evaluatedAtMs) return withheld(input, ["FUTURE_EVIDENCE"]);
  if (evaluatedAtMs - extractedAtMs > input.maxAgeHours * HOUR_MS) {
    return withheld(input, ["STALE_EVIDENCE"]);
  }

  const evidenceRefs = safeEvidenceRefs(source.evidenceRefs);
  if (!evidenceRefs) return withheld(input, ["EVIDENCE_REF_INVALID"]);
  const evidenceRefSet = new Set(evidenceRefs);

  if (
    !Array.isArray(source.observations) ||
    source.observations.length === 0 ||
    source.observations.length > MAX_OBSERVATIONS
  ) {
    return withheld(input, ["OBSERVATION_INVALID"]);
  }

  const identities = new Set<string>();
  const metricsSeen = new Set<ClarityLiveFrictionMetricV1>();
  const observations: ClarityLiveFrictionRateObservationV1[] = [];
  for (const observation of source.observations) {
    if (!validObservation(observation, dimensions, evidenceRefSet)) {
      return withheld(input, ["OBSERVATION_INVALID"]);
    }
    const identity = observationIdentity(observation, dimensions);
    if (identities.has(identity)) return withheld(input, ["OBSERVATION_INVALID"]);
    identities.add(identity);
    metricsSeen.add(observation.metric);
    observations.push(canonicalObservation(observation, dimensions));
  }

  if (EXPECTED_METRICS.some((metric) => !metricsSeen.has(metric))) {
    return withheld(input, ["FRICTION_METRIC_COVERAGE_INCOMPLETE"]);
  }

  observations.sort((left, right) =>
    observationIdentity(left, dimensions).localeCompare(observationIdentity(right, dimensions)),
  );

  const snapshotPayload = JSON.stringify({
    sourceVersion: source.version,
    lookbackDays,
    requestedWindow,
    observedWindow,
    extractedAt,
    dimensions,
    evidenceRefs,
    observations,
  });
  const snapshotId = `clarity-friction:${createHash("sha256")
    .update(snapshotPayload)
    .digest("hex")
    .slice(0, 24)}`;

  return deepFreeze({
    version: CLARITY_LIVE_FRICTION_HISTORY_SNAPSHOT_VERSION,
    sourceVersion: CLARITY_LIVE_FRICTION_RATE_VERSION,
    state: "READY_FOR_INTERNAL_PERSISTENCE",
    reasonCodes: ["READY_FOR_INTERNAL_PERSISTENCE"],
    snapshotId,
    capturedAt: extractedAt,
    coverage: {
      lookbackDays: lookbackDays as 1 | 2 | 3,
      requestedWindow: { ...requestedWindow },
      observedWindow: { ...observedWindow },
      dimensions: [...dimensions],
      sourceTruth: "COMPLETE",
    },
    observations,
    evidenceRefs: [...evidenceRefs],
    limitations: {
      descriptiveProviderRateOnly: true,
      affectedSessionCountsInferred: false,
      historyComparisonEstablished: false,
      causalityEstablished: false,
      attributionEstablished: false,
      statisticalSignificanceEstablished: false,
      monetaryImpactEstablished: false,
      eligibleForConversionRecommendation: false,
    },
    authority: {
      internalPersistenceHandoffAllowed: true,
      persistencePerformed: false,
      siteMutationAllowed: false,
      checkoutMutationAllowed: false,
      trackingMutationAllowed: false,
      pricingMutationAllowed: false,
      metaWriteAllowed: false,
      externalMutationAllowed: false,
    },
  });
}
