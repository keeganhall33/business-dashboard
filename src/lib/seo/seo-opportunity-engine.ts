export type SeoEvidenceConfidenceV1 = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
export type SeoCommercialIntentV1 = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
export type SeoEffortV1 = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
export type SeoBusinessImpactV1 = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
export type SeoOpportunityHorizonV1 = "QUICK_WIN" | "LONGER_TERM";

export type SeoFindingTypeV1 =
  | "QUERY"
  | "TECHNICAL"
  | "ON_PAGE"
  | "INTERNAL_LINK"
  | "IMAGE_PRODUCT"
  | "CONTENT_GAP"
  | "GBP"
  | "AUTHORITY";

export type SeoBusinessOutcomeV1 =
  | "ARTWORK_SALE"
  | "ORIGINAL_COMMISSION"
  | "CORPORATE_COMMISSION"
  | "COLLECTOR_INTEREST"
  | "ATHLETE_BRAND_PARTNERSHIP"
  | "LOCAL_VISIBILITY"
  | "QUALIFIED_TRAFFIC"
  | "UNKNOWN";

export type SeoSafetyFlagV1 =
  | "KEYWORD_STUFFING"
  | "SCRIPTED_REVIEW_LANGUAGE"
  | "THIN_AI_CONTENT"
  | "MASS_CITY_PAGES"
  | "DOORWAY_PAGE"
  | "FAKE_LOCAL_RELEVANCE"
  | "RIGHTS_RISK"
  | "UNSUPPORTED_RANKING_FACTOR";

export type SeoQueryMetricsV1 = {
  clicks: number | null;
  impressions: number | null;
  ctr: number | null;
  averagePosition: number | null;
  conversions?: number | null;
  revenueCents?: number | null;
  periodStart: string;
  periodEnd: string;
  source: string;
};

export type SeoEvidenceProvenanceV1 = {
  source: string;
  observed_at: string;
  confidence: SeoEvidenceConfidenceV1;
};

export type SeoEvidenceV1 = {
  id: string;
  url: string;
  pageType: string;
  findingType: SeoFindingTypeV1;
  query?: string | null;
  metrics?: SeoQueryMetricsV1 | null;
  finding: string;
  recommendedAction: string;
  effort: SeoEffortV1;
  commercialIntent: SeoCommercialIntentV1;
  businessOutcome: SeoBusinessOutcomeV1;
  provenance: SeoEvidenceProvenanceV1;
  safetyFlags?: SeoSafetyFlagV1[];
};

export type SeoOpportunityV1 = {
  id: string;
  opportunityType: SeoFindingTypeV1;
  url: string;
  query: string | null;
  expectedBusinessImpact: SeoBusinessImpactV1;
  effort: SeoEffortV1;
  evidenceConfidence: SeoEvidenceConfidenceV1;
  provenance: SeoEvidenceProvenanceV1[];
  reason: string;
  recommendedAction: string;
  horizon: SeoOpportunityHorizonV1;
  safetyFlags: SeoSafetyFlagV1[];
  priorityScore: number;
  businessOutcome: SeoBusinessOutcomeV1;
};

export type SeoRejectedFindingV1 = {
  id: string;
  reason:
    | "BRAND_OR_SPAM_RISK"
    | "UNSUPPORTED_RANKING_FACTOR";
  safetyFlags: SeoSafetyFlagV1[];
};

export type SeoOpportunityPlanV1 = {
  opportunities: SeoOpportunityV1[];
  monthlyActions: SeoOpportunityV1[];
  rejected: SeoRejectedFindingV1[];
};

