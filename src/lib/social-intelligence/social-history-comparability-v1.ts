import {
  SOCIAL_METRIC_KEYS_V1,
  type CanonicalSocialAccountSnapshotV1,
  type SocialHistoryWindowV1,
  type SocialMetricKeyV1
} from "./social-canonical-v1";

export const SOCIAL_HISTORY_COMPARABILITY_STATES_V1 = [
  "READY",
  "PARTIAL",
  "NEEDS_HISTORY",
  "VERIFY_RANGE",
  "VERIFY_PROVENANCE",
  "SOURCE_NOT_DECISION_GRADE",
  "STALE_SOURCE",
  "FUTURE_EVIDENCE"
] as const;

export type SocialHistoryComparabilityStateV1 = (typeof SOCIAL_HISTORY_COMPARABILITY_STATES_V1)[number];

export type SocialHistoryMetricComparabilityStateV1 =
  | "READY"
  | "UNKNOWN"
  | "NOT_IN_PROVIDER_COVERAGE"
  | "MISSING_PROVENANCE"
  | "RANGE_INVALID"
  | "SOURCE_NOT_CURRENT";

export type SocialHistoryMetricComparabilityV1 = {
  key: SocialMetricKeyV1;
  state: SocialHistoryMetricComparabilityStateV1;
  currentValue: number | null;
  priorValue: number | null;
  absoluteDelta: number | null;
  percentageDelta: number | null;
  evidenceRefs: readonly string[];
  decisionGrade: boolean;
};

export type SocialHistoryWindowComparabilityV1 = {
  window: SocialHistoryWindowV1;
  state: SocialHistoryComparabilityStateV1;
  currentPeriodId: string | null;
  priorPeriodId: string | null;
  currentStartAt: string | null;
  currentEndAt: string | null;
  priorStartAt: string | null;
  priorEndAt: string | null;
  contiguous: boolean | null;
  namedWindowDurationsValid: boolean | null;
  decisionGradeMetrics: readonly SocialMetricKeyV1[];
  metrics: readonly SocialHistoryMetricComparabilityV1[];
  issues: readonly string[];
  evidenceRefs: readonly string[];
};

export type SocialHistoryComparabilityReviewV1 = {
  contractVersion: "SocialHistoryComparabilityReviewV1";
  snapshotId: string;
  platform: CanonicalSocialAccountSnapshotV1["platform"];
  accountId: string;
  evaluatedAt: string;
  sourceDecisionGrade: boolean;
  sourceIssues: readonly string[];
  windows: readonly SocialHistoryWindowComparabilityV1[];
  decisionGradeWindows: readonly SocialHistoryWindowV1[];
  comparisonTruthPreserved: true;
  crossPlatformAggregationPerformed: false;
  causalAttributionClaimed: false;
  externalAccessPerformed: false;
  writesPerformed: false;
};

export type CompileSocialHistoryComparabilityOptionsV1 = {
  now: string;
  staleAfterHours?: number;
  windows?: readonly SocialHistoryWindowV1[];
};

const DAY_MS = 86_400_000;
const DEFAULT_WINDOWS: readonly SocialHistoryWindowV1[] = ["7D", "30D", "90D", "12M"];

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

function namedWindowDurationValid(window: SocialHistoryWindowV1, startAt: string, endAt: string): boolean {
  const durationDays = (Date.parse(endAt) - Date.parse(startAt)) / DAY_MS;
  if (window === "7D") return durationDays === 7;
  if (window === "30D") return durationDays === 30;
  if (window === "90D") return durationDays === 90;
  return durationDays === 365 || durationDays === 366;
}

function calculateDelta(currentValue: number | null, priorValue: number | null): {
  absoluteDelta: number | null;
  percentageDelta: number | null;
} {
  if (currentValue == null || priorValue == null) return { absoluteDelta: null, percentageDelta: null };
  return {
    absoluteDelta: currentValue - priorValue,
    percentageDelta: priorValue === 0 ? null : ((currentValue - priorValue) / priorValue) * 100
  };
}

