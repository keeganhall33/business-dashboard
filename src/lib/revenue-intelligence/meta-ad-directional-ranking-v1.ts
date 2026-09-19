export const META_AD_DIRECTIONAL_RANKING_VERSION =
  "META_AD_DIRECTIONAL_RANKING_V1" as const;

export type MetaAdDirectionalTruthStateV1 =
  | "COMPLETE"
  | "PARTIAL"
  | "UNKNOWN"
  | "STALE"
  | "CONFLICTED"
  | "UNAVAILABLE";

export type MetaAdMetricDirectionV1 =
  | "HIGHER_IS_BETTER"
  | "LOWER_IS_BETTER";

export type MetaAdDirectionalClassificationV1 =
  | "WINNER_CANDIDATE"
  | "LOSER_CANDIDATE"
  | "NO_MATERIAL_CHANGE"
  | "INSUFFICIENT_SAMPLE"
  | "UNRESOLVED_ZERO_BASELINE";

export type MetaAdDirectionalWindowV1 = Readonly<{
  adAccountId: string;
  campaignId: string;
  adSetId: string;
  adId: string;
  metricName: string;
  metricDefinitionId: string;
  metricDirection: MetaAdMetricDirectionV1;
  range: Readonly<{ startDate: string; endDate: string }>;
  observedAt: string;
  completeThrough: string | null;
  truthState: MetaAdDirectionalTruthStateV1;
  value: number | null;
  sampleSize: number | null;
  evidenceRefs: readonly string[];
}>;

export type MetaAdDirectionalPairV1 = Readonly<{
  current: MetaAdDirectionalWindowV1;
  prior: MetaAdDirectionalWindowV1;
}>;

export type MetaAdDirectionalRankingInputV1 = Readonly<{
  generatedAt: string;
  windowDays: 7 | 14 | 30;
  maximumEvidenceAgeHours: number;
  minimumSampleSize: number;
  materialChangeRatio: number;
  pairs: readonly MetaAdDirectionalPairV1[];
}>;

export type MetaAdDirectionalRankingEntryV1 = Readonly<{
  rank: number;
  adAccountId: string;
  campaignId: string;
  adSetId: string;
  adId: string;
  metricName: string;
  metricDefinitionId: string;
  metricDirection: MetaAdMetricDirectionV1;
  currentRange: Readonly<{ startDate: string; endDate: string }>;
  priorRange: Readonly<{ startDate: string; endDate: string }>;
  currentValue: number;
  priorValue: number;
  currentSampleSize: number;
  priorSampleSize: number;
  minimumSampleSize: number;
  absoluteChange: number;
  relativeChange: number | null;
  classification: MetaAdDirectionalClassificationV1;
  observedFacts: readonly string[];
  nextInternalStep:
    | "REVIEW_DIRECTIONAL_CHANGE"
    | "COLLECT_MORE_SAMPLE"
    | "MONITOR"
    | "VERIFY_ZERO_BASELINE";
  evidenceRefs: readonly string[];
  statisticalSignificanceEstablished: false;
  causalityEstablished: false;
  attributionEstablished: false;
  confidence: null;
  monetaryImpact: null;
}>;

export type MetaAdDirectionalRankingV1 = Readonly<{
  version: typeof META_AD_DIRECTIONAL_RANKING_VERSION;
  status: "READY" | "VERIFY_EVIDENCE" | "INVALID_INPUT";
  reasonCode:
    | "DIRECTIONAL_RANKING_READY"
    | "INVALID_OR_UNBOUNDED_INPUT"
    | "PAIR_IDENTITY_OR_METRIC_DRIFT"
    | "FIXED_WINDOWS_NOT_COMPARABLE"
    | "EVIDENCE_NOT_DECISION_GRADE";
  generatedAt: string;
  windowDays: 7 | 14 | 30 | null;
  minimumSampleSize: number | null;
  materialChangeRatio: number | null;
  entries: readonly MetaAdDirectionalRankingEntryV1[];
  evidenceRefs: readonly string[];
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    internalReviewAllowed: true;
    metaWriteAllowed: false;
    budgetMutationAllowed: false;
    campaignMutationAllowed: false;
    trackingMutationAllowed: false;
    externalMutationAllowed: false;
    approvalBypassAllowed: false;
  }>;
  statisticalSignificanceEstablished: false;
  causalityEstablished: false;
  attributionEstablished: false;
  confidence: null;
  monetaryImpact: null;
  externalMutationPerformed: false;
}>;

