import {
  SOCIAL_METRIC_DEFINITIONS_V1,
  SOCIAL_METRIC_KEYS_V1,
  type SocialHistoryWindowV1,
  type SocialMetricKeyV1,
  type SocialMetricObservationInputV1,
  type SocialPeriodInputV1,
  type SocialPlatformV1,
  type SocialSourceCoverageInputV1
} from "./social-canonical-v1";
import {
  SOCIAL_CONNECTOR_SOURCE_KINDS_V1,
  type SocialConnectorSourceKindV1
} from "./social-connector-proof-v1";

export const SOCIAL_PROVIDER_NATIVE_UNITS_V1 = ["COUNT", "SECONDS", "MILLISECONDS", "MINUTES"] as const;
export type SocialProviderNativeUnitV1 = (typeof SOCIAL_PROVIDER_NATIVE_UNITS_V1)[number];

export type SocialProviderMetricMappingV1 = {
  providerMetricKey: string;
  canonicalMetricKey: SocialMetricKeyV1;
  nativeUnit: SocialProviderNativeUnitV1;
  aggregation: "POINT_IN_TIME" | "PERIOD_TOTAL" | "PER_CONTENT_AVERAGE";
  providerDefinitionId: string;
  definitionEvidenceRefs: readonly string[];
};

export type SocialProviderMetricObservationV1 = {
  providerMetricKey: string;
  value: number | null;
  capturedAt: string;
  evidenceRefs?: readonly string[];
};

export type SocialProviderMetricNormalizationInputV1 = {
  platform: SocialPlatformV1;
  connectorId: string;
  runId: string;
  sourceKind: SocialConnectorSourceKindV1;
  authorizationState: "AUTHORIZED";
  readOnly: true;
  providerRunComplete: boolean;
  retrievedAt: string;
  periodId: string;
  window: SocialHistoryWindowV1;
  periodStartAt: string;
  periodEndAt: string;
  mappings: readonly SocialProviderMetricMappingV1[];
  observations: readonly SocialProviderMetricObservationV1[];
  limitations?: readonly string[];
};

export type NormalizedSocialProviderMetricV1 = {
  providerMetricKey: string;
  canonicalMetricKey: SocialMetricKeyV1;
  providerDefinitionId: string;
  nativeUnit: SocialProviderNativeUnitV1;
  canonicalUnit: "COUNT" | "SECONDS";
  conversion: "IDENTITY" | "MILLISECONDS_TO_SECONDS" | "MINUTES_TO_SECONDS";
  value: number | null;
  truthState: "KNOWN" | "UNKNOWN";
  capturedAt: string | null;
  evidenceRefs: readonly string[];
  definitionEvidenceRefs: readonly string[];
};

export type SocialProviderMetricNormalizationV1 = {
  contractVersion: "SocialProviderMetricNormalizationV1";
  platform: SocialPlatformV1;
  connectorId: string;
  runId: string;
  sourceKind: SocialConnectorSourceKindV1;
  retrievedAt: string;
  providerRunComplete: boolean;
  normalizationState: "READY" | "PARTIAL";
  metrics: readonly NormalizedSocialProviderMetricV1[];
  missingProviderMetrics: readonly string[];
  canonicalPeriod: SocialPeriodInputV1;
  sourceCoverage: SocialSourceCoverageInputV1;
  limitations: readonly string[];
  causalAttributionClaimed: false;
  crossPlatformAggregationPerformed: false;
  externalAccessPerformed: false;
  writesPerformed: false;
};

const MAX_MAPPINGS = 100;
const MAX_OBSERVATIONS = 100;
const MAX_REFERENCE_LENGTH = 2_000;
const MAX_TEXT_LENGTH = 500;
const MAX_LIMITATIONS = 50;
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

