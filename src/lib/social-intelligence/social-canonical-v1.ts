export const SOCIAL_PLATFORMS_V1 = [
  "INSTAGRAM",
  "FACEBOOK",
  "YOUTUBE",
  "TIKTOK",
  "X",
  "THREADS",
  "LINKEDIN"
] as const;

export type SocialPlatformV1 = (typeof SOCIAL_PLATFORMS_V1)[number];

export const SOCIAL_SOURCE_HEALTH_STATES_V1 = [
  "CONNECTED_AND_INGESTING",
  "CONNECTED_PARTIAL",
  "AVAILABLE_NEEDS_IMPLEMENTATION",
  "NEEDS_KEEGAN_CONNECTION",
  "NOT_AVAILABLE",
  "NOT_RECOMMENDED"
] as const;

export type SocialSourceHealthStateV1 = (typeof SOCIAL_SOURCE_HEALTH_STATES_V1)[number];

export const SOCIAL_METRIC_KEYS_V1 = [
  "AUDIENCE_TOTAL",
  "NET_NEW_AUDIENCE",
  "IMPRESSIONS",
  "REACH",
  "VIEWS",
  "UNIQUE_VIEWERS",
  "WATCH_TIME_SECONDS",
  "AVERAGE_VIEW_DURATION_SECONDS",
  "LIKES",
  "COMMENTS",
  "SHARES",
  "SAVES",
  "PROFILE_VISITS",
  "LINK_CLICKS",
  "CONTENT_COUNT"
] as const;

export type SocialMetricKeyV1 = (typeof SOCIAL_METRIC_KEYS_V1)[number];
export type SocialMetricTruthStateV1 = "KNOWN" | "UNKNOWN";
export type SocialFreshnessV1 = "FRESH" | "STALE" | "NEVER_SYNCED";
export type SocialHistoryWindowV1 = "7D" | "30D" | "90D" | "12M";
export type SocialMetricDirectionV1 = "UP" | "DOWN" | "FLAT" | "UNKNOWN";
export type SocialAttributionConfidenceV1 = "DIRECT" | "STRONG" | "MODERATE" | "WEAK" | "UNKNOWN";

export type SocialMetricDefinitionV1 = {
  key: SocialMetricKeyV1;
  label: string;
  unit: "COUNT" | "SECONDS";
  aggregation: "POINT_IN_TIME" | "PERIOD_TOTAL" | "PER_CONTENT_AVERAGE";
  comparisonPolicy: "WITHIN_PLATFORM_ONLY";
  definitionNote: string;
};

