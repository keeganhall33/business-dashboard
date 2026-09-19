import {
  SOCIAL_PLATFORMS_V1,
  type SocialPlatformV1
} from "./social-canonical-v1";
import {
  compileSocialConnectorRegistryV1,
  type SocialConnectorRegistryV1,
  type SocialPlatformConnectorInputV1,
  type SocialPlatformConnectorStateV1
} from "./social-connector-proof-v1";
import {
  compileSocialLiveProviderRunV1,
  type SocialLiveProviderRunInputV1,
  type SocialLiveProviderRunV1
} from "./social-live-provider-run-v1";

export const SOCIAL_CONNECTOR_HEALTH_STATES_V1 = [
  "HEALTHY",
  "DEGRADED",
  "STALE",
  "UNPROVEN",
  "BLOCKED",
  "NOT_APPLICABLE"
] as const;
export type SocialConnectorHealthStateV1 = (typeof SOCIAL_CONNECTOR_HEALTH_STATES_V1)[number];

export const SOCIAL_CANONICAL_DATA_STATES_V1 = [
  "CURRENT",
  "PARTIAL",
  "STALE",
  "UNPROVEN",
  "NOT_APPLICABLE"
] as const;
export type SocialCanonicalDataStateV1 = (typeof SOCIAL_CANONICAL_DATA_STATES_V1)[number];

export const SOCIAL_CONNECTOR_HEALTH_ISSUES_V1 = [
  "AUTHORIZATION_REQUIRED",
  "IMPLEMENTATION_REQUIRED",
  "SOURCE_UNAVAILABLE",
  "SOURCE_NOT_RECOMMENDED",
  "CANONICAL_PROOF_MISSING",
  "CANONICAL_PROOF_PARTIAL",
  "CANONICAL_PROOF_STALE",
  "LATEST_PROVIDER_RUN_PARTIAL",
  "LATEST_PROVIDER_RUN_FAILED",
  "CANONICAL_PROOF_LAGGING"
] as const;
export type SocialConnectorHealthIssueV1 = (typeof SOCIAL_CONNECTOR_HEALTH_ISSUES_V1)[number];

export type SocialConnectorHealthPlatformV1 = {
  platform: SocialPlatformV1;
  connectorId: string;
  sourceHealth: SocialConnectorHealthStateV1;
  canonicalDataState: SocialCanonicalDataStateV1;
  readiness: SocialPlatformConnectorStateV1["readiness"];
  liveFirstPartyDataProven: boolean;
  latestCanonicalProofAt: string | null;
  latestProviderRunId: string | null;
  latestProviderRunAt: string | null;
  latestProviderRunState: SocialLiveProviderRunV1["runState"] | null;
  retryAfterAt: string | null;
  issues: readonly SocialConnectorHealthIssueV1[];
  limitations: readonly string[];
  evidenceRefs: readonly string[];
  needsKeeganAction: boolean;
  needsEngineeringAction: boolean;
  readOnly: true;
  writesPerformed: false;
};

