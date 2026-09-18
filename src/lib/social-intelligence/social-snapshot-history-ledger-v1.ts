import {
  SOCIAL_METRIC_KEYS_V1,
  compileSocialSourceCoverageV1,
  type CanonicalSocialAccountSnapshotV1,
  type SocialFreshnessV1,
  type SocialHistoryWindowV1,
  type SocialMetricKeyV1,
  type SocialMetricTruthStateV1,
  type SocialPlatformV1,
  type SocialSourceHealthStateV1
} from "./social-canonical-v1";

export const SOCIAL_HISTORY_MAX_SNAPSHOTS_V1 = 5_000;

export type SocialHistoryRevisionStateV1 =
  | "INITIAL"
  | "UNCHANGED"
  | "REVISED_VALUE"
  | "REVISED_EVIDENCE"
  | "REVISED_VALUE_AND_EVIDENCE";

export type SocialHistoryMetricPointV1 = {
  snapshotId: string;
  retrievedAt: string;
  periodId: string;
  periodStartAt: string;
  periodEndAt: string;
  value: number | null;
  truthState: SocialMetricTruthStateV1;
  evidenceRefs: readonly string[];
  evidenceBacked: boolean;
  revisionState: SocialHistoryRevisionStateV1;
  previousObservationSnapshotId: string | null;
};

export type SocialHistoryMetricSeriesV1 = {
  platform: SocialPlatformV1;
  accountId: string;
  window: SocialHistoryWindowV1;
  metricKey: SocialMetricKeyV1;
  points: readonly SocialHistoryMetricPointV1[];
  latestPoint: SocialHistoryMetricPointV1 | null;
};

export type SocialAccountHistoryV1 = {
  historyId: string;
  platform: SocialPlatformV1;
  accountId: string;
  snapshotCount: number;
  snapshotIds: readonly string[];
  latestSnapshotId: string;
  latestRetrievedAt: string;
  latestSourceState: SocialSourceHealthStateV1;
  currentSourceFreshness: SocialFreshnessV1;
  decisionReady: boolean;
  integrityIssues: readonly string[];
  metricSeries: readonly SocialHistoryMetricSeriesV1[];
  evidenceRefs: readonly string[];
};

export type SocialSnapshotHistoryLedgerV1 = {
  contractVersion: "SocialSnapshotHistoryLedgerV1";
  generatedAt: string;
  snapshotCount: number;
  accounts: readonly SocialAccountHistoryV1[];
  crossPlatformAggregationPerformed: false;
  causalClaimsCreated: false;
  attributionClaimsCreated: false;
  externalAccessPerformed: false;
  writesPerformed: false;
};

export type SocialHistoryAppendDecisionV1 = "APPEND" | "NOOP_DUPLICATE" | "VERIFY_CONFLICT";

export type SocialHistoryAppendPlanV1 = {
  contractVersion: "SocialHistoryAppendPlanV1";
  decision: SocialHistoryAppendDecisionV1;
  canonicalKey: string;
  snapshotId: string;
  platform: SocialPlatformV1;
  accountId: string;
  retrievedAt: string;
  reason: string;
  conflictingSnapshotId: string | null;
  externalAccessPerformed: false;
  writesPerformed: false;
};

type MutablePoint = SocialHistoryMetricPointV1;

type AccountBucket = {
  platform: SocialPlatformV1;
  accountId: string;
  snapshots: CanonicalSocialAccountSnapshotV1[];
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

function canonicalSnapshotId(snapshot: CanonicalSocialAccountSnapshotV1): string {
  const safeAccount = snapshot.accountId.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 80);
  return `social:${snapshot.platform.toLowerCase()}:${safeAccount}:${requireIso(snapshot.retrievedAt, "snapshot.retrievedAt")}`;
}

function accountKey(snapshot: CanonicalSocialAccountSnapshotV1): string {
  return `${snapshot.platform}\u0000${snapshot.accountId}`;
}

function canonicalKey(snapshot: CanonicalSocialAccountSnapshotV1): string {
  return `${snapshot.platform}:${snapshot.accountId}:${snapshot.snapshotId}`;
}