export function compileSocialHistoryComparabilityV1(
  snapshot: CanonicalSocialAccountSnapshotV1,
  options: CompileSocialHistoryComparabilityOptionsV1
): SocialHistoryComparabilityReviewV1 {
  if (!snapshot || snapshot.contractVersion !== "CanonicalSocialAccountSnapshotV1") {
    throw new Error("snapshot must be CanonicalSocialAccountSnapshotV1");
  }

  const now = requireIso(options.now, "now");
  const nowMs = Date.parse(now);
  const staleAfterHours = options.staleAfterHours ?? 48;
  if (!Number.isFinite(staleAfterHours) || staleAfterHours <= 0) throw new Error("staleAfterHours must be positive");

  const windows = unique(options.windows ?? DEFAULT_WINDOWS) as SocialHistoryWindowV1[];
  for (const window of windows) {
    if (!DEFAULT_WINDOWS.includes(window)) throw new Error(`unsupported social history window: ${String(window)}`);
  }

  const retrievedAt = requireIso(snapshot.retrievedAt, "snapshot.retrievedAt");
  const retrievedMs = Date.parse(retrievedAt);
  const lastSuccessfulSyncAt = snapshot.sourceCoverage.lastSuccessfulSyncAt
    ? requireIso(snapshot.sourceCoverage.lastSuccessfulSyncAt, "snapshot.sourceCoverage.lastSuccessfulSyncAt")
    : null;
  const lastSyncMs = lastSuccessfulSyncAt ? Date.parse(lastSuccessfulSyncAt) : null;
  const sourceIssues: string[] = [];

  const futureEvidence = retrievedMs > nowMs || (lastSyncMs != null && (lastSyncMs > nowMs || lastSyncMs > retrievedMs));
  if (retrievedMs > nowMs) sourceIssues.push("snapshot.retrievedAt is in the future");
  if (lastSyncMs != null && lastSyncMs > nowMs) sourceIssues.push("lastSuccessfulSyncAt is in the future");
  if (lastSyncMs != null && lastSyncMs > retrievedMs) sourceIssues.push("lastSuccessfulSyncAt is later than snapshot.retrievedAt");

  const staleSource = lastSyncMs == null || nowMs - lastSyncMs > staleAfterHours * 60 * 60 * 1000;
  if (lastSyncMs == null) sourceIssues.push("source has no successful sync evidence");
  else if (!futureEvidence && staleSource) sourceIssues.push("source successful-sync evidence is stale");

  const sourceConnectedAndComplete = snapshot.sourceCoverage.effectiveState === "CONNECTED_AND_INGESTING";
  if (!sourceConnectedAndComplete) {
    sourceIssues.push(`source effective state is ${snapshot.sourceCoverage.effectiveState}, not CONNECTED_AND_INGESTING`);
  }
  if (snapshot.writesPerformed !== false) sourceIssues.push("canonical social snapshot does not prove read-only behavior");

  const sourceDecisionGrade = !futureEvidence && !staleSource && sourceConnectedAndComplete && snapshot.writesPerformed === false;
  const coverage = new Set(snapshot.sourceCoverage.metricCoverage);

  const windowReviews = windows.map((window): SocialHistoryWindowComparabilityV1 => {
    const periods = snapshot.periods
      .filter((period) => period.window === window)
      .sort((left, right) => Date.parse(right.endAt) - Date.parse(left.endAt) || left.periodId.localeCompare(right.periodId));
    const current = periods[0] ?? null;
    const prior = periods[1] ?? null;
    const issues: string[] = [];

    if (!current) issues.push(`no ${window} current period is available`);
    if (current && !prior) issues.push(`no prior ${window} period is available for comparison`);

    const currentDurationValid = current ? namedWindowDurationValid(window, current.startAt, current.endAt) : null;
    const priorDurationValid = prior ? namedWindowDurationValid(window, prior.startAt, prior.endAt) : null;
    const namedWindowDurationsValid = current && prior ? currentDurationValid === true && priorDurationValid === true : null;
    if (current && currentDurationValid === false) issues.push(`current ${window} period does not match its named duration`);
    if (prior && priorDurationValid === false) issues.push(`prior ${window} period does not match its named duration`);

    const contiguous = current && prior ? Date.parse(prior.endAt) === Date.parse(current.startAt) : null;
    if (current && prior && !contiguous) issues.push(`current and prior ${window} periods are not contiguous non-overlapping windows`);

    const periodAfterRetrieval = [current, prior].some((period) => period != null && Date.parse(period.endAt) > retrievedMs);
    if (periodAfterRetrieval) issues.push(`${window} period ends after snapshot.retrievedAt`);

    const rangeValid = Boolean(current && prior && namedWindowDurationsValid && contiguous && !periodAfterRetrieval);

    const metricReviews = SOCIAL_METRIC_KEYS_V1.map((key): SocialHistoryMetricComparabilityV1 => {
      const currentMetric = current?.metrics[key] ?? null;
      const priorMetric = prior?.metrics[key] ?? null;
      const currentValue = currentMetric?.value ?? null;
      const priorValue = priorMetric?.value ?? null;
      const evidenceRefs = unique([...(currentMetric?.evidenceRefs ?? []), ...(priorMetric?.evidenceRefs ?? [])]);
      const { absoluteDelta, percentageDelta } = calculateDelta(currentValue, priorValue);
      let state: SocialHistoryMetricComparabilityStateV1;

      if (!coverage.has(key)) state = "NOT_IN_PROVIDER_COVERAGE";
      else if (currentValue == null || priorValue == null) state = "UNKNOWN";
      else if ((currentMetric?.evidenceRefs.length ?? 0) === 0 || (priorMetric?.evidenceRefs.length ?? 0) === 0) state = "MISSING_PROVENANCE";
      else if (!rangeValid) state = "RANGE_INVALID";
      else if (!sourceDecisionGrade) state = "SOURCE_NOT_CURRENT";
      else state = "READY";

      return freeze({
        key,
        state,
        currentValue,
        priorValue,
        absoluteDelta,
        percentageDelta,
        evidenceRefs,
        decisionGrade: state === "READY"
      });
    });

    const coveredMetrics = metricReviews.filter((metric) => coverage.has(metric.key));
    const missingProvenance = coveredMetrics.some((metric) => metric.state === "MISSING_PROVENANCE");
    const unknownCoveredMetric = coveredMetrics.some((metric) => metric.state === "UNKNOWN");
    let state: SocialHistoryComparabilityStateV1;

    if (futureEvidence) state = "FUTURE_EVIDENCE";
    else if (staleSource) state = "STALE_SOURCE";
    else if (!sourceConnectedAndComplete || snapshot.writesPerformed !== false) state = "SOURCE_NOT_DECISION_GRADE";
    else if (!current || !prior) state = "NEEDS_HISTORY";
    else if (!rangeValid) state = "VERIFY_RANGE";
    else if (missingProvenance) state = "VERIFY_PROVENANCE";
    else if (unknownCoveredMetric) state = "PARTIAL";
    else state = "READY";

    const decisionGradeMetrics = metricReviews.filter((metric) => metric.decisionGrade).map((metric) => metric.key);
    const evidenceRefs = unique(metricReviews.flatMap((metric) => metric.evidenceRefs));

    return freeze({
      window,
      state,
      currentPeriodId: current?.periodId ?? null,
      priorPeriodId: prior?.periodId ?? null,
      currentStartAt: current?.startAt ?? null,
      currentEndAt: current?.endAt ?? null,
      priorStartAt: prior?.startAt ?? null,
      priorEndAt: prior?.endAt ?? null,
      contiguous,
      namedWindowDurationsValid,
      decisionGradeMetrics,
      metrics: metricReviews,
      issues: unique(issues),
      evidenceRefs
    });
  });

  return freeze({
    contractVersion: "SocialHistoryComparabilityReviewV1",
    snapshotId: snapshot.snapshotId,
    platform: snapshot.platform,
    accountId: snapshot.accountId,
    evaluatedAt: now,
    sourceDecisionGrade,
    sourceIssues: unique(sourceIssues),
    windows: windowReviews,
    decisionGradeWindows: windowReviews.filter((window) => window.state === "READY").map((window) => window.window),
    comparisonTruthPreserved: true,
    crossPlatformAggregationPerformed: false,
    causalAttributionClaimed: false,
    externalAccessPerformed: false,
    writesPerformed: false
  });
}
