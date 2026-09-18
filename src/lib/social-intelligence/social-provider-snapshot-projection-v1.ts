import {
  SOCIAL_METRIC_KEYS_V1,
  compileCanonicalSocialAccountSnapshotV1,
  type CanonicalSocialAccountSnapshotV1,
  type SocialMetricKeyV1,
  type SocialPlatformV1
} from "./social-canonical-v1";
import type {
  SocialProviderMetricNormalizationV1
} from "./social-provider-metric-normalization-v1";
import type { SocialConnectorSourceKindV1 } from "./social-connector-proof-v1";

export type SocialProviderSnapshotProjectionInputV1 = {
  accountId: string;
  handle?: string | null;
  normalizations: readonly SocialProviderMetricNormalizationV1[];
  freshnessMaxAgeHours: number;
};

export type SocialProviderSnapshotProjectionV1 = {
  contractVersion: "SocialProviderSnapshotProjectionV1";
  platform: SocialPlatformV1;
  connectorId: string;
  runId: string;
  sourceKind: SocialConnectorSourceKindV1;
  retrievedAt: string;
  projectionState: "READY" | "PARTIAL";
  snapshot: CanonicalSocialAccountSnapshotV1;
  observationEvidenceRefs: readonly string[];
  definitionEvidenceRefs: readonly string[];
  limitations: readonly string[];
  causalAttributionClaimed: false;
  crossPlatformAggregationPerformed: false;
  externalAccessPerformed: false;
  writesPerformed: false;
};

