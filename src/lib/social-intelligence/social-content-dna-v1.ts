import type {
  CanonicalSocialAccountSnapshotV1,
  CanonicalSocialContentV1,
  SocialMetricKeyV1,
  SocialPlatformV1
} from "./social-canonical-v1";

export const SOCIAL_CONTENT_DNA_V1_VERSION = "SocialContentDnaAnalysisV1" as const;
export const SOCIAL_CONTENT_DNA_MAX_SNAPSHOTS = 20;
export const SOCIAL_CONTENT_DNA_MAX_CONTENT = 500;

export type ContentDnaDimensionV1 =
  | "FORMAT"
  | "SUBJECT"
  | "PROJECT"
  | "THEME"
  | "HOOK"
  | "COLLABORATION"
  | "AMPLIFICATION";

export type ContentPerformanceBandV1 =
  | "OBSERVED_WINNER"
  | "OBSERVED_UNDERPERFORMER"
  | "WITHIN_BASELINE"
  | "INSUFFICIENT_EVIDENCE";

export type ContentDnaAssociationV1 = "ABOVE_PLATFORM_BASELINE" | "BELOW_PLATFORM_BASELINE" | "WITHIN_PLATFORM_BASELINE";

export type ContentObservedPerformanceV1 = Readonly<{
  platform: SocialPlatformV1;
  content_id: string;
  published_at: string;
  exposure_metric: "REACH" | "VIEWS" | "IMPRESSIONS" | null;
  exposure_value: number | null;
  engagement_per_1000_exposure: number | null;
  high_intent_per_1000_exposure: number | null;
  business_outcome_ref_count: number;
  attribution_confidence: CanonicalSocialContentV1["attributionConfidence"];
  production_effort_minutes: number | null;
  band: ContentPerformanceBandV1;
  evidence_refs: readonly string[];
  limitations: readonly string[];
}>;

export type ContentDnaPatternV1 = Readonly<{
  platform: SocialPlatformV1;
  dimension: ContentDnaDimensionV1;
  value: string;
  comparable_content_count: number;
  average_engagement_per_1000_exposure: number;
  platform_median_engagement_per_1000_exposure: number;
  relative_to_platform_median: number | null;
  association: ContentDnaAssociationV1;
  evidence_refs: readonly string[];
  interpretation: string;
  causal_claim: false;
}>;

export type SocialContentDnaAnalysisV1 = Readonly<{
  contract_version: typeof SOCIAL_CONTENT_DNA_V1_VERSION;
  status: "READY" | "PARTIAL" | "INSUFFICIENT_EVIDENCE";
  analyzed_platforms: readonly SocialPlatformV1[];
  excluded_platforms: readonly Readonly<{ platform: SocialPlatformV1; reason: string }>[];
  content: readonly ContentObservedPerformanceV1[];
  patterns: readonly ContentDnaPatternV1[];
  winner_ids: readonly string[];
  underperformer_ids: readonly string[];
  guardrails: readonly string[];
  external_access_performed: false;
  writes_performed: false;
}>;

type ComparableContent = {
  source: CanonicalSocialContentV1;
  exposureMetric: "REACH" | "VIEWS" | "IMPRESSIONS";
  exposure: number;
  engagementPerThousand: number;
  highIntentPerThousand: number | null;
  evidenceRefs: string[];
};

const ENGAGEMENT_KEYS: readonly SocialMetricKeyV1[] = ["LIKES", "COMMENTS", "SHARES", "SAVES"];
const HIGH_INTENT_KEYS: readonly SocialMetricKeyV1[] = ["SAVES", "PROFILE_VISITS", "LINK_CLICKS"];

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function median(values: readonly number[]): number {
  const ordered = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(ordered.length / 2);
  if (ordered.length % 2) return ordered[midpoint]!;
  return (ordered[midpoint - 1]! + ordered[midpoint]!) / 2;
}

