import {
  SOCIAL_METRIC_DEFINITIONS_V1,
  SOCIAL_METRIC_KEYS_V1,
  calculateSocialAudienceTrendV1,
  type CanonicalSocialAccountSnapshotV1,
  type SocialAudienceTrendV1,
  type SocialHistoryWindowV1,
  type SocialMetricKeyV1,
  type SocialPlatformV1,
  type SocialSourceHealthStateV1
} from "./social-canonical-v1";

export type SocialChannelDrilldownAvailabilityV1 =
  | "READY"
  | "PARTIAL"
  | "NEEDS_CONNECTION"
  | "NEEDS_IMPLEMENTATION"
  | "UNAVAILABLE";

export type SocialChannelMetricStateV1 =
  | "CURRENT"
  | "NOT_CURRENT"
  | "UNKNOWN"
  | "NOT_IN_PROVIDER_COVERAGE"
  | "COVERAGE_CONFLICT";

export type SocialChannelWarningCodeV1 =
  | "SOURCE_STALE"
  | "SOURCE_NEVER_SYNCED"
  | "SOURCE_PARTIAL"
  | "NEEDS_CONNECTION"
  | "NEEDS_IMPLEMENTATION"
  | "SOURCE_UNAVAILABLE"
  | "MISSING_WINDOW"
  | "COVERAGE_CONFLICT"
  | "FUTURE_CONTENT";

export type SocialChannelWarningV1 = {
  code: SocialChannelWarningCodeV1;
  message: string;
  metricKey: SocialMetricKeyV1 | null;
  evidenceRefs: readonly string[];
};

export type SocialChannelMetricV1 = {
  key: SocialMetricKeyV1;
  label: string;
  unit: "COUNT" | "SECONDS";
  definitionNote: string;
  coverageDeclared: boolean;
  state: SocialChannelMetricStateV1;
  value: number | null;
  priorValue: number | null;
  absoluteDelta: number | null;
  percentageDelta: number | null;
  direction: "UP" | "DOWN" | "FLAT" | "UNKNOWN";
  decisionGrade: boolean;
  evidenceRefs: readonly string[];
};

export type SocialChannelRecentContentV1 = {
  contentId: string;
  url: string | null;
  publishedAt: string;
  format: string | null;
  subject: string | null;
  project: string | null;
  theme: string | null;
  hook: string | null;
  title: string | null;
  amplificationType: "ORGANIC" | "PAID" | "MIXED" | "UNKNOWN";
  businessOutcomeRefs: readonly string[];
  attributionConfidence: "DIRECT" | "STRONG" | "MODERATE" | "WEAK" | "UNKNOWN";
  knownMetrics: readonly {
    key: SocialMetricKeyV1;
    value: number;
    coverageDeclared: boolean;
    evidenceRefs: readonly string[];
  }[];
};

export type SocialChannelAudienceTrendV1 = {
  points: readonly { at: string; value: number }[];
  summary: SocialAudienceTrendV1;
  decisionGrade: boolean;
};

export type SocialChannelDrilldownV1 = {
  contractVersion: "SocialChannelDrilldownV1";
  snapshotId: string;
  platform: SocialPlatformV1;
  accountId: string;
  handle: string | null;
  window: SocialHistoryWindowV1;
  availability: SocialChannelDrilldownAvailabilityV1;
  currentPeriod: { periodId: string; startAt: string; endAt: string } | null;
  sourceHealth: {
    state: SocialSourceHealthStateV1;
    freshness: "FRESH" | "STALE" | "NEVER_SYNCED";
    lastSuccessfulSyncAt: string | null;
    metricCoverage: readonly SocialMetricKeyV1[];
    limitations: readonly string[];
  };
  metrics: readonly SocialChannelMetricV1[];
  audienceTrend: SocialChannelAudienceTrendV1;
  recentContent: readonly SocialChannelRecentContentV1[];
  warnings: readonly SocialChannelWarningV1[];
  evidenceRefs: readonly string[];
  crossPlatformAggregationPerformed: false;
  causalAttributionClaimed: false;
  externalAccessPerformed: false;
  writesPerformed: false;
};