const DAY_MS = 24 * 60 * 60 * 1_000;
const MAX_PAIRS = 500;
const MAX_EVIDENCE_REFS = 16;
const MAX_TEXT = 240;
const ALLOWED_WINDOW_DAYS = [7, 14, 30] as const;
const TRUTH_STATES: readonly MetaAdDirectionalTruthStateV1[] = [
  "COMPLETE",
  "PARTIAL",
  "UNKNOWN",
  "STALE",
  "CONFLICTED",
  "UNAVAILABLE",
];
const DIRECTIONS: readonly MetaAdMetricDirectionV1[] = [
  "HIGHER_IS_BETTER",
  "LOWER_IS_BETTER",
];

const LIMITATIONS = Object.freeze([
  "Winner and loser labels are directional candidates derived from observed fixed-window movement only; they are not statistical significance claims.",
  "Observed Meta movement does not establish causality, conversion attribution, confidence, incremental revenue, or expected lift.",
  "Insufficient sample is reported explicitly and is never converted into a directional winner or loser claim.",
  "This contract is analysis-only. Meta budget, campaign, ad set, ad, tracking, and other external writes remain approval-gated outside this contract.",
] as const);

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  internalReviewAllowed: true as const,
  metaWriteAllowed: false as const,
  budgetMutationAllowed: false as const,
  campaignMutationAllowed: false as const,
  trackingMutationAllowed: false as const,
  externalMutationAllowed: false as const,
  approvalBypassAllowed: false as const,
});

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function safeText(value: unknown, maximum = MAX_TEXT): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maximum &&
    !/[\r\n]/.test(value)
  );
}