function knownMetric(content: CanonicalSocialContentV1, key: SocialMetricKeyV1): number | null {
  const observation = content.metrics[key];
  return observation.truthState === "KNOWN" && observation.value !== null ? observation.value : null;
}

function evidenceFor(content: CanonicalSocialContentV1, keys: readonly SocialMetricKeyV1[]): string[] {
  return unique(keys.flatMap((key) => content.metrics[key].evidenceRefs));
}

function exposureFor(content: CanonicalSocialContentV1): {
  metric: ComparableContent["exposureMetric"];
  value: number;
} | null {
  for (const key of ["REACH", "VIEWS", "IMPRESSIONS"] as const) {
    const value = knownMetric(content, key);
    if (value !== null && value > 0) return { metric: key, value };
  }
  return null;
}

function comparable(content: CanonicalSocialContentV1): ComparableContent | null {
  const exposure = exposureFor(content);
  if (!exposure) return null;

  const engagement = ENGAGEMENT_KEYS.map((key) => knownMetric(content, key));
  if (engagement.some((value) => value === null)) return null;
  const metricEvidence = evidenceFor(content, [exposure.metric, ...ENGAGEMENT_KEYS]);
  if (!metricEvidence.length) return null;

  const engagementTotal = (engagement as number[]).reduce((sum, value) => sum + value, 0);
  const highIntent = HIGH_INTENT_KEYS.map((key) => knownMetric(content, key));
  const highIntentPerThousand = highIntent.some((value) => value === null)
    ? null
    : ((highIntent as number[]).reduce((sum, value) => sum + value, 0) / exposure.value) * 1000;

  return {
    source: content,
    exposureMetric: exposure.metric,
    exposure: exposure.value,
    engagementPerThousand: (engagementTotal / exposure.value) * 1000,
    highIntentPerThousand,
    evidenceRefs: metricEvidence
  };
}

function bandFor(value: number, platformValues: readonly number[]): ContentPerformanceBandV1 {
  if (platformValues.length < 3) return "INSUFFICIENT_EVIDENCE";
  const baseline = median(platformValues);
  if (baseline === 0) return value === 0 ? "WITHIN_BASELINE" : "OBSERVED_WINNER";
  const ratio = value / baseline;
  if (ratio >= 1.25) return "OBSERVED_WINNER";
  if (ratio <= 0.75) return "OBSERVED_UNDERPERFORMER";
  return "WITHIN_BASELINE";
}

function dimensions(content: CanonicalSocialContentV1): Array<[ContentDnaDimensionV1, string]> {
  const values: Array<[ContentDnaDimensionV1, string | null]> = [
    ["FORMAT", content.format],
    ["SUBJECT", content.subject],
    ["PROJECT", content.project],
    ["THEME", content.theme],
    ["HOOK", content.hook],
    ["COLLABORATION", content.collaborationContext],
    ["AMPLIFICATION", content.amplificationType === "UNKNOWN" ? null : content.amplificationType]
  ];
  return values.flatMap(([dimension, value]) => {
    const normalized = value?.trim();
    return normalized ? [[dimension, normalized] as [ContentDnaDimensionV1, string]] : [];
  });
}

