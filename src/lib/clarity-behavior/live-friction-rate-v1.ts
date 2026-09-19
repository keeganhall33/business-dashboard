import {
  CLARITY_DATA_EXPORT_LIVE_RUNNER_VERSION,
  type ClarityDataExportLiveRunnerResultV1,
} from "./data-export-live-runner-v1";

export const CLARITY_LIVE_FRICTION_RATE_VERSION =
  "CLARITY_LIVE_FRICTION_RATE_V1" as const;

export type ClarityLiveFrictionMetricV1 =
  | "DEAD_CLICK"
  | "RAGE_CLICK"
  | "QUICK_BACK"
  | "EXCESSIVE_SCROLL"
  | "SCRIPT_ERROR"
  | "ERROR_CLICK";

export type ClarityLiveFrictionRateReasonV1 =
  | "READY_FOR_BEHAVIOR_REVIEW"
  | "RUNNER_NOT_ADAPTED"
  | "RUNNER_PROVENANCE_INVALID"
  | "SOURCE_NOT_COMPLETE"
  | "LIVE_GATE_NOT_ACCEPTED"
  | "PROVIDER_RESPONSE_INVALID"
  | "FRICTION_METRIC_MISSING"
  | "FRICTION_METRIC_DUPLICATED"
  | "FRICTION_ROW_INVALID"
  | "FRICTION_DIMENSION_MISSING"
  | "FRICTION_ROW_DUPLICATED";

export type ClarityLiveFrictionRateObservationV1 = Readonly<{
  metric: ClarityLiveFrictionMetricV1;
  providerMetricName: string;
  rowIndex: number;
  dimensions: Readonly<Record<string, string>>;
  sessionsCount: number;
  sessionsWithMetricPercent: number;
  sessionsWithoutMetricPercent: number;
  affectedSessionCount: null;
  affectedSessionCountReason:
    "PROVIDER_EXPORT_EXPOSES_PERCENTAGE_NOT_EXACT_AFFECTED_SESSION_COUNT";
  evidenceRef: string;
}>;

export type ClarityLiveFrictionRateResultV1 = Readonly<{
  version: typeof CLARITY_LIVE_FRICTION_RATE_VERSION;
  state: "READY_FOR_BEHAVIOR_REVIEW" | "WITHHELD";
  reasonCodes: readonly ClarityLiveFrictionRateReasonV1[];
  observations: readonly ClarityLiveFrictionRateObservationV1[];
  coverage: Readonly<{
    lookbackDays: number | null;
    requestedWindow: Readonly<{ startAt: string; endAt: string }> | null;
    observedWindow: Readonly<{ startAt: string; endAt: string }> | null;
    extractedAt: string | null;
    dimensions: readonly string[];
    sourceTruth: string;
  }>;
  evidenceRefs: readonly string[];
  limitations: Readonly<{
    descriptiveProviderRateOnly: true;
    affectedSessionCountsInferred: false;
    providerFrictionRowFieldShapeDocumentedByMicrosoft: false;
    longerTrendRequiresRetainedHistory: true;
    causalityEstablished: false;
    attributionEstablished: false;
    statisticalSignificanceEstablished: false;
    monetaryImpactEstablished: false;
    eligibleForConversionRecommendation: false;
  }>;
  authority: Readonly<{
    persistencePerformed: false;
    siteMutationAllowed: false;
    checkoutMutationAllowed: false;
    trackingMutationAllowed: false;
    pricingMutationAllowed: false;
    metaWriteAllowed: false;
    externalMutationAllowed: false;
  }>;
}>;

type ProviderBlock = Readonly<{
  metricName: string;
  information: readonly Record<string, unknown>[];
}>;

const MAX_PROVIDER_BLOCKS = 100;
const MAX_PROVIDER_ROWS = 1_000;
const MAX_ROW_KEYS = 64;
const PERCENT_COMPLEMENT_TOLERANCE = 1;
const FRICTION_METRICS: ReadonlyArray<
  Readonly<{
    metric: ClarityLiveFrictionMetricV1;
    providerMetricName: string;
  }>
