import {
  SOCIAL_METRIC_KEYS_V1,
  SOCIAL_PLATFORMS_V1,
  type CanonicalSocialAccountSnapshotV1,
  type SocialMetricKeyV1,
  type SocialPlatformV1
} from "./social-canonical-v1";

export const SOCIAL_CONNECTOR_SOURCE_KINDS_V1 = ["OFFICIAL_API", "AUTHORIZED_EXPORT"] as const;
export type SocialConnectorSourceKindV1 = (typeof SOCIAL_CONNECTOR_SOURCE_KINDS_V1)[number];

export const SOCIAL_CONNECTOR_AVAILABILITY_V1 = ["AVAILABLE", "UNAVAILABLE", "NOT_RECOMMENDED"] as const;
export type SocialConnectorAvailabilityV1 = (typeof SOCIAL_CONNECTOR_AVAILABILITY_V1)[number];

export const SOCIAL_CONNECTOR_AUTHORIZATION_STATES_V1 = ["AUTHORIZED", "NEEDS_KEEGAN_CONNECTION", "NOT_APPLICABLE"] as const;
export type SocialConnectorAuthorizationStateV1 = (typeof SOCIAL_CONNECTOR_AUTHORIZATION_STATES_V1)[number];

export const SOCIAL_CONNECTOR_IMPLEMENTATION_STATES_V1 = ["IMPLEMENTED", "NOT_IMPLEMENTED"] as const;
export type SocialConnectorImplementationStateV1 = (typeof SOCIAL_CONNECTOR_IMPLEMENTATION_STATES_V1)[number];

export const SOCIAL_CONNECTOR_READINESS_STATES_V1 = [
  "LIVE_PROVEN",
  "LIVE_PARTIAL",
  "LIVE_STALE",
  "AUTHORIZED_NOT_PROVEN",
  "NEEDS_KEEGAN_CONNECTION",
  "AVAILABLE_NEEDS_IMPLEMENTATION",
  "NOT_AVAILABLE",
  "NOT_RECOMMENDED"
] as const;
export type SocialConnectorReadinessStateV1 = (typeof SOCIAL_CONNECTOR_READINESS_STATES_V1)[number];

export type SocialHistoricalBackfillCapabilityV1 = "SUPPORTED" | "LIMITED" | "UNAVAILABLE" | "UNKNOWN";
export type SocialLiveSyncOutcomeV1 = "SUCCESS" | "PARTIAL";

export type SocialLiveIngestionProofInputV1 = {
  liveFirstPartyData: true;
  syncOutcome: SocialLiveSyncOutcomeV1;
  retrievedAt: string;
  providerEvidenceRefs: readonly string[];
  snapshot: CanonicalSocialAccountSnapshotV1;
};

export type SocialPlatformConnectorInputV1 = {
  platform: SocialPlatformV1;
  connectorId: string;
  availability: SocialConnectorAvailabilityV1;
  authorizationState: SocialConnectorAuthorizationStateV1;
  implementationState: SocialConnectorImplementationStateV1;
  sourceKind: SocialConnectorSourceKindV1 | null;
  readOnly: true;
  supportedMetrics?: readonly SocialMetricKeyV1[];
  historicalBackfill: SocialHistoricalBackfillCapabilityV1;
  limitations?: readonly string[];
  proof?: SocialLiveIngestionProofInputV1 | null;
};

export type SocialConnectorProofV1 = {
  snapshotId: string;
  retrievedAt: string;
  syncOutcome: SocialLiveSyncOutcomeV1;
  providerEvidenceRefs: readonly string[];
  canonicalEvidenceRefs: readonly string[];
};

export type SocialPlatformConnectorStateV1 = {
  platform: SocialPlatformV1;
  connectorId: string;
  readiness: SocialConnectorReadinessStateV1;
  availability: SocialConnectorAvailabilityV1;
  authorizationState: SocialConnectorAuthorizationStateV1;
  implementationState: SocialConnectorImplementationStateV1;
  sourceKind: SocialConnectorSourceKindV1 | null;
  readOnly: true;
  liveFirstPartyDataProven: boolean;
  needsKeeganAction: boolean;
  supportedMetrics: readonly SocialMetricKeyV1[];
  historicalBackfill: SocialHistoricalBackfillCapabilityV1;
  limitations: readonly string[];
  proof: SocialConnectorProofV1 | null;
};

