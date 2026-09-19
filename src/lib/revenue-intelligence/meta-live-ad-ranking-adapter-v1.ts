import {
  rankMetaAdDirectionalMovementV1,
  type MetaAdDirectionalPairV1,
  type MetaAdDirectionalRankingInputV1,
  type MetaAdDirectionalRankingV1,
  type MetaAdMetricDirectionV1,
} from "./meta-ad-directional-ranking-v1";

export const META_LIVE_AD_RANKING_ADAPTER_VERSION =
  "META_LIVE_AD_RANKING_ADAPTER_V1" as const;

export type MetaLiveAdRankingMetricV1 = "CTR" | "CPC" | "PURCHASE_ROAS";

export type MetaLiveAdRankingAdapterInputV1 = Readonly<{
  snapshot: unknown;
  generatedAt: string;
  windowDays: 7 | 14;
  metric: MetaLiveAdRankingMetricV1;
  maximumEvidenceAgeHours: number;
  minimumSampleSize: number;
  materialChangeRatio: number;
}>;

export type MetaLiveAdRankingAdapterResultV1 = Readonly<{
  version: typeof META_LIVE_AD_RANKING_ADAPTER_VERSION;
  status: "READY" | "VERIFY_EVIDENCE" | "INVALID_INPUT";
  reasonCode:
    | "LIVE_META_EVIDENCE_READY"
    | "INVALID_OR_UNBOUNDED_INPUT"
    | "META_SNAPSHOT_NOT_LIVE"
    | "FIXED_WINDOW_SOURCE_INCOMPLETE"
    | "FIXED_WINDOWS_NOT_COMPARABLE"
    | "AD_COHORT_NOT_COMPARABLE"
    | "METRIC_EVIDENCE_INCOMPLETE";
  ranking: MetaAdDirectionalRankingV1 | null;
  sourceGeneratedAt: string | null;
  apiVersion: string | null;
  evidenceRefs: readonly string[];
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    metaWriteAllowed: false;
    budgetMutationAllowed: false;
    campaignMutationAllowed: false;
    approvalBypassAllowed: false;
  }>;
}>;

type JsonObject = Record<string, unknown>;

type ParsedWindow = Readonly<{
  key: string;
  role: "CURRENT" | "PRIOR" | "CONTEXT";
  days: number;
  range: Readonly<{ startDate: string; endDate: string }>;
  apiVersion: string;
  completeThrough: string;
  ads: readonly JsonObject[];
}>;

const DAY_MS = 24 * 60 * 60 * 1_000;
const MAX_ADS_PER_WINDOW = 5_000;
const MAX_TEXT = 240;
const METRICS: Readonly<
  Record<
    MetaLiveAdRankingMetricV1,
    Readonly<{
      field: "ctr" | "cpc" | "roas";
      metricName: string;
      metricDefinitionId: string;
      direction: MetaAdMetricDirectionV1;
      sampleField: "impressions" | "clicks";
      sampleBasis: string;
    }>
  >
> = Object.freeze({
  CTR: Object.freeze({
    field: "ctr",
    metricName: "ctr",
    metricDefinitionId: "meta_ads_ctr_percent_v1",
    direction: "HIGHER_IS_BETTER",
    sampleField: "impressions",
    sampleBasis: "Meta-reported impressions",
  }),
  CPC: Object.freeze({
    field: "cpc",
    metricName: "cpc",
    metricDefinitionId: "meta_ads_cpc_v1",
    direction: "LOWER_IS_BETTER",
    sampleField: "clicks",
    sampleBasis: "Meta-reported clicks",
  }),
  PURCHASE_ROAS: Object.freeze({
    field: "roas",
    metricName: "purchase_roas",
    metricDefinitionId: "meta_offsite_purchase_value_over_spend_v1",
    direction: "HIGHER_IS_BETTER",
    sampleField: "impressions",
    sampleBasis: "Meta-reported impressions; this is an exposure-volume gate, not a statistical ROAS sample",
  }),
});

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  metaWriteAllowed: false as const,
  budgetMutationAllowed: false as const,
  campaignMutationAllowed: false as const,
  approvalBypassAllowed: false as const,
});

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeText(value: unknown, maximum = MAX_TEXT): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maximum &&
    !/[\r\n]/.test(value)
  );
}

function canonicalInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function dateOnlyMs(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10) === value ? parsed : null;
}

function validRange(value: unknown): value is Readonly<{ startDate: string; endDate: string }> {
  if (!isObject(value)) return false;
  const start = dateOnlyMs(value.startDate);
  const end = dateOnlyMs(value.endDate);
  return start !== null && end !== null && end >= start;
}

function inclusiveDays(range: Readonly<{ startDate: string; endDate: string }>): number {
  const start = dateOnlyMs(range.startDate) as number;
  const end = dateOnlyMs(range.endDate) as number;
  return Math.floor((end - start) / DAY_MS) + 1;
}

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function nonNegativeSafeInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : null;
}