export type CompileSocialChannelDrilldownOptionsV1 = {
  window: SocialHistoryWindowV1;
  now: string;
  staleAfterHours?: number;
  maxRecentContent?: number;
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

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function currentFreshness(
  lastSuccessfulSyncAt: string | null,
  now: string,
  staleAfterHours: number
): "FRESH" | "STALE" | "NEVER_SYNCED" {
  if (!lastSuccessfulSyncAt) return "NEVER_SYNCED";
  const syncMs = Date.parse(requireIso(lastSuccessfulSyncAt, "lastSuccessfulSyncAt"));
  const nowMs = Date.parse(now);
  if (syncMs > nowMs) throw new Error("lastSuccessfulSyncAt cannot be in the future");
  return nowMs - syncMs > staleAfterHours * 60 * 60 * 1000 ? "STALE" : "FRESH";
}

function availabilityFor(
  state: SocialSourceHealthStateV1,
  freshness: "FRESH" | "STALE" | "NEVER_SYNCED",
  hasCurrentPeriod: boolean
): SocialChannelDrilldownAvailabilityV1 {
  if (state === "NEEDS_KEEGAN_CONNECTION") return "NEEDS_CONNECTION";
  if (state === "AVAILABLE_NEEDS_IMPLEMENTATION") return "NEEDS_IMPLEMENTATION";
  if (state === "NOT_AVAILABLE" || state === "NOT_RECOMMENDED") return "UNAVAILABLE";
  if (state === "CONNECTED_PARTIAL" || freshness !== "FRESH" || !hasCurrentPeriod) return "PARTIAL";
  return "READY";
}

function warning(
  code: SocialChannelWarningCodeV1,
  message: string,
  metricKey: SocialMetricKeyV1 | null = null,
  evidenceRefs: readonly string[] = []
): SocialChannelWarningV1 {
  return freeze({ code, message, metricKey, evidenceRefs: unique(evidenceRefs) });
}

export function compileSocialChannelDrilldownV1(
  snapshot: CanonicalSocialAccountSnapshotV1,
  options: CompileSocialChannelDrilldownOptionsV1
): SocialChannelDrilldownV1 {
  if (!snapshot || snapshot.contractVersion !== "CanonicalSocialAccountSnapshotV1") {
    throw new Error("snapshot must be CanonicalSocialAccountSnapshotV1");
  }
  const now = requireIso(options.now, "now");
  const nowMs = Date.parse(now);
  const retrievedAt = requireIso(snapshot.retrievedAt, "snapshot.retrievedAt");
  if (Date.parse(retrievedAt) > nowMs) throw new Error("snapshot.retrievedAt cannot be in the future");

  const staleAfterHours = options.staleAfterHours ?? 48;
  if (!Number.isFinite(staleAfterHours) || staleAfterHours <= 0) throw new Error("staleAfterHours must be positive");
  const maxRecentContent = options.maxRecentContent ?? 12;
  if (!Number.isInteger(maxRecentContent) || maxRecentContent < 1 || maxRecentContent > 50) {
    throw new Error("maxRecentContent must be an integer between 1 and 50");
  }

  const matchingPeriods = snapshot.periods
    .filter((period) => period.window === options.window)
    .sort((left, right) => Date.parse(right.endAt) - Date.parse(left.endAt) || left.periodId.localeCompare(right.periodId));
  const currentPeriod = matchingPeriods[0] ?? null;
  const comparison = snapshot.comparisons.find((row) => row.window === options.window) ?? null;
  const freshness = currentFreshness(snapshot.sourceCoverage.lastSuccessfulSyncAt, now, staleAfterHours);
  const availability = availabilityFor(snapshot.sourceCoverage.effectiveState, freshness, currentPeriod !== null);
  const coverage = new Set(snapshot.sourceCoverage.metricCoverage);
  const warnings: SocialChannelWarningV1[] = [];

  if (freshness === "STALE") warnings.push(warning("SOURCE_STALE", "Channel source is stale; observations are not current decision-grade evidence."));
  if (freshness === "NEVER_SYNCED") warnings.push(warning("SOURCE_NEVER_SYNCED", "Channel source has no successful sync evidence."));
  if (snapshot.sourceCoverage.effectiveState === "CONNECTED_PARTIAL") warnings.push(warning("SOURCE_PARTIAL", "Channel connector reports partial coverage or ingestion."));
  if (snapshot.sourceCoverage.effectiveState === "NEEDS_KEEGAN_CONNECTION") warnings.push(warning("NEEDS_CONNECTION", "This channel requires an authorized account connection before live data can be used."));
  if (snapshot.sourceCoverage.effectiveState === "AVAILABLE_NEEDS_IMPLEMENTATION") warnings.push(warning("NEEDS_IMPLEMENTATION", "This channel is not yet backed by live first-party ingestion."));
  if (snapshot.sourceCoverage.effectiveState === "NOT_AVAILABLE" || snapshot.sourceCoverage.effectiveState === "NOT_RECOMMENDED") warnings.push(warning("SOURCE_UNAVAILABLE", "This channel is not available for live ingestion in the current connector posture."));
  if (!currentPeriod) warnings.push(warning("MISSING_WINDOW", `No canonical ${options.window} period is available for this channel.`));

  const metrics: SocialChannelMetricV1[] = SOCIAL_METRIC_KEYS_V1.map((key) => {
    const definition = SOCIAL_METRIC_DEFINITIONS_V1[key];
    const observed = currentPeriod?.metrics[key] ?? null;
    const row = comparison?.metrics[key] ?? null;
    const coverageDeclared = coverage.has(key);
    const hasObservedValue = observed?.truthState === "KNOWN" && observed.value != null;
    let state: SocialChannelMetricStateV1;
    if (!coverageDeclared && hasObservedValue) state = "COVERAGE_CONFLICT";
    else if (!coverageDeclared) state = "NOT_IN_PROVIDER_COVERAGE";
    else if (!hasObservedValue) state = "UNKNOWN";
    else if (availability !== "READY") state = "NOT_CURRENT";
    else state = "CURRENT";

    const evidenceRefs = unique([...(observed?.evidenceRefs ?? []), ...(row?.evidenceRefs ?? [])]);
    if (state === "COVERAGE_CONFLICT") {
      warnings.push(warning(
        "COVERAGE_CONFLICT",
        `${definition.label} has an observed value but is absent from declared provider metric coverage; verification is required.`,
        key,
        evidenceRefs
      ));
    }

    return freeze({
      key,
      label: definition.label,
      unit: definition.unit,
      definitionNote: definition.definitionNote,
      coverageDeclared,
      state,
      value: observed?.value ?? null,
      priorValue: row?.priorValue ?? null,
      absoluteDelta: row?.absoluteDelta ?? null,
      percentageDelta: row?.percentageDelta ?? null,
      direction: row?.direction ?? "UNKNOWN",
      decisionGrade: state === "CURRENT",
      evidenceRefs
    });
  });

  const audiencePoints = matchingPeriods
    .slice(0, 24)
    .reverse()
    .flatMap((period) => {
      const metric = period.metrics.AUDIENCE_TOTAL;
      return coverage.has("AUDIENCE_TOTAL") && metric.truthState === "KNOWN" && metric.value != null
        ? [{ at: period.endAt, value: metric.value }]
        : [];
    });
  const audienceSummary = calculateSocialAudienceTrendV1(audiencePoints);

  let sawFutureContent = false;
  const recentContent = snapshot.content
    .filter((content) => {
      const future = Date.parse(content.publishedAt) > nowMs;
      sawFutureContent ||= future;
      return !future;
    })
    .slice(0, maxRecentContent)
    .map((content) => freeze({
      contentId: content.contentId,
      url: content.url,
      publishedAt: content.publishedAt,
      format: content.format,
      subject: content.subject,
      project: content.project,
      theme: content.theme,
      hook: content.hook,
      title: content.title,
      amplificationType: content.amplificationType,
      businessOutcomeRefs: unique(content.businessOutcomeRefs),
      attributionConfidence: content.attributionConfidence,
      knownMetrics: SOCIAL_METRIC_KEYS_V1.flatMap((key) => {
        const metric = content.metrics[key];
        return metric.truthState === "KNOWN" && metric.value != null
          ? [freeze({ key, value: metric.value, coverageDeclared: coverage.has(key), evidenceRefs: unique(metric.evidenceRefs) })]
          : [];
      })
    }));
  if (sawFutureContent) warnings.push(warning("FUTURE_CONTENT", "Future-dated content was excluded from observed channel performance."));

  const evidenceRefs = unique([
    ...metrics.flatMap((metric) => metric.evidenceRefs),
    ...recentContent.flatMap((content) => [
      ...content.businessOutcomeRefs,
      ...content.knownMetrics.flatMap((metric) => metric.evidenceRefs)
    ])
  ]);

  return freeze({
    contractVersion: "SocialChannelDrilldownV1",
    snapshotId: snapshot.snapshotId,
    platform: snapshot.platform,
    accountId: snapshot.accountId,
    handle: snapshot.handle,
    window: options.window,
    availability,
    currentPeriod: currentPeriod ? { periodId: currentPeriod.periodId, startAt: currentPeriod.startAt, endAt: currentPeriod.endAt } : null,
    sourceHealth: {
      state: snapshot.sourceCoverage.effectiveState,
      freshness,
      lastSuccessfulSyncAt: snapshot.sourceCoverage.lastSuccessfulSyncAt,
      metricCoverage: [...snapshot.sourceCoverage.metricCoverage],
      limitations: [...snapshot.sourceCoverage.limitations]
    },
    metrics,
    audienceTrend: freeze({
      points: audiencePoints,
      summary: audienceSummary,
      decisionGrade: availability === "READY" && audiencePoints.length >= 2
    }),
    recentContent,
    warnings,
    evidenceRefs,
    crossPlatformAggregationPerformed: false,
    causalAttributionClaimed: false,
    externalAccessPerformed: false,
    writesPerformed: false
  });
}