const FINDING_TYPES = new Set<SeoFindingTypeV1>([
  "QUERY",
  "TECHNICAL",
  "ON_PAGE",
  "INTERNAL_LINK",
  "IMAGE_PRODUCT",
  "CONTENT_GAP",
  "GBP",
  "AUTHORITY"
]);
const CONFIDENCE = new Set<SeoEvidenceConfidenceV1>(["HIGH", "MEDIUM", "LOW", "UNKNOWN"]);
const COMMERCIAL_INTENT = new Set<SeoCommercialIntentV1>(["HIGH", "MEDIUM", "LOW", "UNKNOWN"]);
const EFFORT = new Set<SeoEffortV1>(["LOW", "MEDIUM", "HIGH", "UNKNOWN"]);
const BUSINESS_OUTCOMES = new Set<SeoBusinessOutcomeV1>([
  "ARTWORK_SALE",
  "ORIGINAL_COMMISSION",
  "CORPORATE_COMMISSION",
  "COLLECTOR_INTEREST",
  "ATHLETE_BRAND_PARTNERSHIP",
  "LOCAL_VISIBILITY",
  "QUALIFIED_TRAFFIC",
  "UNKNOWN"
]);
const SAFETY_FLAGS = new Set<SeoSafetyFlagV1>([
  "KEYWORD_STUFFING",
  "SCRIPTED_REVIEW_LANGUAGE",
  "THIN_AI_CONTENT",
  "MASS_CITY_PAGES",
  "DOORWAY_PAGE",
  "FAKE_LOCAL_RELEVANCE",
  "RIGHTS_RISK",
  "UNSUPPORTED_RANKING_FACTOR"
]);
const SUPPRESS_FLAGS = new Set<SeoSafetyFlagV1>([
  "KEYWORD_STUFFING",
  "SCRIPTED_REVIEW_LANGUAGE",
  "THIN_AI_CONTENT",
  "MASS_CITY_PAGES",
  "DOORWAY_PAGE",
  "FAKE_LOCAL_RELEVANCE"
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function optionalString(value: unknown, label: string): string | null {
  if (value == null) return null;
  return requiredString(value, label);
}

function enumValue<T extends string>(value: unknown, allowed: Set<T>, label: string): T {
  const normalized = requiredString(value, label) as T;
  if (!allowed.has(normalized)) throw new Error(`${label} is unsupported`);
  return normalized;
}

function canonicalTimestamp(value: unknown, label: string): string {
  const timestamp = requiredString(value, label);
  const millis = Date.parse(timestamp);
  if (!Number.isFinite(millis) || new Date(millis).toISOString() !== timestamp) {
    throw new Error(`${label} must be a canonical ISO timestamp`);
  }
  return timestamp;
}

function canonicalDate(value: unknown, label: string): string {
  const date = requiredString(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`${label} must be YYYY-MM-DD`);
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`${label} must be a valid calendar date`);
  }
  return date;
}