function result(
  status: MetaLiveAdRankingAdapterResultV1["status"],
  reasonCode: MetaLiveAdRankingAdapterResultV1["reasonCode"],
  options: {
    ranking?: MetaAdDirectionalRankingV1 | null;
    sourceGeneratedAt?: string | null;
    apiVersion?: string | null;
    evidenceRefs?: string[];
    limitations?: string[];
  } = {},
): MetaLiveAdRankingAdapterResultV1 {
  return deepFreeze({
    version: META_LIVE_AD_RANKING_ADAPTER_VERSION,
    status,
    reasonCode,
    ranking: options.ranking ?? null,
    sourceGeneratedAt: options.sourceGeneratedAt ?? null,
    apiVersion: options.apiVersion ?? null,
    evidenceRefs: [...new Set(options.evidenceRefs ?? [])].sort(),
    limitations: [...new Set(options.limitations ?? [])].sort(),
    authority: AUTHORITY,
  });
}

function parseWindow(value: unknown): ParsedWindow | null {
  if (!isObject(value)) return null;
  if (!safeText(value.key, 40)) return null;
  if (value.role !== "CURRENT" && value.role !== "PRIOR" && value.role !== "CONTEXT") {
    return null;
  }
  if (!Number.isSafeInteger(value.days) || (value.days as number) < 1 || (value.days as number) > 365) {
    return null;
  }
  if (!validRange(value.reportingRange)) return null;
  if (!isObject(value.sourceCompleteness)) return null;
  const completeness = value.sourceCompleteness;
  if (
    !safeText(completeness.apiVersion, 40) ||
    completeness.paginationComplete !== true ||
    !Number.isSafeInteger(completeness.pagesFetched) ||
    (completeness.pagesFetched as number) < 1 ||
    completeness.completedUtcDaysOnly !== true ||
    dateOnlyMs(completeness.completeThrough) === null ||
    completeness.completeThrough !== value.reportingRange.endDate
  ) {
    return null;
  }
  if (!Array.isArray(value.ads) || value.ads.length > MAX_ADS_PER_WINDOW || value.ads.some((ad) => !isObject(ad))) {
    return null;
  }
  return {
    key: value.key.trim(),
    role: value.role,
    days: value.days as number,
    range: {
      startDate: value.reportingRange.startDate,
      endDate: value.reportingRange.endDate,
    },
    apiVersion: completeness.apiVersion.trim(),
    completeThrough: completeness.completeThrough as string,
    ads: value.ads as readonly JsonObject[],
  };
}

function comparableWindows(current: ParsedWindow, prior: ParsedWindow, windowDays: 7 | 14): boolean {
  const currentStart = dateOnlyMs(current.range.startDate) as number;
  const priorEnd = dateOnlyMs(prior.range.endDate) as number;
  return (
    current.role === "CURRENT" &&
    prior.role === "PRIOR" &&
    current.days === windowDays &&
    prior.days === windowDays &&
    inclusiveDays(current.range) === windowDays &&
    inclusiveDays(prior.range) === windowDays &&
    priorEnd + DAY_MS === currentStart &&
    current.apiVersion === prior.apiVersion
  );
}

function indexAds(ads: readonly JsonObject[]): Map<string, JsonObject> | null {
  const indexed = new Map<string, JsonObject>();
  for (const ad of ads) {
    if (
      !safeText(ad.campaignId, 160) ||
      !safeText(ad.adSetId, 160) ||
      !safeText(ad.adId, 160)
    ) {
      return null;
    }
    const adId = ad.adId.trim();
    if (indexed.has(adId)) return null;
    indexed.set(adId, ad);
  }
  return indexed;
}

function sameAdCohort(current: Map<string, JsonObject>, prior: Map<string, JsonObject>): boolean {
  if (current.size !== prior.size) return false;
  for (const [adId, currentAd] of current) {
    const priorAd = prior.get(adId);
    if (!priorAd) return false;
    if (
      currentAd.campaignId !== priorAd.campaignId ||
      currentAd.adSetId !== priorAd.adSetId
    ) {
      return false;
    }
  }
  return true;
}