function requireNonEmpty(value: string, field: string, maxLength = MAX_TEXT_LENGTH): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} must be non-empty`);
  if (normalized.length > maxLength) throw new Error(`${field} exceeds ${maxLength} characters`);
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
      throw new Error(`${path}.${key} contains credential material; provider normalization must never carry secrets`);
    }
    rejectCredentialMaterial(child, `${path}.${key}`, seen);
  }
}

function safeReference(value: string, field: string): string {
  const normalized = requireNonEmpty(value, field, MAX_REFERENCE_LENGTH);
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

function normalizeRefs(values: readonly string[] | undefined, field: string): string[] {
  const refs = unique(values ?? []).map((value, index) => safeReference(value, `${field}[${index}]`));
  if (refs.length > 100) throw new Error(`${field} exceeds 100 references`);
  return refs;
}

function normalizeLimitations(values: readonly string[] | undefined): string[] {
  const limitations = unique(values ?? []).map((value, index) => requireNonEmpty(value, `limitations[${index}]`));
  if (limitations.length > MAX_LIMITATIONS) throw new Error(`limitations exceeds ${MAX_LIMITATIONS} items`);
  return limitations;
}

function conversionFor(metricKey: SocialMetricKeyV1, nativeUnit: SocialProviderNativeUnitV1): NormalizedSocialProviderMetricV1["conversion"] {
  const canonicalUnit = SOCIAL_METRIC_DEFINITIONS_V1[metricKey].unit;
  if (canonicalUnit === "COUNT") {
    if (nativeUnit !== "COUNT") throw new Error(`${metricKey} requires COUNT provider units; received ${nativeUnit}`);
    return "IDENTITY";
  }
  if (nativeUnit === "SECONDS") return "IDENTITY";
  if (nativeUnit === "MILLISECONDS") return "MILLISECONDS_TO_SECONDS";
  if (nativeUnit === "MINUTES") return "MINUTES_TO_SECONDS";
  throw new Error(`${metricKey} requires time provider units; received ${nativeUnit}`);
}

function convertValue(value: number, conversion: NormalizedSocialProviderMetricV1["conversion"], field: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} must be a finite non-negative number or null`);
  if (conversion === "MILLISECONDS_TO_SECONDS") return value / 1_000;
  if (conversion === "MINUTES_TO_SECONDS") return value * 60;
  return value;
}