function nullableMetric(
  value: unknown,
  label: string,
  { min = 0, max = Number.POSITIVE_INFINITY }: { min?: number; max?: number } = {}
): number | null {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be null or a finite number between ${min} and ${max}`);
  }
  return value;
}

function validateUrl(value: unknown, label: string): string {
  const raw = requiredString(value, label);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`${label} must use http or https`);
  }
  return parsed.toString();
}

function validateMetrics(value: unknown, label: string): SeoQueryMetricsV1 | null {
  if (value == null) return null;
  if (!isPlainObject(value)) throw new Error(`${label} must be an object`);

  const periodStart = canonicalDate(value.periodStart, `${label}.periodStart`);
  const periodEnd = canonicalDate(value.periodEnd, `${label}.periodEnd`);
  if (periodEnd < periodStart) throw new Error(`${label}.periodEnd cannot precede periodStart`);

  return {
    clicks: nullableMetric(value.clicks, `${label}.clicks`),
    impressions: nullableMetric(value.impressions, `${label}.impressions`),
    ctr: nullableMetric(value.ctr, `${label}.ctr`, { min: 0, max: 1 }),
    averagePosition: nullableMetric(value.averagePosition, `${label}.averagePosition`, { min: 1 }),
    conversions: value.conversions === undefined ? undefined : nullableMetric(value.conversions, `${label}.conversions`),
    revenueCents: value.revenueCents === undefined ? undefined : nullableMetric(value.revenueCents, `${label}.revenueCents`),
    periodStart,
    periodEnd,
    source: requiredString(value.source, `${label}.source`)
  };
}

function validateProvenance(value: unknown, label: string): SeoEvidenceProvenanceV1 {
  if (!isPlainObject(value)) throw new Error(`${label} must be an object`);
  return {
    source: requiredString(value.source, `${label}.source`),
    observed_at: canonicalTimestamp(value.observed_at, `${label}.observed_at`),
    confidence: enumValue(value.confidence, CONFIDENCE, `${label}.confidence`)
  };
}

function validateSafetyFlags(value: unknown, label: string): SeoSafetyFlagV1[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const flags: SeoSafetyFlagV1[] = [];
  const seen = new Set<SeoSafetyFlagV1>();
  for (const item of value) {
    const flag = enumValue(item, SAFETY_FLAGS, `${label} item`);
    if (seen.has(flag)) throw new Error(`${label} contains duplicate flag ${flag}`);
    seen.add(flag);
    flags.push(flag);
  }
  return flags;
}

export function validateSeoEvidenceV1(value: unknown): SeoEvidenceV1[] {
  if (!Array.isArray(value)) throw new Error("SEO evidence must be an array");
  const ids = new Set<string>();

  return value.map((item, index) => {
    const label = `evidence[${index}]`;
    if (!isPlainObject(item)) throw new Error(`${label} must be a plain object`);

    const id = requiredString(item.id, `${label}.id`);
    if (ids.has(id)) throw new Error(`Duplicate evidence id ${id}`);
    ids.add(id);

    return {
      id,
      url: validateUrl(item.url, `${label}.url`),
      pageType: requiredString(item.pageType, `${label}.pageType`),
      findingType: enumValue(item.findingType, FINDING_TYPES, `${label}.findingType`),
      query: optionalString(item.query, `${label}.query`),
      metrics: validateMetrics(item.metrics, `${label}.metrics`),
      finding: requiredString(item.finding, `${label}.finding`),
      recommendedAction: requiredString(item.recommendedAction, `${label}.recommendedAction`),
      effort: enumValue(item.effort, EFFORT, `${label}.effort`),
      commercialIntent: enumValue(item.commercialIntent, COMMERCIAL_INTENT, `${label}.commercialIntent`),
      businessOutcome: enumValue(item.businessOutcome, BUSINESS_OUTCOMES, `${label}.businessOutcome`),
      provenance: validateProvenance(item.provenance, `${label}.provenance`),
      safetyFlags: validateSafetyFlags(item.safetyFlags, `${label}.safetyFlags`)
    };
  });
}

function hasMeasuredBusinessValue(metrics: SeoQueryMetricsV1 | null | undefined): boolean {
  return Boolean((metrics?.conversions ?? 0) > 0 || (metrics?.revenueCents ?? 0) > 0);
}

function isPageTwoOrNearPageOne(metrics: SeoQueryMetricsV1 | null | undefined): boolean {
  const position = metrics?.averagePosition;
  return position != null && position >= 4 && position <= 20;
}

function hasHighImpressions(metrics: SeoQueryMetricsV1 | null | undefined): boolean {
  return metrics?.impressions != null && metrics.impressions >= 100;
}

function hasLowCtr(metrics: SeoQueryMetricsV1 | null | undefined): boolean {
  return metrics?.ctr != null && metrics.ctr < 0.03;
}

function expectedImpact(evidence: SeoEvidenceV1): SeoBusinessImpactV1 {
  if (hasMeasuredBusinessValue(evidence.metrics)) return "HIGH";
  if (evidence.commercialIntent === "HIGH") return "HIGH";
  if (evidence.commercialIntent === "MEDIUM") return "MEDIUM";
  if (evidence.commercialIntent === "LOW") return "LOW";
  if (isPageTwoOrNearPageOne(evidence.metrics) && hasHighImpressions(evidence.metrics)) return "MEDIUM";
  return "UNKNOWN";
}

function horizonFor(evidence: SeoEvidenceV1): SeoOpportunityHorizonV1 {
  if (evidence.findingType === "CONTENT_GAP" || evidence.findingType === "AUTHORITY") return "LONGER_TERM";
  if (evidence.effort === "HIGH" || evidence.effort === "UNKNOWN") return "LONGER_TERM";
  return "QUICK_WIN";
}

const impactScore: Record<SeoBusinessImpactV1, number> = { HIGH: 48, MEDIUM: 34, LOW: 18, UNKNOWN: 4 };
const confidenceScore: Record<SeoEvidenceConfidenceV1, number> = { HIGH: 15, MEDIUM: 10, LOW: 4, UNKNOWN: 0 };
const effortScore: Record<SeoEffortV1, number> = { LOW: 8, MEDIUM: 4, HIGH: 0, UNKNOWN: 0 };

function scoreEvidence(evidence: SeoEvidenceV1, impact: SeoBusinessImpactV1, horizon: SeoOpportunityHorizonV1): number {
  let score = impactScore[impact] + confidenceScore[evidence.provenance.confidence] + effortScore[evidence.effort];
  if (horizon === "QUICK_WIN") score += 8;
  if (isPageTwoOrNearPageOne(evidence.metrics) && hasHighImpressions(evidence.metrics)) score += 14;
  if (hasLowCtr(evidence.metrics) && hasHighImpressions(evidence.metrics)) score += 6;
  if (hasMeasuredBusinessValue(evidence.metrics)) score += 14;
  if (evidence.commercialIntent === "HIGH") score += 6;
  if (evidence.safetyFlags?.includes("RIGHTS_RISK")) score -= 30;
  return Math.max(0, Math.min(100, score));
}

function confidenceRank(value: SeoEvidenceConfidenceV1): number {
  return { HIGH: 4, MEDIUM: 3, LOW: 2, UNKNOWN: 1 }[value];
}

function dedupeKey(evidence: SeoEvidenceV1): string {
  return [
    evidence.url.toLowerCase(),
    (evidence.query ?? "").toLowerCase(),
    evidence.findingType,
    evidence.finding.toLowerCase().replace(/\s+/g, " ").trim()
  ].join("|");
}

function mergeProvenance(items: SeoEvidenceV1[]): SeoEvidenceProvenanceV1[] {
  const keyed = new Map<string, SeoEvidenceProvenanceV1>();
  for (const item of items) {
    const provenance = item.provenance;
    keyed.set(`${provenance.source}|${provenance.observed_at}|${provenance.confidence}`, provenance);
  }
  return [...keyed.values()].sort((a, b) => {
    if (a.observed_at !== b.observed_at) return b.observed_at.localeCompare(a.observed_at);
    if (confidenceRank(a.confidence) !== confidenceRank(b.confidence)) {
      return confidenceRank(b.confidence) - confidenceRank(a.confidence);
    }
    return a.source.localeCompare(b.source);
  });
}

function strongestEvidence(items: SeoEvidenceV1[]): SeoEvidenceV1 {
  return [...items].sort((a, b) => {
    const aImpact = expectedImpact(a);
    const bImpact = expectedImpact(b);
    const aScore = scoreEvidence(a, aImpact, horizonFor(a));
    const bScore = scoreEvidence(b, bImpact, horizonFor(b));
    if (aScore !== bScore) return bScore - aScore;
    if (confidenceRank(a.provenance.confidence) !== confidenceRank(b.provenance.confidence)) {
      return confidenceRank(b.provenance.confidence) - confidenceRank(a.provenance.confidence);
    }
    return a.id.localeCompare(b.id);
  })[0]!;
}

function suppressReason(evidence: SeoEvidenceV1): SeoRejectedFindingV1["reason"] | null {
  if (evidence.safetyFlags?.includes("UNSUPPORTED_RANKING_FACTOR")) return "UNSUPPORTED_RANKING_FACTOR";
  if (evidence.safetyFlags?.some((flag) => SUPPRESS_FLAGS.has(flag))) return "BRAND_OR_SPAM_RISK";
  return null;
}

function opportunityFromGroup(items: SeoEvidenceV1[]): SeoOpportunityV1 {
  const evidence = strongestEvidence(items);
  const impact = expectedImpact(evidence);
  const horizon = horizonFor(evidence);
  const provenance = mergeProvenance(items);
  const confidence = provenance.reduce<SeoEvidenceConfidenceV1>(
    (best, item) => (confidenceRank(item.confidence) > confidenceRank(best) ? item.confidence : best),
    "UNKNOWN"
  );
  const safetyFlags = [...new Set(items.flatMap((item) => item.safetyFlags ?? []))].sort() as SeoSafetyFlagV1[];

  return {
    id: evidence.id,
    opportunityType: evidence.findingType,
    url: evidence.url,
    query: evidence.query ?? null,
    expectedBusinessImpact: impact,
    effort: evidence.effort,
    evidenceConfidence: confidence,
    provenance,
    reason: evidence.finding,
    recommendedAction: evidence.safetyFlags?.includes("RIGHTS_RISK")
      ? `Resolve athlete/celebrity commercial-rights risk before acting. ${evidence.recommendedAction}`
      : evidence.recommendedAction,
    horizon,
    safetyFlags,
    priorityScore: scoreEvidence(evidence, impact, horizon),
    businessOutcome: evidence.businessOutcome
  };
}

function opportunityOrder(a: SeoOpportunityV1, b: SeoOpportunityV1): number {
  if (a.priorityScore !== b.priorityScore) return b.priorityScore - a.priorityScore;
  if (a.horizon !== b.horizon) return a.horizon === "QUICK_WIN" ? -1 : 1;
  if (a.url !== b.url) return a.url.localeCompare(b.url);
  if ((a.query ?? "") !== (b.query ?? "")) return (a.query ?? "").localeCompare(b.query ?? "");
  if (a.opportunityType !== b.opportunityType) return a.opportunityType.localeCompare(b.opportunityType);
  return a.id.localeCompare(b.id);
}

export function buildSeoOpportunityPlanV1(value: unknown): SeoOpportunityPlanV1 {
  const evidence = validateSeoEvidenceV1(value);
  const rejected: SeoRejectedFindingV1[] = [];
  const groups = new Map<string, SeoEvidenceV1[]>();

  for (const item of evidence) {
    const reason = suppressReason(item);
    if (reason) {
      rejected.push({
        id: item.id,
        reason,
        safetyFlags: [...(item.safetyFlags ?? [])].sort() as SeoSafetyFlagV1[]
      });
      continue;
    }
    const key = dedupeKey(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  const opportunities = [...groups.values()].map(opportunityFromGroup).sort(opportunityOrder);
  rejected.sort((a, b) => a.id.localeCompare(b.id));

  return {
    opportunities,
    monthlyActions: opportunities.slice(0, 5),
    rejected
  };
}