function buildPair(
  accountId: string,
  sourceGeneratedAt: string,
  metric: MetaLiveAdRankingMetricV1,
  currentWindow: ParsedWindow,
  priorWindow: ParsedWindow,
  currentAd: JsonObject,
  priorAd: JsonObject,
): MetaAdDirectionalPairV1 | null {
  const definition = METRICS[metric];
  const currentValue = nonNegativeNumber(currentAd[definition.field]);
  const priorValue = nonNegativeNumber(priorAd[definition.field]);
  const currentSample = nonNegativeSafeInteger(currentAd[definition.sampleField]);
  const priorSample = nonNegativeSafeInteger(priorAd[definition.sampleField]);
  if (
    currentValue === null ||
    priorValue === null ||
    currentSample === null ||
    priorSample === null
  ) {
    return null;
  }

  const identity = {
    adAccountId: accountId,
    campaignId: (currentAd.campaignId as string).trim(),
    adSetId: (currentAd.adSetId as string).trim(),
    adId: (currentAd.adId as string).trim(),
    metricName: definition.metricName,
    metricDefinitionId: definition.metricDefinitionId,
    metricDirection: definition.direction,
  };

  const evidenceRef = (window: ParsedWindow) =>
    `meta:${accountId}:${window.apiVersion}:${window.key}:${identity.adId}:${metric.toLowerCase()}`;

  return {
    current: {
      ...identity,
      range: currentWindow.range,
      observedAt: sourceGeneratedAt,
      completeThrough: currentWindow.completeThrough,
      truthState: "COMPLETE",
      value: currentValue,
      sampleSize: currentSample,
      evidenceRefs: [evidenceRef(currentWindow)],
    },
    prior: {
      ...identity,
      range: priorWindow.range,
      observedAt: sourceGeneratedAt,
      completeThrough: priorWindow.completeThrough,
      truthState: "COMPLETE",
      value: priorValue,
      sampleSize: priorSample,
      evidenceRefs: [evidenceRef(priorWindow)],
    },
  };
}

function validAdapterInput(input: MetaLiveAdRankingAdapterInputV1): boolean {
  return Boolean(
    input &&
      canonicalInstant(input.generatedAt) &&
      (input.windowDays === 7 || input.windowDays === 14) &&
      typeof input.metric === "string" &&
      Object.prototype.hasOwnProperty.call(METRICS, input.metric) &&
      typeof input.maximumEvidenceAgeHours === "number" &&
      Number.isFinite(input.maximumEvidenceAgeHours) &&
      input.maximumEvidenceAgeHours > 0 &&
      input.maximumEvidenceAgeHours <= 24 * 30 &&
      Number.isSafeInteger(input.minimumSampleSize) &&
      input.minimumSampleSize > 0 &&
      typeof input.materialChangeRatio === "number" &&
      Number.isFinite(input.materialChangeRatio) &&
      input.materialChangeRatio > 0 &&
      input.materialChangeRatio <= 1
  );
}