function buildPatterns(platform: SocialPlatformV1, rows: readonly ComparableContent[]): ContentDnaPatternV1[] {
  if (rows.length < 3) return [];
  const platformMedian = median(rows.map((row) => row.engagementPerThousand));
  const groups = new Map<string, { dimension: ContentDnaDimensionV1; value: string; rows: ComparableContent[] }>();

  for (const row of rows) {
    for (const [dimension, value] of dimensions(row.source)) {
      const key = `${dimension}\u0000${value.toLocaleLowerCase()}`;
      const existing = groups.get(key);
      if (existing) existing.rows.push(row);
      else groups.set(key, { dimension, value, rows: [row] });
    }
  }

  return [...groups.values()]
    .filter((group) => group.rows.length >= 2)
    .map((group) => {
      const average = group.rows.reduce((sum, row) => sum + row.engagementPerThousand, 0) / group.rows.length;
      const zeroBaseline = platformMedian === 0;
      const relative = zeroBaseline ? (average === 0 ? 1 : null) : average / platformMedian;
      const association: ContentDnaAssociationV1 = zeroBaseline
        ? average === 0
          ? "WITHIN_PLATFORM_BASELINE"
          : "ABOVE_PLATFORM_BASELINE"
        : relative! >= 1.2
          ? "ABOVE_PLATFORM_BASELINE"
          : relative! <= 0.8
            ? "BELOW_PLATFORM_BASELINE"
            : "WITHIN_PLATFORM_BASELINE";
      const relativeText = zeroBaseline
        ? average === 0
          ? "1x"
          : "above a zero baseline with relative magnitude undefined"
        : `${round(relative!)}x`;
      return Object.freeze({
        platform,
        dimension: group.dimension,
        value: group.value,
        comparable_content_count: group.rows.length,
        average_engagement_per_1000_exposure: round(average),
        platform_median_engagement_per_1000_exposure: round(platformMedian),
        relative_to_platform_median: relative === null ? null : round(relative),
        association,
        evidence_refs: Object.freeze(unique(group.rows.flatMap((row) => row.evidenceRefs))),
        interpretation: `${group.dimension.toLowerCase()} “${group.value}” is observed at ${relativeText} the ${platform} median normalized engagement in this bounded sample. This is an association, not a causal effect.`,
        causal_claim: false as const
      });
    })
    .sort((a, b) =>
      a.platform.localeCompare(b.platform) ||
      a.dimension.localeCompare(b.dimension) ||
      a.value.localeCompare(b.value)
    );
}

function validateBounds(snapshots: readonly CanonicalSocialAccountSnapshotV1[]): void {
  if (snapshots.length > SOCIAL_CONTENT_DNA_MAX_SNAPSHOTS) {
    throw new Error(`Content DNA accepts at most ${SOCIAL_CONTENT_DNA_MAX_SNAPSHOTS} snapshots`);
  }
  const contentCount = snapshots.reduce((sum, snapshot) => sum + snapshot.content.length, 0);
  if (contentCount > SOCIAL_CONTENT_DNA_MAX_CONTENT) {
    throw new Error(`Content DNA accepts at most ${SOCIAL_CONTENT_DNA_MAX_CONTENT} content records`);
  }
}