export function compileSocialProviderMetricNormalizationV1(
  input: SocialProviderMetricNormalizationInputV1,
  now: string
): SocialProviderMetricNormalizationV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  rejectCredentialMaterial(input);
  if (input.authorizationState !== "AUTHORIZED") throw new Error("provider normalization requires explicit AUTHORIZED state");
  if (input.readOnly !== true) throw new Error("social provider normalization must be read-only");
  if (!SOCIAL_CONNECTOR_SOURCE_KINDS_V1.includes(input.sourceKind)) {
    throw new Error("social provider normalization requires an official API or authorized export source");
  }

  const nowMs = Date.parse(requireIso(now, "now"));
  const retrievedAt = requireIso(input.retrievedAt, "retrievedAt");
  const retrievedMs = Date.parse(retrievedAt);
  if (retrievedMs > nowMs) throw new Error("retrievedAt cannot be in the future");

  const periodStartAt = requireIso(input.periodStartAt, "periodStartAt");
  const periodEndAt = requireIso(input.periodEndAt, "periodEndAt");
  if (Date.parse(periodEndAt) <= Date.parse(periodStartAt)) throw new Error("periodEndAt must be after periodStartAt");
  if (Date.parse(periodEndAt) > retrievedMs) throw new Error("periodEndAt cannot extend beyond retrievedAt");

  const connectorId = requireNonEmpty(input.connectorId, "connectorId");
  const runId = requireNonEmpty(input.runId, "runId");
  const periodId = requireNonEmpty(input.periodId, "periodId");
  if (!Array.isArray(input.mappings) || input.mappings.length === 0) throw new Error("mappings must contain at least one provider metric mapping");
  if (input.mappings.length > MAX_MAPPINGS) throw new Error(`mappings exceeds ${MAX_MAPPINGS} items`);
  if (!Array.isArray(input.observations)) throw new Error("observations must be an array");
  if (input.observations.length > MAX_OBSERVATIONS) throw new Error(`observations exceeds ${MAX_OBSERVATIONS} items`);
  const mappings = input.mappings as readonly SocialProviderMetricMappingV1[];
  const observations = input.observations as readonly SocialProviderMetricObservationV1[];

  const allowedMetricKeys = new Set<string>(SOCIAL_METRIC_KEYS_V1);
  const mappingsByProvider = new Map<string, SocialProviderMetricMappingV1>();
  const providerByCanonical = new Map<SocialMetricKeyV1, string>();
  const normalizedMappings = mappings.map((mapping, index) => {
    const providerMetricKey = requireNonEmpty(mapping.providerMetricKey, `mappings[${index}].providerMetricKey`);
    if (!allowedMetricKeys.has(mapping.canonicalMetricKey)) {
      throw new Error(`${providerMetricKey} maps to unsupported canonical metric ${String(mapping.canonicalMetricKey)}`);
    }
    if (mappingsByProvider.has(providerMetricKey)) throw new Error(`duplicate provider metric mapping: ${providerMetricKey}`);
    const priorProviderMetric = providerByCanonical.get(mapping.canonicalMetricKey);
    if (priorProviderMetric) {
      throw new Error(`${mapping.canonicalMetricKey} has ambiguous provider mappings: ${priorProviderMetric}, ${providerMetricKey}`);
    }
    if (!SOCIAL_PROVIDER_NATIVE_UNITS_V1.includes(mapping.nativeUnit)) {
      throw new Error(`${providerMetricKey} has unsupported native unit ${String(mapping.nativeUnit)}`);
    }
    const canonicalDefinition = SOCIAL_METRIC_DEFINITIONS_V1[mapping.canonicalMetricKey];
    if (mapping.aggregation !== canonicalDefinition.aggregation) {
      throw new Error(`${providerMetricKey} aggregation ${mapping.aggregation} does not match canonical ${mapping.canonicalMetricKey} aggregation ${canonicalDefinition.aggregation}`);
    }
    conversionFor(mapping.canonicalMetricKey, mapping.nativeUnit);
    const providerDefinitionId = safeReference(mapping.providerDefinitionId, `mappings[${index}].providerDefinitionId`);
    const definitionEvidenceRefs = normalizeRefs(mapping.definitionEvidenceRefs, `mappings[${index}].definitionEvidenceRefs`);
    if (!definitionEvidenceRefs.length) throw new Error(`${providerMetricKey} requires provider definition evidence`);

    const normalized: SocialProviderMetricMappingV1 = freeze({
      providerMetricKey,
      canonicalMetricKey: mapping.canonicalMetricKey,
      nativeUnit: mapping.nativeUnit,
      aggregation: mapping.aggregation,
      providerDefinitionId,
      definitionEvidenceRefs
    });
    mappingsByProvider.set(providerMetricKey, normalized);
    providerByCanonical.set(mapping.canonicalMetricKey, providerMetricKey);
    return normalized;
  });

  const observationsByProvider = new Map<string, SocialProviderMetricObservationV1>();
  for (const [index, observation] of observations.entries()) {
    const providerMetricKey = requireNonEmpty(observation.providerMetricKey, `observations[${index}].providerMetricKey`);
    if (!mappingsByProvider.has(providerMetricKey)) throw new Error(`observation ${providerMetricKey} has no explicit provider-to-canonical mapping`);
    if (observationsByProvider.has(providerMetricKey)) throw new Error(`duplicate provider metric observation: ${providerMetricKey}`);
    const capturedAt = requireIso(observation.capturedAt, `observations[${index}].capturedAt`);
    if (Date.parse(capturedAt) > retrievedMs) throw new Error(`${providerMetricKey}.capturedAt cannot be after retrievedAt`);
    const evidenceRefs = normalizeRefs(observation.evidenceRefs, `observations[${index}].evidenceRefs`);
    if (observation.value != null && !evidenceRefs.length) throw new Error(`${providerMetricKey} KNOWN observation requires provider evidence`);
    observationsByProvider.set(providerMetricKey, freeze({ providerMetricKey, value: observation.value, capturedAt, evidenceRefs }));
  }

  const canonicalMetrics: Partial<Record<SocialMetricKeyV1, SocialMetricObservationInputV1>> = {};
  const normalizedMetrics: NormalizedSocialProviderMetricV1[] = [];
  const missingProviderMetrics: string[] = [];
  const limitations = normalizeLimitations(input.limitations);

  for (const mapping of normalizedMappings) {
    const observation = observationsByProvider.get(mapping.providerMetricKey);
    const canonicalUnit = SOCIAL_METRIC_DEFINITIONS_V1[mapping.canonicalMetricKey].unit;
    const conversion = conversionFor(mapping.canonicalMetricKey, mapping.nativeUnit);
    if (!observation || observation.value == null) {
      missingProviderMetrics.push(mapping.providerMetricKey);
      normalizedMetrics.push(freeze({
        providerMetricKey: mapping.providerMetricKey,
        canonicalMetricKey: mapping.canonicalMetricKey,
        providerDefinitionId: mapping.providerDefinitionId,
        nativeUnit: mapping.nativeUnit,
        canonicalUnit,
        conversion,
        value: null,
        truthState: "UNKNOWN",
        capturedAt: observation?.capturedAt ?? null,
        evidenceRefs: [] as string[],
        definitionEvidenceRefs: mapping.definitionEvidenceRefs
      }));
      canonicalMetrics[mapping.canonicalMetricKey] = { value: null, evidenceRefs: [] };
      continue;
    }

    const value = convertValue(observation.value, conversion, `${mapping.providerMetricKey}.value`);
    normalizedMetrics.push(freeze({
      providerMetricKey: mapping.providerMetricKey,
      canonicalMetricKey: mapping.canonicalMetricKey,
      providerDefinitionId: mapping.providerDefinitionId,
      nativeUnit: mapping.nativeUnit,
      canonicalUnit,
      conversion,
      value,
      truthState: "KNOWN",
      capturedAt: observation.capturedAt,
      evidenceRefs: observation.evidenceRefs ?? [],
      definitionEvidenceRefs: mapping.definitionEvidenceRefs
    }));
    canonicalMetrics[mapping.canonicalMetricKey] = { value, evidenceRefs: observation.evidenceRefs ?? [] };
  }

  const partial = !input.providerRunComplete || missingProviderMetrics.length > 0;
  if (!input.providerRunComplete && limitations.length === 0) throw new Error("incomplete provider run requires an explicit limitation");
  for (const metricKey of missingProviderMetrics) {
    limitations.push(`Mapped provider metric ${metricKey} was not observed; canonical value remains UNKNOWN.`);
  }

  const metricCoverage = normalizedMappings.map((mapping) => mapping.canonicalMetricKey).sort((left, right) => left.localeCompare(right));
  const normalizedLimitations = unique(limitations);

  return freeze({
    contractVersion: "SocialProviderMetricNormalizationV1",
    platform: input.platform,
    connectorId,
    runId,
    sourceKind: input.sourceKind,
    retrievedAt,
    providerRunComplete: input.providerRunComplete,
    normalizationState: partial ? "PARTIAL" : "READY",
    metrics: normalizedMetrics.sort((left, right) => left.canonicalMetricKey.localeCompare(right.canonicalMetricKey)),
    missingProviderMetrics: missingProviderMetrics.sort((left, right) => left.localeCompare(right)),
    canonicalPeriod: { periodId, window: input.window, startAt: periodStartAt, endAt: periodEndAt, metrics: canonicalMetrics },
    sourceCoverage: {
      requestedState: partial ? "CONNECTED_PARTIAL" : "CONNECTED_AND_INGESTING",
      lastSuccessfulSyncAt: retrievedAt,
      metricCoverage,
      limitations: normalizedLimitations
    },
    limitations: normalizedLimitations,
    causalAttributionClaimed: false,
    crossPlatformAggregationPerformed: false,
    externalAccessPerformed: false,
    writesPerformed: false
  });
}