export function rankLiveMetaAdSnapshotV1(
  input: MetaLiveAdRankingAdapterInputV1,
): MetaLiveAdRankingAdapterResultV1 {
  if (!validAdapterInput(input) || !isObject(input.snapshot)) {
    return result("INVALID_INPUT", "INVALID_OR_UNBOUNDED_INPUT", {
      limitations: ["No live Meta ranking was prepared from invalid or unbounded input."],
    });
  }

  const snapshot = input.snapshot;
  const sourceGeneratedAt = canonicalInstant(snapshot.generatedAt) ? snapshot.generatedAt : null;
  const accountId = safeText(snapshot.accountId, 160) ? snapshot.accountId.trim() : null;
  if (snapshot.status !== "LIVE" || sourceGeneratedAt === null || accountId === null) {
    return result("VERIFY_EVIDENCE", "META_SNAPSHOT_NOT_LIVE", {
      sourceGeneratedAt,
      limitations: ["Meta evidence must come from a canonical LIVE snapshot with explicit account identity."],
    });
  }

  if (!isObject(snapshot.adFixedWindows)) {
    return result("VERIFY_EVIDENCE", "FIXED_WINDOW_SOURCE_INCOMPLETE", {
      sourceGeneratedAt,
      limitations: ["The LIVE Meta snapshot is missing fixed-window ad evidence."],
    });
  }

  const fixedWindows = snapshot.adFixedWindows;
  const windowsRaw = fixedWindows.windows;
  if (
    !Array.isArray(windowsRaw) ||
    !canonicalInstant(fixedWindows.generatedAt) ||
    dateOnlyMs(fixedWindows.completeThrough) === null ||
    windowsRaw.length > 16
  ) {
    return result("VERIFY_EVIDENCE", "FIXED_WINDOW_SOURCE_INCOMPLETE", {
      sourceGeneratedAt,
      limitations: ["Meta fixed-window provenance is malformed or unbounded."],
    });
  }

  const parsedWindows = windowsRaw.map((window: unknown) => parseWindow(window));
  if (parsedWindows.some((window) => window === null)) {
    return result("VERIFY_EVIDENCE", "FIXED_WINDOW_SOURCE_INCOMPLETE", {
      sourceGeneratedAt,
      limitations: ["At least one required Meta window is partial, malformed, or not exhaustively paginated."],
    });
  }
  const windows = parsedWindows as ParsedWindow[];
  const byKey = new Map<string, ParsedWindow>();
  for (const window of windows) {
    if (byKey.has(window.key)) {
      return result("VERIFY_EVIDENCE", "FIXED_WINDOW_SOURCE_INCOMPLETE", {
        sourceGeneratedAt,
        limitations: ["Duplicate fixed-window keys make Meta evidence ambiguous."],
      });
    }
    byKey.set(window.key, window);
  }

  const current = byKey.get(`CURRENT_${input.windowDays}D`);
  const prior = byKey.get(`PRIOR_${input.windowDays}D`);
  if (!current || !prior) {
    return result("VERIFY_EVIDENCE", "FIXED_WINDOW_SOURCE_INCOMPLETE", {
      sourceGeneratedAt,
      limitations: ["The requested current/prior Meta windows are not both present."],
    });
  }
  if (
    !comparableWindows(current, prior, input.windowDays) ||
    current.range.endDate !== fixedWindows.completeThrough
  ) {
    return result("VERIFY_EVIDENCE", "FIXED_WINDOWS_NOT_COMPARABLE", {
      sourceGeneratedAt,
      apiVersion: current.apiVersion,
      limitations: [
        "Meta current/prior windows must be adjacent, equal-duration, completed UTC periods from the same API version, with the current window ending on completeThrough.",
      ],
    });
  }

  const currentAds = indexAds(current.ads);
  const priorAds = indexAds(prior.ads);
  if (currentAds === null || priorAds === null) {
    return result("VERIFY_EVIDENCE", "FIXED_WINDOW_SOURCE_INCOMPLETE", {
      sourceGeneratedAt,
      apiVersion: current.apiVersion,
      limitations: ["Meta ad identity is missing, malformed, or duplicated within a fixed window."],
    });
  }
  if (!sameAdCohort(currentAds, priorAds)) {
    return result("VERIFY_EVIDENCE", "AD_COHORT_NOT_COMPARABLE", {
      sourceGeneratedAt,
      apiVersion: current.apiVersion,
      limitations: [
        "Current and prior Meta ad cohorts differ. New, ended, moved, or identity-drifted ads are not silently dropped from directional ranking.",
      ],
    });
  }

  const pairs: MetaAdDirectionalPairV1[] = [];
  for (const [adId, currentAd] of currentAds) {
    const priorAd = priorAds.get(adId) as JsonObject;
    const pair = buildPair(
      accountId,
      sourceGeneratedAt,
      input.metric,
      current,
      prior,
      currentAd,
      priorAd,
    );
    if (!pair) {
      return result("VERIFY_EVIDENCE", "METRIC_EVIDENCE_INCOMPLETE", {
        sourceGeneratedAt,
        apiVersion: current.apiVersion,
        limitations: [
          `Meta ${input.metric} or its required sample evidence is missing for at least one ad. Missing values are not coerced to zero.`,
        ],
      });
    }
    pairs.push(pair);
  }

  if (pairs.length === 0) {
    return result("VERIFY_EVIDENCE", "METRIC_EVIDENCE_INCOMPLETE", {
      sourceGeneratedAt,
      apiVersion: current.apiVersion,
      limitations: ["The requested Meta windows contain no comparable ad evidence."],
    });
  }

  const rankingInput: MetaAdDirectionalRankingInputV1 = {
    generatedAt: input.generatedAt,
    windowDays: input.windowDays,
    maximumEvidenceAgeHours: input.maximumEvidenceAgeHours,
    minimumSampleSize: input.minimumSampleSize,
    materialChangeRatio: input.materialChangeRatio,
    pairs,
  };
  const ranking = rankMetaAdDirectionalMovementV1(rankingInput);
  if (ranking.status !== "READY") {
    return result("VERIFY_EVIDENCE", "FIXED_WINDOW_SOURCE_INCOMPLETE", {
      sourceGeneratedAt,
      apiVersion: current.apiVersion,
      ranking,
      evidenceRefs: [...ranking.evidenceRefs],
      limitations: [
        "The live snapshot adapter produced bounded evidence, but the downstream directional decision contract rejected it as non-decision-grade.",
        ...ranking.limitations,
      ],
    });
  }

  const definition = METRICS[input.metric];
  return result("READY", "LIVE_META_EVIDENCE_READY", {
    sourceGeneratedAt,
    apiVersion: current.apiVersion,
    ranking,
    evidenceRefs: [...ranking.evidenceRefs],
    limitations: [
      `Directional ${input.metric} ranking uses ${definition.sampleBasis} as the caller-thresholded sample basis.`,
      "Live Meta directional ranking does not establish statistical significance, causality, incrementality, cross-channel attribution, confidence, or monetary impact.",
      "This adapter is read-only analysis. Meta budget, campaign, ad set, ad, tracking, and other external writes remain approval-gated elsewhere.",
    ],
  });
}