export const SOCIAL_METRIC_DEFINITIONS_V1: Readonly<Record<SocialMetricKeyV1, SocialMetricDefinitionV1>> = Object.freeze({
  AUDIENCE_TOTAL: {
    key: "AUDIENCE_TOTAL",
    label: "Followers / subscribers",
    unit: "COUNT",
    aggregation: "POINT_IN_TIME",
    comparisonPolicy: "WITHIN_PLATFORM_ONLY",
    definitionNote: "Platform-native follower or subscriber total. Audience overlap across platforms is unknown."
  },
  NET_NEW_AUDIENCE: {
    key: "NET_NEW_AUDIENCE",
    label: "Net new followers / subscribers",
    unit: "COUNT",
    aggregation: "PERIOD_TOTAL",
    comparisonPolicy: "WITHIN_PLATFORM_ONLY",
    definitionNote: "Platform-native net audience change for the reporting period."
  },
  IMPRESSIONS: {
    key: "IMPRESSIONS",
    label: "Impressions",
    unit: "COUNT",
    aggregation: "PERIOD_TOTAL",
    comparisonPolicy: "WITHIN_PLATFORM_ONLY",
    definitionNote: "Platform-native impressions. Definitions differ by platform and must not be silently merged."
  },
  REACH: {
    key: "REACH",
    label: "Reach",
    unit: "COUNT",
    aggregation: "PERIOD_TOTAL",
    comparisonPolicy: "WITHIN_PLATFORM_ONLY",
    definitionNote: "Platform-native reach. Unique-person semantics vary by platform."
  },
  VIEWS: {
    key: "VIEWS",
    label: "Views",
    unit: "COUNT",
    aggregation: "PERIOD_TOTAL",
    comparisonPolicy: "WITHIN_PLATFORM_ONLY",
    definitionNote: "Platform-native views. View thresholds and replay semantics vary by platform."
  },
  UNIQUE_VIEWERS: {
    key: "UNIQUE_VIEWERS",
    label: "Unique viewers",
    unit: "COUNT",
    aggregation: "PERIOD_TOTAL",
    comparisonPolicy: "WITHIN_PLATFORM_ONLY",
    definitionNote: "Unique viewers only when the provider exposes this metric explicitly."
  },
  WATCH_TIME_SECONDS: {
    key: "WATCH_TIME_SECONDS",
    label: "Watch time",
    unit: "SECONDS",
    aggregation: "PERIOD_TOTAL",
    comparisonPolicy: "WITHIN_PLATFORM_ONLY",
    definitionNote: "Provider-reported watch time normalized to seconds."
  },
  AVERAGE_VIEW_DURATION_SECONDS: {
    key: "AVERAGE_VIEW_DURATION_SECONDS",
    label: "Average view duration",
    unit: "SECONDS",
    aggregation: "PER_CONTENT_AVERAGE",
    comparisonPolicy: "WITHIN_PLATFORM_ONLY",
    definitionNote: "Provider-reported average view duration normalized to seconds."
  },
  LIKES: {
    key: "LIKES",
    label: "Likes",
    unit: "COUNT",
    aggregation: "PERIOD_TOTAL",
    comparisonPolicy: "WITHIN_PLATFORM_ONLY",
    definitionNote: "Platform-native likes or equivalent positive reaction count."
  },
  COMMENTS: {
    key: "COMMENTS",
    label: "Comments",
    unit: "COUNT",
    aggregation: "PERIOD_TOTAL",
    comparisonPolicy: "WITHIN_PLATFORM_ONLY",
    definitionNote: "Platform-native public or provider-reported comments."
  },
  SHARES: {
    key: "SHARES",
    label: "Shares / reposts",
    unit: "COUNT",
    aggregation: "PERIOD_TOTAL",
    comparisonPolicy: "WITHIN_PLATFORM_ONLY",
    definitionNote: "Platform-native shares, reposts, or equivalent reshares where exposed."
  },
  SAVES: {
    key: "SAVES",
    label: "Saves / bookmarks",
    unit: "COUNT",
    aggregation: "PERIOD_TOTAL",
    comparisonPolicy: "WITHIN_PLATFORM_ONLY",
    definitionNote: "Provider-reported saves or bookmarks; unavailable platforms remain UNKNOWN."
  },
  PROFILE_VISITS: {
    key: "PROFILE_VISITS",
    label: "Profile visits",
    unit: "COUNT",
    aggregation: "PERIOD_TOTAL",
    comparisonPolicy: "WITHIN_PLATFORM_ONLY",
    definitionNote: "Provider-reported profile or page visits."
  },
  LINK_CLICKS: {
    key: "LINK_CLICKS",
    label: "Link clicks",
    unit: "COUNT",
    aggregation: "PERIOD_TOTAL",
    comparisonPolicy: "WITHIN_PLATFORM_ONLY",
    definitionNote: "Provider-reported link clicks. This alone does not prove downstream attribution."
  },
  CONTENT_COUNT: {
    key: "CONTENT_COUNT",
    label: "Published content",
    unit: "COUNT",
    aggregation: "PERIOD_TOTAL",
    comparisonPolicy: "WITHIN_PLATFORM_ONLY",
    definitionNote: "Count of content records included in the reporting period."
  }
});

export type SocialMetricObservationInputV1 = number | null | {
  value: number | null;
  evidenceRefs?: readonly string[];
};