> = [
  { metric: "DEAD_CLICK", providerMetricName: "Dead Click Count" },
  { metric: "RAGE_CLICK", providerMetricName: "Rage Click Count" },
  { metric: "QUICK_BACK", providerMetricName: "Quickback Click" },
  { metric: "EXCESSIVE_SCROLL", providerMetricName: "Excessive Scroll" },
  { metric: "SCRIPT_ERROR", providerMetricName: "Script Error Count" },
  { metric: "ERROR_CLICK", providerMetricName: "Error Click Count" },
];

const METRIC_BY_NORMALIZED_NAME = new Map(
  FRICTION_METRICS.map((entry) => [normalizeName(entry.providerMetricName), entry]),
);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function finiteNonNegativeNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function nonNegativeInteger(value: unknown): number | null {
  const parsed = finiteNonNegativeNumber(value);
  return parsed != null && Number.isSafeInteger(parsed) ? parsed : null;
}

function percentage(value: unknown): number | null {
  const parsed = finiteNonNegativeNumber(value);
  return parsed != null && parsed <= 100 ? parsed : null;
}

function parseProviderBlocks(value: unknown): ProviderBlock[] | null {
  if (!Array.isArray(value) || value.length > MAX_PROVIDER_BLOCKS) return null;

  let rowCount = 0;
  const blocks: ProviderBlock[] = [];
  for (const block of value) {
    if (!isPlainObject(block)) return null;
    if (
      typeof block.metricName !== "string" ||
      block.metricName.trim().length === 0 ||
      block.metricName.length > 120 ||
      !Array.isArray(block.information)
    ) {
      return null;
    }

    rowCount += block.information.length;
    if (rowCount > MAX_PROVIDER_ROWS) return null;

    const rows: Record<string, unknown>[] = [];
    for (const row of block.information) {
      if (!isPlainObject(row) || Object.keys(row).length > MAX_ROW_KEYS) return null;
      rows.push(row);
    }

    blocks.push({
      metricName: block.metricName.trim(),
      information: rows,
    });
  }
  return blocks;
}