function rejectSecretReference(ref: string, field: string): void {
  const normalized = ref.trim().toLowerCase();
  if (normalized.startsWith("op://") || normalized.startsWith("bearer ")) {
    throw new Error(`${field} must not contain credential material`);
  }
}

function normalizeEvidenceRefs(refs: readonly string[], field: string): readonly string[] {
  const normalized = unique(refs);
  for (const ref of normalized) rejectSecretReference(ref, field);
  return normalized;
}

function assertMetricTruth(
  metricKey: SocialMetricKeyV1,
  metric: { key: SocialMetricKeyV1; value: number | null; truthState: SocialMetricTruthStateV1; evidenceRefs: readonly string[] },
  field: string
): void {
  if (metric.key !== metricKey) throw new Error(`${field}.key must equal ${metricKey}`);
  if (metric.truthState === "KNOWN" && metric.value == null) throw new Error(`${field} KNOWN metric must carry a value`);
  if (metric.truthState === "UNKNOWN" && metric.value != null) throw new Error(`${field} UNKNOWN metric must not carry a value`);
  if (metric.value != null && (!Number.isFinite(metric.value) || metric.value < 0)) {
    throw new Error(`${field}.value must be finite and non-negative`);
  }
  normalizeEvidenceRefs(metric.evidenceRefs, `${field}.evidenceRefs`);
}

function validateSnapshot(snapshot: CanonicalSocialAccountSnapshotV1, nowMs: number): void {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new Error("each snapshot must be an object");
  if (snapshot.contractVersion !== "CanonicalSocialAccountSnapshotV1") throw new Error("snapshot contractVersion must be CanonicalSocialAccountSnapshotV1");
  requireNonEmpty(snapshot.accountId, "snapshot.accountId");
  const retrievedAt = requireIso(snapshot.retrievedAt, "snapshot.retrievedAt");
  const retrievedMs = Date.parse(retrievedAt);
  if (retrievedMs > nowMs) throw new Error(`snapshot ${snapshot.snapshotId} is future-dated`);
  if (snapshot.snapshotId !== canonicalSnapshotId(snapshot)) throw new Error(`snapshot ${snapshot.snapshotId} does not match canonical identity`);
  if (snapshot.externalAccessPerformed !== false || snapshot.writesPerformed !== false) {
    throw new Error(`snapshot ${snapshot.snapshotId} must preserve zero-action canonical snapshot semantics`);
  }

  normalizeEvidenceRefs(snapshot.evidenceRefs, `snapshot ${snapshot.snapshotId}.evidenceRefs`);
  const syncAt = snapshot.sourceCoverage.lastSuccessfulSyncAt
    ? requireIso(snapshot.sourceCoverage.lastSuccessfulSyncAt, "sourceCoverage.lastSuccessfulSyncAt")
    : null;
  if (syncAt && Date.parse(syncAt) > retrievedMs) {
    throw new Error(`snapshot ${snapshot.snapshotId} has successful-sync evidence after retrieval`);
  }

  const periodKeys = new Set<string>();
  for (const period of snapshot.periods) {
    const startAt = requireIso(period.startAt, `snapshot ${snapshot.snapshotId}.period.startAt`);
    const endAt = requireIso(period.endAt, `snapshot ${snapshot.snapshotId}.period.endAt`);
    if (Date.parse(endAt) <= Date.parse(startAt)) throw new Error(`snapshot ${snapshot.snapshotId} has an invalid period range`);
    if (Date.parse(endAt) > retrievedMs) throw new Error(`snapshot ${snapshot.snapshotId} has a period ending after retrieval`);
    const periodKey = `${period.window}\u0000${startAt}\u0000${endAt}`;
    if (periodKeys.has(periodKey)) throw new Error(`snapshot ${snapshot.snapshotId} has duplicate period coverage for ${period.window}`);
    periodKeys.add(periodKey);
    requireNonEmpty(period.periodId, `snapshot ${snapshot.snapshotId}.period.periodId`);
    for (const metricKey of SOCIAL_METRIC_KEYS_V1) {
      assertMetricTruth(metricKey, period.metrics[metricKey], `snapshot ${snapshot.snapshotId}.${period.periodId}.${metricKey}`);
    }
  }

  const contentIds = new Set<string>();
  for (const content of snapshot.content) {
    if (content.platform !== snapshot.platform) throw new Error(`snapshot ${snapshot.snapshotId} content platform mismatch`);
    const contentId = requireNonEmpty(content.contentId, `snapshot ${snapshot.snapshotId}.content.contentId`);
    if (contentIds.has(contentId)) throw new Error(`snapshot ${snapshot.snapshotId} has duplicate contentId: ${contentId}`);
    contentIds.add(contentId);
    const publishedAt = requireIso(content.publishedAt, `snapshot ${snapshot.snapshotId}.${contentId}.publishedAt`);
    if (Date.parse(publishedAt) > retrievedMs) throw new Error(`snapshot ${snapshot.snapshotId} contains future-dated content: ${contentId}`);
    normalizeEvidenceRefs(content.businessOutcomeRefs, `snapshot ${snapshot.snapshotId}.${contentId}.businessOutcomeRefs`);
    for (const metricKey of SOCIAL_METRIC_KEYS_V1) {
      assertMetricTruth(metricKey, content.metrics[metricKey], `snapshot ${snapshot.snapshotId}.${contentId}.${metricKey}`);
    }
  }
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort((left, right) => left.localeCompare(right))
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(object[key])}`)
    .join(",")}}`;
}