export type CanonicalSocialMetricV1 = {
  key: SocialMetricKeyV1;
  value: number | null;
  truthState: SocialMetricTruthStateV1;
  evidenceRefs: readonly string[];
};

export type SocialMetricComparisonV1 = {
  key: SocialMetricKeyV1;
  currentValue: number | null;
  priorValue: number | null;
  absoluteDelta: number | null;
  percentageDelta: number | null;
  direction: SocialMetricDirectionV1;
  evidenceRefs: readonly string[];
};

export type SocialSourceCoverageInputV1 = {
  requestedState: SocialSourceHealthStateV1;
  lastSuccessfulSyncAt?: string | null;
  metricCoverage?: readonly SocialMetricKeyV1[];
  limitations?: readonly string[];
};

export type SocialSourceCoverageV1 = {
  requestedState: SocialSourceHealthStateV1;
  effectiveState: SocialSourceHealthStateV1;
  freshness: SocialFreshnessV1;
  lastSuccessfulSyncAt: string | null;
  metricCoverage: readonly SocialMetricKeyV1[];
  limitations: readonly string[];
  reason: string | null;
};

export type SocialPeriodInputV1 = {
  periodId: string;
  window: SocialHistoryWindowV1;
  startAt: string;
  endAt: string;
  metrics?: Partial<Record<SocialMetricKeyV1, SocialMetricObservationInputV1>>;
};

export type CanonicalSocialPeriodV1 = {
  periodId: string;
  window: SocialHistoryWindowV1;
  startAt: string;
  endAt: string;
  metrics: Readonly<Record<SocialMetricKeyV1, CanonicalSocialMetricV1>>;
};

export type SocialContentInputV1 = {
  contentId: string;
  url?: string | null;
  publishedAt: string;
  format?: string | null;
  subject?: string | null;
  project?: string | null;
  theme?: string | null;
  hook?: string | null;
  title?: string | null;
  thumbnailRef?: string | null;
  durationSeconds?: number | null;
  productionEffortMinutes?: number | null;
  collaborationContext?: string | null;
  amplificationType?: "ORGANIC" | "PAID" | "MIXED" | "UNKNOWN";
  businessOutcomeRefs?: readonly string[];
  attributionConfidence?: SocialAttributionConfidenceV1;
  metrics?: Partial<Record<SocialMetricKeyV1, SocialMetricObservationInputV1>>;
};

export type CanonicalSocialContentV1 = {
  platform: SocialPlatformV1;
  contentId: string;
  url: string | null;
  publishedAt: string;
  format: string | null;
  subject: string | null;
  project: string | null;
  theme: string | null;
  hook: string | null;
  title: string | null;
  thumbnailRef: string | null;
  durationSeconds: number | null;
  productionEffortMinutes: number | null;
  collaborationContext: string | null;
  amplificationType: "ORGANIC" | "PAID" | "MIXED" | "UNKNOWN";
  businessOutcomeRefs: readonly string[];
  attributionConfidence: SocialAttributionConfidenceV1;
  metrics: Readonly<Record<SocialMetricKeyV1, CanonicalSocialMetricV1>>;
};

export type SocialAccountSnapshotInputV1 = {
  platform: SocialPlatformV1;
  accountId: string;
  handle?: string | null;
  retrievedAt: string;
  sourceCoverage: SocialSourceCoverageInputV1;
  periods: readonly SocialPeriodInputV1[];
  content?: readonly SocialContentInputV1[];
};

export type CanonicalSocialAccountSnapshotV1 = {
  contractVersion: "CanonicalSocialAccountSnapshotV1";
  snapshotId: string;
  platform: SocialPlatformV1;
  accountId: string;
  handle: string | null;
  retrievedAt: string;
  sourceCoverage: SocialSourceCoverageV1;
  periods: readonly CanonicalSocialPeriodV1[];
  comparisons: readonly {
    window: SocialHistoryWindowV1;
    currentPeriodId: string;
    priorPeriodId: string | null;
    metrics: Readonly<Record<SocialMetricKeyV1, SocialMetricComparisonV1>>;
  }[];
  content: readonly CanonicalSocialContentV1[];
  metricDefinitions: typeof SOCIAL_METRIC_DEFINITIONS_V1;
  evidenceRefs: readonly string[];
  externalAccessPerformed: false;
  writesPerformed: false;
};