export type SocialConnectorRegistryV1 = {
  contractVersion: "SocialConnectorRegistryV1";
  generatedAt: string;
  platforms: readonly SocialPlatformConnectorStateV1[];
  livePlatforms: readonly SocialPlatformV1[];
  stalePlatforms: readonly SocialPlatformV1[];
  platformsNeedingKeeganAction: readonly SocialPlatformV1[];
  allTargetPlatformsExplicit: true;
  externalAccessPerformed: false;
  writesPerformed: false;
};

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
      throw new Error(`${path}.${key} contains credential material; connector proof contracts must never carry secrets`);
    }
    rejectCredentialMaterial(child, `${path}.${key}`, seen);
  }
}

function normalizeMetrics(values: readonly SocialMetricKeyV1[] | undefined): readonly SocialMetricKeyV1[] {
  const allowed = new Set<string>(SOCIAL_METRIC_KEYS_V1);
  const normalized = unique(values ?? []);
  for (const metric of normalized) {
    if (!allowed.has(metric)) throw new Error(`unsupported social metric: ${metric}`);
  }
  return normalized as SocialMetricKeyV1[];
}

function normalizeProof(
  input: SocialPlatformConnectorInputV1,
  proof: SocialLiveIngestionProofInputV1,
  nowMs: number,
  staleAfterHours: number
): { proof: SocialConnectorProofV1; stale: boolean } {
  if (input.availability !== "AVAILABLE") throw new Error(`${input.platform} live proof requires AVAILABLE connector state`);
  if (input.authorizationState !== "AUTHORIZED") throw new Error(`${input.platform} live proof requires AUTHORIZED state`);
  if (input.implementationState !== "IMPLEMENTED") throw new Error(`${input.platform} live proof requires IMPLEMENTED state`);
  if (!input.sourceKind || !SOCIAL_CONNECTOR_SOURCE_KINDS_V1.includes(input.sourceKind)) {
    throw new Error(`${input.platform} live proof requires an official API or authorized export source`);
  }
  if (input.readOnly !== true) throw new Error(`${input.platform} connector must be read-only`);
  if (proof.liveFirstPartyData !== true) throw new Error(`${input.platform} proof must explicitly attest live first-party data`);
  if (proof.snapshot.platform !== input.platform) throw new Error(`${input.platform} proof snapshot platform mismatch`);
  if (proof.snapshot.writesPerformed !== false) throw new Error(`${input.platform} canonical snapshot must prove zero writes`);

  const retrievedAt = requireIso(proof.retrievedAt, `${input.platform}.proof.retrievedAt`);
  if (retrievedAt !== requireIso(proof.snapshot.retrievedAt, `${input.platform}.snapshot.retrievedAt`)) {
    throw new Error(`${input.platform} proof retrievedAt must match the canonical snapshot`);
  }
  if (!proof.snapshot.sourceCoverage.lastSuccessfulSyncAt) {
    throw new Error(`${input.platform} live proof requires successful-sync evidence`);
  }
  const requested = proof.snapshot.sourceCoverage.requestedState;
  if (requested !== "CONNECTED_AND_INGESTING" && requested !== "CONNECTED_PARTIAL") {
    throw new Error(`${input.platform} canonical snapshot does not claim a connected source`);
  }

  const providerEvidenceRefs = unique(proof.providerEvidenceRefs);
  const canonicalEvidenceRefs = unique(proof.snapshot.evidenceRefs);
  if (!providerEvidenceRefs.length) throw new Error(`${input.platform} live proof requires provider provenance evidence`);
  if (!canonicalEvidenceRefs.length) throw new Error(`${input.platform} live proof requires canonical metric/content evidence`);

  const stale = nowMs - Date.parse(retrievedAt) > staleAfterHours * 60 * 60 * 1000;
  return {
    proof: freeze({
      snapshotId: requireNonEmpty(proof.snapshot.snapshotId, `${input.platform}.snapshot.snapshotId`),
      retrievedAt,
      syncOutcome: proof.syncOutcome,
      providerEvidenceRefs,
      canonicalEvidenceRefs
    }),
    stale
  };
}