function compareEvidence(left: readonly string[], right: readonly string[]): boolean {
  const a = unique(left);
  const b = unique(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function revisionState(previous: MutablePoint | undefined, value: number | null, evidenceRefs: readonly string[]): SocialHistoryRevisionStateV1 {
  if (!previous) return "INITIAL";
  const valueChanged = previous.value !== value || previous.truthState !== (value == null ? "UNKNOWN" : "KNOWN");
  const evidenceChanged = !compareEvidence(previous.evidenceRefs, evidenceRefs);
  if (valueChanged && evidenceChanged) return "REVISED_VALUE_AND_EVIDENCE";
  if (valueChanged) return "REVISED_VALUE";
  if (evidenceChanged) return "REVISED_EVIDENCE";
  return "UNCHANGED";
}

function buildAccountHistory(
  bucket: AccountBucket,
  now: string,
  staleAfterHours: number
): SocialAccountHistoryV1 {
  const snapshots = [...bucket.snapshots].sort(
    (left, right) => Date.parse(left.retrievedAt) - Date.parse(right.retrievedAt) || left.snapshotId.localeCompare(right.snapshotId)
  );
  const latest = snapshots.at(-1)!;
  const currentCoverage = compileSocialSourceCoverageV1(latest.sourceCoverage, now, staleAfterHours);
  const integrityIssues = new Set<string>();
  const coverage = new Set<SocialMetricKeyV1>(latest.sourceCoverage.metricCoverage);

  if (currentCoverage.effectiveState !== "CONNECTED_AND_INGESTING") {
    integrityIssues.add(`Latest source state is ${currentCoverage.effectiveState}`);
  }
  if (currentCoverage.freshness !== "FRESH") {
    integrityIssues.add(`Latest source freshness is ${currentCoverage.freshness}`);
  }

  for (const period of latest.periods) {
    for (const metricKey of SOCIAL_METRIC_KEYS_V1) {
      const metric = period.metrics[metricKey];
      if (metric.truthState === "KNOWN" && !coverage.has(metricKey)) {
        integrityIssues.add(`${metricKey} has a value outside declared provider coverage`);
      }
      if (metric.truthState === "KNOWN" && metric.evidenceRefs.length === 0) {
        integrityIssues.add(`${metricKey} is KNOWN without evidence`);
      }
    }
  }

  const seriesBuckets = new Map<string, MutablePoint[]>();
  const previousByPeriodMetric = new Map<string, MutablePoint>();
  for (const snapshot of snapshots) {
    for (const period of snapshot.periods) {
      for (const metricKey of SOCIAL_METRIC_KEYS_V1) {
        const metric = period.metrics[metricKey];
        const evidenceRefs = normalizeEvidenceRefs(metric.evidenceRefs, `${snapshot.snapshotId}.${period.periodId}.${metricKey}.evidenceRefs`);
        const periodMetricKey = `${period.window}\u0000${period.startAt}\u0000${period.endAt}\u0000${metricKey}`;
        const previous = previousByPeriodMetric.get(periodMetricKey);
        const point: MutablePoint = freeze({
          snapshotId: snapshot.snapshotId,
          retrievedAt: snapshot.retrievedAt,
          periodId: period.periodId,
          periodStartAt: period.startAt,
          periodEndAt: period.endAt,
          value: metric.value,
          truthState: metric.truthState,
          evidenceRefs,
          evidenceBacked: metric.truthState === "KNOWN" && evidenceRefs.length > 0,
          revisionState: revisionState(previous, metric.value, evidenceRefs),
          previousObservationSnapshotId: previous?.snapshotId ?? null
        });
        previousByPeriodMetric.set(periodMetricKey, point);
        const seriesKey = `${period.window}\u0000${metricKey}`;
        const points = seriesBuckets.get(seriesKey) ?? [];
        points.push(point);
        seriesBuckets.set(seriesKey, points);
      }
    }
  }

  const metricSeries = [...seriesBuckets.entries()]
    .map(([key, points]) => {
      const [window, metricKey] = key.split("\u0000") as [SocialHistoryWindowV1, SocialMetricKeyV1];
      const sorted = [...points].sort(
        (left, right) =>
          Date.parse(left.periodEndAt) - Date.parse(right.periodEndAt) ||
          Date.parse(left.retrievedAt) - Date.parse(right.retrievedAt) ||
          left.snapshotId.localeCompare(right.snapshotId)
      );
      return freeze({
        platform: bucket.platform,
        accountId: bucket.accountId,
        window,
        metricKey,
        points: freeze(sorted),
        latestPoint: sorted.at(-1) ?? null
      });
    })
    .sort((left, right) => left.window.localeCompare(right.window) || left.metricKey.localeCompare(right.metricKey));

  const evidenceRefs = unique(snapshots.flatMap((snapshot) => snapshot.evidenceRefs));
  if (!evidenceRefs.length) integrityIssues.add("No canonical evidence refs are present in account history");
  const safeAccount = bucket.accountId.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 80);

  return freeze({
    historyId: `social-history:${bucket.platform.toLowerCase()}:${safeAccount}`,
    platform: bucket.platform,
    accountId: bucket.accountId,
    snapshotCount: snapshots.length,
    snapshotIds: snapshots.map((snapshot) => snapshot.snapshotId),
    latestSnapshotId: latest.snapshotId,
    latestRetrievedAt: latest.retrievedAt,
    latestSourceState: currentCoverage.effectiveState,
    currentSourceFreshness: currentCoverage.freshness,
    decisionReady: integrityIssues.size === 0,
    integrityIssues: [...integrityIssues].sort((left, right) => left.localeCompare(right)),
    metricSeries,
    evidenceRefs
  });
}

export function compileSocialSnapshotHistoryLedgerV1(
  snapshots: readonly CanonicalSocialAccountSnapshotV1[],
  now: string,
  staleAfterHours = 48
): SocialSnapshotHistoryLedgerV1 {
  if (!Array.isArray(snapshots)) throw new Error("snapshots must be an array");
  if (snapshots.length > SOCIAL_HISTORY_MAX_SNAPSHOTS_V1) throw new Error(`snapshots must not exceed ${SOCIAL_HISTORY_MAX_SNAPSHOTS_V1}`);
  if (!Number.isFinite(staleAfterHours) || staleAfterHours <= 0) throw new Error("staleAfterHours must be positive");
  const generatedAt = requireIso(now, "now");
  const nowMs = Date.parse(generatedAt);
  const deduped = new Map<string, CanonicalSocialAccountSnapshotV1>();
  const captureIdentity = new Map<string, string>();

  for (const snapshot of snapshots) {
    validateSnapshot(snapshot, nowMs);
    const existing = deduped.get(snapshot.snapshotId);
    if (existing) {
      if (stableSerialize(existing) !== stableSerialize(snapshot)) {
        throw new Error(`conflicting payloads share snapshotId: ${snapshot.snapshotId}`);
      }
      continue;
    }
    const captureKey = `${snapshot.platform}\u0000${snapshot.accountId}\u0000${snapshot.retrievedAt}`;
    const existingCapture = captureIdentity.get(captureKey);
    if (existingCapture && existingCapture !== snapshot.snapshotId) {
      throw new Error(`conflicting snapshot identity at ${snapshot.platform}/${snapshot.accountId}/${snapshot.retrievedAt}`);
    }
    captureIdentity.set(captureKey, snapshot.snapshotId);
    deduped.set(snapshot.snapshotId, snapshot);
  }

  const buckets = new Map<string, AccountBucket>();
  for (const snapshot of deduped.values()) {
    const key = accountKey(snapshot);
    const bucket = buckets.get(key) ?? { platform: snapshot.platform, accountId: snapshot.accountId, snapshots: [] };
    bucket.snapshots.push(snapshot);
    buckets.set(key, bucket);
  }

  const accounts = [...buckets.values()]
    .map((bucket) => buildAccountHistory(bucket, generatedAt, staleAfterHours))
    .sort((left, right) => left.platform.localeCompare(right.platform) || left.accountId.localeCompare(right.accountId));

  return freeze({
    contractVersion: "SocialSnapshotHistoryLedgerV1",
    generatedAt,
    snapshotCount: deduped.size,
    accounts,
    crossPlatformAggregationPerformed: false,
    causalClaimsCreated: false,
    attributionClaimsCreated: false,
    externalAccessPerformed: false,
    writesPerformed: false
  });
}

export function planSocialHistoryAppendV1(
  candidate: CanonicalSocialAccountSnapshotV1,
  existingSnapshots: readonly CanonicalSocialAccountSnapshotV1[],
  now: string
): SocialHistoryAppendPlanV1 {
  const nowIso = requireIso(now, "now");
  const nowMs = Date.parse(nowIso);
  validateSnapshot(candidate, nowMs);
  if (!Array.isArray(existingSnapshots)) throw new Error("existingSnapshots must be an array");
  if (existingSnapshots.length > SOCIAL_HISTORY_MAX_SNAPSHOTS_V1) {
    throw new Error(`existingSnapshots must not exceed ${SOCIAL_HISTORY_MAX_SNAPSHOTS_V1}`);
  }
  for (const snapshot of existingSnapshots) validateSnapshot(snapshot, nowMs);

  const exact = existingSnapshots.find((snapshot) => snapshot.snapshotId === candidate.snapshotId);
  if (exact) {
    const same = stableSerialize(exact) === stableSerialize(candidate);
    return freeze({
      contractVersion: "SocialHistoryAppendPlanV1",
      decision: same ? "NOOP_DUPLICATE" : "VERIFY_CONFLICT",
      canonicalKey: canonicalKey(candidate),
      snapshotId: candidate.snapshotId,
      platform: candidate.platform,
      accountId: candidate.accountId,
      retrievedAt: candidate.retrievedAt,
      reason: same
        ? "An identical canonical snapshot is already present; append would be a duplicate"
        : "The same canonical snapshot identity already exists with a different payload",
      conflictingSnapshotId: exact.snapshotId,
      externalAccessPerformed: false,
      writesPerformed: false
    });
  }

  const sameCapture = existingSnapshots.find(
    (snapshot) =>
      snapshot.platform === candidate.platform &&
      snapshot.accountId === candidate.accountId &&
      snapshot.retrievedAt === candidate.retrievedAt
  );
  if (sameCapture) {
    return freeze({
      contractVersion: "SocialHistoryAppendPlanV1",
      decision: "VERIFY_CONFLICT",
      canonicalKey: canonicalKey(candidate),
      snapshotId: candidate.snapshotId,
      platform: candidate.platform,
      accountId: candidate.accountId,
      retrievedAt: candidate.retrievedAt,
      reason: "Another snapshot already claims the same platform/account capture time",
      conflictingSnapshotId: sameCapture.snapshotId,
      externalAccessPerformed: false,
      writesPerformed: false
    });
  }

  return freeze({
    contractVersion: "SocialHistoryAppendPlanV1",
    decision: "APPEND",
    canonicalKey: canonicalKey(candidate),
    snapshotId: candidate.snapshotId,
    platform: candidate.platform,
    accountId: candidate.accountId,
    retrievedAt: candidate.retrievedAt,
    reason: "Canonical snapshot identity is new and structurally valid for append-only history",
    conflictingSnapshotId: null,
    externalAccessPerformed: false,
    writesPerformed: false
  });
}