export type SocialAudienceTrendPointV1 = {
  at: string;
  value: number | null;
};

export type SocialAudienceTrendV1 = {
  currentValue: number | null;
  absoluteDelta: number | null;
  percentageDelta: number | null;
  velocityPerDay: number | null;
  priorVelocityPerDay: number | null;
  accelerationPerDay: number | null;
  direction: SocialMetricDirectionV1;
};

export type LegacySocialBridgePayloadV1 = {
  generatedAt?: string | null;
  mode?: string | null;
  source?: string | null;
  insights?: readonly unknown[] | null;
};

export type SocialLegacyBridgeAdapterV1 = {
  contractVersion: "SocialLegacyBridgeAdapterV1";
  operationalState: "SCAFFOLDED";
  liveFirstPartyData: false;
  coverageState: "AVAILABLE_NEEDS_IMPLEMENTATION";
  generatedAt: string | null;
  recordCount: number;
  limitations: readonly string[];
  externalAccessPerformed: false;
  writesPerformed: false;
};

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

function requireNonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} must be non-empty`);
  return normalized;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function normalizeOptionalNonNegative(value: number | null | undefined, field: string): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} must be a finite non-negative number or null`);
  return value;
}

function normalizeObservation(key: SocialMetricKeyV1, input: SocialMetricObservationInputV1 | undefined): CanonicalSocialMetricV1 {
  const raw = typeof input === "object" && input !== null ? input.value : input;
  const evidenceRefs = typeof input === "object" && input !== null ? unique(input.evidenceRefs ?? []) : [];
  const value = normalizeOptionalNonNegative(raw, key);
  return freeze({
    key,
    value,
    truthState: value == null ? "UNKNOWN" : "KNOWN",
    evidenceRefs
  });
}

function normalizeMetrics(input?: Partial<Record<SocialMetricKeyV1, SocialMetricObservationInputV1>>): Readonly<Record<SocialMetricKeyV1, CanonicalSocialMetricV1>> {
  return freeze(Object.fromEntries(SOCIAL_METRIC_KEYS_V1.map((key) => [key, normalizeObservation(key, input?.[key])])) as Record<SocialMetricKeyV1, CanonicalSocialMetricV1>);
}

function compareMetric(key: SocialMetricKeyV1, current: CanonicalSocialMetricV1, prior?: CanonicalSocialMetricV1): SocialMetricComparisonV1 {
  const currentValue = current.value;
  const priorValue = prior?.value ?? null;
  const absoluteDelta = currentValue == null || priorValue == null ? null : currentValue - priorValue;
  const percentageDelta = absoluteDelta == null || priorValue === 0 ? null : (absoluteDelta / priorValue) * 100;
  const direction: SocialMetricDirectionV1 = absoluteDelta == null ? "UNKNOWN" : absoluteDelta > 0 ? "UP" : absoluteDelta < 0 ? "DOWN" : "FLAT";
  return freeze({
    key,
    currentValue,
    priorValue,
    absoluteDelta,
    percentageDelta,
    direction,
    evidenceRefs: unique([...current.evidenceRefs, ...(prior?.evidenceRefs ?? [])])
  });
}