const MAX_NORMALIZATIONS = 16;
const MAX_REFERENCE_LENGTH = 2_000;
const FORBIDDEN_CREDENTIAL_KEYS = new Set([
  "accesstoken",
  "refreshtoken",
  "apikey",
  "clientsecret",
  "password",
  "cookie",
  "authorizationheader",
  "bearertoken",
  "secret"
]);

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
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

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  const a = unique(left);
  const b = unique(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function rejectCredentialMaterial(value: unknown, path = "input", seen = new WeakSet<object>()): void {
  if (!value || typeof value !== "object") return;
  const object = value as Record<string, unknown>;
  if (seen.has(object)) return;
  seen.add(object);
  if (Array.isArray(value)) {
    value.forEach((child, index) => rejectCredentialMaterial(child, `${path}[${index}]`, seen));
    return;
  }
  for (const [key, child] of Object.entries(object)) {
    const normalizedKey = key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    if (FORBIDDEN_CREDENTIAL_KEYS.has(normalizedKey)) {
      throw new Error(`${path}.${key} contains credential material; social snapshot projection must never carry secrets`);
    }
    rejectCredentialMaterial(child, `${path}.${key}`, seen);
  }
}

function safeReference(value: string, field: string): string {
  const normalized = requireNonEmpty(value, field);
  if (normalized.length > MAX_REFERENCE_LENGTH) throw new Error(`${field} exceeds ${MAX_REFERENCE_LENGTH} characters`);
  if (/^bearer\s+/i.test(normalized)) throw new Error(`${field} must not contain bearer credentials`);
  if (/^(?:access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret|password|secret)\s*[:=]/i.test(normalized)) {
    throw new Error(`${field} must not contain credential material`);
  }
  try {
    const parsed = new URL(normalized);
    if (parsed.username || parsed.password) throw new Error(`${field} must not contain embedded credentials`);
    for (const key of ["access_token", "token", "api_key", "apikey", "signature", "secret"]) {
      if (parsed.searchParams.has(key)) throw new Error(`${field} must not contain credential query parameters`);
    }
  } catch (error) {
    if (error instanceof Error && /credential/.test(error.message)) throw error;
  }
  return normalized;
}

function normalizeRefs(values: readonly string[], field: string): string[] {
  return unique(values).map((value, index) => safeReference(value, `${field}[${index}]`));
}

function artifactMetricKeys(artifact: SocialProviderMetricNormalizationV1): SocialMetricKeyV1[] {
  const allowed = new Set<string>(SOCIAL_METRIC_KEYS_V1);
  const seen = new Set<SocialMetricKeyV1>();
  const keys: SocialMetricKeyV1[] = [];
  for (const metric of artifact.metrics) {
    if (!allowed.has(metric.canonicalMetricKey)) {
      throw new Error(`normalization contains unsupported canonical metric ${String(metric.canonicalMetricKey)}`);
    }
    if (seen.has(metric.canonicalMetricKey)) {
      throw new Error(`normalization contains duplicate canonical metric ${metric.canonicalMetricKey}`);
    }
    seen.add(metric.canonicalMetricKey);
    keys.push(metric.canonicalMetricKey);
  }
  return keys.sort((left, right) => left.localeCompare(right));
}

function revalidateArtifact(
  artifact: SocialProviderMetricNormalizationV1,
  index: number,
  nowMs: number
): {
  periodId: string;
  metricKeys: readonly SocialMetricKeyV1[];
  observationEvidenceRefs: readonly string[];
  definitionEvidenceRefs: readonly string[];
} {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    throw new Error(`normalizations[${index}] must be an object`);
  }
  rejectCredentialMaterial(artifact, `normalizations[${index}]`);
  if (artifact.contractVersion !== "SocialProviderMetricNormalizationV1") {
    throw new Error(`normalizations[${index}] must be a SocialProviderMetricNormalizationV1 artifact`);
  }
  if (artifact.externalAccessPerformed !== false || artifact.writesPerformed !== false) {
    throw new Error(`normalizations[${index}] must preserve read-only projection boundaries`);
  }
  if (artifact.causalAttributionClaimed !== false || artifact.crossPlatformAggregationPerformed !== false) {
    throw new Error(`normalizations[${index}] cannot widen attribution or cross-platform claims`);
  }
  if (artifact.sourceKind !== "OFFICIAL_API" && artifact.sourceKind !== "AUTHORIZED_EXPORT") {
    throw new Error(`normalizations[${index}] requires an official API or authorized export source`);
  }

  const retrievedAt = requireIso(artifact.retrievedAt, `normalizations[${index}].retrievedAt`);
  const retrievedMs = Date.parse(retrievedAt);
  if (retrievedMs > nowMs) throw new Error(`normalizations[${index}].retrievedAt cannot be in the future`);

  const periodId = requireNonEmpty(artifact.canonicalPeriod.periodId, `normalizations[${index}].canonicalPeriod.periodId`);
  const startAt = requireIso(artifact.canonicalPeriod.startAt, `normalizations[${index}].canonicalPeriod.startAt`);
  const endAt = requireIso(artifact.canonicalPeriod.endAt, `normalizations[${index}].canonicalPeriod.endAt`);
  if (Date.parse(endAt) <= Date.parse(startAt)) throw new Error(`${periodId} period end must be after period start`);
  if (Date.parse(endAt) > retrievedMs) throw new Error(`${periodId} period cannot extend beyond provider retrieval time`);

  const metricKeys = artifactMetricKeys(artifact);
  const periodMetricKeys = Object.keys(artifact.canonicalPeriod.metrics ?? {}).sort();
  if (!sameStrings(metricKeys, periodMetricKeys)) {
    throw new Error(`${periodId} canonical period metrics must exactly match normalized metric coverage`);
  }
  if (!sameStrings(metricKeys, artifact.sourceCoverage.metricCoverage)) {
    throw new Error(`${periodId} source metric coverage must exactly match normalized metric coverage`);
  }

  const derivedState = !artifact.providerRunComplete || artifact.missingProviderMetrics.length > 0 ? "PARTIAL" : "READY";
  if (artifact.normalizationState !== derivedState) {
    throw new Error(`${periodId} normalizationState is inconsistent with provider completion evidence`);
  }
  const expectedCoverage = derivedState === "READY" ? "CONNECTED_AND_INGESTING" : "CONNECTED_PARTIAL";
  if (artifact.sourceCoverage.requestedState !== expectedCoverage) {
    throw new Error(`${periodId} source coverage is inconsistent with normalizationState`);
  }

  const lastSuccessfulSyncAt = artifact.sourceCoverage.lastSuccessfulSyncAt
    ? requireIso(artifact.sourceCoverage.lastSuccessfulSyncAt, `${periodId}.lastSuccessfulSyncAt`)
    : null;
  if (lastSuccessfulSyncAt && Date.parse(lastSuccessfulSyncAt) > retrievedMs) {
    throw new Error(`${periodId} lastSuccessfulSyncAt cannot be after retrieval time`);
  }
  if (artifact.providerRunComplete && lastSuccessfulSyncAt !== retrievedAt) {
    throw new Error(`${periodId} completed provider run must bind successful-sync freshness to retrievedAt`);
  }

  if (!sameStrings(artifact.limitations, artifact.sourceCoverage.limitations)) {
    throw new Error(`${periodId} source limitations must preserve normalization limitations exactly`);
  }

  const observationEvidenceRefs: string[] = [];
  const definitionEvidenceRefs: string[] = [];
  for (const metric of artifact.metrics) {
    const canonical = artifact.canonicalPeriod.metrics?.[metric.canonicalMetricKey];
    const canonicalValue = typeof canonical === "object" && canonical !== null ? canonical.value : canonical;
    const canonicalEvidence = typeof canonical === "object" && canonical !== null ? canonical.evidenceRefs ?? [] : [];
    const metricEvidence = normalizeRefs(metric.evidenceRefs, `${periodId}.${metric.canonicalMetricKey}.evidenceRefs`);
    const definitions = normalizeRefs(metric.definitionEvidenceRefs, `${periodId}.${metric.canonicalMetricKey}.definitionEvidenceRefs`);
    safeReference(metric.providerDefinitionId, `${periodId}.${metric.canonicalMetricKey}.providerDefinitionId`);

    if (metric.truthState === "KNOWN") {
      if (metric.value == null || !Number.isFinite(metric.value) || metric.value < 0) {
        throw new Error(`${periodId}.${metric.canonicalMetricKey} KNOWN metric requires a finite non-negative value`);
      }
      if (!metricEvidence.length) throw new Error(`${periodId}.${metric.canonicalMetricKey} KNOWN metric requires evidence`);
      if (canonicalValue !== metric.value || !sameStrings(canonicalEvidence, metricEvidence)) {
        throw new Error(`${periodId}.${metric.canonicalMetricKey} canonical period must preserve normalized value and evidence`);
      }
    } else if (metric.truthState === "UNKNOWN") {
      if (metric.value !== null || canonicalValue != null || canonicalEvidence.length > 0 || metricEvidence.length > 0) {
        throw new Error(`${periodId}.${metric.canonicalMetricKey} UNKNOWN metric cannot carry a value or observation evidence`);
      }
    } else {
      throw new Error(`${periodId}.${metric.canonicalMetricKey} has unsupported truthState`);
    }

    observationEvidenceRefs.push(...metricEvidence);
    definitionEvidenceRefs.push(...definitions);
  }

  return {
    periodId,
    metricKeys,
    observationEvidenceRefs: unique(observationEvidenceRefs),
    definitionEvidenceRefs: unique(definitionEvidenceRefs)
  };
}