function dimensionValue(row: Record<string, unknown>, dimension: string): string | null {
  const value = row[dimension];
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function baseResult(
  runner: ClarityDataExportLiveRunnerResultV1,
  state: ClarityLiveFrictionRateResultV1["state"],
  reasonCodes: ClarityLiveFrictionRateReasonV1[],
  observations: ClarityLiveFrictionRateObservationV1[] = [],
): ClarityLiveFrictionRateResultV1 {
  const gate = runner.adapterResult?.gateResult ?? null;
  const plan = runner.plan;
  const fetchResult = runner.fetchResult;
  return deepFreeze({
    version: CLARITY_LIVE_FRICTION_RATE_VERSION,
    state,
    reasonCodes: [...new Set(reasonCodes)],
    observations: observations.map((observation) => ({
      ...observation,
      dimensions: { ...observation.dimensions },
    })),
    coverage: {
      lookbackDays: plan?.lookbackDays ?? null,
      requestedWindow: plan?.expectedUtcWindow
        ? { ...plan.expectedUtcWindow }
        : null,
      observedWindow: fetchResult?.coverage.providerWindow
        ? { ...fetchResult.coverage.providerWindow }
        : null,
      extractedAt: fetchResult?.responseReceivedAt ?? null,
      dimensions: plan ? [...plan.dimensions] : [],
      sourceTruth: runner.adapterResult?.effectiveSourceTruth ?? "UNKNOWN",
    },
    evidenceRefs: [...new Set(runner.provenance.transportEvidenceRefs)].sort(),
    limitations: {
      descriptiveProviderRateOnly: true as const,
      affectedSessionCountsInferred: false as const,
      providerFrictionRowFieldShapeDocumentedByMicrosoft: false as const,
      longerTrendRequiresRetainedHistory: true as const,
      causalityEstablished: false as const,
      attributionEstablished: false as const,
      statisticalSignificanceEstablished: false as const,
      monetaryImpactEstablished: false as const,
      eligibleForConversionRecommendation: false as const,
    },
    authority: {
      persistencePerformed: false as const,
      siteMutationAllowed: false as const,
      checkoutMutationAllowed: false as const,
      trackingMutationAllowed: false as const,
      pricingMutationAllowed: false as const,
      metaWriteAllowed: false as const,
      externalMutationAllowed: false as const,
    },
  });
}

function runnerProvenanceValid(runner: ClarityDataExportLiveRunnerResultV1): boolean {
  const plan = runner.plan;
  const fetchResult = runner.fetchResult;
  const adapter = runner.adapterResult;
  const gate = adapter?.gateResult;
  return Boolean(
    runner.version === CLARITY_DATA_EXPORT_LIVE_RUNNER_VERSION &&
      runner.state === "ADAPTED" &&
      runner.reasonCode === "ADAPTED" &&
      plan?.status === "READY" &&
      fetchResult?.state === "FETCHED" &&
      adapter?.adapterState === "ADAPTED" &&
      gate &&
      runner.provenance.requestStartCapturedByRunner === true &&
      runner.provenance.observedWindowBoundToAuthorizedFetch === true &&
      runner.provenance.extractedAtBoundToAuthorizedFetch === true &&
      runner.provenance.sourceTruthSuppliedExplicitly === true &&
      runner.provenance.sourceTruthInferredFromHttpStatus === false &&
      runner.privacy.bearerTokenReturned === false &&
      runner.authority.networkCallPerformed === true &&
      runner.authority.authorizationHeaderUsed === true &&
      runner.authority.persistencePerformed === false &&
      runner.authority.externalMutationAllowed === false &&
      runner.authority.metaWriteAllowed === false &&
      fetchResult.evidenceRefs.length === 1 &&
      runner.provenance.transportEvidenceRefs.length === 1 &&
      fetchResult.evidenceRefs[0] === runner.provenance.transportEvidenceRefs[0] &&
      adapter.evidenceRefs.length === 1 &&
      adapter.evidenceRefs[0] === fetchResult.evidenceRefs[0] &&
      gate.evidenceRefs.length === 1 &&
      gate.evidenceRefs[0] === fetchResult.evidenceRefs[0] &&
      gate.requestedWindow.startAt === plan.expectedUtcWindow?.startAt &&
      gate.requestedWindow.endAt === plan.expectedUtcWindow?.endAt &&
      gate.observedWindow.startAt === fetchResult.coverage.providerWindow?.startAt &&
      gate.observedWindow.endAt === fetchResult.coverage.providerWindow?.endAt &&
      gate.extractedAt === fetchResult.responseReceivedAt
  );
}

/**
 * Projects provider-reported Clarity friction incidence percentages from one
 * provenance-bound authorized live run into descriptive behavior evidence.
 *
 * Microsoft documents these metric blocks as available from Data Export, but
 * does not document the friction-row response field schema. This contract
 * therefore validates the currently observed provider field names strictly,
 * labels that limitation explicitly, and refuses to infer exact affected
 * session counts from rounded percentages.
 *
 * The result is eligible only for human behavior review. It does not authorize
 * persistence, site/checkout/tracking/pricing mutation, Meta writes, causal or
 * attribution claims, conversion recommendations, or monetary impact claims.
 */
export function projectClarityLiveFrictionRatesV1(
  runner: ClarityDataExportLiveRunnerResultV1,
): ClarityLiveFrictionRateResultV1 {
  if (
    !runner ||
    runner.version !== CLARITY_DATA_EXPORT_LIVE_RUNNER_VERSION ||
    runner.state !== "ADAPTED" ||
    runner.reasonCode !== "ADAPTED" ||
    !runner.fetchResult ||
    !runner.adapterResult
  ) {
    return baseResult(runner, "WITHHELD", ["RUNNER_NOT_ADAPTED"]);
  }

  if (!runnerProvenanceValid(runner)) {
    return baseResult(runner, "WITHHELD", ["RUNNER_PROVENANCE_INVALID"]);
  }

  if (runner.adapterResult.effectiveSourceTruth !== "COMPLETE") {
    return baseResult(runner, "WITHHELD", ["SOURCE_NOT_COMPLETE"]);
  }

  if (runner.adapterResult.gateResult?.gateState !== "ACCEPTED_FOR_HISTORY") {
    return baseResult(runner, "WITHHELD", ["LIVE_GATE_NOT_ACCEPTED"]);
  }

  const blocks = parseProviderBlocks(runner.fetchResult.responseJson);
  if (!blocks) {
    return baseResult(runner, "WITHHELD", ["PROVIDER_RESPONSE_INVALID"]);
  }

  const frictionBlocks = new Map<string, ProviderBlock[]>();
  for (const block of blocks) {
    const normalized = normalizeName(block.metricName);
    if (!METRIC_BY_NORMALIZED_NAME.has(normalized)) continue;
    const existing = frictionBlocks.get(normalized) ?? [];
    existing.push(block);
    frictionBlocks.set(normalized, existing);
  }

  for (const expected of FRICTION_METRICS) {
    const matching = frictionBlocks.get(normalizeName(expected.providerMetricName)) ?? [];
    if (matching.length === 0) {
      return baseResult(runner, "WITHHELD", ["FRICTION_METRIC_MISSING"]);
    }
    if (matching.length !== 1) {
      return baseResult(runner, "WITHHELD", ["FRICTION_METRIC_DUPLICATED"]);
    }
  }

  const observations: ClarityLiveFrictionRateObservationV1[] = [];
  const identities = new Set<string>();
  const dimensions = runner.plan?.dimensions ?? [];
  const evidenceRef = runner.provenance.transportEvidenceRefs[0];

  for (const expected of FRICTION_METRICS) {
    const block = frictionBlocks.get(normalizeName(expected.providerMetricName))![0];
    if (block.information.length === 0) {
      return baseResult(runner, "WITHHELD", ["FRICTION_ROW_INVALID"]);
    }

    for (const [rowIndex, row] of block.information.entries()) {
      const sessionsCount = nonNegativeInteger(row.sessionsCount);
      const withMetric = percentage(row.sessionsWithMetricPercentage);
      const withoutMetric = percentage(row.sessionsWithoutMetricPercentage);
      if (
        sessionsCount == null ||
        withMetric == null ||
        withoutMetric == null ||
        Math.abs(withMetric + withoutMetric - 100) > PERCENT_COMPLEMENT_TOLERANCE
      ) {
        return baseResult(runner, "WITHHELD", ["FRICTION_ROW_INVALID"]);
      }

      const rowDimensions: Record<string, string> = {};
      for (const dimension of dimensions) {
        const value = dimensionValue(row, dimension);
        if (value === null) {
          return baseResult(runner, "WITHHELD", ["FRICTION_DIMENSION_MISSING"]);
        }
        rowDimensions[dimension] = value;
      }

      const identity = JSON.stringify([
        expected.metric,
        ...dimensions.map((dimension) => [dimension, rowDimensions[dimension]]),
      ]);
      if (identities.has(identity)) {
        return baseResult(runner, "WITHHELD", ["FRICTION_ROW_DUPLICATED"]);
      }
      identities.add(identity);

      observations.push({
        metric: expected.metric,
        providerMetricName: block.metricName,
        rowIndex,
        dimensions: rowDimensions,
        sessionsCount,
        sessionsWithMetricPercent: withMetric,
        sessionsWithoutMetricPercent: withoutMetric,
        affectedSessionCount: null,
        affectedSessionCountReason:
          "PROVIDER_EXPORT_EXPOSES_PERCENTAGE_NOT_EXACT_AFFECTED_SESSION_COUNT",
        evidenceRef,
      });
    }
  }

  return baseResult(
    runner,
    "READY_FOR_BEHAVIOR_REVIEW",
    ["READY_FOR_BEHAVIOR_REVIEW"],
    observations,
  );
}