export function compileSocialSourceCoverageV1(input: SocialSourceCoverageInputV1, now: string, staleAfterHours = 48): SocialSourceCoverageV1 {
  if (!Number.isFinite(staleAfterHours) || staleAfterHours <= 0) throw new Error("staleAfterHours must be positive");
  const nowMs = Date.parse(requireIso(now, "now"));
  const lastSuccessfulSyncAt = input.lastSuccessfulSyncAt ? requireIso(input.lastSuccessfulSyncAt, "lastSuccessfulSyncAt") : null;
  const syncMs = lastSuccessfulSyncAt ? Date.parse(lastSuccessfulSyncAt) : null;
  const connected = input.requestedState === "CONNECTED_AND_INGESTING" || input.requestedState === "CONNECTED_PARTIAL";
  const freshness: SocialFreshnessV1 = syncMs == null ? "NEVER_SYNCED" : nowMs - syncMs > staleAfterHours * 60 * 60 * 1000 ? "STALE" : "FRESH";
  let effectiveState = input.requestedState;
  let reason: string | null = null;
  if (connected && freshness !== "FRESH") {
    effectiveState = "CONNECTED_PARTIAL";
    reason = freshness === "NEVER_SYNCED" ? "Connected source has no successful sync evidence" : "Connected source is stale";
  }
  return freeze({
    requestedState: input.requestedState,
    effectiveState,
    freshness,
    lastSuccessfulSyncAt,
    metricCoverage: unique(input.metricCoverage ?? []) as SocialMetricKeyV1[],
    limitations: unique(input.limitations ?? []),
    reason
  });
}

function normalizePeriod(input: SocialPeriodInputV1): CanonicalSocialPeriodV1 {
  const startAt = requireIso(input.startAt, "period.startAt");
  const endAt = requireIso(input.endAt, "period.endAt");
  if (Date.parse(endAt) <= Date.parse(startAt)) throw new Error("period.endAt must be after period.startAt");
  return freeze({
    periodId: requireNonEmpty(input.periodId, "period.periodId"),
    window: input.window,
    startAt,
    endAt,
    metrics: normalizeMetrics(input.metrics)
  });
}

function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function normalizeContent(platform: SocialPlatformV1, input: SocialContentInputV1): CanonicalSocialContentV1 {
  return freeze({
    platform,
    contentId: requireNonEmpty(input.contentId, "content.contentId"),
    url: safeUrl(input.url),
    publishedAt: requireIso(input.publishedAt, "content.publishedAt"),
    format: input.format?.trim() || null,
    subject: input.subject?.trim() || null,
    project: input.project?.trim() || null,
    theme: input.theme?.trim() || null,
    hook: input.hook?.trim() || null,
    title: input.title?.trim() || null,
    thumbnailRef: input.thumbnailRef?.trim() || null,
    durationSeconds: normalizeOptionalNonNegative(input.durationSeconds, "content.durationSeconds"),
    productionEffortMinutes: normalizeOptionalNonNegative(input.productionEffortMinutes, "content.productionEffortMinutes"),
    collaborationContext: input.collaborationContext?.trim() || null,
    amplificationType: input.amplificationType ?? "UNKNOWN",
    businessOutcomeRefs: unique(input.businessOutcomeRefs ?? []),
    attributionConfidence: input.attributionConfidence ?? "UNKNOWN",
    metrics: normalizeMetrics(input.metrics)
  });
}