export function analyzeSocialContentDnaV1(
  snapshots: readonly CanonicalSocialAccountSnapshotV1[]
): SocialContentDnaAnalysisV1 {
  validateBounds(snapshots);
  const excludedPlatforms: Array<{ platform: SocialPlatformV1; reason: string }> = [];
  const comparableByPlatform = new Map<SocialPlatformV1, ComparableContent[]>();
  const allContentByPlatform = new Map<SocialPlatformV1, CanonicalSocialContentV1[]>();

  for (const snapshot of snapshots) {
    const connected = snapshot.sourceCoverage.effectiveState === "CONNECTED_AND_INGESTING" || snapshot.sourceCoverage.effectiveState === "CONNECTED_PARTIAL";
    if (!connected) {
      excludedPlatforms.push({ platform: snapshot.platform, reason: `Source state ${snapshot.sourceCoverage.effectiveState} is not proven connected.` });
      continue;
    }
    if (snapshot.sourceCoverage.freshness !== "FRESH") {
      excludedPlatforms.push({ platform: snapshot.platform, reason: `Source freshness is ${snapshot.sourceCoverage.freshness}; current-performance conclusions are withheld.` });
      continue;
    }
    const platformContent = allContentByPlatform.get(snapshot.platform) ?? [];
    platformContent.push(...snapshot.content);
    allContentByPlatform.set(snapshot.platform, platformContent);
    const comparableRows = comparableByPlatform.get(snapshot.platform) ?? [];
    comparableRows.push(...snapshot.content.map(comparable).filter((row): row is ComparableContent => row !== null));
    comparableByPlatform.set(snapshot.platform, comparableRows);
  }

  const content: ContentObservedPerformanceV1[] = [];
  const patterns: ContentDnaPatternV1[] = [];

  for (const platform of [...allContentByPlatform.keys()].sort()) {
    const rows = comparableByPlatform.get(platform) ?? [];
    const rates = rows.map((row) => row.engagementPerThousand);
    const comparableById = new Map(rows.map((row) => [row.source.contentId, row]));
    const platformContent = [...(allContentByPlatform.get(platform) ?? [])].sort(
      (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.contentId.localeCompare(b.contentId)
    );

    for (const source of platformContent) {
      const row = comparableById.get(source.contentId);
      const limitations: string[] = [];
      if (!row) {
        if (!exposureFor(source)) limitations.push("No positive known REACH, VIEWS, or IMPRESSIONS denominator.");
        if (ENGAGEMENT_KEYS.some((key) => knownMetric(source, key) === null)) limitations.push("At least one engagement component is UNKNOWN.");
        if (!evidenceFor(source, ["REACH", "VIEWS", "IMPRESSIONS", ...ENGAGEMENT_KEYS]).length) limitations.push("No metric evidence reference supports a normalized comparison.");
      }
      const highIntentMissing = HIGH_INTENT_KEYS.some((key) => knownMetric(source, key) === null);
      if (row && highIntentMissing) limitations.push("High-intent rate withheld because saves, profile visits, or link clicks are UNKNOWN.");
      content.push(Object.freeze({
        platform,
        content_id: source.contentId,
        published_at: source.publishedAt,
        exposure_metric: row?.exposureMetric ?? null,
        exposure_value: row?.exposure ?? null,
        engagement_per_1000_exposure: row ? round(row.engagementPerThousand) : null,
        high_intent_per_1000_exposure: row?.highIntentPerThousand == null ? null : round(row.highIntentPerThousand),
        business_outcome_ref_count: source.businessOutcomeRefs.length,
        attribution_confidence: source.attributionConfidence,
        production_effort_minutes: source.productionEffortMinutes,
        band: row ? bandFor(row.engagementPerThousand, rates) : "INSUFFICIENT_EVIDENCE",
        evidence_refs: Object.freeze(row?.evidenceRefs ?? []),
        limitations: Object.freeze(unique(limitations))
      }));
    }
    patterns.push(...buildPatterns(platform, rows));
  }

  const analyzedPlatforms = [...allContentByPlatform.keys()].sort();
  const comparableCount = content.filter((item) => item.engagement_per_1000_exposure !== null).length;
  const status: SocialContentDnaAnalysisV1["status"] = comparableCount >= 3
    ? excludedPlatforms.length ? "PARTIAL" : "READY"
    : "INSUFFICIENT_EVIDENCE";

  return Object.freeze({
    contract_version: SOCIAL_CONTENT_DNA_V1_VERSION,
    status,
    analyzed_platforms: Object.freeze(analyzedPlatforms),
    excluded_platforms: Object.freeze(
      excludedPlatforms
        .map((entry) => Object.freeze({ ...entry }))
        .sort((a, b) => a.platform.localeCompare(b.platform) || a.reason.localeCompare(b.reason))
    ),
    content: Object.freeze(content),
    patterns: Object.freeze(patterns),
    winner_ids: Object.freeze(content.filter((item) => item.band === "OBSERVED_WINNER").map((item) => `${item.platform}:${item.content_id}`)),
    underperformer_ids: Object.freeze(content.filter((item) => item.band === "OBSERVED_UNDERPERFORMER").map((item) => `${item.platform}:${item.content_id}`)),
    guardrails: Object.freeze([
      "Normalized engagement compares content only within the same platform.",
      "UNKNOWN metrics are never coerced to zero.",
      "Content DNA patterns describe bounded associations, not causality.",
      "Business outcome references are counted but never converted into inferred revenue or attribution.",
      "Stale or unproven source states are excluded from current-performance conclusions."
    ]),
    external_access_performed: false,
    writes_performed: false
  });
}