export function compileSocialProviderSnapshotProjectionV1(
  input: SocialProviderSnapshotProjectionInputV1,
  now: string
): SocialProviderSnapshotProjectionV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  rejectCredentialMaterial(input);
  const accountId = requireNonEmpty(input.accountId, "accountId");
  const generatedAt = requireIso(now, "now");
  const nowMs = Date.parse(generatedAt);
  if (!Number.isFinite(input.freshnessMaxAgeHours) || input.freshnessMaxAgeHours <= 0) {
    throw new Error("freshnessMaxAgeHours must be a positive finite number");
  }
  if (!Array.isArray(input.normalizations) || input.normalizations.length === 0) {
    throw new Error("normalizations must contain at least one provider normalization artifact");
  }
  if (input.normalizations.length > MAX_NORMALIZATIONS) {
    throw new Error(`normalizations exceeds ${MAX_NORMALIZATIONS} artifacts`);
  }

  const first = input.normalizations[0]!;
  const platform = first.platform;
  const connectorId = requireNonEmpty(first.connectorId, "connectorId");
  const runId = requireNonEmpty(first.runId, "runId");
  const sourceKind = first.sourceKind;
  const retrievedAt = requireIso(first.retrievedAt, "retrievedAt");
  const providerRunComplete = first.providerRunComplete;
  const firstSuccessfulSyncAt = first.sourceCoverage.lastSuccessfulSyncAt
    ? requireIso(first.sourceCoverage.lastSuccessfulSyncAt, "lastSuccessfulSyncAt")
    : null;

  const periodIds = new Set<string>();
  const observationEvidenceRefs: string[] = [];
  const definitionEvidenceRefs: string[] = [];
  const metricCoverage = new Set<SocialMetricKeyV1>();
  const limitations: string[] = [];
  let partial = false;

  input.normalizations.forEach((artifact, index) => {
    if (artifact.platform !== platform) throw new Error("provider snapshot projection cannot mix platforms");
    if (artifact.connectorId !== connectorId) throw new Error("provider snapshot projection cannot mix connector identities");
    if (artifact.runId !== runId) throw new Error("provider snapshot projection cannot mix provider run identities");
    if (artifact.sourceKind !== sourceKind) throw new Error("provider snapshot projection cannot mix source kinds");
    if (requireIso(artifact.retrievedAt, `normalizations[${index}].retrievedAt`) !== retrievedAt) {
      throw new Error("provider snapshot projection requires one exact retrieval instant per run");
    }
    if (artifact.providerRunComplete !== providerRunComplete) {
      throw new Error("provider snapshot projection cannot mix provider completion states within one run");
    }
    const syncAt = artifact.sourceCoverage.lastSuccessfulSyncAt
      ? requireIso(artifact.sourceCoverage.lastSuccessfulSyncAt, `normalizations[${index}].lastSuccessfulSyncAt`)
      : null;
    if (syncAt !== firstSuccessfulSyncAt) {
      throw new Error("provider snapshot projection requires consistent successful-sync provenance across periods");
    }

    const validated = revalidateArtifact(artifact, index, nowMs);
    if (periodIds.has(validated.periodId)) throw new Error(`duplicate canonical periodId: ${validated.periodId}`);
    periodIds.add(validated.periodId);
    validated.metricKeys.forEach((key) => metricCoverage.add(key));
    observationEvidenceRefs.push(...validated.observationEvidenceRefs);
    definitionEvidenceRefs.push(...validated.definitionEvidenceRefs);
    limitations.push(...artifact.limitations);
    partial ||= artifact.normalizationState === "PARTIAL";
  });

  const snapshot = compileCanonicalSocialAccountSnapshotV1(
    {
      platform,
      accountId,
      handle: input.handle,
      retrievedAt,
      sourceCoverage: {
        requestedState: partial ? "CONNECTED_PARTIAL" : "CONNECTED_AND_INGESTING",
        lastSuccessfulSyncAt: firstSuccessfulSyncAt,
        metricCoverage: [...metricCoverage].sort((left, right) => left.localeCompare(right)),
        limitations: unique(limitations)
      },
      periods: input.normalizations.map((artifact) => artifact.canonicalPeriod)
    },
    generatedAt,
    input.freshnessMaxAgeHours
  );

  return freeze({
    contractVersion: "SocialProviderSnapshotProjectionV1",
    platform,
    connectorId,
    runId,
    sourceKind,
    retrievedAt,
    projectionState: partial ? "PARTIAL" : "READY",
    snapshot,
    observationEvidenceRefs: normalizeRefs(observationEvidenceRefs, "observationEvidenceRefs"),
    definitionEvidenceRefs: normalizeRefs(definitionEvidenceRefs, "definitionEvidenceRefs"),
    limitations: unique(limitations),
    causalAttributionClaimed: false,
    crossPlatformAggregationPerformed: false,
    externalAccessPerformed: false,
    writesPerformed: false
  });
}