function safeEvidenceRef(value: unknown): value is string {
  return (
    safeText(value) &&
    !/(?:bearer\s+|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)=?/i.test(
      value,
    )
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

function inclusiveDays(range: Readonly<{ startDate: string; endDate: string }>): number | null {
  const start = dateOnlyMs(range.startDate);
  const end = dateOnlyMs(range.endDate);
  if (start === null || end === null || end < start) return null;
  return Math.floor((end - start) / DAY_MS) + 1;
}

function validEvidenceRefs(refs: unknown): refs is readonly string[] {
  if (!Array.isArray(refs) || refs.length === 0 || refs.length > MAX_EVIDENCE_REFS) {
    return false;
  }
  if (refs.some((ref) => !safeEvidenceRef(ref))) return false;
  const normalized = refs.map((ref) => ref.trim());
  return new Set(normalized).size === normalized.length;
}

function validWindowShape(window: MetaAdDirectionalWindowV1): boolean {
  return Boolean(
    window &&
      safeText(window.adAccountId, 160) &&
      safeText(window.campaignId, 160) &&
      safeText(window.adSetId, 160) &&
      safeText(window.adId, 160) &&
      safeText(window.metricName, 120) &&
      safeText(window.metricDefinitionId, 160) &&
      DIRECTIONS.includes(window.metricDirection) &&
      inclusiveDays(window.range) !== null &&
      canonicalInstant(window.observedAt) &&
      (window.completeThrough === null || dateOnlyMs(window.completeThrough) !== null) &&
      TRUTH_STATES.includes(window.truthState) &&
      (window.value === null ||
        (typeof window.value === "number" && Number.isFinite(window.value) && window.value >= 0)) &&
      (window.sampleSize === null ||
        (Number.isSafeInteger(window.sampleSize) && (window.sampleSize as number) >= 0)) &&
      validEvidenceRefs(window.evidenceRefs)
  );
}

function emptyResult(
  input: Partial<MetaAdDirectionalRankingInputV1>,
  status: Exclude<MetaAdDirectionalRankingV1["status"], "READY">,
  reasonCode: Exclude<
    MetaAdDirectionalRankingV1["reasonCode"],
    "DIRECTIONAL_RANKING_READY"
  >,
): MetaAdDirectionalRankingV1 {
  return deepFreeze({
    version: META_AD_DIRECTIONAL_RANKING_VERSION,
    status,
    reasonCode,
    generatedAt: canonicalInstant(input.generatedAt) ? input.generatedAt : "UNKNOWN",
    windowDays: ALLOWED_WINDOW_DAYS.includes(input.windowDays as 7 | 14 | 30)
      ? (input.windowDays as 7 | 14 | 30)
      : null,
    minimumSampleSize:
      Number.isSafeInteger(input.minimumSampleSize) && (input.minimumSampleSize as number) > 0
        ? (input.minimumSampleSize as number)
        : null,
    materialChangeRatio:
      typeof input.materialChangeRatio === "number" &&
      Number.isFinite(input.materialChangeRatio) &&
      input.materialChangeRatio > 0 &&
      input.materialChangeRatio <= 1
        ? input.materialChangeRatio
        : null,
    entries: [],
    evidenceRefs: [],
    limitations: LIMITATIONS,
    authority: AUTHORITY,
    statisticalSignificanceEstablished: false,
    causalityEstablished: false,
    attributionEstablished: false,
    confidence: null,
    monetaryImpact: null,
    externalMutationPerformed: false,
  });
}

function sameIdentityAndMetric(pair: MetaAdDirectionalPairV1): boolean {
  const { current, prior } = pair;
  return (
    current.adAccountId === prior.adAccountId &&
    current.campaignId === prior.campaignId &&
    current.adSetId === prior.adSetId &&
    current.adId === prior.adId &&
    current.metricName === prior.metricName &&
    current.metricDefinitionId === prior.metricDefinitionId &&
    current.metricDirection === prior.metricDirection
  );
}

function comparableRanges(pair: MetaAdDirectionalPairV1, windowDays: 7 | 14 | 30): boolean {
  const currentStart = dateOnlyMs(pair.current.range.startDate);
  const priorEnd = dateOnlyMs(pair.prior.range.endDate);
  return (
    inclusiveDays(pair.current.range) === windowDays &&
    inclusiveDays(pair.prior.range) === windowDays &&
    currentStart !== null &&
    priorEnd !== null &&
    priorEnd + DAY_MS === currentStart
  );
}

function evidenceDecisionGrade(
  pair: MetaAdDirectionalPairV1,
  generatedAtMs: number,
  maximumAgeMs: number,
): boolean {
  for (const window of [pair.current, pair.prior]) {
    const observedAtMs = Date.parse(window.observedAt);
    const endMs = dateOnlyMs(window.range.endDate);
    const completeThroughMs =
      window.completeThrough === null ? null : dateOnlyMs(window.completeThrough);
    if (
      window.truthState !== "COMPLETE" ||
      window.value === null ||
      window.sampleSize === null ||
      observedAtMs > generatedAtMs ||
      generatedAtMs - observedAtMs > maximumAgeMs ||
      endMs === null ||
      completeThroughMs === null ||
      completeThroughMs < endMs
    ) {
      return false;
    }
  }
  return true;
}

function candidateClassification(
  currentValue: number,
  priorValue: number,
  currentSampleSize: number,
  priorSampleSize: number,
  minimumSampleSize: number,
  direction: MetaAdMetricDirectionV1,
  materialChangeRatio: number,
): Readonly<{
  classification: MetaAdDirectionalClassificationV1;
  relativeChange: number | null;
}> {
  if (currentSampleSize < minimumSampleSize || priorSampleSize < minimumSampleSize) {
    return { classification: "INSUFFICIENT_SAMPLE", relativeChange: null };
  }

  if (priorValue === 0) {
    if (currentValue === 0) {
      return { classification: "NO_MATERIAL_CHANGE", relativeChange: 0 };
    }
    return { classification: "UNRESOLVED_ZERO_BASELINE", relativeChange: null };
  }

  const relativeChange = (currentValue - priorValue) / priorValue;
  const improvement =
    direction === "HIGHER_IS_BETTER"
      ? relativeChange >= materialChangeRatio
      : relativeChange <= -materialChangeRatio;
  const deterioration =
    direction === "HIGHER_IS_BETTER"
      ? relativeChange <= -materialChangeRatio
      : relativeChange >= materialChangeRatio;

  if (improvement) return { classification: "WINNER_CANDIDATE", relativeChange };
  if (deterioration) return { classification: "LOSER_CANDIDATE", relativeChange };
  return { classification: "NO_MATERIAL_CHANGE", relativeChange };
}

function nextStep(
  classification: MetaAdDirectionalClassificationV1,
): MetaAdDirectionalRankingEntryV1["nextInternalStep"] {
  if (classification === "INSUFFICIENT_SAMPLE") return "COLLECT_MORE_SAMPLE";
  if (classification === "UNRESOLVED_ZERO_BASELINE") return "VERIFY_ZERO_BASELINE";
  if (classification === "NO_MATERIAL_CHANGE") return "MONITOR";
  return "REVIEW_DIRECTIONAL_CHANGE";
}

function buildEntry(
  pair: MetaAdDirectionalPairV1,
  minimumSampleSize: number,
  materialChangeRatio: number,
): Omit<MetaAdDirectionalRankingEntryV1, "rank"> {
  const currentValue = pair.current.value as number;
  const priorValue = pair.prior.value as number;
  const currentSampleSize = pair.current.sampleSize as number;
  const priorSampleSize = pair.prior.sampleSize as number;
  const movement = candidateClassification(
    currentValue,
    priorValue,
    currentSampleSize,
    priorSampleSize,
    minimumSampleSize,
    pair.current.metricDirection,
    materialChangeRatio,
  );
  const absoluteChange = currentValue - priorValue;
  const evidenceRefs = [...new Set([...pair.current.evidenceRefs, ...pair.prior.evidenceRefs])]
    .map((ref) => ref.trim())
    .sort((a, b) => a.localeCompare(b));

  const observedFacts = [
    `Observed ${pair.current.metricName} changed from ${priorValue} to ${currentValue} across adjacent ${inclusiveDays(pair.current.range)}-day windows.`,
    `Observed sample sizes were ${priorSampleSize} prior and ${currentSampleSize} current; the caller-supplied minimum is ${minimumSampleSize}.`,
    movement.classification === "INSUFFICIENT_SAMPLE"
      ? "Directional classification is withheld because at least one observed window is below the supplied minimum sample."
      : movement.classification === "UNRESOLVED_ZERO_BASELINE"
        ? "Relative directional classification is withheld because the prior metric value is zero."
        : `Observed movement is classified as ${movement.classification} using the caller-supplied material-change ratio ${materialChangeRatio}.`,
  ];

  return {
    adAccountId: pair.current.adAccountId,
    campaignId: pair.current.campaignId,
    adSetId: pair.current.adSetId,
    adId: pair.current.adId,
    metricName: pair.current.metricName,
    metricDefinitionId: pair.current.metricDefinitionId,
    metricDirection: pair.current.metricDirection,
    currentRange: { ...pair.current.range },
    priorRange: { ...pair.prior.range },
    currentValue,
    priorValue,
    currentSampleSize,
    priorSampleSize,
    minimumSampleSize,
    absoluteChange,
    relativeChange: movement.relativeChange,
    classification: movement.classification,
    observedFacts,
    nextInternalStep: nextStep(movement.classification),
    evidenceRefs,
    statisticalSignificanceEstablished: false,
    causalityEstablished: false,
    attributionEstablished: false,
    confidence: null,
    monetaryImpact: null,
  };
}

function classificationPriority(classification: MetaAdDirectionalClassificationV1): number {
  switch (classification) {
    case "WINNER_CANDIDATE":
    case "LOSER_CANDIDATE":
      return 0;
    case "INSUFFICIENT_SAMPLE":
      return 1;
    case "UNRESOLVED_ZERO_BASELINE":
      return 2;
    case "NO_MATERIAL_CHANGE":
      return 3;
  }
}

/**
 * Ranks observed ad-level Meta movement across one exact fixed reporting horizon.
 * "Winner" and "loser" are deliberately candidate labels only: this function
 * performs no significance test, causal inference, attribution, or Meta write.
 */
export function rankMetaAdDirectionalMovementV1(
  input: MetaAdDirectionalRankingInputV1,
): MetaAdDirectionalRankingV1 {
  if (
    !input ||
    !canonicalInstant(input.generatedAt) ||
    !ALLOWED_WINDOW_DAYS.includes(input.windowDays) ||
    !Number.isFinite(input.maximumEvidenceAgeHours) ||
    input.maximumEvidenceAgeHours <= 0 ||
    input.maximumEvidenceAgeHours > 168 ||
    !Number.isSafeInteger(input.minimumSampleSize) ||
    input.minimumSampleSize <= 0 ||
    input.minimumSampleSize > 100_000_000 ||
    !Number.isFinite(input.materialChangeRatio) ||
    input.materialChangeRatio <= 0 ||
    input.materialChangeRatio > 1 ||
    !Array.isArray(input.pairs) ||
    input.pairs.length === 0 ||
    input.pairs.length > MAX_PAIRS ||
    input.pairs.some(
      (pair) =>
        !pair ||
        !validWindowShape(pair.current) ||
        !validWindowShape(pair.prior),
    )
  ) {
    return emptyResult(input ?? {}, "INVALID_INPUT", "INVALID_OR_UNBOUNDED_INPUT");
  }

  if (input.pairs.some((pair) => !sameIdentityAndMetric(pair))) {
    return emptyResult(input, "VERIFY_EVIDENCE", "PAIR_IDENTITY_OR_METRIC_DRIFT");
  }

  if (input.pairs.some((pair) => !comparableRanges(pair, input.windowDays))) {
    return emptyResult(input, "VERIFY_EVIDENCE", "FIXED_WINDOWS_NOT_COMPARABLE");
  }

  const generatedAtMs = Date.parse(input.generatedAt);
  const maximumAgeMs = input.maximumEvidenceAgeHours * 60 * 60 * 1_000;
  if (
    input.pairs.some(
      (pair) => !evidenceDecisionGrade(pair, generatedAtMs, maximumAgeMs),
    )
  ) {
    return emptyResult(input, "VERIFY_EVIDENCE", "EVIDENCE_NOT_DECISION_GRADE");
  }

  const seenAdMetricKeys = new Set<string>();
  for (const pair of input.pairs) {
    const key = [
      pair.current.adAccountId,
      pair.current.campaignId,
      pair.current.adSetId,
      pair.current.adId,
      pair.current.metricDefinitionId,
    ].join("\u0000");
    if (seenAdMetricKeys.has(key)) {
      return emptyResult(input, "VERIFY_EVIDENCE", "PAIR_IDENTITY_OR_METRIC_DRIFT");
    }
    seenAdMetricKeys.add(key);
  }

  const entries = input.pairs.map((pair) =>
    buildEntry(pair, input.minimumSampleSize, input.materialChangeRatio),
  );
  entries.sort((left, right) => {
    const priority =
      classificationPriority(left.classification) -
      classificationPriority(right.classification);
    if (priority !== 0) return priority;

    const leftMagnitude = Math.abs(left.relativeChange ?? 0);
    const rightMagnitude = Math.abs(right.relativeChange ?? 0);
    if (leftMagnitude !== rightMagnitude) return rightMagnitude - leftMagnitude;
    return left.adId.localeCompare(right.adId);
  });

  const rankedEntries: MetaAdDirectionalRankingEntryV1[] = entries.map(
    (entry, index) => ({ rank: index + 1, ...entry }),
  );
  const evidenceRefs = [
    ...new Set(rankedEntries.flatMap((entry) => entry.evidenceRefs)),
  ].sort((a, b) => a.localeCompare(b));

  return deepFreeze({
    version: META_AD_DIRECTIONAL_RANKING_VERSION,
    status: "READY",
    reasonCode: "DIRECTIONAL_RANKING_READY",
    generatedAt: input.generatedAt,
    windowDays: input.windowDays,
    minimumSampleSize: input.minimumSampleSize,
    materialChangeRatio: input.materialChangeRatio,
    entries: rankedEntries,
    evidenceRefs,
    limitations: LIMITATIONS,
    authority: AUTHORITY,
    statisticalSignificanceEstablished: false,
    causalityEstablished: false,
    attributionEstablished: false,
    confidence: null,
    monetaryImpact: null,
    externalMutationPerformed: false,
  });
}