export function compileCanonicalSocialAccountSnapshotV1(input: SocialAccountSnapshotInputV1, now: string, staleAfterHours = 48): CanonicalSocialAccountSnapshotV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  const accountId = requireNonEmpty(input.accountId, "accountId");
  const retrievedAt = requireIso(input.retrievedAt, "retrievedAt");
  const periods = input.periods.map(normalizePeriod).sort((left, right) => Date.parse(right.endAt) - Date.parse(left.endAt));
  const duplicatePeriod = periods.find((period, index) => periods.findIndex((candidate) => candidate.periodId === period.periodId) !== index);
  if (duplicatePeriod) throw new Error(`duplicate periodId: ${duplicatePeriod.periodId}`);

  const comparisons = (["7D", "30D", "90D", "12M"] as const).flatMap((window) => {
    const matching = periods.filter((period) => period.window === window);
    if (!matching.length) return [];
    const current = matching[0];
    const prior = matching[1];
    const metrics = Object.fromEntries(SOCIAL_METRIC_KEYS_V1.map((key) => [key, compareMetric(key, current.metrics[key], prior?.metrics[key])])) as Record<SocialMetricKeyV1, SocialMetricComparisonV1>;
    return [freeze({ window, currentPeriodId: current.periodId, priorPeriodId: prior?.periodId ?? null, metrics: freeze(metrics) })];
  });
  const content = [...(input.content ?? [])].map((row) => normalizeContent(input.platform, row)).sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt) || left.contentId.localeCompare(right.contentId));
  const evidenceRefs = unique([
    ...periods.flatMap((period) => SOCIAL_METRIC_KEYS_V1.flatMap((key) => period.metrics[key].evidenceRefs)),
    ...content.flatMap((row) => SOCIAL_METRIC_KEYS_V1.flatMap((key) => row.metrics[key].evidenceRefs)),
    ...content.flatMap((row) => row.businessOutcomeRefs)
  ]);
  const safeAccount = accountId.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 80);

  return freeze({
    contractVersion: "CanonicalSocialAccountSnapshotV1",
    snapshotId: `social:${input.platform.toLowerCase()}:${safeAccount}:${retrievedAt}`,
    platform: input.platform,
    accountId,
    handle: input.handle?.trim() || null,
    retrievedAt,
    sourceCoverage: compileSocialSourceCoverageV1(input.sourceCoverage, now, staleAfterHours),
    periods,
    comparisons,
    content,
    metricDefinitions: SOCIAL_METRIC_DEFINITIONS_V1,
    evidenceRefs,
    externalAccessPerformed: false,
    writesPerformed: false
  });
}

export function calculateSocialAudienceTrendV1(points: readonly SocialAudienceTrendPointV1[]): SocialAudienceTrendV1 {
  const normalized = points
    .map((point) => ({ at: requireIso(point.at, "trend.at"), value: normalizeOptionalNonNegative(point.value, "trend.value") }))
    .sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
  const current = normalized.at(-1);
  const prior = normalized.at(-2);
  const beforePrior = normalized.at(-3);
  const currentValue = current?.value ?? null;
  const priorValue = prior?.value ?? null;
  const absoluteDelta = currentValue == null || priorValue == null ? null : currentValue - priorValue;
  const percentageDelta = absoluteDelta == null || priorValue === 0 ? null : (absoluteDelta / priorValue) * 100;
  const velocity = (a: typeof current, b: typeof prior): number | null => {
    if (!a || !b || a.value == null || b.value == null) return null;
    const days = (Date.parse(a.at) - Date.parse(b.at)) / 86_400_000;
    return days > 0 ? (a.value - b.value) / days : null;
  };
  const velocityPerDay = velocity(current, prior);
  const priorVelocityPerDay = velocity(prior, beforePrior);
  const accelerationPerDay = velocityPerDay == null || priorVelocityPerDay == null ? null : velocityPerDay - priorVelocityPerDay;
  return freeze({
    currentValue,
    absoluteDelta,
    percentageDelta,
    velocityPerDay,
    priorVelocityPerDay,
    accelerationPerDay,
    direction: absoluteDelta == null ? "UNKNOWN" : absoluteDelta > 0 ? "UP" : absoluteDelta < 0 ? "DOWN" : "FLAT"
  });
}

export function adaptLegacySocialBridgeV1(payload: LegacySocialBridgePayloadV1 | null | undefined): SocialLegacyBridgeAdapterV1 {
  return freeze({
    contractVersion: "SocialLegacyBridgeAdapterV1",
    operationalState: "SCAFFOLDED",
    liveFirstPartyData: false,
    coverageState: "AVAILABLE_NEEDS_IMPLEMENTATION",
    generatedAt: payload?.generatedAt ? requireIso(payload.generatedAt, "legacy.generatedAt") : null,
    recordCount: Array.isArray(payload?.insights) ? payload.insights.length : 0,
    limitations: [
      "Legacy social:run uses manual and website-derived records, not proven live platform ingestion",
      "Legacy records cannot establish first-party channel metric completeness",
      "Legacy records cannot establish cross-platform attribution or competitor performance"
    ],
    externalAccessPerformed: false,
    writesPerformed: false
  });
}