export type SocialConnectorHealthReviewV1 = {
  contractVersion: "SocialConnectorHealthReviewV1";
  generatedAt: string;
  platforms: readonly SocialConnectorHealthPlatformV1[];
  healthyPlatforms: readonly SocialPlatformV1[];
  degradedPlatforms: readonly SocialPlatformV1[];
  blockedPlatforms: readonly SocialPlatformV1[];
  platformsNeedingKeeganAction: readonly SocialPlatformV1[];
  platformsNeedingEngineeringAction: readonly SocialPlatformV1[];
  liveFirstPartyPlatforms: readonly SocialPlatformV1[];
  connectorRegistry: SocialConnectorRegistryV1;
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

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function compareRuns(left: SocialLiveProviderRunV1, right: SocialLiveProviderRunV1): number {
  const timeDelta = Date.parse(right.retrievedAt) - Date.parse(left.retrievedAt);
  if (timeDelta !== 0) return timeDelta;
  const startDelta = Date.parse(right.startedAt) - Date.parse(left.startedAt);
  if (startDelta !== 0) return startDelta;
  return right.runId.localeCompare(left.runId);
}

function latestRunForPlatform(
  platform: SocialPlatformV1,
  runs: readonly SocialLiveProviderRunV1[]
): SocialLiveProviderRunV1 | null {
  return runs.filter((run) => run.platform === platform).sort(compareRuns)[0] ?? null;
}

function classifyCanonicalDataState(row: SocialPlatformConnectorStateV1): SocialCanonicalDataStateV1 {
  switch (row.readiness) {
    case "LIVE_PROVEN":
      return "CURRENT";
    case "LIVE_PARTIAL":
      return "PARTIAL";
    case "LIVE_STALE":
      return "STALE";
    case "AUTHORIZED_NOT_PROVEN":
    case "AVAILABLE_NEEDS_IMPLEMENTATION":
    case "NEEDS_KEEGAN_CONNECTION":
      return "UNPROVEN";
    case "NOT_AVAILABLE":
    case "NOT_RECOMMENDED":
      return "NOT_APPLICABLE";
  }
}

function baseIssues(row: SocialPlatformConnectorStateV1): SocialConnectorHealthIssueV1[] {
  switch (row.readiness) {
    case "LIVE_PROVEN":
      return [];
    case "LIVE_PARTIAL":
      return ["CANONICAL_PROOF_PARTIAL"];
    case "LIVE_STALE":
      return ["CANONICAL_PROOF_STALE"];
    case "AUTHORIZED_NOT_PROVEN":
      return ["CANONICAL_PROOF_MISSING"];
    case "NEEDS_KEEGAN_CONNECTION":
      return ["AUTHORIZATION_REQUIRED"];
    case "AVAILABLE_NEEDS_IMPLEMENTATION":
      return ["IMPLEMENTATION_REQUIRED"];
    case "NOT_AVAILABLE":
      return ["SOURCE_UNAVAILABLE"];
    case "NOT_RECOMMENDED":
      return ["SOURCE_NOT_RECOMMENDED"];
  }
}

function classifyHealth(
  row: SocialPlatformConnectorStateV1,
  latestRun: SocialLiveProviderRunV1 | null,
  issues: readonly SocialConnectorHealthIssueV1[]
): SocialConnectorHealthStateV1 {
  if (row.readiness === "NOT_AVAILABLE" || row.readiness === "NOT_RECOMMENDED") return "NOT_APPLICABLE";
  if (row.readiness === "NEEDS_KEEGAN_CONNECTION" || row.readiness === "AVAILABLE_NEEDS_IMPLEMENTATION") return "BLOCKED";
  if (row.readiness === "LIVE_STALE") return "STALE";

  const proofAt = row.proof?.retrievedAt ? Date.parse(row.proof.retrievedAt) : null;
  const runIsNewer = latestRun && (proofAt == null || Date.parse(latestRun.retrievedAt) > proofAt);
  if (runIsNewer && latestRun?.runState === "FAILED") {
    return row.liveFirstPartyDataProven ? "DEGRADED" : "BLOCKED";
  }
  if (runIsNewer && latestRun?.runState === "PARTIAL") return "DEGRADED";
  if (issues.includes("CANONICAL_PROOF_LAGGING") && row.liveFirstPartyDataProven) return "DEGRADED";
  if (row.readiness === "LIVE_PARTIAL") return "DEGRADED";
  if (row.readiness === "LIVE_PROVEN") return "HEALTHY";
  return "UNPROVEN";
}

function compilePlatformHealth(
  row: SocialPlatformConnectorStateV1,
  latestRun: SocialLiveProviderRunV1 | null
): SocialConnectorHealthPlatformV1 {
  const issues = baseIssues(row);
  const proofAt = row.proof?.retrievedAt ?? null;
  const proofMs = proofAt ? Date.parse(proofAt) : null;
  const runIsNewer = latestRun && (proofMs == null || Date.parse(latestRun.retrievedAt) > proofMs);

  if (runIsNewer && latestRun?.runState === "FAILED") issues.push("LATEST_PROVIDER_RUN_FAILED");
  if (runIsNewer && latestRun?.runState === "PARTIAL") issues.push("LATEST_PROVIDER_RUN_PARTIAL");
  if (runIsNewer && proofMs != null && latestRun?.runState === "COMPLETE") issues.push("CANONICAL_PROOF_LAGGING");

  const normalizedIssues = [...new Set(issues)].sort((left, right) => left.localeCompare(right));
  const sourceHealth = classifyHealth(row, latestRun, normalizedIssues);
  const needsKeeganAction = row.needsKeeganAction;
  const needsEngineeringAction =
    row.readiness === "AVAILABLE_NEEDS_IMPLEMENTATION" ||
    row.readiness === "AUTHORIZED_NOT_PROVEN" ||
    normalizedIssues.includes("LATEST_PROVIDER_RUN_PARTIAL") ||
    normalizedIssues.includes("LATEST_PROVIDER_RUN_FAILED") ||
    normalizedIssues.includes("CANONICAL_PROOF_LAGGING") ||
    normalizedIssues.includes("CANONICAL_PROOF_STALE") ||
    normalizedIssues.includes("CANONICAL_PROOF_PARTIAL");

  return freeze({
    platform: row.platform,
    connectorId: row.connectorId,
    sourceHealth,
    canonicalDataState: classifyCanonicalDataState(row),
    readiness: row.readiness,
    liveFirstPartyDataProven: row.liveFirstPartyDataProven,
    latestCanonicalProofAt: proofAt,
    latestProviderRunId: latestRun?.runId ?? null,
    latestProviderRunAt: latestRun?.retrievedAt ?? null,
    latestProviderRunState: latestRun?.runState ?? null,
    retryAfterAt: latestRun?.retryAfterAt ?? null,
    issues: normalizedIssues,
    limitations: unique([...(row.limitations ?? []), ...(latestRun?.limitations ?? [])]),
    evidenceRefs: unique([
      ...(row.proof?.providerEvidenceRefs ?? []),
      ...(row.proof?.canonicalEvidenceRefs ?? []),
      ...(latestRun?.pageEvidenceRefs ?? [])
    ]),
    needsKeeganAction,
    needsEngineeringAction,
    readOnly: true,
    writesPerformed: false
  });
}

export function compileSocialConnectorHealthReviewV1(
  connectorInputs: readonly SocialPlatformConnectorInputV1[],
  providerRunInputs: readonly SocialLiveProviderRunInputV1[],
  now: string,
  staleAfterHours = 48
): SocialConnectorHealthReviewV1 {
  if (!Array.isArray(connectorInputs)) throw new Error("connectorInputs must be an array");
  if (!Array.isArray(providerRunInputs)) throw new Error("providerRunInputs must be an array");
  const generatedAt = requireIso(now, "now");
  const registry = compileSocialConnectorRegistryV1(connectorInputs, generatedAt, staleAfterHours);
  const connectorByPlatform = new Map(registry.platforms.map((row) => [row.platform, row] as const));
  const runIds = new Set<string>();

  const runs = providerRunInputs.map((input, index) => {
    const run = compileSocialLiveProviderRunV1(input, generatedAt);
    const identity = `${run.connectorId}:${run.runId}`;
    if (runIds.has(identity)) throw new Error(`duplicate provider run identity: ${identity}`);
    runIds.add(identity);

    const connector = connectorByPlatform.get(run.platform);
    if (!connector) throw new Error(`providerRuns[${index}] has unsupported platform ${run.platform}`);
    if (connector.connectorId !== run.connectorId) {
      throw new Error(`${run.platform} provider run connectorId does not match the canonical connector registry`);
    }
    if (connector.sourceKind !== run.sourceKind) {
      throw new Error(`${run.platform} provider run sourceKind does not match the canonical connector registry`);
    }
    if (connector.authorizationState !== "AUTHORIZED" || connector.implementationState !== "IMPLEMENTED") {
      throw new Error(`${run.platform} provider run cannot exist for a connector that is not authorized and implemented`);
    }
    if (connector.availability !== "AVAILABLE") {
      throw new Error(`${run.platform} provider run cannot exist for an unavailable connector`);
    }
    return run;
  });

  const platforms = SOCIAL_PLATFORMS_V1.map((platform) =>
    compilePlatformHealth(connectorByPlatform.get(platform)!, latestRunForPlatform(platform, runs))
  );

  return freeze({
    contractVersion: "SocialConnectorHealthReviewV1",
    generatedAt,
    platforms,
    healthyPlatforms: platforms.filter((row) => row.sourceHealth === "HEALTHY").map((row) => row.platform),
    degradedPlatforms: platforms
      .filter((row) => row.sourceHealth === "DEGRADED" || row.sourceHealth === "STALE")
      .map((row) => row.platform),
    blockedPlatforms: platforms.filter((row) => row.sourceHealth === "BLOCKED").map((row) => row.platform),
    platformsNeedingKeeganAction: platforms.filter((row) => row.needsKeeganAction).map((row) => row.platform),
    platformsNeedingEngineeringAction: platforms.filter((row) => row.needsEngineeringAction).map((row) => row.platform),
    liveFirstPartyPlatforms: platforms.filter((row) => row.liveFirstPartyDataProven).map((row) => row.platform),
    connectorRegistry: registry,
    externalAccessPerformed: false,
    writesPerformed: false
  });
}