function compileConnectorState(
  input: SocialPlatformConnectorInputV1,
  nowMs: number,
  staleAfterHours: number
): SocialPlatformConnectorStateV1 {
  rejectCredentialMaterial(input);
  const platform = input.platform;
  if (!SOCIAL_PLATFORMS_V1.includes(platform)) throw new Error(`unsupported social platform: ${String(platform)}`);
  const connectorId = requireNonEmpty(input.connectorId, `${platform}.connectorId`);
  if (input.readOnly !== true) throw new Error(`${platform} connector must be read-only`);

  if (input.availability === "AVAILABLE" && !input.sourceKind) {
    throw new Error(`${platform} available connector requires an official API or authorized export source`);
  }
  if (input.availability !== "AVAILABLE" && input.proof) {
    throw new Error(`${platform} unavailable connector cannot carry live proof`);
  }
  if (input.availability !== "AVAILABLE" && input.authorizationState === "AUTHORIZED") {
    throw new Error(`${platform} unavailable connector cannot be AUTHORIZED`);
  }
  if (input.authorizationState === "NEEDS_KEEGAN_CONNECTION" && input.proof) {
    throw new Error(`${platform} cannot carry live proof before authorization`);
  }

  const supportedMetrics = normalizeMetrics(input.supportedMetrics);
  const limitations = unique(input.limitations ?? []);
  let readiness: SocialConnectorReadinessStateV1;
  let normalizedProof: SocialConnectorProofV1 | null = null;

  if (input.availability === "NOT_RECOMMENDED") {
    readiness = "NOT_RECOMMENDED";
  } else if (input.availability === "UNAVAILABLE") {
    readiness = "NOT_AVAILABLE";
  } else if (input.authorizationState === "NEEDS_KEEGAN_CONNECTION") {
    readiness = "NEEDS_KEEGAN_CONNECTION";
  } else if (input.implementationState === "NOT_IMPLEMENTED") {
    readiness = "AVAILABLE_NEEDS_IMPLEMENTATION";
  } else if (!input.proof) {
    readiness = "AUTHORIZED_NOT_PROVEN";
  } else {
    const result = normalizeProof(input, input.proof, nowMs, staleAfterHours);
    normalizedProof = result.proof;
    readiness = result.stale ? "LIVE_STALE" : input.proof.syncOutcome === "PARTIAL" ? "LIVE_PARTIAL" : "LIVE_PROVEN";
  }

  const liveFirstPartyDataProven = readiness === "LIVE_PROVEN" || readiness === "LIVE_PARTIAL" || readiness === "LIVE_STALE";
  return freeze({
    platform,
    connectorId,
    readiness,
    availability: input.availability,
    authorizationState: input.authorizationState,
    implementationState: input.implementationState,
    sourceKind: input.sourceKind,
    readOnly: true,
    liveFirstPartyDataProven,
    needsKeeganAction: readiness === "NEEDS_KEEGAN_CONNECTION",
    supportedMetrics,
    historicalBackfill: input.historicalBackfill,
    limitations,
    proof: normalizedProof
  });
}

export function compileSocialConnectorRegistryV1(
  inputs: readonly SocialPlatformConnectorInputV1[],
  now: string,
  staleAfterHours = 48
): SocialConnectorRegistryV1 {
  if (!Array.isArray(inputs)) throw new Error("inputs must be an array");
  if (!Number.isFinite(staleAfterHours) || staleAfterHours <= 0) throw new Error("staleAfterHours must be positive");
  const generatedAt = requireIso(now, "now");
  const nowMs = Date.parse(generatedAt);
  const byPlatform = new Map<SocialPlatformV1, SocialPlatformConnectorInputV1>();

  for (const input of inputs) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("each connector input must be an object");
    if (byPlatform.has(input.platform)) throw new Error(`duplicate connector state for platform: ${input.platform}`);
    byPlatform.set(input.platform, input);
  }

  const missing = SOCIAL_PLATFORMS_V1.filter((platform) => !byPlatform.has(platform));
  const extras = [...byPlatform.keys()].filter((platform) => !SOCIAL_PLATFORMS_V1.includes(platform));
  if (missing.length || extras.length) {
    throw new Error(`all target platforms must be explicit; missing=${missing.join(",") || "none"}; unsupported=${extras.join(",") || "none"}`);
  }

  const platforms = SOCIAL_PLATFORMS_V1.map((platform) => compileConnectorState(byPlatform.get(platform)!, nowMs, staleAfterHours));
  return freeze({
    contractVersion: "SocialConnectorRegistryV1",
    generatedAt,
    platforms,
    livePlatforms: platforms.filter((row) => row.readiness === "LIVE_PROVEN" || row.readiness === "LIVE_PARTIAL").map((row) => row.platform),
    stalePlatforms: platforms.filter((row) => row.readiness === "LIVE_STALE").map((row) => row.platform),
    platformsNeedingKeeganAction: platforms.filter((row) => row.needsKeeganAction).map((row) => row.platform),
    allTargetPlatformsExplicit: true,
    externalAccessPerformed: false,
    writesPerformed: false
  });
}
